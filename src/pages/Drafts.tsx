import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  FileText, Sparkles, Loader2, Mail, Trash2, Pencil,
  CheckCircle2, Archive as ArchiveIcon, RotateCcw, User,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildMailtoUrl } from "@/lib/mailto";

type DraftStatus = "draft" | "approved" | "archived";
type ContentType = "linkedin" | "blog_he" | "blog_en";

interface DraftRow {
  id: string;
  title: string;
  intro: string | null;
  source_item_ids: string[];
  created_at: string;
  status: DraftStatus;
  content_type: ContentType;
  user_id: string | null;
}

const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  linkedin: "פוסט",
  blog_he: "מאמר עברית",
  blog_en: "מאמר אנגלית",
};

const CONTENT_TYPE_COLOR: Record<ContentType, string> = {
  linkedin: "bg-blue-500/10 text-blue-700 border-blue-300/40 dark:text-blue-400",
  blog_he: "bg-purple-500/10 text-purple-700 border-purple-300/40 dark:text-purple-400",
  blog_en: "bg-indigo-500/10 text-indigo-700 border-indigo-300/40 dark:text-indigo-400",
};

const tabs: { id: DraftStatus; label: string; emptyHint: string }[] = [
  { id: "draft", label: "טיוטות", emptyHint: "עדיין לא יצרת טיוטות. בעמוד הראשי בחר פריטים ולחץ \"צור מאמר מהנבחרים\"." },
  { id: "approved", label: "מאושרים", emptyHint: "אין מאמרים מאושרים. סמן טיוטה כמאושרת מתוך כרטיס הטיוטה." },
  { id: "archived", label: "ארכיון", emptyHint: "אין מאמרים בארכיון." },
];

const statusBadge: Record<DraftStatus, string> = {
  draft: "bg-accent/10 text-accent border-accent/20",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  archived: "bg-muted text-muted-foreground border-border",
};

const statusLabel: Record<DraftStatus, string> = {
  draft: "טיוטה",
  approved: "מאושר",
  archived: "בארכיון",
};

const Drafts = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<DraftStatus>("draft");
  const [contentFilter, setContentFilter] = useState<ContentType | "all">("all");

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["article_drafts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("article_drafts")
        .select("id,title,intro,source_item_ids,created_at,status,content_type,user_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DraftRow[];
    },
  });

  const { data: profilesMap = {} } = useQuery({
    enabled: rows.length > 0,
    queryKey: ["profiles", rows.map((r) => r.user_id).filter(Boolean).join(",")],
    queryFn: async () => {
      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
      if (!userIds.length) return {};
      const { data } = await (supabase as any)
        .from("profiles")
        .select("user_id,first_name")
        .in("user_id", userIds);
      return Object.fromEntries((data ?? []).map((p: any) => [p.user_id, p.first_name]));
    },
  });

  const counts = useMemo(() => {
    const c: Record<DraftStatus, number> = { draft: 0, approved: 0, archived: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const filtered = useMemo(
    () => rows
      .filter((r) => r.status === tab)
      .filter((r) => contentFilter === "all" || (r.content_type ?? "linkedin") === contentFilter)
      .map((r) => ({
      ...r,
      created_label: new Date(r.created_at).toLocaleString("he-IL", {
        day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      }),
    })),
    [rows, tab, contentFilter],
  );

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DraftStatus }) => {
      const { error } = await (supabase as any)
        .from("article_drafts").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.status === "approved" ? "המאמר אושר"
        : v.status === "archived" ? "המאמר הועבר לארכיון"
        : "המאמר הוחזר לטיוטות",
      );
      qc.invalidateQueries({ queryKey: ["article_drafts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("article_drafts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("המאמר נמחק");
      qc.invalidateQueries({ queryKey: ["article_drafts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppLayout>
      <div className="rounded-2xl bg-gradient-to-br from-accent/5 via-primary/5 to-background border border-border p-6 mb-6">
        <div className="flex items-center gap-2 text-accent text-xs font-semibold uppercase tracking-widest mb-2">
          <Sparkles className="h-3.5 w-3.5" /> מאמרים שיצרת
        </div>
        <h1 className="text-2xl font-bold text-primary mb-1">מאמרים משותפים</h1>
        <p className="text-sm text-muted-foreground">
          כל המאמרים שנוצרו על ידי כל חברי הצוות. ניתן לערוך, לאשר ולשתף כל מאמר.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2",
              tab === t.id
                ? "border-accent text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className={cn(
              "text-[11px] px-1.5 rounded-full border",
              tab === t.id ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-muted text-muted-foreground",
            )}>
              {counts[t.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Content type filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([["all", "הכל"], ["linkedin", "פוסט"], ["blog_he", "מאמר עברית"], ["blog_en", "מאמר אנגלית"]] as [string, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setContentFilter(id as ContentType | "all")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              contentFilter === id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface-card p-12 text-center text-muted-foreground">
          {tabs.find((t) => t.id === tab)?.emptyHint}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((d) => {
            const mailto = buildMailtoUrl({
              kind: "generated_article",
              title: d.title,
              summary: d.intro ?? undefined,
            });
            return (
              <Card key={d.id} className="p-5 flex flex-col gap-3 border-border hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1 uppercase tracking-wider">
                      <FileText className="h-3.5 w-3.5" />
                      {d.created_label}
                    </span>
                    {d.user_id && profilesMap[d.user_id] && (
                      <span className="flex items-center gap-1 bg-secondary px-1.5 py-0.5 rounded">
                        <User className="h-3 w-3" />
                        {profilesMap[d.user_id]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border font-medium",
                      CONTENT_TYPE_COLOR[(d.content_type ?? "linkedin") as ContentType],
                    )}>
                      {CONTENT_TYPE_LABEL[(d.content_type ?? "linkedin") as ContentType]}
                    </span>
                    <span className={cn(
                      "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-semibold",
                      statusBadge[d.status],
                    )}>
                      {statusLabel[d.status]}
                    </span>
                  </div>
                </div>

                <Link to={`/drafts/${d.id}`} className="group">
                  <h3 className="text-base font-semibold text-primary leading-snug group-hover:text-accent transition-colors">
                    {d.title}
                  </h3>
                  {d.intro && (
                    <p className="text-sm text-foreground/70 leading-relaxed line-clamp-3 mt-1.5">{d.intro}</p>
                  )}
                </Link>

                <div className="text-[11px] text-muted-foreground">
                  מבוסס על {d.source_item_ids.length} פריטים
                </div>

                <div className="flex items-center gap-1 flex-wrap pt-2 border-t border-border mt-auto">
                  <Button size="sm" variant="ghost" onClick={() => nav(`/drafts/${d.id}`)} className="gap-1.5 h-8">
                    <Pencil className="h-3.5 w-3.5" /> ערוך
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="h-8">
                    <a href={mailto} className="gap-1.5 inline-flex items-center">
                      <Mail className="h-3.5 w-3.5" /> שלח
                    </a>
                  </Button>
                  {d.status !== "approved" && (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => updateStatus.mutate({ id: d.id, status: "approved" })}
                      className="gap-1.5 h-8 text-emerald-600 hover:text-emerald-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> אשר
                    </Button>
                  )}
                  {d.status !== "archived" ? (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => updateStatus.mutate({ id: d.id, status: "archived" })}
                      className="gap-1.5 h-8"
                    >
                      <ArchiveIcon className="h-3.5 w-3.5" /> ארכיון
                    </Button>
                  ) : (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => updateStatus.mutate({ id: d.id, status: "draft" })}
                      className="gap-1.5 h-8"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> שחזר
                    </Button>
                  )}
                  <div className="flex-1" />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>למחוק את המאמר?</AlertDialogTitle>
                        <AlertDialogDescription>הפעולה אינה הפיכה.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>ביטול</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(d.id)}>מחק</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
};

export default Drafts;