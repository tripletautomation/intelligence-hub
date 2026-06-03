import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ItemCard } from "@/components/ItemCard";
import { ItemDrawer } from "@/components/ItemDrawer";
import { Button } from "@/components/ui/button";
import { RefreshCw, Search, LayoutList, Tag, ChevronDown, ChevronUp, Zap, Calendar, Clock, Archive, CheckSquare, X, Loader2, MessageSquare, Newspaper } from "lucide-react";
import { NewsSearchPanel } from "@/components/NewsSearchPanel";
import { WeeklyBriefPanel } from "@/components/WeeklyBriefPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { supabase } from "@/integrations/supabase/client";
import {
  useItems,
  useSources,
  useUserActions,
  useLogAction,
  deriveItemStates,
  usePreferences,
  useHideItem,
  useTopicCategories,
} from "@/hooks/useIntelligence";
import { formatHeRelative } from "@/lib/format";
import { toast } from "sonner";
import type { Item, ActionType, TopicCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "israel" | "global" | "events" | "research" | "unread" | "saved" | "liked" | "disliked";
type GroupMode = "time" | "topic";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "israel", label: "ישראל" },
  { id: "global", label: "עולם" },
  { id: "events", label: "אירועים" },
  { id: "research", label: "מחקר" },
  { id: "unread", label: "לא נקראו" },
  { id: "saved", label: "שמורים" },
  { id: "liked", label: "❤️ אהבתי" },
  { id: "disliked", label: "👎 לא רלוונטי" },
];

type TimeBucket = "today" | "week" | "month" | "older";

const TIME_BUCKETS: { id: TimeBucket; label: string }[] = [
  { id: "today", label: "היום" },
  { id: "week", label: "השבוע" },
  { id: "month", label: "החודש" },
  { id: "older", label: "ישן יותר" },
];

function getTimeBucket(publishedAt: string | null): TimeBucket {
  if (!publishedAt) return "older";
  const now = Date.now();
  const ms = now - new Date(publishedAt).getTime();
  const hours = ms / 1000 / 3600;
  if (hours < 24) return "today";
  if (hours < 24 * 7) return "week";
  if (hours < 24 * 30) return "month";
  return "older";
}

function getTopicBucket(item: Item, categories: TopicCategory[]): string {
  const itemTags = item.tags_ai.map((t) => t.toLowerCase());
  for (const cat of categories) {
    const catKeywords = cat.keywords.map((k) => k.toLowerCase());
    if (catKeywords.some((kw) => itemTags.some((t) => t.includes(kw) || kw.includes(t)))) {
      return cat.name;
    }
  }
  return "כללי";
}

type GenerateType = "linkedin" | "blog_he" | "blog_en";

const Dashboard = () => {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: items = [], dataUpdatedAt, refetch: refetchItems } = useItems();
  const { data: sources = [] } = useSources();
  const { data: actions } = useUserActions();
  const { data: prefs } = usePreferences();
  const { data: topicCategories = [] } = useTopicCategories();
  const hideItem = useHideItem();

  const log = useLogAction();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [showRead, setShowRead] = useState(false);
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [newsSearchOpen, setNewsSearchOpen] = useState(false);
  const [weeklyBriefOpen, setWeeklyBriefOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("time");
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<string>>(new Set(["older"]));
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState<GenerateType | null>(null);
  const [chatOpen, setChatOpen] = useState(true);

  const toggleBucket = (bucket: string) =>
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
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

  // Compute effective score per item (relevance + user tag boosts)
  const effectiveScore = useMemo(() => {
    const boost = prefs?.user_relevance_boost ?? {};
    const map = new Map<string, number>();
    for (const item of items) {
      const tagBoost = item.tags_ai.reduce((sum, tag) => sum + (boost[tag] ?? 0), 0);
      map.set(item.id, (item.relevance_score ?? 0) + tagBoost);
    }
    return map;
  }, [items, prefs?.user_relevance_boost]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hiddenSet = new Set(prefs?.hidden_item_ids ?? []);
    const showHidden = filter === "liked" || filter === "disliked";
    return items.filter((it) => {
      const st = states.get(it.id) ?? { read: false, saved: false, liked: false, disliked: false };
      if ((it.relevance_score ?? 0) < 30) return false;
      if (!showHidden && hiddenSet.has(it.id)) return false;
      if (filter === "israel" && it.region !== "israel") return false;
      if (filter === "global" && it.region !== "global") return false;
      if (filter === "events" && it.item_type !== "event") return false;
      if (filter === "research" && it.item_type !== "research") return false;
      if (!showRead && filter !== "unread" && filter !== "liked" && filter !== "disliked" && st.read) return false;
      if (filter === "unread" && st.read) return false;
      if (filter === "saved" && !st.saved) return false;
      if (filter === "liked" && !st.liked) return false;
      if (filter === "disliked" && !st.disliked) return false;
      if (q) {
        const hay = `${it.title_he} ${it.summary_he ?? ""} ${it.tags_ai.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, states, filter, search, prefs?.hidden_item_ids, showRead]);

  // Sort filtered by effective score (descending)
  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => (effectiveScore.get(b.id) ?? 0) - (effectiveScore.get(a.id) ?? 0)),
    [filtered, effectiveScore],
  );

  // Group by time buckets
  const byTime = useMemo(() => {
    const map = new Map<TimeBucket, Item[]>();
    for (const b of TIME_BUCKETS) map.set(b.id, []);
    for (const item of sortedFiltered) {
      const bucket = getTimeBucket(item.published_at);
      map.get(bucket)!.push(item);
    }
    return map;
  }, [sortedFiltered]);

  // Group by topic
  const byTopic = useMemo(() => {
    const map = new Map<string, Item[]>();
    const orderedNames = [...topicCategories.map((c) => c.name), "כללי"];
    for (const name of orderedNames) map.set(name, []);
    for (const item of sortedFiltered) {
      const bucket = getTopicBucket(item, topicCategories);
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(item);
    }
    // Remove empty buckets
    for (const [key, val] of map) {
      if (val.length === 0) map.delete(key);
    }
    return map;
  }, [sortedFiltered, topicCategories]);

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
    log.mutate({ itemId: item.id, action, itemTags: item.tags_ai });
    if (action === "dislike" || action === "save") {
      hideItem.mutate({ itemId: item.id, hide: true });
    }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleGenerate = async (type: GenerateType) => {
    if (selectedIds.size === 0) return;
    setGenerating(type);
    try {
      const ids = [...selectedIds];
      let draftId: string;
      if (type === "linkedin") {
        const { data, error } = await supabase.functions.invoke("generate-article", { body: { item_ids: ids } });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        draftId = (data as any).draft_id;
      } else {
        const language = type === "blog_en" ? "en" : "he";
        const { data, error } = await supabase.functions.invoke("generate-blog-post", { body: { item_ids: ids, language } });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        draftId = (data as any).draft_id;
      }
      setSelectMode(false);
      setSelectedIds(new Set());
      toast.success("הטיוטה נוצרה בהצלחה");
      nav(`/drafts/${draftId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ביצירת מאמר");
    } finally {
      setGenerating(null);
    }
  };

  const renderItem = (item: Item) => (
    <ItemCard
      key={item.id}
      item={item}
      source={item.source_id ? sourcesById.get(item.source_id) : undefined}
      state={states.get(item.id) ?? { read: false, saved: false, liked: false, disliked: false }}
      onOpen={() => !selectMode && setOpenItem(item)}
      onAction={(a) => handleAction(item, a)}
      compact
      selectable={selectMode}
      selected={selectedIds.has(item.id)}
      onToggleSelected={() => toggleSelect(item.id)}
      onHide={() => {
        hideItem.mutate(
          { itemId: item.id, hide: true },
          {
            onSuccess: () => toast.success("הפריט הועבר לארכיון האישי"),
            onError: (e: Error) => toast.error(e.message),
          },
        );
      }}
    />
  );

  return (
    <AppLayout search={search} onSearchChange={setSearch}>
      {/* Chat panel — fixed on right side */}
      {chatOpen && (
        <div className="fixed right-0 top-[112px] h-[calc(100vh-112px)] z-30 shadow-2xl border-r border-border">
          <ChatPanel onClose={() => setChatOpen(false)} />
        </div>
      )}

      {/* Main content — shrinks when chat open */}
      <div className={cn("transition-[margin] duration-200", chatOpen && "mr-[380px]")}>

      {/* Top bar */}
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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={chatOpen ? "default" : "outline"}
            onClick={() => setChatOpen((v) => !v)}
            className={cn("gap-2", !chatOpen && "border-accent/50 text-accent hover:bg-accent/10")}
          >
            <MessageSquare className="h-4 w-4" />
            עוזר אישי
          </Button>
          <Button
            size="sm"
            variant={selectMode ? "secondary" : "outline"}
            onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
            className="gap-2"
          >
            <CheckSquare className="h-4 w-4" />
            {selectMode ? "בטל בחירה" : "בחר פריטים"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNewsSearchOpen(true)}
            className="gap-2"
          >
            <Search className="h-4 w-4" />
            חפש ידיעות
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWeeklyBriefOpen(true)}
            className="gap-2 border-accent/40 text-accent hover:bg-accent/10"
          >
            <Newspaper className="h-4 w-4" />
            בריף השבוע
          </Button>
          <Button
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "מחפש ידיעות..." : "קבל ידיעות חדשות"}
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <KpiStrip newToday={kpi.newToday} unread={kpi.unread} upcoming={kpi.upcoming} activeSources={kpi.activeSources} />

      {/* Filters + group toggle */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
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
        <div className="mr-auto flex items-center gap-2">
          {/* Group mode toggle */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-full p-0.5">
            <button
              onClick={() => setGroupMode("time")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                groupMode === "time"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutList className="h-3.5 w-3.5" /> לפי זמן
            </button>
            <button
              onClick={() => setGroupMode("topic")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                groupMode === "topic"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Tag className="h-3.5 w-3.5" /> לפי נושא
            </button>
          </div>
          <button
            onClick={() => setShowRead((v) => !v)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors",
              showRead
                ? "bg-secondary text-foreground border-border"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {showRead ? "הסתר נקראים" : "הצג נקראים"}
          </button>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="surface-card p-12 text-center text-muted-foreground">אין פריטים תואמים לסינון</div>
      ) : groupMode === "time" ? (
        <div className="space-y-5">
          {TIME_BUCKETS.map(({ id, label }) => {
            const bucketItems = byTime.get(id) ?? [];
            if (bucketItems.length === 0) return null;
            const isCollapsed = collapsedBuckets.has(id);
            return (
              <BucketSection
                key={id}
                label={label}
                count={bucketItems.length}
                collapsed={isCollapsed}
                variant={id as BucketVariant}
                onToggle={() => toggleBucket(id)}
              >
                {bucketItems.map(renderItem)}
              </BucketSection>
            );
          })}
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(byTopic.entries()).map(([name, topicItems]) => {
            const isCollapsed = collapsedBuckets.has(name);
            return (
              <BucketSection
                key={name}
                label={name}
                count={topicItems.length}
                collapsed={isCollapsed}
                variant="topic"
                onToggle={() => toggleBucket(name)}
              >
                {topicItems.map(renderItem)}
              </BucketSection>
            );
          })}
        </div>
      )}

      <ItemDrawer
        item={openItem}
        source={openItem?.source_id ? sourcesById.get(openItem.source_id) : undefined}
        state={openState}
        open={!!openItem}
        onOpenChange={(o) => !o && setOpenItem(null)}
        onAction={(a) => openItem && handleAction(openItem, a)}
      />

      <NewsSearchPanel open={newsSearchOpen} onOpenChange={setNewsSearchOpen} />
      <WeeklyBriefPanel open={weeklyBriefOpen} onOpenChange={setWeeklyBriefOpen} />

      {/* Multi-select action bar */}
      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size > 0 ? `${selectedIds.size} פריטים נבחרו` : "בחר פריטים לעיבוד"}
            </span>
            <Button
              size="sm" variant="ghost"
              onClick={() => { const all = new Set(sortedFiltered.map(i => i.id)); setSelectedIds(all); }}
              className="text-xs gap-1"
            >
              <CheckSquare className="h-3.5 w-3.5" /> בחר הכל
            </Button>
            <div className="w-px h-5 bg-border hidden sm:block" />
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { type: "linkedin" as GenerateType, label: "פוסט" },
                { type: "blog_he" as GenerateType, label: "מאמר עברית" },
                { type: "blog_en" as GenerateType, label: "מאמר אנגלית" },
              ]).map(({ type, label }) => (
                <Button
                  key={type}
                  size="sm"
                  disabled={selectedIds.size === 0 || !!generating}
                  onClick={() => handleGenerate(type)}
                  className="gap-1.5"
                >
                  {generating === type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {label}
                </Button>
              ))}
            </div>
            <Button
              size="sm" variant="ghost"
              onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
              className="mr-auto text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      </div> {/* end main content wrapper */}
    </AppLayout>
  );
};

const KpiStrip = ({ newToday, unread, upcoming, activeSources }: {
  newToday: number; unread: number; upcoming: number; activeSources: number;
}) => (
  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-card/50 border border-border rounded-xl px-5 py-2.5 mb-6 text-sm">
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">חדשים היום</span>
      <span className="font-bold text-foreground tabular-nums">{newToday}</span>
    </div>
    <div className="w-px h-4 bg-border hidden sm:block" />
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">לא נקראו</span>
      <span className="font-bold text-accent tabular-nums">{unread}</span>
    </div>
    <div className="w-px h-4 bg-border hidden sm:block" />
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">אירועים קרובים</span>
      <span className="font-bold text-foreground tabular-nums">{upcoming}</span>
    </div>
    <div className="w-px h-4 bg-border hidden sm:block" />
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">מקורות פעילים</span>
      <span className="font-bold text-foreground tabular-nums">{activeSources}</span>
    </div>
  </div>
);

type BucketVariant = "today" | "week" | "month" | "older" | "topic";

const BUCKET_CONFIG: Record<BucketVariant, {
  borderColor: string;
  badgeClass: string;
  iconClass: string;
  Icon: React.FC<{ className?: string }>;
  pulse?: boolean;
}> = {
  today: {
    borderColor: "border-l-accent",
    badgeClass: "bg-accent/15 text-accent border border-accent/30",
    iconClass: "text-accent",
    Icon: Zap,
    pulse: true,
  },
  week: {
    borderColor: "border-l-blue-400/60",
    badgeClass: "bg-blue-500/10 text-blue-400 border border-blue-400/20",
    iconClass: "text-blue-400",
    Icon: Clock,
  },
  month: {
    borderColor: "border-l-slate-400/50",
    badgeClass: "bg-slate-500/10 text-slate-400 border border-slate-400/20",
    iconClass: "text-slate-400",
    Icon: Calendar,
  },
  older: {
    borderColor: "border-l-slate-600/40",
    badgeClass: "bg-slate-700/20 text-slate-500 border border-slate-600/20",
    iconClass: "text-slate-500",
    Icon: Archive,
  },
  topic: {
    borderColor: "border-l-violet-400/60",
    badgeClass: "bg-violet-500/10 text-violet-400 border border-violet-400/20",
    iconClass: "text-violet-400",
    Icon: Tag,
  },
};

const BucketSection = ({
  label,
  count,
  collapsed,
  onToggle,
  variant = "topic",
  children,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  variant?: BucketVariant;
  children: React.ReactNode;
}) => {
  const cfg = BUCKET_CONFIG[variant];
  const Icon = cfg.Icon;
  return (
    <div className={cn("border-l-2 pl-4 transition-all", cfg.borderColor)}>
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full text-right group py-2"
      >
        <Icon className={cn("h-4 w-4 shrink-0", cfg.iconClass, cfg.pulse && "animate-pulse")} />
        <span className="text-sm font-bold text-foreground tracking-tight">{label}</span>
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums", cfg.badgeClass)}>
          {count}
        </span>
        <span className="mr-auto">
          {collapsed
            ? <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            : <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          }
        </span>
      </button>
      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-2 pb-2">
          {children}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
