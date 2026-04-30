import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Search, MapPin, Calendar, ExternalLink, Bookmark, BookmarkCheck, Mail, CalendarPlus, Loader2, Globe, Building2, CalendarCheck, ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface DiscoveredEvent {
  title: string;
  event_date: string | null;
  location: string | null;
  is_online: boolean;
  source_name: string | null;
  source_url: string;
  summary: string;
  why_it_matters: string;
}

type Format = "any" | "online" | "physical" | "hybrid";

const EXAMPLES = [
  "Cisco events in June",
  "AI infrastructure events in Europe",
  "data center conferences in Singapore",
  "cooling webinars next month",
];

function formatHeDate(iso: string | null) {
  if (!iso) return "תאריך לא ידוע";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "תאריך לא ידוע";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

function toGoogleCalendarUrl(ev: DiscoveredEvent) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const text = encodeURIComponent(ev.title);
  const details = encodeURIComponent(`${ev.summary}\n\n${ev.why_it_matters}\n\n${ev.source_url}`);
  const location = encodeURIComponent(ev.is_online ? "Online" : ev.location ?? "");
  let dates = "";
  if (ev.event_date) {
    const d = new Date(ev.event_date);
    if (!isNaN(d.getTime())) {
      const start = d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const end = new Date(d.getTime() + 60 * 60 * 1000)
        .toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      dates = `&dates=${start}/${end}`;
    }
  }
  return `${base}&text=${text}&details=${details}&location=${location}${dates}`;
}

function toMailtoUrl(ev: DiscoveredEvent) {
  const subject = encodeURIComponent(`אירוע: ${ev.title}`);
  const body = encodeURIComponent(
    `${ev.title}\n\n` +
    `מתי: ${formatHeDate(ev.event_date)}\n` +
    `איפה: ${ev.is_online ? "אונליין" : ev.location ?? "לא ידוע"}\n` +
    `מקור: ${ev.source_name ?? ""}\n\n` +
    `${ev.summary}\n\nלמה זה חשוב:\n${ev.why_it_matters}\n\nקישור: ${ev.source_url}`,
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

const Discover = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [location, setLocation] = useState("");
  const [organization, setOrganization] = useState("");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<Format>("any");
  const [results, setResults] = useState<DiscoveredEvent[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [boardAdded, setBoardAdded] = useState<Set<string>>(new Set());
  const [scannerAdded, setScannerAdded] = useState<Set<string>>(new Set());

  const { data: saved = [] } = useQuery({
    enabled: !!user,
    queryKey: ["saved_discoveries", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_discoveries")
        .select("source_url");
      if (error) throw error;
      return data as { source_url: string }[];
    },
  });
  const savedSet = new Set(saved.map((s) => s.source_url));

  const search = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("discover-events", {
        body: {
          query, month: month || null, location: location || null,
          organization: organization || null, topic: topic || null,
          format, limit: 10,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { events: DiscoveredEvent[]; query: string };
    },
    onSuccess: (data) => {
      const now = new Date();
      const futureOnly = (data.events ?? []).filter((ev) => {
        if (!ev.event_date) return true;
        const d = new Date(ev.event_date);
        return isNaN(d.getTime()) || d >= now;
      });
      setResults(futureOnly);
      setLastQuery(data.query ?? query);
      if (!data.events?.length) {
        toast({ title: "לא נמצאו אירועים", description: "נסה לנסח מחדש או לשנות פילטרים." });
      }
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה בחיפוש", description: e.message, variant: "destructive" });
    },
  });

  const addToScanner = useMutation({
    mutationFn: async (ev: DiscoveredEvent) => {
      const { data, error } = await supabase.functions.invoke("add-source-to-scanner", {
        body: { name: ev.source_name ?? ev.source_url, url: ev.source_url, category: "events" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { source_id: string; already_existed: boolean };
    },
    onSuccess: (data, ev) => {
      setScannerAdded((prev) => new Set([...prev, ev.source_url]));
      if (data.already_existed) {
        toast({ title: "כבר בסורק", description: "האתר כבר רשום כמקור סריקה." });
      } else {
        toast({ title: "האתר נוסף לסורק", description: "אירועים עתידיים מאתר זה יסרקו אוטומטית." });
      }
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const addToBoard = useMutation({
    mutationFn: async (ev: DiscoveredEvent) => {
      const { data, error } = await supabase.functions.invoke("add-event-to-board", {
        body: { event: ev },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { item_id: string; already_existed: boolean };
    },
    onSuccess: (data, ev) => {
      setBoardAdded((prev) => new Set([...prev, ev.source_url]));
      if (data.already_existed) {
        toast({ title: "כבר קיים בלוח", description: "האירוע כבר נמצא בלוח האירועים שלך." });
      } else {
        toast({ title: "נוסף ללוח האירועים", description: "האירוע מופיע כעת בלוח האירועים." });
      }
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const saveOne = useMutation({
    mutationFn: async (ev: DiscoveredEvent) => {
      if (!user) throw new Error("not authenticated");
      const { error } = await supabase.from("saved_discoveries").insert({
        user_id: user.id,
        title: ev.title,
        event_date: ev.event_date,
        location: ev.location,
        is_online: ev.is_online,
        source_name: ev.source_name,
        source_url: ev.source_url,
        summary: ev.summary,
        why_it_matters: ev.why_it_matters,
        query: lastQuery,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_discoveries"] });
      toast({ title: "נשמר", description: "האירוע נוסף לרשימה השמורה שלך." });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    },
  });

  const onSearch = () => {
    if (query.trim().length < 2) {
      toast({ title: "נדרשת שאילתה", description: "כתוב מה אתה מחפש.", variant: "destructive" });
      return;
    }
    search.mutate();
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Hero search */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-accent/5 to-background border border-border p-8">
          <div className="flex items-center gap-2 text-accent text-xs font-semibold uppercase tracking-widest mb-2">
            <Sparkles className="h-3.5 w-3.5" /> חיפוש חכם
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary mb-1">חיפוש אירועים בעולם</h1>
          <p className="text-sm text-muted-foreground mb-6">
            גלה כנסים, וובינרים ופאנלים מעבר למקורות הקבועים — מופעל ע״י Tavily + AI.
          </p>

          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="לדוגמה: AI infrastructure events in Europe"
              className="pr-12 h-14 text-base bg-background border-border"
            />
            <Button
              onClick={onSearch}
              disabled={search.isPending}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-10"
            >
              {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "חפש"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setQuery(ex)}
                className="text-xs px-3 py-1.5 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/50"
              >
                {ex}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
            <Input placeholder="חודש / טווח (June 2026)" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-background" />
            <Input placeholder="מיקום" value={location} onChange={(e) => setLocation(e.target.value)} className="bg-background" />
            <Input placeholder="חברה / ארגון" value={organization} onChange={(e) => setOrganization(e.target.value)} className="bg-background" />
            <Input placeholder="נושא" value={topic} onChange={(e) => setTopic(e.target.value)} className="bg-background" />
            <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">כל פורמט</SelectItem>
                <SelectItem value="online">אונליין</SelectItem>
                <SelectItem value="physical">פיזי</SelectItem>
                <SelectItem value="hybrid">היברידי</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* Results */}
        <section>
          {search.isPending && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <div className="text-sm">סורקים את האינטרנט ומחלצים אירועים…</div>
            </div>
          )}

          {!search.isPending && results.length === 0 && lastQuery && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              לא נמצאו אירועים מתאימים. נסה לנסח מחדש.
            </div>
          )}

          {!search.isPending && results.length === 0 && !lastQuery && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              התחל עם חיפוש או בחר דוגמה מלמעלה.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {results.map((ev, i) => (
              <ResultCard
                key={`${ev.source_url}-${i}`}
                ev={ev}
                isSaved={savedSet.has(ev.source_url)}
                onSave={() => saveOne.mutate(ev)}
                isInBoard={boardAdded.has(ev.source_url)}
                onAddToBoard={() => addToBoard.mutate(ev)}
                addingToBoard={addToBoard.isPending && addToBoard.variables?.source_url === ev.source_url}
                isInScanner={scannerAdded.has(ev.source_url)}
                onAddToScanner={() => addToScanner.mutate(ev)}
                addingToScanner={addToScanner.isPending && addToScanner.variables?.source_url === ev.source_url}
              />
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

const ResultCard = ({
  ev, isSaved, onSave, isInBoard, onAddToBoard, addingToBoard,
  isInScanner, onAddToScanner, addingToScanner,
}: {
  ev: DiscoveredEvent; isSaved: boolean; onSave: () => void;
  isInBoard: boolean; onAddToBoard: () => void; addingToBoard: boolean;
  isInScanner: boolean; onAddToScanner: () => void; addingToScanner: boolean;
}) => {
  return (
    <Card className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow border-border bg-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-primary leading-snug flex-1">{ev.title}</h3>
        {ev.is_online ? (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 shrink-0">
            <Globe className="h-3 w-3 inline ml-1" />אונליין
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border shrink-0">
            פיזי
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatHeDate(ev.event_date)}</span>
        {ev.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{ev.location}</span>}
        {ev.source_name && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{ev.source_name}</span>}
      </div>

      {ev.summary && <p className="text-sm text-foreground/80 leading-relaxed">{ev.summary}</p>}

      {ev.why_it_matters && (
        <div className="text-xs bg-accent/5 border-r-2 border-accent rounded p-2.5 text-foreground/70">
          <span className="font-semibold text-accent">למה זה חשוב: </span>{ev.why_it_matters}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1 mt-auto">
        <Button asChild size="sm" variant="default" className="gap-1.5">
          <a href={ev.source_url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> פרטים
          </a>
        </Button>
        <Button size="sm" variant="outline" onClick={onSave} disabled={isSaved} className="gap-1.5">
          {isSaved ? <><BookmarkCheck className="h-3.5 w-3.5" /> נשמר</> : <><Bookmark className="h-3.5 w-3.5" /> שמור</>}
        </Button>
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <a href={toGoogleCalendarUrl(ev)} target="_blank" rel="noreferrer">
            <CalendarPlus className="h-3.5 w-3.5" /> ליומן
          </a>
        </Button>
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <a href={toMailtoUrl(ev)}>
            <Mail className="h-3.5 w-3.5" /> שלח במייל
          </a>
        </Button>
        <Button
          size="sm"
          variant={isInBoard ? "secondary" : "outline"}
          onClick={onAddToBoard}
          disabled={isInBoard || addingToBoard}
          className="gap-1.5 ml-auto"
        >
          {addingToBoard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
          {isInBoard ? "בלוח האירועים" : "הוסף ללוח"}
        </Button>
        <Button
          size="sm"
          variant={isInScanner ? "secondary" : "ghost"}
          onClick={onAddToScanner}
          disabled={isInScanner || addingToScanner}
          className="gap-1.5"
        >
          {addingToScanner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
          {isInScanner ? "בסורק ✓" : "הוסף אתר לסורק"}
        </Button>
      </div>
    </Card>
  );
};

export default Discover;