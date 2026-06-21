import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, ExternalLink, ArrowRight, Newspaper, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BriefItem {
  title_he: string;
  url: string;
  why_it_matters: string;
}

interface BriefResult {
  items_found: number;
  item_ids: string[];
  items: BriefItem[];
  drafts: { blog_he_id: string | null; blog_en_id: string | null };
  social_post_draft_id: string | null;
  drafts_pending?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = "idle" | "searching" | "done" | "error";

export function WeeklyBriefPanel({ open, onOpenChange }: Props) {
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<BriefResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runBrief = async () => {
    setPhase("searching");
    setResult(null);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-brief", { body: {} });
      if (error) throw new Error(error.message);
      setResult(data as BriefResult);
      setPhase("done");
      toast.success(`נמצאו ${(data as BriefResult).items_found} ידיעות — הטיוטה נוצרת ברקע`);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "שגיאה לא ידועה");
      setPhase("error");
      toast.error("שגיאה בבריף השבועי");
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setPhase("idle");
      setResult(null);
      setErrorMsg(null);
    }
    onOpenChange(o);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[440px] sm:w-[500px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Newspaper className="h-4 w-4 text-accent" />
            בריף השבוע
          </SheetTitle>
          <p className="text-sm text-muted-foreground mt-1">
            שולף את 3-5 הידיעות הכי מעניינות השבוע בתחומי TripleT ויוצר מהן מאמר + פוסט מקשר.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {phase === "idle" && (
            <div className="text-center space-y-4 py-8">
              <div className="text-4xl">📰</div>
              <p className="text-sm text-muted-foreground">
                הפונקציה תחפש בכל תחומי TripleT — Data Centers, AI, סייבר, ענן — ותבחר את 5 הידיעות הכי חשובות של 7 הימים האחרונים.
              </p>
              <Button onClick={runBrief} className="gap-2">
                <Sparkles className="h-4 w-4" />
                משוך ידיעות השבוע
              </Button>
            </div>
          )}

          {phase === "searching" && (
            <div className="text-center space-y-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto" />
              <p className="text-sm text-muted-foreground">מחפש ידיעות השבוע ויוצר תוכן...</p>
              <p className="text-xs text-muted-foreground">זה עשוי לקחת כחצי דקה</p>
            </div>
          )}

          {phase === "error" && (
            <div className="text-center space-y-3 py-8">
              <p className="text-sm text-destructive">{errorMsg}</p>
              <Button variant="outline" onClick={runBrief} className="gap-2">
                <Loader2 className="h-4 w-4" />
                נסה שוב
              </Button>
            </div>
          )}

          {phase === "done" && result && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                נמצאו {result.items_found} ידיעות — נוצרו הטיוטות
              </div>

              {/* Items list */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">ידיעות שנבחרו</h3>
                {result.items.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-card p-3 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-primary leading-snug">{item.title_he}</p>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.why_it_matters}</p>
                  </div>
                ))}
              </div>

              {/* Draft links */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">טיוטות</h3>
                {result.drafts_pending && !result.drafts.blog_he_id && (
                  <button
                    onClick={() => { nav(`/drafts`); handleOpenChange(false); }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5",
                      "text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
                    )}
                  >
                    <span>הטיוטה (מאמר + פוסט) נוצרת ברקע — תופיע בעמוד המאמרים תוך דקה</span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </button>
                )}
                <div className="space-y-2">
                  {result.drafts.blog_he_id && (
                    <button
                      onClick={() => { nav(`/drafts/${result.drafts.blog_he_id}`); handleOpenChange(false); }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5",
                        "text-sm font-medium text-primary hover:bg-accent/5 transition-colors"
                      )}
                    >
                      <span>מאמר בלוג — עברית</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                  {result.drafts.blog_en_id && (
                    <button
                      onClick={() => { nav(`/drafts/${result.drafts.blog_en_id}`); handleOpenChange(false); }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5",
                        "text-sm font-medium text-primary hover:bg-accent/5 transition-colors"
                      )}
                    >
                      <span>Blog Article — English</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                  {result.social_post_draft_id && (
                    <button
                      onClick={() => { nav(`/drafts/${result.social_post_draft_id}`); handleOpenChange(false); }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5",
                        "text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
                      )}
                    >
                      <span>פוסט LinkedIn מקשר — עברית</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <Button variant="outline" size="sm" className="w-full gap-2" onClick={runBrief}>
                <Sparkles className="h-4 w-4" />
                הפעל מחדש
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
