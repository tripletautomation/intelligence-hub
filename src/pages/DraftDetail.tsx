import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowRight, Loader2, Save, Trash2, Mail, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { buildMailtoUrl } from "@/lib/mailto";

interface Draft {
  id: string;
  title: string;
  intro: string | null;
  body: string | null;
  closing: string | null;
  source_item_ids: string[];
  style_note: string | null;
  created_at: string;
}

interface SourceItem {
  id: string;
  title_he: string;
  url: string | null;
}

const DraftDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: draft, isLoading } = useQuery({
    enabled: !!user && !!id,
    queryKey: ["article_drafts", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("article_drafts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Draft | null;
    },
  });

  const { data: sourceItems = [] } = useQuery({
    enabled: !!draft?.source_item_ids?.length,
    queryKey: ["draft_sources", id, draft?.source_item_ids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id,title_he,url")
        .in("id", draft!.source_item_ids);
      if (error) throw error;
      return (data ?? []) as SourceItem[];
    },
  });

  const [form, setForm] = useState<Pick<Draft, "title" | "intro" | "body" | "closing">>({
    title: "", intro: "", body: "", closing: "",
  });
  useEffect(() => {
    if (draft) {
      setForm({
        title: draft.title ?? "",
        intro: draft.intro ?? "",
        body: draft.body ?? "",
        closing: draft.closing ?? "",
      });
    }
  }, [draft]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("article_drafts")
        .update({
          title: form.title,
          intro: form.intro,
          body: form.body,
          closing: form.closing,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("נשמר");
      qc.invalidateQueries({ queryKey: ["article_drafts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("article_drafts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הטיוטה נמחקה");
      qc.invalidateQueries({ queryKey: ["article_drafts"] });
      nav("/drafts");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fullText = useMemo(
    () => [form.intro, form.body, form.closing].filter((s) => s?.trim()).join("\n\n"),
    [form],
  );

  const mailtoHref = buildMailtoUrl({
    kind: "generated_article",
    title: form.title,
    summary: form.intro,
    whyItMatters: form.closing,
  });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${form.title}\n\n${fullText}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("לא ניתן להעתיק"); }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!draft) {
    return (
      <AppLayout>
        <div className="surface-card p-12 text-center text-muted-foreground">
          הטיוטה לא נמצאה. <Link to="/drafts" className="text-accent hover:underline">חזור לטיוטות</Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav("/drafts")} className="gap-1.5">
          <ArrowRight className="h-4 w-4" /> כל הטיוטות
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onCopy} className="gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "הועתק" : "העתק"}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={mailtoHref} className="gap-1.5">
              <Mail className="h-4 w-4" /> שלח במייל
            </a>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" /> מחק
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>למחוק את הטיוטה?</AlertDialogTitle>
                <AlertDialogDescription>הפעולה אינה הפיכה.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()}>מחק</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            שמור
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-xs uppercase tracking-wider text-muted-foreground">כותרת</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="text-xl font-bold"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="intro" className="text-xs uppercase tracking-wider text-muted-foreground">פתיח</Label>
            <Textarea
              id="intro"
              value={form.intro ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))}
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body" className="text-xs uppercase tracking-wider text-muted-foreground">גוף המאמר</Label>
            <Textarea
              id="body"
              value={form.body ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={14}
              className="leading-relaxed"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="closing" className="text-xs uppercase tracking-wider text-muted-foreground">סיכום</Label>
            <Textarea
              id="closing"
              value={form.closing ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, closing: e.target.value }))}
              rows={4}
            />
          </div>
        </Card>

        <aside className="space-y-4">
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">פריטי מקור</div>
            {sourceItems.length === 0 ? (
              <div className="text-sm text-muted-foreground">לא נמצאו פריטי מקור.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {sourceItems.map((s) => (
                  <li key={s.id} className="leading-snug">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-foreground/80 hover:text-accent">
                        • {s.title_he}
                      </a>
                    ) : (
                      <span className="text-foreground/80">• {s.title_he}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {draft.style_note && (
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">הערת סגנון</div>
              <p className="text-sm text-foreground/80">{draft.style_note}</p>
            </Card>
          )}
        </aside>
      </div>
    </AppLayout>
  );
};

export default DraftDetail;