import { useEffect } from "react";
import type { Item, Source, ItemUserState } from "@/lib/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RegionBadge } from "./RegionBadge";
import { formatHeDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck, ExternalLink, ThumbsDown, ThumbsUp, Check, MapPin, Calendar, Eye, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildMailtoUrl } from "@/lib/mailto";

interface Props {
  item: Item | null;
  source?: Source;
  state: ItemUserState;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAction: (a: "view" | "mark_read" | "save" | "unsave" | "like" | "dislike" | "open_source") => void;
}

export const ItemDrawer = ({ item, source, state, open, onOpenChange, onAction }: Props) => {
  useEffect(() => {
    if (open && item) onAction("view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

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

          {item.tags_ai.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags_ai.map((t) => (
                <span key={t} className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-md">
                  #{t}
                </span>
              ))}
            </div>
          )}

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
