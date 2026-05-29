import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Sparkles, Plus, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ResearchBlock {
  title: string;
  snippet: string;
  url: string;
  relevance: number;
}

interface SourceWithNote extends ResearchBlock {
  note: string;
}

type ArticleType = "linkedin" | "blog_he" | "blog_en";

const ARTICLE_TYPE_LABELS: Record<ArticleType, string> = {
  linkedin: "פוסט LinkedIn / מאמר דעה (עברית)",
  blog_he: "מאמר בלוג — עברית",
  blog_en: "מאמר בלוג — English",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewArticleSheet = ({ open, onOpenChange }: Props) => {
  const nav = useNavigate();
  const qc = useQueryClient();

  const [topic, setTopic] = useState("");
  const [instructions, setInstructions] = useState("");
  const [articleType, setArticleType] = useState<ArticleType>("linkedin");
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<SourceWithNote[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [createLoading, setCreateLoading] = useState(false);

  const reset = () => {
    setTopic("");
    setInstructions("");
    setArticleType("linkedin");
    setResults([]);
    setSelected(new Set());
    setExpandedNotes(new Set());
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const scanSources = async () => {
    if (!topic.trim()) return;
    setSearchLoading(true);
    setResults([]);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("research-web", {
        body: { query: topic.trim(), context: instructions.trim() || topic.trim() },
      });
      if (error) throw new Error(error.message);
      const blocks: ResearchBlock[] = (data as any)?.blocks ?? [];
      setResults(blocks.map((b) => ({ ...b, note: "" })));
      if (blocks.length === 0) toast.info("לא נמצאו תוצאות, נסה נושא אחר");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setSearchLoading(false);
    }
  };

  const toggleSelect = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleNote = (url: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const updateNote = (url: string, note: string) => {
    setResults((prev) => prev.map((r) => r.url === url ? { ...r, note } : r));
  };

  const createArticle = async () => {
    const chosenSources = results.filter((r) => selected.has(r.url));
    if (chosenSources.length === 0) {
      toast.error("בחרי לפחות מקור אחד");
      return;
    }

    setCreateLoading(true);
    try {
      const webContext = chosenSources
        .map((s) => `${s.title}\n${s.snippet}\nמקור: ${s.url}${s.note ? `\nהערה: ${s.note}` : ""}`)
        .join("\n\n---\n\n");

      const sourceNotes: Record<string, string> = {};
      chosenSources.forEach((s) => {
        if (s.note.trim()) sourceNotes[`web:${s.url}`] = s.note.trim();
      });

      let draftId: string | null = null;

      if (articleType === "linkedin") {
        const { data, error } = await supabase.functions.invoke("generate-article", {
          body: {
            item_ids: [],
            web_context: webContext,
            instructions: instructions.trim() || undefined,
            source_notes: Object.keys(sourceNotes).length ? sourceNotes : undefined,
            target_words: "medium",
          },
        });
        if (error) throw new Error(error.message);
        draftId = (data as any)?.draft_id;
      } else {
        const { data, error } = await supabase.functions.invoke("generate-blog-post", {
          body: {
            item_ids: [],
            language: articleType === "blog_en" ? "en" : "he",
            web_context: webContext,
            instructions: instructions.trim() || undefined,
            source_notes: Object.keys(sourceNotes).length ? sourceNotes : undefined,
          },
        });
        if (error) throw new Error(error.message);
        draftId = (data as any)?.draft_id;
      }

      if (!draftId) throw new Error("לא התקבל מזהה טיוטה");

      // Save web sources to the draft so DraftDetail can display them
      await supabase.from("article_drafts" as any).update({
        web_sources: chosenSources.map((s) => ({
          title: s.title,
          url: s.url,
          snippet: s.snippet,
          note: s.note,
        })),
      }).eq("id", draftId);

      qc.invalidateQueries({ queryKey: ["article_drafts"] });
      toast.success("המאמר נוצר!");
      handleClose(false);
      nav(`/drafts/${draftId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ביצירת מאמר");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-5 p-6">
        <SheetHeader>
          <SheetTitle className="text-right">מאמר חדש מנושא</SheetTitle>
        </SheetHeader>

        {/* Topic */}
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">נושא לסריקה</Label>
          <div className="flex gap-2">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && scanSources()}
              placeholder="לדוגמה: AI in Israeli data centers 2025"
              dir="rtl"
              className="flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              disabled={searchLoading || !topic.trim()}
              onClick={scanSources}
            >
              {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              סרוק
            </Button>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">הנחיות ל-AI (אופציונלי)</Label>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="מה חשוב לכלול, זווית, טון, נקודות ספציפיות..."
            rows={3}
            className="text-sm resize-none"
            dir="rtl"
          />
        </div>

        {/* Article type */}
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">סוג תוכן</Label>
          <Select value={articleType} onValueChange={(v) => setArticleType(v as ArticleType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ARTICLE_TYPE_LABELS) as ArticleType[]).map((t) => (
                <SelectItem key={t} value={t}>{ARTICLE_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                תוצאות ({results.length}) — בחרי מקורות
              </Label>
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => setSelected(
                  selected.size === results.length
                    ? new Set()
                    : new Set(results.map((r) => r.url))
                )}
              >
                {selected.size === results.length ? "בטל הכל" : "בחר הכל"}
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {results.map((block) => {
                const isSelected = selected.has(block.url);
                const noteOpen = expandedNotes.has(block.url);
                return (
                  <div
                    key={block.url}
                    className={cn(
                      "rounded-md border text-xs transition-colors",
                      isSelected ? "border-accent/50 bg-accent/5" : "border-border"
                    )}
                  >
                    <div
                      className="p-2.5 cursor-pointer"
                      onClick={() => toggleSelect(block.url)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-foreground leading-tight line-clamp-2 flex-1">{block.title}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isSelected
                            ? <Check className="h-3.5 w-3.5 text-accent" />
                            : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                      </div>
                      <p className="text-muted-foreground mt-1 line-clamp-2">{block.snippet}</p>
                      <a
                        href={block.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-mono text-muted-foreground hover:text-accent mt-1 block truncate"
                      >
                        {block.url}
                      </a>
                    </div>

                    {/* Note toggle */}
                    <div className="border-t border-border px-2.5 pb-0.5">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-muted-foreground hover:text-accent py-1.5 text-[11px]"
                        onClick={() => toggleNote(block.url)}
                      >
                        {noteOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {block.note ? "הערה: " + block.note.slice(0, 40) + (block.note.length > 40 ? "..." : "") : "הוסף הערה"}
                      </button>
                      {noteOpen && (
                        <Textarea
                          autoFocus
                          placeholder="מה לקחת מהמקור הזה? (לדוגמה: השתמש בנתון X, הזכר את הגישה Y)"
                          value={block.note}
                          onChange={(e) => updateNote(block.url, e.target.value)}
                          rows={2}
                          className="text-xs resize-none mb-2"
                          dir="rtl"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create button */}
        {results.length > 0 && (
          <Button
            className="w-full gap-2 mt-auto"
            disabled={createLoading || selected.size === 0}
            onClick={createArticle}
          >
            {createLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> יוצר מאמר...</>
              : <><Sparkles className="h-4 w-4" /> צור מאמר מ-{selected.size} מקורות</>}
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
};
