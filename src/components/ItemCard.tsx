import type { Item, Source, ItemUserState } from "@/lib/types";
import { RegionBadge } from "./RegionBadge";
import { formatHeRelative } from "@/lib/format";
import { Bookmark, BookmarkCheck, ExternalLink, ThumbsDown, ThumbsUp, Check, Calendar, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { buildMailtoUrl } from "@/lib/mailto";

interface Props {
  item: Item;
  source?: Source;
  state: ItemUserState;
  onOpen: () => void;
  onAction: (a: "mark_read" | "save" | "unsave" | "like" | "dislike" | "open_source") => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
}

export const ItemCard = ({
  item, source, state, onOpen, onAction,
  selectable, selected, onToggleSelected,
}: Props) => {
  return (
    <article
      className={cn(
        "surface-card p-6 transition-all hover:shadow-md cursor-pointer animate-fade-in",
        state.read && "opacity-75",
        selectable && selected && "ring-2 ring-accent border-accent",
      )}
      onClick={(e) => {
        if (selectable) {
          e.preventDefault();
          onToggleSelected?.();
          return;
        }
        onOpen();
      }}
    >
      {selectable && (
        <div
          className="flex items-center gap-2 mb-3 text-xs text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={!!selected}
            onCheckedChange={() => onToggleSelected?.()}
            aria-label="בחר פריט למאמר"
          />
          <span>{selected ? "נבחר ליצירת מאמר" : "סמן לבחירה"}</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 flex-wrap">
        <RegionBadge region={item.region} />
        {source && <span className="font-medium text-foreground/70">{source.name}</span>}
        <span>•</span>
        <span>{formatHeRelative(item.published_at)}</span>
        {item.item_type === "event" && (
          <span className="inline-flex items-center gap-1 mr-auto rounded-full bg-accent-soft text-accent-soft-foreground px-2 py-0.5 font-medium">
            <Calendar className="h-3 w-3" /> אירוע
          </span>
        )}
        {item.item_type === "research" && (
          <span className="mr-auto rounded-full bg-accent-soft text-accent-soft-foreground px-2 py-0.5 font-medium">מחקר</span>
        )}
      </div>

      <h3 className="text-lg font-bold text-primary leading-snug mb-2">{item.title_he}</h3>
      {item.summary_he && <p className="text-muted-foreground leading-relaxed text-sm mb-4">{item.summary_he}</p>}

      {item.why_it_matters && (
        <div className="bg-highlight border border-highlight-border text-highlight-foreground rounded-xl px-4 py-3 mb-4 text-sm leading-relaxed">
          <span className="font-semibold ml-1">למה זה חשוב:</span>
          {item.why_it_matters}
        </div>
      )}

      {item.tags_ai.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {item.tags_ai.map((t) => (
            <span key={t} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {item.url && (
          <Button variant="ghost" size="sm" asChild onClick={() => onAction("open_source")}>
            <a href={item.url} target="_blank" rel="noreferrer" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              פתח מקור
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
          {state.saved ? "שמור" : "שמירה"}
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
    </article>
  );
};
