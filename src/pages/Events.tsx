import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useItems, useSources } from "@/hooks/useIntelligence";
import { formatHeDateTime } from "@/lib/format";
import { RegionBadge } from "@/components/RegionBadge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const Events = () => {
  const { data: items = [] } = useItems();
  const { data: sources = [] } = useSources();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"all" | "online" | "physical">("all");
  const [region, setRegion] = useState<"all" | "israel" | "global">("all");

  const sourcesById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const events = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => i.item_type === "event")
      .filter((i) => {
        if (mode === "online" && !i.event_is_online) return false;
        if (mode === "physical" && i.event_is_online) return false;
        if (region !== "all" && i.region !== region) return false;
        if (q && !`${i.title_he} ${i.summary_he ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const da = a.event_date ? new Date(a.event_date).getTime() : Infinity;
        const db = b.event_date ? new Date(b.event_date).getTime() : Infinity;
        return da - db;
      });
  }, [items, mode, region, search]);

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

      <div className="space-y-4">
        {events.map((ev) => {
          const src = ev.source_id ? sourcesById.get(ev.source_id) : undefined;
          return (
            <article key={ev.id} className="surface-card p-6 animate-fade-in">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 flex-wrap">
                <RegionBadge region={ev.region} />
                {src && <span className="font-medium text-foreground/70">{src.name}</span>}
              </div>
              <h3 className="text-lg font-bold text-primary mb-2">{ev.title_he}</h3>

              <div className="flex flex-wrap gap-4 text-sm text-foreground/80 mb-3">
                {ev.event_date && (
                  <div className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-accent" />{formatHeDateTime(ev.event_date)}</div>
                )}
                <div className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-accent" />{ev.event_is_online ? "אונליין" : ev.event_location ?? "—"}</div>
              </div>

              {ev.summary_he && <p className="text-muted-foreground text-sm leading-relaxed mb-3">{ev.summary_he}</p>}

              {ev.why_it_matters && (
                <div className="bg-highlight border border-highlight-border text-highlight-foreground rounded-xl px-4 py-3 mb-4 text-sm">
                  <span className="font-semibold ml-1">למה זה חשוב:</span>{ev.why_it_matters}
                </div>
              )}

              {ev.event_register_url && (
                <Button asChild size="sm">
                  <a href={ev.event_register_url} target="_blank" rel="noreferrer" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> פרטים והרשמה
                  </a>
                </Button>
              )}
            </article>
          );
        })}
        {events.length === 0 && (
          <div className="surface-card p-12 text-center text-muted-foreground">אין אירועים תואמים</div>
        )}
      </div>
    </AppLayout>
  );
};

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors",
      active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
    )}
  >
    {children}
  </button>
);

export default Events;
