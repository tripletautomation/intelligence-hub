import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useItems, useSources } from "@/hooks/useIntelligence";
import { formatHeDateTime } from "@/lib/format";
import { RegionBadge } from "@/components/RegionBadge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Item, Source } from "@/lib/types";

type Bucket = "this_month" | "next_month" | "past";

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfNextMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
const startOfMonthAfterNext = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 2, 1);

const bucketOf = (iso: string | null | undefined, now: Date): Bucket | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  if (t < now.getTime()) return "past";
  if (t < startOfNextMonth(now).getTime()) return "this_month";
  if (t < startOfMonthAfterNext(now).getTime()) return "next_month";
  // Beyond next month — group with "next month" so users still see them in upcoming
  return "next_month";
};

const Events = () => {
  const { data: items = [] } = useItems();
  const { data: sources = [] } = useSources();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"all" | "online" | "physical">("all");
  const [region, setRegion] = useState<"all" | "israel" | "global">("all");

  const sourcesById = useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => i.item_type === "event")
      .filter((i) => {
        if (mode === "online" && !i.event_is_online) return false;
        if (mode === "physical" && i.event_is_online) return false;
        if (region !== "all" && i.region !== region) return false;
        if (q && !`${i.title_he} ${i.summary_he ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [items, mode, region, search]);

  const { thisMonth, nextMonth, past } = useMemo(() => {
    const now = new Date();
    const groups: Record<Bucket, Item[]> = { this_month: [], next_month: [], past: [] };
    for (const ev of filtered) {
      const b = bucketOf(ev.event_date, now);
      if (b) groups[b].push(ev);
    }
    const ascByDate = (a: Item, b: Item) =>
      new Date(a.event_date!).getTime() - new Date(b.event_date!).getTime();
    const descByDate = (a: Item, b: Item) =>
      new Date(b.event_date!).getTime() - new Date(a.event_date!).getTime();
    return {
      thisMonth: groups.this_month.sort(ascByDate),
      nextMonth: groups.next_month.sort(ascByDate),
      past: groups.past.sort(descByDate),
    };
  }, [filtered]);

  const totalUpcoming = thisMonth.length + nextMonth.length;

  return (
    <AppLayout search={search} onSearchChange={setSearch}>
      <div className="flex flex-wrap gap-2 mb-6">
        <Chip active={mode === "all"} onClick={() => setMode("all")}>כל האירועים</Chip>
        <Chip active={mode === "online"} onClick={() => setMode("online")}>אונליין</Chip>
        <Chip active={mode === "physical"} onClick={() => setMode("physical")}>פיזי</Chip>
        <div className="w-px bg-border mx-2" />
        <Chip active={region === "all"} onClick={() => setRegion("all")}>הכל</Chip>
        <Chip active={region === "israel"} onClick={() => setRegion("israel")}>ישראל</Chip>
        <Chip active={region === "global"} onClick={() => setRegion("global")}>גלובלי</Chip>
      </div>

      {totalUpcoming === 0 && past.length === 0 ? (
        <div className="surface-card p-12 text-center text-muted-foreground">אין אירועים תואמים</div>
      ) : (
        <div className="space-y-10">
          <Section
            title="החודש"
            subtitle="אירועים שמתקיימים החודש — הקרוב ביותר ראשון"
            count={thisMonth.length}
            events={thisMonth}
            sourcesById={sourcesById}
            emptyText="אין אירועים החודש"
          />
          <Section
            title="החודש הבא"
            subtitle="אירועים מהחודש הבא והלאה"
            count={nextMonth.length}
            events={nextMonth}
            sourcesById={sourcesById}
            emptyText="אין אירועים בחודש הבא"
          />
          <Section
            title="אירועים שעברו"
            subtitle="ארכיון — האחרונים שהיו ראשונים"
            count={past.length}
            events={past}
            sourcesById={sourcesById}
            emptyText="אין אירועים בארכיון"
            muted
          />
        </div>
      )}
    </AppLayout>
  );
};

const Section = ({
  title, subtitle, count, events, sourcesById, emptyText, muted,
}: {
  title: string;
  subtitle: string;
  count: number;
  events: Item[];
  sourcesById: Map<string, Source>;
  emptyText: string;
  muted?: boolean;
}) => (
  <section>
    <div className="flex items-baseline justify-between mb-3 border-b border-border pb-2">
      <div>
        <h2 className={cn("text-xl font-bold", muted ? "text-foreground/70" : "text-primary")}>
          {title}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <span className="text-xs text-muted-foreground">{count} אירועים</span>
    </div>
    {events.length === 0 ? (
      <div className="text-sm text-muted-foreground py-6 text-center">{emptyText}</div>
    ) : (
      <div className={cn("space-y-4", muted && "opacity-90")}>
        {events.map((ev) => (
          <EventCard
            key={ev.id}
            ev={ev}
            source={ev.source_id ? sourcesById.get(ev.source_id) : undefined}
            isPast={muted}
          />
        ))}
      </div>
    )}
  </section>
);

const EventCard = ({ ev, source, isPast }: { ev: Item; source?: Source; isPast?: boolean }) => (
  <article
    className={cn(
      "surface-card p-6 animate-fade-in",
      isPast && "border-dashed",
    )}
  >
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 flex-wrap">
      <RegionBadge region={ev.region} />
      {source && <span className="font-medium text-foreground/70">{source.name}</span>}
      {isPast && (
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3 w-3" /> עבר
        </span>
      )}
    </div>

    <h3 className={cn("text-lg font-bold mb-2", isPast ? "text-foreground/80" : "text-primary")}>
      {ev.title_he}
    </h3>

    <div className="flex flex-wrap gap-4 text-sm text-foreground/80 mb-3">
      {ev.event_date && (
        <div className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-accent" />
          {formatHeDateTime(ev.event_date)}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <MapPin className="h-4 w-4 text-accent" />
        {ev.event_is_online ? "אונליין" : ev.event_location ?? "—"}
      </div>
    </div>

    {ev.summary_he && (
      <p className="text-muted-foreground text-sm leading-relaxed mb-3">{ev.summary_he}</p>
    )}

    {ev.why_it_matters && !isPast && (
      <div className="bg-highlight border border-highlight-border text-highlight-foreground rounded-xl px-4 py-3 mb-4 text-sm">
        <span className="font-semibold ml-1">למה זה חשוב:</span>{ev.why_it_matters}
      </div>
    )}

    {ev.event_register_url && (
      <Button asChild size="sm" variant={isPast ? "outline" : "default"}>
        <a href={ev.event_register_url} target="_blank" rel="noreferrer" className="gap-1.5">
          <ExternalLink className="h-3.5 w-3.5" /> {isPast ? "צפה בדף האירוע" : "פרטים והרשמה"}
        </a>
      </Button>
    )}
  </article>
);

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors",
      active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground",
    )}
  >
    {children}
  </button>
);

export default Events;
