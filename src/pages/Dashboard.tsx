import { useMemo, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { ItemCard } from "@/components/ItemCard";
import { ItemDrawer } from "@/components/ItemDrawer";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, X, FileText, Loader2 } from "lucide-react";
import { useItems, useSources, useUserActions, useLogAction, deriveItemStates, usePreferences, useHideItem } from "@/hooks/useIntelligence";

import { supabase } from "@/integrations/supabase/client";
import { formatHeRelative } from "@/lib/format";
import { toast } from "sonner";
import type { Item, ActionType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

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
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: items = [], dataUpdatedAt, refetch: refetchItems } = useItems();
  const { data: sources = [] } = useSources();
  const { data: actions } = useUserActions();
  const { data: prefs } = usePreferences();
  const hideItem = useHideItem();

  const log = useLogAction();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const generateArticle = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) throw new Error("בחר לפחות פריט אחד");
      const { data, error } = await supabase.functions.invoke("generate-article", {
        body: { item_ids: ids },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any).draft_id as string;
    },
    onSuccess: (draftId) => {
      toast.success("טיוטת מאמר נוצרה");
      exitSelectMode();
      qc.invalidateQueries({ queryKey: ["article_drafts"] });
      nav(`/drafts/${draftId}`);
    },
    onError: (e: Error) => toast.error(e.message ?? "שגיאה ביצירת המאמר"),
  });

  const lastUpdatedIso = useMemo(() => {
    const ts = items
      .map((i) => i.published_at)
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime());
    const max = ts.length ? Math.max(...ts) : dataUpdatedAt;
    return max ? new Date(max).toISOString() : null;
  }, [items, dataUpdatedAt]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-rss", { body: { max_items: 10 } });
      if (error) throw error;
      const totalInserted = ((data as any)?.results ?? []).reduce(
        (s: number, r: any) => s + (r.inserted ?? 0),
        0,
      );
      await Promise.all([
        refetchItems(),
        qc.invalidateQueries({ queryKey: ["ingestion_runs"] }),
      ]);
      toast.success(totalInserted > 0 ? `נוספו ${totalInserted} פריטים חדשים` : "אין פריטים חדשים");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ברענון");
    } finally {
      setRefreshing(false);
    }
  };

  const states = useMemo(() => deriveItemStates(actions), [actions]);
  const sourcesById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hiddenSet = new Set(prefs?.hidden_item_ids ?? []);
    return items.filter((it) => {
      const st = states.get(it.id) ?? { read: false, saved: false, liked: false, disliked: false };
      // Hide off-topic / low-relevance items (not related to data centers / computing / tech)
      if ((it.relevance_score ?? 0) < 30) return false;
      const isHidden = hiddenSet.has(it.id);
      if (isHidden) return false;
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
  }, [items, states, filter, search, prefs?.hidden_item_ids]);

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
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {refreshing ? (
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> מרענן עכשיו...
            </span>
          ) : lastUpdatedIso ? (
            <>עודכן לאחרונה <span className="text-foreground font-medium">{formatHeRelative(lastUpdatedIso)}</span></>
          ) : (
            "טרם עודכן"
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => nav("/drafts")} className="gap-1.5">
            <FileText className="h-4 w-4" /> טיוטות מאמרים
          </Button>
          {!selectMode ? (
            <Button size="sm" variant="outline" onClick={() => setSelectMode(true)} className="gap-1.5">
              <Sparkles className="h-4 w-4" /> צור מאמר מהנבחרים
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={exitSelectMode} className="gap-1.5">
              <X className="h-4 w-4" /> בטל בחירה
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "מרענן..." : "רענן עכשיו"}
          </Button>
        </div>
      </div>

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
              selectable={selectMode}
              selected={selectedIds.has(item.id)}
              onToggleSelected={() => toggleSelected(item.id)}
              hidden={showArchived}
              onHide={() => {
                hideItem.mutate(
                  { itemId: item.id, hide: true },
                  {
                    onSuccess: () => toast.success("הפריט הועבר לארכיון האישי"),
                    onError: (e: Error) => toast.error(e.message),
                  },
                );
              }}
              onRestore={() => {
                hideItem.mutate(
                  { itemId: item.id, hide: false },
                  {
                    onSuccess: () => toast.success("הפריט שוחזר לפיד"),
                    onError: (e: Error) => toast.error(e.message),
                  },
                );
              }}
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

      {selectMode && (
        <div className="fixed bottom-6 inset-x-0 z-40 px-4 pointer-events-none">
          <div className="max-w-3xl mx-auto bg-card border border-border shadow-lg rounded-2xl px-5 py-3 flex items-center gap-4 pointer-events-auto">
            <div className="text-sm">
              <span className="font-bold text-primary">{selectedIds.size}</span>
              <span className="text-muted-foreground"> פריטים נבחרו</span>
              <span className="text-muted-foreground"> · עד 10</span>
            </div>
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={() => generateArticle.mutate()}
              disabled={selectedIds.size === 0 || selectedIds.size > 10 || generateArticle.isPending}
              className="gap-1.5"
            >
              {generateArticle.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Sparkles className="h-4 w-4" />}
              {generateArticle.isPending ? "יוצר מאמר..." : "צור מאמר"}
            </Button>
          </div>
        </div>
      )}
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
