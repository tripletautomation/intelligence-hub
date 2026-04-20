import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSources } from "@/hooks/useIntelligence";
import { useIsAdmin } from "@/hooks/useAdmin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, Pencil, Archive, Play, RotateCcw, Plus, ShieldAlert, CheckCircle2, XCircle, Wand2, AlertCircle, HelpCircle } from "lucide-react";

type DetectResult =
  | { result: "valid"; rss_url: string; item_count: number; via: "input" | "pattern" | "alternate"; tried?: string[] }
  | { result: "invalid"; rss_url: string; reason: string; tried?: string[] }
  | { result: "not_found"; tried?: string[] }
  | { result: "manual_review"; reason: string; tried?: string[] };

type SourceStatus = "valid" | "invalid" | "pending" | "archived";

interface SourceRow {
  id: string;
  name: string;
  display_name: string | null;
  type: string | null;
  category: string | null;
  region: string | null;
  url: string | null;
  rss_url: string | null;
  active: boolean;
  is_seed: boolean;
  notes: string | null;
  status: SourceStatus;
  archived_at: string | null;
  priority: number;
}

const sourceSchema = z.object({
  name: z.string().trim().min(1, "שם חובה").max(120),
  display_name: z.string().trim().max(120).optional().or(z.literal("")),
  type: z.string().trim().max(40).optional().or(z.literal("")),
  category: z.string().trim().max(60).optional().or(z.literal("")),
  region: z.enum(["israel", "global"]).optional().or(z.literal("")),
  url: z.string().trim().url("URL לא תקין").max(500).optional().or(z.literal("")),
  rss_url: z.string().trim().url("RSS URL לא תקין").max(500).optional().or(z.literal("")),
  active: z.boolean(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

type FormState = z.infer<typeof sourceSchema>;

const emptyForm: FormState = {
  name: "",
  display_name: "",
  type: "",
  category: "",
  region: "",
  url: "",
  rss_url: "",
  active: true,
  notes: "",
};

export const SourceManager = ({ onRunSource }: { onRunSource: (sourceId: string) => Promise<void> }) => {
  const qc = useQueryClient();
  const { data: sources = [] } = useSources() as { data: SourceRow[] };
  const { data: isAdmin = false, isLoading: roleLoading } = useIsAdmin();

  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<SourceRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [validating, setValidating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return sources
      .filter((s) => !s.is_seed)
      .filter((s) => (showArchived ? true : s.status !== "archived"))
      .sort((a, b) =>
        a.status === "archived" && b.status !== "archived" ? 1 :
        a.status !== "archived" && b.status === "archived" ? -1 :
        (b.priority ?? 0) - (a.priority ?? 0),
      );
  }, [sources, showArchived]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDetectResult(null);
    setCreating(true);
  };
  const openEdit = (s: SourceRow) => {
    setEditing(s);
    setForm({
      name: s.name ?? "",
      display_name: s.display_name ?? "",
      type: s.type ?? "",
      category: s.category ?? "",
      region: (s.region as any) ?? "",
      url: s.url ?? "",
      rss_url: s.rss_url ?? "",
      active: s.active,
      notes: s.notes ?? "",
    });
    setDetectResult(null);
    setCreating(true);
  };

  const detectRss = async () => {
    const candidate = (form.rss_url?.trim() || form.url?.trim() || "").trim();
    if (!candidate || !/^https?:\/\//i.test(candidate)) {
      toast.error("הזן Base URL או RSS URL חוקי קודם");
      return;
    }
    setDetecting(true);
    setDetectResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("detect-rss", { body: { url: candidate } });
      if (error) throw error;
      const r = data as DetectResult;
      setDetectResult(r);
      if (r.result === "valid") {
        setForm((f) => ({ ...f, rss_url: r.rss_url }));
        toast.success(`נמצא RSS תקין (${r.item_count} פריטים) — ${labelVia(r.via)}`);
      } else if (r.result === "invalid") {
        toast.error(`ה-URL הגיב אך אינו feed תקין (${r.reason})`);
      } else if (r.result === "not_found") {
        toast.error("לא נמצא RSS אוטומטית — סמן ידנית או הזן URL ישיר");
      } else {
        toast.error(`דרושה בדיקה ידנית: ${r.reason}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בזיהוי");
      setDetectResult({ result: "manual_review", reason: "error" });
    } finally {
      setDetecting(false);
    }
  };

  const validateRss = async (): Promise<{ valid: boolean; reason?: string; status?: SourceStatus }> => {
    const url = form.rss_url?.trim();
    if (!url) return { valid: true, status: "pending" }; // no rss to validate
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-rss", { body: { url } });
      if (error) throw error;
      const v = data as any;
      if (v?.valid) {
        toast.success(`RSS תקין (${v.item_count ?? 0} פריטים נמצאו)`);
        return { valid: true, status: "valid" };
      }
      toast.error(`RSS לא תקין: ${v?.reason ?? "unknown"}`);
      return { valid: false, reason: v?.reason, status: "invalid" };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאת ולידציה");
      return { valid: false, reason: "error", status: "invalid" };
    } finally {
      setValidating(false);
    }
  };

  const save = async () => {
    const parsed = sourceSchema.safeParse(form);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      toast.error(first.message);
      return;
    }
    setSaving(true);
    try {
      // Run validation if rss_url present
      let nextStatus: SourceStatus = editing?.status ?? "pending";
      if (parsed.data.rss_url) {
        const v = await validateRss();
        nextStatus = v.status ?? "pending";
      } else {
        nextStatus = "pending"; // non-RSS sources stay pending (not runnable in Phase 1)
      }

      const payload: any = {
        name: parsed.data.name,
        display_name: parsed.data.display_name || null,
        type: parsed.data.type || null,
        category: parsed.data.category || null,
        region: parsed.data.region || null,
        url: parsed.data.url || null,
        rss_url: parsed.data.rss_url || null,
        active: parsed.data.active,
        notes: parsed.data.notes || null,
        status: editing?.status === "archived" ? "archived" : nextStatus,
        is_seed: false,
      };

      if (editing) {
        const { error } = await (supabase as any)
          .from("sources").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("המקור עודכן");
      } else {
        const { error } = await (supabase as any).from("sources").insert(payload);
        if (error) throw error;
        toast.success("המקור נוסף");
      }
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["sources"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: SourceRow, next: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from("sources").update({ active: next }).eq("id", s.id);
      if (error) throw error;
      toast.success(next ? "המקור הופעל" : "המקור הושבת — ריצות עתידיות יתעלמו ממנו");
      qc.invalidateQueries({ queryKey: ["sources"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const archive = async (s: SourceRow) => {
    try {
      const { error } = await (supabase as any)
        .from("sources")
        .update({ status: "archived", archived_at: new Date().toISOString(), active: false })
        .eq("id", s.id);
      if (error) throw error;
      toast.success("המקור הועבר לארכיון. פריטים היסטוריים נשמרים.");
      qc.invalidateQueries({ queryKey: ["sources"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const restore = async (s: SourceRow) => {
    try {
      const { error } = await (supabase as any)
        .from("sources")
        .update({ status: s.rss_url ? "valid" : "pending", archived_at: null })
        .eq("id", s.id);
      if (error) throw error;
      toast.success("המקור שוחזר");
      qc.invalidateQueries({ queryKey: ["sources"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const runOne = async (s: SourceRow) => {
    setRunningId(s.id);
    try {
      await onRunSource(s.id);
    } finally {
      setRunningId(null);
    }
  };

  if (roleLoading) {
    return <div className="surface-card p-6 text-sm text-muted-foreground">טוען הרשאות...</div>;
  }
  if (!isAdmin) {
    return (
      <div className="surface-card p-6 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h2 className="text-lg font-bold text-primary">ניהול מקורות</h2>
          <p className="text-sm text-muted-foreground mt-1">
            דרושות הרשאות אדמין כדי להוסיף, לערוך או לארכב מקורות.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="surface-card p-6">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-primary">ניהול מקורות</h2>
            <p className="text-sm text-muted-foreground">
              הוסף, ערוך, השבת או ארכב מקורות. ארכוב משאיר את הפריטים ההיסטוריים במקומם.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="show-archived" className="text-xs cursor-pointer">הצג ארכיון</Label>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1" /> מקור חדש
            </Button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="text-sm text-muted-foreground">אין מקורות להצגה</div>
        ) : (
          <div className="space-y-2">
            {visible.map((s) => (
              <SourceRowCard
                key={s.id}
                source={s}
                runningId={runningId}
                onEdit={() => openEdit(s)}
                onToggleActive={(v) => toggleActive(s, v)}
                onArchive={() => archive(s)}
                onRestore={() => restore(s)}
                onRun={() => runOne(s)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת מקור" : "מקור חדש"}</DialogTitle>
            <DialogDescription className="text-xs">
              שדות בסיסיים נחוצים ל-ingestion. RSS לא חובה — מקור ללא RSS יישמר כ-pending ולא יוטמע ב-Phase 1.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label="שם (פנימי)" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
            </Field>
            <Field label="שם תצוגה">
              <Input value={form.display_name ?? ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} maxLength={120} />
            </Field>
            <Field label="סוג (source_type)">
              <Input value={form.type ?? ""} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="news / events / research" maxLength={40} />
            </Field>
            <Field label="קטגוריה (source_category)">
              <Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={60} />
            </Field>
            <Field label="אזור">
              <Select
                value={(form.region as string) || ""}
                onValueChange={(v) => setForm({ ...form, region: v as any })}
              >
                <SelectTrigger><SelectValue placeholder="בחר אזור" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="israel">ישראל</SelectItem>
                  <SelectItem value="global">גלובלי</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="פעיל">
              <div className="flex items-center h-10">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              </div>
            </Field>
            <Field label="Base URL" full>
              <div className="flex gap-2">
                <Input dir="ltr" value={form.url ?? ""} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." maxLength={500} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={detectRss}
                  disabled={detecting || (!form.url && !form.rss_url)}
                  className="gap-1.5 shrink-0"
                  title="זהה RSS אוטומטית מתוך הדומיין"
                >
                  {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  זהה RSS
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                בודק את ה-URL כפי שהוא, מסלולי RSS נפוצים, וקישורי alternate בעמוד. עוזר אך לא מובטח.
              </p>
            </Field>
            <Field label="RSS URL" full>
              <div className="flex gap-2">
                <Input dir="ltr" value={form.rss_url ?? ""} onChange={(e) => setForm({ ...form, rss_url: e.target.value })} placeholder="https://.../rss" maxLength={500} />
                <Button type="button" variant="outline" size="sm" onClick={validateRss} disabled={validating || !form.rss_url}>
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : "בדוק"}
                </Button>
              </div>
              {detectResult && <DetectBanner r={detectResult} />}
            </Field>
            <Field label="הערות" full>
              <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} rows={3} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>ביטול</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editing ? "עדכן" : "צור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const Field = ({ label, children, required, full }: { label: string; children: React.ReactNode; required?: boolean; full?: boolean }) => (
  <div className={cn("space-y-1", full && "col-span-2")}>
    <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
    {children}
  </div>
);

const SourceRowCard = ({
  source: s, runningId, onEdit, onToggleActive, onArchive, onRestore, onRun,
}: {
  source: SourceRow;
  runningId: string | null;
  onEdit: () => void;
  onToggleActive: (v: boolean) => void;
  onArchive: () => void;
  onRestore: () => void;
  onRun: () => void;
}) => {
  const archived = s.status === "archived";
  const runnable = !archived && s.active && !!s.rss_url && s.status === "valid";
  const displayName = s.display_name || s.name;
  const isRunning = runningId === s.id;

  return (
    <div className={cn(
      "p-3 rounded-md border bg-background/50",
      archived ? "border-border/40 opacity-60" : "border-border",
    )}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{displayName}</span>
            <StatusBadge status={s.status} />
            {!s.active && !archived && <Badge variant="outline" className="text-xs">מושבת</Badge>}
            {s.region && <Badge variant="secondary" className="text-xs">{s.region === "israel" ? "ישראל" : "גלובלי"}</Badge>}
            {s.type && <Badge variant="outline" className="text-xs">{s.type}</Badge>}
            {runnable ? (
              <Badge className="text-xs bg-green-500/15 text-green-600 hover:bg-green-500/20 border-0">runnable</Badge>
            ) : !archived ? (
              <Badge variant="outline" className="text-xs text-muted-foreground">לא runnable</Badge>
            ) : null}
          </div>
          {s.rss_url && (
            <div className="text-xs text-muted-foreground truncate mt-1" dir="ltr">{s.rss_url}</div>
          )}
          {s.notes && <div className="text-xs text-muted-foreground mt-1 line-clamp-1">📝 {s.notes}</div>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!archived && (
            <Switch checked={s.active} onCheckedChange={onToggleActive} aria-label="toggle active" />
          )}
          {runnable && (
            <Button size="sm" variant="outline" onClick={onRun} disabled={isRunning}>
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} disabled={archived}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {archived ? (
            <Button size="sm" variant="ghost" onClick={onRestore}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onArchive}>
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: SourceStatus }) => {
  const map = {
    valid:    { label: "תקין",    cls: "bg-green-500/15 text-green-600 border-0",    icon: <CheckCircle2 className="h-3 w-3" /> },
    invalid:  { label: "שגוי",    cls: "bg-destructive/15 text-destructive border-0", icon: <XCircle className="h-3 w-3" /> },
    pending:  { label: "ממתין",   cls: "bg-amber-500/15 text-amber-600 border-0",     icon: null },
    archived: { label: "ארכיון",  cls: "bg-muted text-muted-foreground border-0",     icon: null },
  } as const;
  const m = map[status];
  return (
    <Badge className={cn("text-xs gap-1", m.cls)}>
      {m.icon}{m.label}
    </Badge>
  );
};
