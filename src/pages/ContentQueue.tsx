import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Copy, Check, ExternalLink, CheckCircle2, SkipForward, Trash2, Send, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PLATFORM_META, platformLabel, type SchedulablePlatform } from "@/lib/platforms";

interface ScheduledPost {
  id: string;
  draft_id: string | null;
  platform: SchedulablePlatform;
  content: string;
  scheduled_at: string;
  status: "queued" | "due" | "published" | "skipped";
  published_at: string | null;
}

type Filter = "active" | "published" | "all";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = d.getTime() - now;
  const absMin = Math.round(Math.abs(diff) / 60000);
  const rel =
    absMin < 60 ? `${absMin} ד׳` :
    absMin < 60 * 24 ? `${Math.round(absMin / 60)} ש׳` :
    `${Math.round(absMin / 60 / 24)} ימים`;
  const when = d.toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return diff >= 0 ? `${when} · בעוד ${rel}` : `${when} · לפני ${rel}`;
}

const STATUS_META: Record<ScheduledPost["status"], { label: string; cls: string }> = {
  queued:    { label: "מתוזמן",  cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  due:       { label: "מוכן לפרסום", cls: "bg-accent/15 text-accent border-accent/30" },
  published: { label: "פורסם",   cls: "bg-green-500/10 text-green-600 border-green-500/20" },
  skipped:   { label: "דולג",    cls: "bg-muted text-muted-foreground border-border" },
};

const ContentQueue = () => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("active");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["scheduled_posts"],
    queryFn: async (): Promise<ScheduledPost[]> => {
      const { data, error } = await (supabase as any)
        .from("scheduled_posts")
        .select("id,draft_id,platform,content,scheduled_at,status,published_at")
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduledPost[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ScheduledPost["status"] }) => {
      const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "published") patch.published_at = new Date().toISOString();
      const { error } = await (supabase as any).from("scheduled_posts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled_posts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("scheduled_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scheduled_posts"] }); toast.success("הוסר מהתור"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishNow = async (p: ScheduledPost) => {
    await navigator.clipboard.writeText(p.content).catch(() => {});
    setCopiedId(p.id);
    setTimeout(() => setCopiedId((c) => (c === p.id ? null : c)), 2000);
    const url = PLATFORM_META[p.platform]?.composerUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    toast.success("התוכן הועתק — הדבק בפלטפורמה");
  };

  const filtered = useMemo(() => {
    if (filter === "all") return posts;
    if (filter === "published") return posts.filter((p) => p.status === "published" || p.status === "skipped");
    return posts.filter((p) => p.status === "queued" || p.status === "due");
  }, [posts, filter]);

  const activeCount = posts.filter((p) => p.status === "queued" || p.status === "due").length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-primary flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-accent" />
              תור פרסום
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              התוכן המתוזמן לרשתות. כשמגיע הזמן — תקבל מייל עם התוכן מוכן, וכאן אפשר לפרסם בלחיצה.
            </p>
          </div>
          <div className="flex gap-1.5">
            {([["active", `פעילים${activeCount ? ` (${activeCount})` : ""}`], ["published", "פורסמו"], ["all", "הכל"]] as [Filter, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">טוען...</div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>אין כאן עדיין תוכן. תזמן פוסטים מתוך עורך הטיוטה ("תזמן לרשתות").</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const meta = PLATFORM_META[p.platform];
              const done = p.status === "published" || p.status === "skipped";
              return (
                <Card key={p.id} className={cn("p-4 space-y-3", done && "opacity-70")}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-semibold text-sm", meta?.color)}>{platformLabel(p.platform)}</span>
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_META[p.status].cls)}>
                        {STATUS_META[p.status].label}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {formatWhen(p.scheduled_at)}
                    </span>
                  </div>

                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-4" dir={meta?.dir ?? "rtl"}>
                    {p.content}
                  </p>

                  <div className="flex items-center gap-2 pt-1 border-t border-border flex-wrap">
                    {!done && (
                      <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => publishNow(p)}>
                        {copiedId === p.id ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                        פרסם עכשיו
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                      onClick={() => navigator.clipboard.writeText(p.content).then(() => { setCopiedId(p.id); setTimeout(() => setCopiedId((c) => c === p.id ? null : c), 2000); toast.success("הועתק"); })}>
                      {copiedId === p.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      העתק
                    </Button>
                    {meta?.composerUrl && (
                      <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
                        <a href={meta.composerUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> פתח</a>
                      </Button>
                    )}
                    {!done && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-green-600"
                        onClick={() => setStatus.mutate({ id: p.id, status: "published" })}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> סמן כפורסם
                      </Button>
                    )}
                    {!done && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-muted-foreground"
                        onClick={() => setStatus.mutate({ id: p.id, status: "skipped" })}>
                        <SkipForward className="h-3.5 w-3.5" /> דלג
                      </Button>
                    )}
                    {p.draft_id && (
                      <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 text-xs mr-auto">
                        <Link to={`/drafts/${p.draft_id}`}><FileText className="h-3.5 w-3.5" /> לטיוטה</Link>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                      onClick={() => remove.mutate(p.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default ContentQueue;
