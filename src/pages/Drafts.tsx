import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

interface DraftRow {
  id: string;
  title: string;
  intro: string | null;
  source_item_ids: string[];
  created_at: string;
}

const Drafts = () => {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["article_drafts", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("article_drafts")
        .select("id,title,intro,source_item_ids,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DraftRow[];
    },
  });

  const formatted = useMemo(
    () => rows.map((r) => ({
      ...r,
      created_label: new Date(r.created_at).toLocaleString("he-IL", {
        day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      }),
    })),
    [rows],
  );

  return (
    <AppLayout>
      <div className="rounded-2xl bg-gradient-to-br from-accent/5 via-primary/5 to-background border border-border p-6 mb-8">
        <div className="flex items-center gap-2 text-accent text-xs font-semibold uppercase tracking-widest mb-2">
          <Sparkles className="h-3.5 w-3.5" /> טיוטות מאמרים
        </div>
        <h1 className="text-2xl font-bold text-primary mb-1">המאמרים שיצרת</h1>
        <p className="text-sm text-muted-foreground">
          טיוטות שנוצרו מבחירה של פריטים בעמוד הראשי. ניתן לערוך, להעתיק ולשלוח.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : formatted.length === 0 ? (
        <div className="surface-card p-12 text-center text-muted-foreground">
          עדיין לא יצרת טיוטות. בעמוד הראשי לחץ "צור מאמר מהנבחרים" כדי להתחיל.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {formatted.map((d) => (
            <Link key={d.id} to={`/drafts/${d.id}`}>
              <Card className="p-5 h-full flex flex-col gap-2 hover:shadow-md transition-shadow border-border">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  טיוטה · {d.created_label}
                </div>
                <h3 className="text-base font-semibold text-primary leading-snug">{d.title}</h3>
                {d.intro && (
                  <p className="text-sm text-foreground/70 leading-relaxed line-clamp-3">{d.intro}</p>
                )}
                <div className="text-[11px] text-muted-foreground mt-auto">
                  מבוסס על {d.source_item_ids.length} פריטים
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppLayout>
  );
};

export default Drafts;