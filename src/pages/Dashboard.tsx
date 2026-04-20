import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { ItemCard } from "@/components/ItemCard";
import { ItemDrawer } from "@/components/ItemDrawer";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useItems, useSources, useUserActions, useLogAction, deriveItemStates } from "@/hooks/useIntelligence";
import { useIsAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { formatHeRelative } from "@/lib/format";
import { toast } from "sonner";
import type { Item, ActionType } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "israel" | "global" | "events" | "research" | "unread" | "saved" | "liked";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "israel", label: "ישראל" },
  { id: "global", label: "עולם" },
  { id: "events", label: "אירועים" },
  { id: "research", label: "מחקר" },
  { id: "unread", label: "לא נקראו" },
  { id: "saved", label: "שמורים" },
  { id: "liked", label: "אהבתי" },
];

const Dashboard = () => {
  const { data: items = [] } = useItems();
  const { data: sources = [] } = useSources();
  const { data: actions } = useUserActions();
  const log = useLogAction();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState<Item | null>(null);

  const states = useMemo(() => deriveItemStates(actions), [actions]);
  const sourcesById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const st = states.get(it.id) ?? { read: false, saved: false, liked: false, disliked: false };
      if (filter === "israel" && it.region !== "israel") return false;
      if (filter === "global" && it.region !== "global") return false;
      if (filter === "events" && it.item_type !== "event") return false;
      if (filter === "research" && it.item_type !== "research") return false;
      if (filter === "unread" && st.read) return false;
      if (filter === "saved" && !st.saved) return false;
      if (filter === "liked" && !st.liked) return false;
      if (q) {
        const hay = `${it.title_he} ${it.summary_he ?? ""} ${it.tags_ai.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, states, filter, search]);

  const kpi = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newToday = items.filter((i) => i.published_at && new Date(i.published_at) >= today).length;
    const unread = items.filter((i) => !(states.get(i.id)?.read ?? false)).length;
    const upcoming = items.filter(
      (i) => i.item_type === "event" && i.event_date && new Date(i.event_date) > new Date()
    ).length;
    const activeSources = sources.filter((s) => s.active).length;
    return { newToday, unread, upcoming, activeSources };
  }, [items, sources, states]);

  const openState = openItem
    ? states.get(openItem.id) ?? { read: false, saved: false, liked: false, disliked: false }
    : { read: false, saved: false, liked: false, disliked: false };

  const handleAction = (item: Item, action: ActionType) => {
    log.mutate({ itemId: item.id, action });
  };

  return (
    <AppLayout search={search} onSearchChange={setSearch}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="פריטים חדשים היום" value={kpi.newToday} />
        <KpiCard label="לא נקראו" value={kpi.unread} accent />
        <KpiCard label="אירועים קרובים" value={kpi.upcoming} />
        <KpiCard label="מקורות פעילים" value={kpi.activeSources} />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors",
              filter === f.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="surface-card p-12 text-center text-muted-foreground">אין פריטים תואמים לסינון</div>
        ) : (
          filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              source={item.source_id ? sourcesById.get(item.source_id) : undefined}
              state={states.get(item.id) ?? { read: false, saved: false, liked: false, disliked: false }}
              onOpen={() => setOpenItem(item)}
              onAction={(a) => handleAction(item, a)}
            />
          ))
        )}
      </div>

      <ItemDrawer
        item={openItem}
        source={openItem?.source_id ? sourcesById.get(openItem.source_id) : undefined}
        state={openState}
        open={!!openItem}
        onOpenChange={(o) => !o && setOpenItem(null)}
        onAction={(a) => openItem && handleAction(openItem, a)}
      />
    </AppLayout>
  );
};

const KpiCard = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
  <div className="surface-card p-5">
    <div className="text-xs text-muted-foreground mb-2">{label}</div>
    <div className={cn("text-3xl font-bold", accent ? "text-accent" : "text-primary")}>{value}</div>
  </div>
);

export default Dashboard;
