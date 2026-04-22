import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Bookmark, Calendar, MapPin, ExternalLink, Trash2, Mail, CalendarPlus,
  Globe, Building2, Sparkles, Loader2, CheckCircle2, ArrowUpCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface SavedRow {
  id: string;
  title: string;
  event_date: string | null;
  location: string | null;
  is_online: boolean | null;
  source_name: string | null;
  source_url: string;
  summary: string | null;
  why_it_matters: string | null;
  query: string | null;
  created_at: string;
  promoted_to_item_id: string | null;
}

type FormatFilter = "any" | "online" | "physical";
type StatusFilter = "any" | "promoted" | "not_promoted";

function formatHeDate(iso: string | null) {
  if (!iso) return "תאריך לא ידוע";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "תאריך לא ידוע";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

function toGoogleCalendarUrl(ev: SavedRow) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const text = encodeURIComponent(ev.title);
  const details = encodeURIComponent(`${ev.summary ?? ""}\n\n${ev.why_it_matters ?? ""}\n\n${ev.source_url}`);
  const location = encodeURIComponent(ev.is_online ? "Online" : ev.location ?? "");
  let dates = "";
  if (ev.event_date) {
    const d = new Date(ev.event_date);
    if (!isNaN(d.getTime())) {
      const start = d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const end = new Date(d.getTime() + 60 * 60 * 1000)
        .toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      dates = `&dates=${start}/${end}`;
    }
  }
  return `${base}&text=${text}&details=${details}&location=${location}${dates}`;
}

function toMailtoUrl(ev: SavedRow) {
  const subject = encodeURIComponent(`אירוע: ${ev.title}`);
  const body = encodeURIComponent(
    `${ev.title}\n\n` +
    `מתי: ${formatHeDate(ev.event_date)}\n` +
    `איפה: ${ev.is_online ? "אונליין" : ev.location ?? "לא ידוע"}\n` +
    `מקור: ${ev.source_name ?? ""}\n\n` +
    `${ev.summary ?? ""}\n\nלמה זה חשוב:\n${ev.why_it_matters ?? ""}\n\nקישור: ${ev.source_url}`,
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

const Saved = () => {
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [format, setFormat] = useState<FormatFilter>("any");
  const [status, setStatus] = useState<StatusFilter>("any");

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["saved_discoveries_full", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_discoveries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (format === "online" && r.is_online !== true) return false;
      if (format === "physical" && r.is_online === true) return false;
      if (status === "promoted" && !r.promoted_to_item_id) return false;
      if (status === "not_promoted" && r.promoted_to_item_id) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q) ||
        (r.source_name ?? "").toLowerCase().includes(q) ||
        (r.location ?? "").toLowerCase().includes(q) ||
        (r.query ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, format, status]);

  const removeOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_discoveries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_discoveries_full"] });
      qc.invalidateQueries({ queryKey: ["saved_discoveries"] });
      toast({ title: "הוסר", description: "הפריט הוסר מהרשימה השמורה." });
    },
    onError: (e: Error) =>
      toast({ title: "שגיאה במחיקה", description: e.message, variant: "destructive" }),
  });

  const promote = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc("promote_discovery_to_item", {
        _discovery_id: id,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_discoveries_full"] });
      toast({
        title: "קודם לאירועים",
        description: "הפריט נוסף לזרם האירועים המנוהל.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "שגיאה בקידום", description: e.message, variant: "destructive" }),
  });

  const promotedCount = rows.filter((r) => r.promoted_to_item_id).length;

  return (
    <AppLayout>
      <div className="space-y-8">
        <section className="rounded-2xl bg-gradient-to-br from-accent/5 via-primary/5 to-background border border-border p-8">
          <div className="flex items-center gap-2 text-accent text-xs font-semibold uppercase tracking-widest mb-2">
            <Bookmark className="h-3.5 w-3.5" /> השמורים שלי
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary mb-1">
            אירועים ששמרת מחיפוש חכם
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            רשימה פרטית של כל תוצאות החיפוש שסימנת לשמירה. {rows.length} פריטים
            {isAdmin && promotedCount > 0 && ` · ${promotedCount} כבר קודמו לאירועים`}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              placeholder="חיפוש בכותרות, סיכומים..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-background"
            />
            <Select value={format} onValueChange={(v) => setFormat(v as FormatFilter)}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">כל פורמט</SelectItem>
                <SelectItem value="online">אונליין</SelectItem>
                <SelectItem value="physical">פיזי</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">כל הסטטוסים</SelectItem>
                <SelectItem value="promoted">קודמו לאירועים</SelectItem>
                <SelectItem value="not_promoted">לא קודמו</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section>
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {rows.length === 0 ? (
                <>
                  עדיין לא שמרת אירועים. עבור ל
                  <a href="/discover" className="text-accent hover:underline mx-1">חיפוש אירועים</a>
                  כדי להתחיל.
                </>
              ) : (
                "לא נמצאו תוצאות מתאימות לפילטרים."
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((r) => (
              <SavedCard
                key={r.id}
                row={r}
                isAdmin={!!isAdmin}
                onRemove={() => removeOne.mutate(r.id)}
                onPromote={() => promote.mutate(r.id)}
                isPromoting={promote.isPending && promote.variables === r.id}
              />
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

const SavedCard = ({
  row, isAdmin, onRemove, onPromote, isPromoting,
}: {
  row: SavedRow;
  isAdmin: boolean;
  onRemove: () => void;
  onPromote: () => void;
  isPromoting: boolean;
}) => {
  const promoted = !!row.promoted_to_item_id;
  return (
    <Card className="p-5 flex flex-col gap-3 border-border bg-card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-primary leading-snug flex-1">{row.title}</h3>
        <div className="flex flex-col gap-1 items-end shrink-0">
          {row.is_online ? (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
              <Globe className="h-3 w-3 inline ml-1" />אונליין
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
              פיזי
            </span>
          )}
          {promoted && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> קודם
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatHeDate(row.event_date)}</span>
        {row.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{row.location}</span>}
        {row.source_name && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{row.source_name}</span>}
      </div>

      {row.summary && <p className="text-sm text-foreground/80 leading-relaxed">{row.summary}</p>}

      {row.why_it_matters && (
        <div className="text-xs bg-accent/5 border-r-2 border-accent rounded p-2.5 text-foreground/70">
          <span className="font-semibold text-accent">למה זה חשוב: </span>{row.why_it_matters}
        </div>
      )}

      {row.query && (
        <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> נשמר מחיפוש: <span className="text-muted-foreground">{row.query}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1 mt-auto">
        <Button asChild size="sm" variant="default" className="gap-1.5">
          <a href={row.source_url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> פרטים
          </a>
        </Button>
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <a href={toGoogleCalendarUrl(row)} target="_blank" rel="noreferrer">
            <CalendarPlus className="h-3.5 w-3.5" /> ליומן
          </a>
        </Button>
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <a href={toMailtoUrl(row)}>
            <Mail className="h-3.5 w-3.5" /> שלח במייל
          </a>
        </Button>

        {isAdmin && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={promoted || isPromoting}
                className="gap-1.5"
              >
                {isPromoting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
                {promoted ? "כבר קודם" : "קדם לאירועים"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>קידום לזרם האירועים המנוהל?</AlertDialogTitle>
                <AlertDialogDescription>
                  הפעולה תוסיף את "{row.title}" כאירוע רשמי שיופיע לכל המשתמשים בעמוד האירועים. ניתן לעשות זאת פעם אחת בלבד לפריט.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={onPromote}>אישור וקידום</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> הסר
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>להסיר מהשמורים?</AlertDialogTitle>
              <AlertDialogDescription>
                הפריט יוסר רק מהרשימה הפרטית שלך. אם הוא כבר קודם לאירועים — האירוע עצמו יישאר.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove}>הסר</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
};

export default Saved;