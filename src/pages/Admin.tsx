import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useSources, useItems } from "@/hooks/useIntelligence";
import { toast } from "sonner";
import { formatHeRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SourceManager } from "@/components/SourceManager";
import { UserAccessManager } from "@/components/UserAccessManager";
import { ChevronDown, AlertTriangle, Activity } from "lucide-react";

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

const Admin = () => {
  const qc = useQueryClient();
  const { data: sources = [] } = useSources();
  const { data: items = [] } = useItems();
  const [running, setRunning] = useState(false);
  const [runningResearch, setRunningResearch] = useState(false);
  const [hideSeed, setHideSeed] = useState(() => localStorage.getItem("hideSeed") === "1");

  const realSources = sources.filter((s: any) => !s.is_seed && s.rss_url);
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

  const newsRuns = runs.filter((r) => r.triggered_by !== "manual-research").slice(0, 20);
  const researchRuns = runs.filter((r) => r.triggered_by === "manual-research").slice(0, 20);

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
      await Promise.all([refetchRuns(), qc.invalidateQueries({ queryKey: ["items"] })]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בריצה");
    } finally {
      setRunning(false);
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
      await Promise.all([refetchRuns(), qc.invalidateQueries({ queryKey: ["items"] })]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בריצת Research");
    } finally {
      setRunningResearch(false);
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

        <SourceManager onRunSource={(id) => runIngestion(id)} />

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

        <LogsMonitoringSection newsRuns={newsRuns} researchRuns={researchRuns} />
      </div>
    </AppLayout>
  );
};

const LogsMonitoringSection = ({
  newsRuns, researchRuns,
}: { newsRuns: IngestionRun[]; researchRuns: IngestionRun[] }) => {
  const [open, setOpen] = useState(false);
  const allRuns = [...newsRuns, ...researchRuns].sort(
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
