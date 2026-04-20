import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ItemCard } from "@/components/ItemCard";
import { ItemDrawer } from "@/components/ItemDrawer";
import { useItems, useSources, useUserActions, useLogAction, deriveItemStates } from "@/hooks/useIntelligence";
import type { Item, ActionType } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Archive = () => {
  const { data: items = [] } = useItems();
  const { data: sources = [] } = useSources();
  const { data: actions } = useUserActions();
  const log = useLogAction();
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [sourceId, setSourceId] = useState<string>("all");
  const [readState, setReadState] = useState<string>("all");
  const [openItem, setOpenItem] = useState<Item | null>(null);

  const states = useMemo(() => deriveItemStates(actions), [actions]);
  const sourcesById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const st = states.get(it.id) ?? { read: false, saved: false, liked: false, disliked: false };
      if (region !== "all" && it.region !== region) return false;
      if (type !== "all" && it.item_type !== type) return false;
      if (sourceId !== "all" && it.source_id !== sourceId) return false;
      if (readState === "read" && !st.read) return false;
      if (readState === "unread" && st.read) return false;
      if (readState === "saved" && !st.saved) return false;
      if (q) {
        const hay = `${it.title_he} ${it.summary_he ?? ""} ${it.tags_ai.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, states, search, region, type, sourceId, readState]);

  const openState = openItem
    ? states.get(openItem.id) ?? { read: false, saved: false, liked: false, disliked: false }
    : { read: false, saved: false, liked: false, disliked: false };

  const handleAction = (item: Item, a: ActionType) => log.mutate({ itemId: item.id, action: a });

  return (
    <AppLayout search={search} onSearchChange={setSearch}>
      <div className="surface-card p-4 mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FilterSelect label="אזור" value={region} onValueChange={setRegion} options={[
          { v: "all", l: "הכל" }, { v: "israel", l: "ישראל" }, { v: "global", l: "גלובלי" },
        ]} />
        <FilterSelect label="סוג" value={type} onValueChange={setType} options={[
          { v: "all", l: "הכל" }, { v: "news", l: "חדשות" }, { v: "event", l: "אירוע" },
          { v: "research", l: "מחקר" }, { v: "vendor", l: "ספק" },
        ]} />
        <FilterSelect label="מקור" value={sourceId} onValueChange={setSourceId} options={[
          { v: "all", l: "הכל" }, ...sources.map((s) => ({ v: s.id, l: s.name })),
        ]} />
        <FilterSelect label="סטטוס" value={readState} onValueChange={setReadState} options={[
          { v: "all", l: "הכל" }, { v: "unread", l: "לא נקראו" },
          { v: "read", l: "נקראו" }, { v: "saved", l: "שמורים" },
        ]} />
      </div>

      <div className="text-sm text-muted-foreground mb-3">{filtered.length} פריטים</div>

      <div className="space-y-4">
        {filtered.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            source={item.source_id ? sourcesById.get(item.source_id) : undefined}
            state={states.get(item.id) ?? { read: false, saved: false, liked: false, disliked: false }}
            onOpen={() => setOpenItem(item)}
            onAction={(a) => handleAction(item, a)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="surface-card p-12 text-center text-muted-foreground">אין פריטים תואמים</div>
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

const FilterSelect = ({
  label, value, onValueChange, options,
}: { label: string; value: string; onValueChange: (v: string) => void; options: { v: string; l: string }[] }) => (
  <div>
    <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export default Archive;
