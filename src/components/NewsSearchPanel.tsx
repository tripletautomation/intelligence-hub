import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Plus, CheckCircle2, ExternalLink, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DiscoveredNewsItem {
  title_he: string;
  summary_he: string;
  why_it_matters: string;
  url: string;
  source_name: string | null;
  tags: string[];
  relevance_score: number;
  region: "israel" | "global";
  published_date: string | null;
}

type DaysFilter = "1" | "7" | "30" | "365";

const DAYS_OPTIONS: { value: DaysFilter; label: string }[] = [
  { value: "1", label: "24 שעות אחרונות" },
  { value: "7", label: "שבוע אחרון" },
  { value: "30", label: "חודש אחרון" },
  { value: "365", label: "כל הזמן" },
];

function formatPublishedDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffH = diffMs / 1000 / 3600;
  if (diffH < 1) return "לפני פחות משעה";
  if (diffH < 24) return `לפני ${Math.floor(diffH)} שעות`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "אתמול";
  if (diffD < 7) return `לפני ${diffD} ימים`;
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export const NewsSearchPanel = ({ open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<"any" | "israel" | "global">("any");
  const [days, setDays] = useState<DaysFilter>("30");
  const [results, setResults] = useState<DiscoveredNewsItem[]>([]);
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("discover-news", {
        body: { query: query.trim(), region, days: Number(days) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResults((data as any)?.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setSearching(false);
    }
  };

  const addToFeed = async (item: DiscoveredNewsItem) => {
    setAddingUrl(item.url);
    try {
      const { data, error } = await supabase.functions.invoke("add-news-to-feed", { body: { item } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAddedUrls((prev) => new Set([...prev, item.url]));
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success((data as any)?.already_existed ? "הידיעה כבר קיימת בדשבורד" : "הידיעה נוספה לדשבורד");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בהוספה");
    } finally {
      setAddingUrl(null);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setResults([]);
    setQuery("");
    setAddedUrls(new Set());
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="text-xl">חיפוש ידיעות</SheetTitle>
          <p className="text-sm text-muted-foreground">חפש מאמרים וידיעות על נושא ומשוך אותם לדשבורד</p>
        </SheetHeader>

        {/* Search form */}
        <div className="px-6 py-4 space-y-3 border-b border-border shrink-0 bg-muted/20">
          <Input
            placeholder="למשל: AI inference chips, data center cooling..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="bg-background"
            dir="ltr"
          />
          <div className="flex gap-2">
            <Select value={days} onValueChange={(v) => setDays(v as DaysFilter)}>
              <SelectTrigger className="w-44 bg-background shrink-0">
                <Clock className="h-3.5 w-3.5 text-muted-foreground ml-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={region} onValueChange={(v) => setRegion(v as typeof region)}>
              <SelectTrigger className="w-32 bg-background shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">כל האזורים</SelectItem>
                <SelectItem value="israel">ישראל</SelectItem>
                <SelectItem value="global">עולמי</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="flex-1 gap-2"
            >
              {searching
                ? <><Loader2 className="h-4 w-4 animate-spin" /> מחפש...</>
                : <><Search className="h-4 w-4" /> חפש</>}
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {searching && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm">מחפש ומסכם ידיעות...</p>
            </div>
          )}

          {!searching && results.length === 0 && query && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              לא נמצאו תוצאות — נסה שאילתה אחרת או הרחב את טווח הזמן
            </div>
          )}

          {!searching && results.length === 0 && !query && (
            <div className="text-center py-16 text-muted-foreground text-sm space-y-2">
              <Search className="h-10 w-10 mx-auto opacity-20" />
              <p>הקלד נושא וחפש ידיעות רלוונטיות</p>
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                {["AI data centers", "cybersecurity 2025", "GPU infrastructure", "Israel tech"].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setQuery(ex)}
                    className="text-xs px-3 py-1.5 rounded-full bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!searching && results.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground pb-1">
                נמצאו {results.length} ידיעות · לחץ <span className="font-medium text-foreground">הוסף לדשבורד</span> כדי לשתף עם כל המשתמשים
              </p>
              {results.map((item) => (
                <NewsResultCard
                  key={item.url}
                  item={item}
                  added={addedUrls.has(item.url)}
                  isAdding={addingUrl === item.url}
                  onAdd={() => addToFeed(item)}
                />
              ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const NewsResultCard = ({
  item,
  added,
  isAdding,
  onAdd,
}: {
  item: DiscoveredNewsItem;
  added: boolean;
  isAdding: boolean;
  onAdd: () => void;
}) => {
  const dateLabel = formatPublishedDate(item.published_date);

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-2.5 transition-colors",
      added ? "border-accent/30 bg-accent/5" : "border-border bg-card hover:border-accent/20"
    )}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-primary leading-snug flex-1">{item.title_he}</h3>
        <span className={cn(
          "shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-medium",
          item.region === "israel"
            ? "bg-blue-500/10 text-blue-400 border-blue-400/20"
            : "bg-slate-500/10 text-slate-400 border-slate-400/20"
        )}>
          {item.region === "israel" ? "ישראל" : "עולמי"}
        </span>
      </div>

      {/* Meta row: source + date */}
      {(item.source_name || dateLabel) && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {item.source_name && <span className="font-medium">{item.source_name}</span>}
          {item.source_name && dateLabel && <span>·</span>}
          {dateLabel && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {dateLabel}
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-foreground/70 leading-relaxed">{item.summary_he}</p>

      {item.why_it_matters && (
        <div className="text-xs bg-accent/5 border-r-2 border-accent rounded p-2 text-foreground/70 leading-relaxed">
          <span className="font-semibold text-accent">למה זה חשוב: </span>
          {item.why_it_matters}
        </div>
      )}

      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 4).map((t) => (
            <span key={t} className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant={added ? "outline" : "default"}
          disabled={added || isAdding}
          onClick={onAdd}
          className="gap-1.5 h-7 text-xs"
        >
          {isAdding
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : added
              ? <CheckCircle2 className="h-3 w-3 text-accent" />
              : <Plus className="h-3 w-3" />}
          {added ? "נוסף לדשבורד" : isAdding ? "מוסיף..." : "הוסף לדשבורד"}
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0 mr-auto">
          <a href={item.url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
};
