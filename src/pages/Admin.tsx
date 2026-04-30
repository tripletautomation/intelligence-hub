import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useSources, useItems } from "@/hooks/useIntelligence";
import { toast } from "sonner";
import { formatHeRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SourceManager, type SourceManagerHandle } from "@/components/SourceManager";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Globe2, Loader2, Rss, FileText, CalendarDays } from "lucide-react";
import { UserAccessManager } from "@/components/UserAccessManager";
import { ChevronDown, AlertTriangle, Activity, BrainCircuit, Save } from "lucide-react";

// ─── AI Provider / Model catalogue ───────────────────────────────────────────
const AI_PROVIDERS = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    envKey: "ANTHROPIC_API_KEY",
    models: [
      { id: "claude-opus-4-7", label: "Claude Opus 4.7 — הכי חזק" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — מהיר ויכולת גבוהה" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — מהיר וזול" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    models: [
      { id: "gpt-4.1", label: "GPT-4.1 — הכי חזק (מומלץ לכתיבה)" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini — מהיר וזול" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini — מהיר וזול" },
    ],
  },
  {
    id: "lovable",
    label: "Lovable AI Gateway (ברירת מחדל)",
    envKey: "LOVABLE_API_KEY",
    models: [
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "openai/gpt-4o", label: "GPT-4o via Gateway" },
    ],
  },
];

interface AiConfig { provider: string; model_id: string; }

const SingleAiConfig = ({
  configId,
  label,
  description,
  defaultProvider,
  defaultModel,
}: {
  configId: string;
  label: string;
  description: string;
  defaultProvider: string;
  defaultModel: string;
}) => {
  const qc = useQueryClient();
  const queryKey = ["ai_config", configId];

  const { data: config, isLoading } = useQuery<AiConfig>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_config").select("provider,model_id").eq("id", configId).maybeSingle();
      if (error) throw error;
      return data ?? { provider: defaultProvider, model_id: defaultModel };
    },
  });

  const [provider, setProvider] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  const activeProvider = provider ?? config?.provider ?? defaultProvider;
  const activeModel = modelId ?? config?.model_id ?? defaultModel;
  const providerDef = AI_PROVIDERS.find((p) => p.id === activeProvider) ?? AI_PROVIDERS[1];

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("ai_config")
        .upsert({ id: configId, provider: activeProvider, model_id: activeModel, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הגדרות נשמרו");
      qc.invalidateQueries({ queryKey });
      setProvider(null);
      setModelId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isDirty = (provider !== null && provider !== config?.provider) ||
    (modelId !== null && modelId !== config?.model_id);

  if (isLoading) return <div className="text-sm text-muted-foreground">טוען...</div>;

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-primary">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ספק AI</Label>
          <Select value={activeProvider} onValueChange={(v) => { setProvider(v); setModelId(AI_PROVIDERS.find(p => p.id === v)?.models[0]?.id ?? null); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">מודל</Label>
          <Select value={activeModel} onValueChange={setModelId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {providerDef.models.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/70 font-mono">Secret: {providerDef.envKey}</span>
        <Button size="sm" variant="outline" disabled={!isDirty || save.isPending} onClick={() => save.mutate()} className="gap-1.5 h-7 text-xs">
          <Save className="h-3 w-3" />
          {save.isPending ? "שומר..." : "שמור"}
        </Button>
      </div>
    </div>
  );
};

const AiConfigSection = () => (
  <div className="surface-card p-6">
    <div className="flex items-center gap-2 mb-1">
      <BrainCircuit className="h-5 w-5 text-accent" />
      <h2 className="text-lg font-bold text-primary">הגדרות מודל AI</h2>
    </div>
    <p className="text-sm text-muted-foreground mb-4">
      הגדר מודל נפרד לכתיבת מאמרים ולחיפוש/סיכום. ניתן לשנות בכל עת.
    </p>
    <div className="space-y-3">
      <SingleAiConfig
        configId="article"
        label="מודל כתיבת מאמרים"
        description="משמש ליצירת מאמרים מלאים. מומלץ: GPT-4.1 לאיכות כתיבה גבוהה."
        defaultProvider="openai"
        defaultModel="gpt-4.1"
      />
      <SingleAiConfig
        configId="default"
        label="מודל חיפוש וסיכומים"
        description="משמש לחיפוש מקורות, סיכום חדשות, רשתות חברתיות ועיבוד רקע. מומלץ: GPT-4o mini לחיסכון בעלויות."
        defaultProvider="openai"
        defaultModel="gpt-4o-mini"
      />
    </div>
  </div>
);

interface IngestionRun {
  id: string;
  source_id: string | null;
  source_name: string | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors_json: Array<{ stage: string; url?: string; message: string }> | null;
  triggered_by: string;
}

interface DiscoveredSource {
  name: string;
  url: string;
  description_he: string;
  suggested_type: "rss" | "page";
  suggested_category: "industry_news" | "events" | "research" | "other";
  rss_url: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  industry_news: "חדשות", events: "אירועים", research: "מחקר", other: "אחר",
};
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  industry_news: <Globe2 className="h-3 w-3" />,
  events: <CalendarDays className="h-3 w-3" />,
  research: <FileText className="h-3 w-3" />,
  other: <Globe2 className="h-3 w-3" />,
};

const Admin = () => {
  const qc = useQueryClient();
  const { data: sources = [] } = useSources();
  const { data: items = [] } = useItems();
  const [running, setRunning] = useState(false);
  const [runningResearch, setRunningResearch] = useState(false);
  const [runningPageEvents, setRunningPageEvents] = useState(false);
  const [runningPageResearch, setRunningPageResearch] = useState(false);
  const [hideSeed, setHideSeed] = useState(() => localStorage.getItem("hideSeed") === "1");

  // Source Discovery
  const sourceManagerRef = useRef<SourceManagerHandle>(null);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);

  const runDiscover = async () => {
    if (!discoverQuery.trim()) return;
    setDiscoverLoading(true);
    setDiscoveredSources([]);
    try {
      const { data, error } = await supabase.functions.invoke("discover-sources", {
        body: { query: discoverQuery, limit: 10 },
      });
      if (error) throw error;
      setDiscoveredSources((data as any)?.sources ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בחיפוש מקורות");
    } finally { setDiscoverLoading(false); }
  };

  const realSources = sources.filter((s: any) => !s.is_seed && s.rss_url);
  const pageEventSources = sources.filter((s: any) => s.type === "page" && s.category === "events" && s.active);
  const pageResearchSources = sources.filter((s: any) => s.type === "page" && s.category === "research" && s.active);
  const seedItemsCount = items.filter((i: any) => i.is_seed).length;
  const realItemsCount = items.length - seedItemsCount;
  const researchItemsCount = items.filter((i: any) => i.item_type === "research").length;

  const { data: runs = [], refetch: refetchRuns } = useQuery({
    queryKey: ["ingestion_runs"],
    queryFn: async (): Promise<IngestionRun[]> => {
      const { data, error } = await (supabase as any)
        .from("ingestion_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const newsRuns = runs.filter((r) =>
    r.triggered_by !== "manual-research" &&
    r.triggered_by !== "manual-page-events" &&
    r.triggered_by !== "manual-page-research"
  ).slice(0, 20);
  const researchRuns = runs.filter((r) => r.triggered_by === "manual-research").slice(0, 20);
  const pageEventRuns = runs.filter((r) => r.triggered_by === "manual-page-events").slice(0, 20);
  const pageResearchRuns = runs.filter((r) => r.triggered_by === "manual-page-research").slice(0, 20);

  const runIngestion = async (sourceId?: string) => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-rss", {
        body: { source_id: sourceId, max_items: 10 },
      });
      if (error) throw error;
      const results = (data as any)?.results ?? [];
      const totalInserted = results.reduce((s: number, r: any) => s + (r.inserted ?? 0), 0);
      toast.success(`הריצה הסתיימה — ${totalInserted} פריטים חדשים נוספו`);
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בריצה");
    } finally {
      setRunning(false);
      refetchRuns();
    }
  };

  const runResearchIngestion = async () => {
    setRunningResearch(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-research", {
        body: { max_items: 15 },
      });
      if (error) throw error;
      const d = data as any;
      const ins = d?.inserted ?? 0;
      const prom = d?.promoted ?? 0;
      const fet = d?.fetched ?? 0;
      const skip = d?.skipped ?? 0;
      const b = d?.skip_breakdown ?? {};
      toast.success(
        `Research — נמשכו ${fet} · חדשים ${ins} · קודמו מ-news ${prom} · דולגו ${skip}` +
        (b ? ` (כבר research: ${b.already_research ?? 0}, לא-מחקר: ${b.not_research ?? 0})` : "")
      );
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בריצת Research");
    } finally {
      setRunningResearch(false);
      refetchRuns();
    }
  };

  const runPageEventsIngestion = async () => {
    setRunningPageEvents(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-page-events", { body: {} });
      if (error) throw error;
      const results = (data as any)?.results ?? [];
      const totalInserted = results.reduce((s: number, r: any) => s + (r.inserted ?? 0), 0);
      const totalFetched = results.reduce((s: number, r: any) => s + (r.fetched ?? 0), 0);
      toast.success(`Page Events — נמשכו ${totalFetched} · חדשים ${totalInserted}`);
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בריצת Page Events");
    } finally {
      setRunningPageEvents(false);
      refetchRuns();
    }
  };

  const runPageResearchIngestion = async () => {
    setRunningPageResearch(true);
    try {
      const responses = await Promise.all(
        pageResearchSources.map((s: any) =>
          supabase.functions.invoke("ingest-page-research", { body: { source_id: s.id } })
        )
      );
      const results = responses.flatMap((r) => (r.data as any)?.results ?? []);
      const totalInserted = results.reduce((s: number, r: any) => s + (r.inserted ?? 0), 0);
      const totalFetched = results.reduce((s: number, r: any) => s + (r.fetched ?? 0), 0);
      const failed = responses.filter((r) => r.error).length;
      if (failed > 0) toast.warning(`Page Research — ${failed} מקורות נכשלו`);
      toast.success(`Page Research — נמשכו ${totalFetched} · חדשים ${totalInserted}`);
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בריצת Page Research");
    } finally {
      setRunningPageResearch(false);
      refetchRuns();
    }
  };

  const toggleHideSeed = (v: boolean) => {
    setHideSeed(v);
    localStorage.setItem("hideSeed", v ? "1" : "0");
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-6">
        <AiConfigSection />

        <div className="surface-card p-6">
          <h2 className="text-lg font-bold text-primary mb-1">מצב נתונים</h2>
          <p className="text-sm text-muted-foreground mb-4">סקירה של seed מול תוכן אמיתי שהוטמע</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="פריטים אמיתיים" value={realItemsCount} accent />
            <Stat label="פריטי Research" value={researchItemsCount} />
            <Stat label="פריטי seed (דמו)" value={seedItemsCount} />
            <Stat label="מקורות פעילים עם RSS" value={realSources.length} />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <Label htmlFor="hideseed" className="text-sm cursor-pointer">
              הסתר seed/דמו בכל המסכים
            </Label>
            <Switch id="hideseed" checked={hideSeed} onCheckedChange={toggleHideSeed} />
          </div>
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-primary">הרצת News ידנית</h2>
              <p className="text-sm text-muted-foreground">
                משוך תוכן עכשיו מכל המקורות ה-runnable. עד 10 פריטים למקור.
              </p>
            </div>
            <Button onClick={() => runIngestion()} disabled={running || realSources.length === 0}>
              {running ? "רץ..." : "הרץ את כל המקורות"}
            </Button>
          </div>
        </div>

        {/* Source Discovery */}
        <div className="surface-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-accent" />
            <div>
              <h2 className="text-lg font-bold text-primary">גלה מקורות חדשים</h2>
              <p className="text-sm text-muted-foreground">חפש באינטרנט מקורות רלוונטיים והוסף אותם לרשימה</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="לדוגמה: data center events Israel, cloud infrastructure news..."
              value={discoverQuery}
              onChange={(e) => setDiscoverQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runDiscover()}
              className="flex-1"
              dir="auto"
            />
            <Button onClick={runDiscover} disabled={discoverLoading || !discoverQuery.trim()} className="gap-1.5">
              {discoverLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {discoverLoading ? "מחפש..." : "חפש"}
            </Button>
          </div>
          {discoveredSources.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {discoveredSources.map((s) => (
                <Card key={s.url} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground truncate" dir="ltr">{s.url}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        {s.suggested_type === "rss" ? <Rss className="h-2.5 w-2.5" /> : <Globe2 className="h-2.5 w-2.5" />}
                        {s.suggested_type}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {CATEGORY_ICONS[s.suggested_category]}
                        {CATEGORY_LABELS[s.suggested_category] ?? s.suggested_category}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{s.description_he}</p>
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5"
                    onClick={() => sourceManagerRef.current?.openCreate({
                      name: s.name,
                      url: s.url,
                      rss_url: s.rss_url ?? "",
                      type: s.suggested_type === "rss" ? "rss" : "page",
                      category: s.suggested_category !== "other" ? s.suggested_category : "",
                    })}>
                    <Search className="h-3 w-3" /> הוסף מקור
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        <SourceManager ref={sourceManagerRef} onRunSource={(id) => runIngestion(id)} />

        <UserAccessManager />

        <div className="surface-card p-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold text-primary">הרצת Research ידנית</h2>
              <p className="text-sm text-muted-foreground">
                שואב מ-DCD RSS ומסנן דרך AI — נשמרים רק whitepapers / reports / studies / analyses כ-<code className="text-xs">item_type=research</code>.
              </p>
            </div>
            <Button onClick={runResearchIngestion} disabled={runningResearch} variant="secondary">
              {runningResearch ? "רץ..." : "הרץ Research"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-2" dir="ltr">
            Source: DCD main RSS · Filter: AI strict (is_research=true only) · Manual only
          </div>
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-primary">הרצת Page Events ידנית</h2>
              <p className="text-sm text-muted-foreground">
                סורק עמודי אירועים (ללא RSS) דרך Tavily ומחלץ אירועים מובנים עם AI. נשמרים כ-<code className="text-xs">item_type=event</code>.
              </p>
            </div>
            <Button onClick={runPageEventsIngestion} disabled={runningPageEvents || pageEventSources.length === 0} variant="secondary">
              {runningPageEvents ? "רץ..." : "הרץ Page Events"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-2" dir="ltr">
            Sources: {pageEventSources.length === 0 ? "none configured" : pageEventSources.map((s: any) => s.display_name ?? s.name).join(" · ")} · Tavily + OpenAI · Manual only
          </div>
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-primary">הרצת Page Research ידנית</h2>
              <p className="text-sm text-muted-foreground">
                סורק עמודי whitepapers / reports (ללא RSS) דרך Tavily ומחלץ פריטי מחקר מובנים עם AI. נשמרים כ-<code className="text-xs">item_type=research</code>.
              </p>
            </div>
            <Button onClick={runPageResearchIngestion} disabled={runningPageResearch || pageResearchSources.length === 0} variant="secondary">
              {runningPageResearch ? "רץ..." : "הרץ Page Research"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-2" dir="ltr">
            Sources: {pageResearchSources.length === 0 ? "none configured" : pageResearchSources.map((s: any) => s.display_name ?? s.name).join(" · ")} · Tavily + OpenAI · Manual only
          </div>
        </div>

        <LogsMonitoringSection
          newsRuns={newsRuns}
          researchRuns={researchRuns}
          pageEventRuns={pageEventRuns}
          pageResearchRuns={pageResearchRuns}
        />
      </div>
    </AppLayout>
  );
};

const LogsMonitoringSection = ({
  newsRuns, researchRuns, pageEventRuns, pageResearchRuns,
}: { newsRuns: IngestionRun[]; researchRuns: IngestionRun[]; pageEventRuns: IngestionRun[]; pageResearchRuns: IngestionRun[] }) => {
  const [open, setOpen] = useState(true);
  const allRuns = [...newsRuns, ...researchRuns, ...pageEventRuns, ...pageResearchRuns].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
  const last = allRuns[0];
  const errorCount = last?.errors_json?.length ?? 0;
  const hasErrors = errorCount > 0 || (last && last.status !== "success" && last.status !== "running");

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn(
      "surface-card",
      hasErrors && "border-destructive/40",
    )}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full p-4 flex items-center justify-between gap-4 text-start hover:bg-muted/30 transition-colors rounded-[inherit]"
        >
          <div className="flex items-center gap-3 min-w-0">
            {hasErrors ? (
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            ) : (
              <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-primary">Logs & Monitoring</div>
              {last ? (
                <div className="text-xs text-muted-foreground truncate">
                  ריצה אחרונה: <span className="text-foreground">{last.status}</span>
                  {" · "}
                  {formatHeRelative(last.started_at)}
                  {errorCount > 0 && (
                    <> {" · "}<span className="text-destructive">{errorCount} שגיאות</span></>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">אין ריצות עדיין</div>
              )}
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-0 space-y-4">
        <RunsLogCard title="לוג ריצות — News" runs={newsRuns} />
        <RunsLogCard title="לוג ריצות — Research" runs={researchRuns} />
        <RunsLogCard title="לוג ריצות — Page Events" runs={pageEventRuns} />
        <RunsLogCard title="לוג ריצות — Page Research" runs={pageResearchRuns} />
      </CollapsibleContent>
    </Collapsible>
  );
};

const RunsLogCard = ({ title, runs }: { title: string; runs: IngestionRun[] }) => (
  <div className="surface-card p-6">
    <h2 className="text-lg font-bold text-primary mb-4">{title}</h2>
    {runs.length === 0 ? (
      <div className="text-sm text-muted-foreground">אין ריצות עדיין</div>
    ) : (
      <div className="space-y-2">
        {runs.map((r) => (
          <div key={r.id} className="p-3 rounded-md border border-border bg-background/50">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <StatusDot status={r.status} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.source_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{formatHeRelative(r.started_at)}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex gap-4 shrink-0">
                <span>נמשכו: <b className="text-foreground">{r.fetched}</b></span>
                <span>חדשים: <b className="text-foreground">{r.inserted}</b></span>
                <span>דילוגים: <b className="text-foreground">{r.skipped}</b></span>
                <span className={cn(r.errors_json && "text-destructive")}>
                  שגיאות: <b>{r.errors_json?.length ?? 0}</b>
                </span>
              </div>
            </div>
            {r.errors_json && r.errors_json.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">הצג שגיאות</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {r.errors_json.slice(0, 5).map((e, i) => (
                    <li key={i} className="text-destructive" dir="ltr">
                      [{e.stage}] {e.message}{e.url ? ` — ${e.url}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

const Stat = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
  <div className="rounded-md border border-border p-4 bg-background/50">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={cn("text-2xl font-bold mt-1", accent ? "text-accent" : "text-primary")}>{value}</div>
  </div>
);

const StatusDot = ({ status }: { status: string }) => {
  const color =
    status === "success" ? "bg-green-500" :
    status === "partial" ? "bg-amber-500" :
    status === "running" ? "bg-blue-500 animate-pulse" :
    "bg-destructive";
  return <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", color)} title={status} />;
};

export default Admin;
