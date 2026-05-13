import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Item, Source, ItemUserState } from "@/lib/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RegionBadge } from "./RegionBadge";
import { formatHeDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Bookmark, BookmarkCheck, ExternalLink, ThumbsDown, ThumbsUp, Check,
  MapPin, Calendar, Eye, Mail, FileText, Sparkles, Loader2, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildMailtoUrl } from "@/lib/mailto";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SummaryResult {
  brief: string;
  key_points: string[];
  implications: string;
}

interface Props {
  item: Item | null;
  source?: Source;
  state: ItemUserState;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAction: (a: "view" | "mark_read" | "save" | "unsave" | "like" | "dislike" | "open_source") => void;
}

export const ItemDrawer = ({ item, source, state, open, onOpenChange, onAction }: Props) => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    if (open && item) {
      onAction("view");
      setSummary(null);
      setSummaryOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const summarize = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("אין פריט");
      const { data, error } = await supabase.functions.invoke("summarize-item", {
        body: { item_id: item.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as SummaryResult;
    },
    onSuccess: (result) => {
      setSummary(result);
      setSummaryOpen(true);
    },
    onError: (e: Error) => toast.error(e.message ?? "שגיאה בסיכום"),
  });

  const writeArticle = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("אין פריט");
      const { data, error } = await supabase.functions.invoke("generate-article", {
        body: { item_ids: [item.id] },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any).draft_id as string;
    },
    onSuccess: (draftId) => {
      toast.success("טיוטת מאמר נוצרה");
      qc.invalidateQueries({ queryKey: ["article_drafts"] });
      onOpenChange(false);
      nav(`/drafts/${draftId}`);
    },
    onError: (e: Error) => toast.error(e.message ?? "שגיאה ביצירת המאמר"),
  });

  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="text-start">
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <RegionBadge region={item.region} />
            {source && <span className="font-medium text-foreground/70">{source.name}</span>}
            <span>•</span>
            <span>{formatHeDateTime(item.published_at)}</span>
            <span className="inline-flex items-center gap-1 mr-auto">
              <Eye className="h-3 w-3" /> {item.view_count}
            </span>
          </div>
          <SheetTitle className="text-2xl text-primary leading-snug pt-2">{item.title_he}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {item.summary_he && <p className="text-foreground/80 leading-relaxed">{item.summary_he}</p>}

          {item.item_type === "event" && (
            <div className="surface-card p-4 space-y-2 text-sm">
              {item.event_date && (
                <div className="flex items-center gap-2 text-foreground">
                  <Calendar className="h-4 w-4 text-accent" />
                  <span className="font-medium">{formatHeDateTime(item.event_date)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-foreground">
                <MapPin className="h-4 w-4 text-accent" />
                <span>{item.event_is_online ? "אונליין" : item.event_location ?? "—"}</span>
              </div>
              {item.event_register_url && (
                <Button asChild size="sm" className="mt-2">
                  <a href={item.event_register_url} target="_blank" rel="noreferrer">פרטים והרשמה</a>
                </Button>
              )}
            </div>
          )}

          {item.why_it_matters && (
            <div className="bg-highlight border border-highlight-border text-highlight-foreground rounded-xl p-4 leading-relaxed">
              <div className="font-semibold mb-1">למה זה חשוב</div>
              {item.why_it_matters}
            </div>
          )}

          {/* AI Summary */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (!summary && !summarize.isPending) summarize.mutate();
                else setSummaryOpen((v) => !v);
              }}
              disabled={summarize.isPending}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-primary hover:bg-muted/30 transition-colors"
            >
              <span className="flex items-center gap-2">
                {summarize.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  : <Sparkles className="h-4 w-4 text-accent" />}
                {summarize.isPending ? "מסכם..." : "סיכום AI"}
              </span>
              {summary && (
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", summaryOpen && "rotate-180")} />
              )}
            </button>
            {summary && summaryOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-border">
                <p className="text-sm text-foreground/80 leading-relaxed pt-3">{summary.brief}</p>
                {summary.key_points.length > 0 && (
                  <ul className="space-y-1">
                    {summary.key_points.map((pt, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-accent font-bold shrink-0">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {summary.implications && (
                  <div className="text-xs text-muted-foreground border-t border-border pt-2">
                    <span className="font-medium text-foreground">השלכות: </span>
                    {summary.implications}
                  </div>
                )}
              </div>
            )}
          </div>

          {item.tags_ai.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags_ai.map((t) => (
                <span key={t} className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-md">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Write Article CTA */}
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">כתוב מאמר מידיעה זו</p>
              <p className="text-xs text-muted-foreground">יצור טיוטת מאמר מלאה בלחיצה אחת</p>
            </div>
            <Button
              size="sm"
              onClick={() => writeArticle.mutate()}
              disabled={writeArticle.isPending}
              className="gap-1.5 shrink-0"
            >
              {writeArticle.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <FileText className="h-4 w-4" />}
              {writeArticle.isPending ? "יוצר..." : "צור מאמר"}
            </Button>
          </div>

          <div className="flex items-center gap-1 flex-wrap pt-2 border-t border-border">
            {item.url && (
              <Button variant="ghost" size="sm" asChild onClick={() => onAction("open_source")}>
                <a href={item.url} target="_blank" rel="noreferrer" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> פתח מקור
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <a
                href={buildMailtoUrl({
                  kind: item.item_type === "event" ? "event" : "article",
                  title: item.title_he,
                  date: item.item_type === "event" ? item.event_date : item.published_at,
                  location: item.event_location,
                  isOnline: item.event_is_online,
                  summary: item.summary_he,
                  whyItMatters: item.why_it_matters,
                  url: item.url,
                  sourceName: source?.name,
                })}
                className="gap-1.5"
              >
                <Mail className="h-3.5 w-3.5" /> שלח במייל
              </a>
            </Button>
            {!state.read && (
              <Button variant="ghost" size="sm" onClick={() => onAction("mark_read")} className="gap-1.5">
                <Check className="h-3.5 w-3.5" /> סמן כנקרא
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAction(state.saved ? "unsave" : "save")}
              className={cn("gap-1.5", state.saved && "text-accent")}
            >
              {state.saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
              שמירה
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAction("like")}
              className={cn("gap-1.5", state.liked && "text-accent")}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAction("dislike")}
              className={cn("gap-1.5", state.disliked && "text-destructive")}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
