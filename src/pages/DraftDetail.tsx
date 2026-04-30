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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowRight, Loader2, Save, Trash2, Mail, Copy, Check,
  Wand2, Maximize2, Minimize2, RefreshCw, Sparkles,
  Globe, Plus, X, Linkedin, Twitter, Facebook, Instagram,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { buildEmailBodyHtml } from "@/lib/articleHtml";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface SourceItem { id: string; title_he: string; url: string | null; }

interface ResearchBlock { title: string; snippet: string; url: string; relevance: number; }

type UnifiedSource =
  | { kind: "db"; id: string; title: string; url: string | null }
  | { kind: "web"; title: string; snippet: string; url: string; relevance: number };

interface SocialPosts { linkedin: string; facebook: string; instagram: string; twitter: string; }

type Section = "intro" | "body" | "closing";
type AiAction = "regenerate" | "expand" | "condense" | "rephrase";
type Tone = "formal" | "analytical" | "concise";
type MainTab = "editor" | "social";
type Platform = "linkedin" | "facebook" | "instagram" | "twitter";

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<Section, string> = { intro: "פתיח", body: "גוף המאמר", closing: "סיכום" };

const AI_ACTIONS: { id: AiAction; label: string; icon: React.ReactNode }[] = [
  { id: "regenerate", label: "כתוב מחדש", icon: <RefreshCw className="h-3.5 w-3.5" /> },
  { id: "expand",     label: "הרחב",       icon: <Maximize2 className="h-3.5 w-3.5" /> },
  { id: "condense",   label: "קצר",        icon: <Minimize2 className="h-3.5 w-3.5" /> },
  { id: "rephrase",   label: "נסח מחדש",   icon: <Wand2 className="h-3.5 w-3.5" /> },
];

const TONES: { id: Tone; label: string }[] = [
  { id: "formal", label: "רשמי" },
  { id: "analytical", label: "אנליטי" },
  { id: "concise", label: "תמציתי" },
];

const PLATFORMS: { id: Platform; label: string; icon: React.ReactNode; maxChars: number; color: string }[] = [
  { id: "linkedin",  label: "LinkedIn",  icon: <Linkedin className="h-4 w-4" />,  maxChars: 1300, color: "text-blue-600" },
  { id: "facebook",  label: "Facebook",  icon: <Facebook className="h-4 w-4" />,  maxChars: 600,  color: "text-blue-500" },
  { id: "instagram", label: "Instagram", icon: <Instagram className="h-4 w-4" />, maxChars: 300,  color: "text-pink-500" },
  { id: "twitter",   label: "X / Twitter", icon: <Twitter className="h-4 w-4" />, maxChars: 280,  color: "text-foreground" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

const DraftDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [mainTab, setMainTab] = useState<MainTab>("editor");
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("intro");
  const [activeTone, setActiveTone] = useState<Tone>("formal");
  const [refineLoading, setRefineLoading] = useState(false);

  // Unified sources panel (DB items + web research blocks combined)
  const [activeSources, setActiveSources] = useState<UnifiedSource[]>([]);
  const [sourcesInitialized, setSourcesInitialized] = useState(false);

  // Web research
  const [researchQuery, setResearchQuery] = useState("");
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchBlocks, setResearchBlocks] = useState<ResearchBlock[]>([]);
  const [regenerateLoading, setRegenerateLoading] = useState(false);

  // Rephrase with custom instruction
  const [showRephraseInput, setShowRephraseInput] = useState(false);
  const [rephraseInstruction, setRephraseInstruction] = useState("");

  // Social posts
  const [socialPosts, setSocialPosts] = useState<SocialPosts | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null);
  const [copiedPlatform, setCopiedPlatform] = useState<Platform | null>(null);
  const [socialAiPlatform, setSocialAiPlatform] = useState<Platform | null>(null);
  const [socialAiInstruction, setSocialAiInstruction] = useState("");
  const [socialAiLoading, setSocialAiLoading] = useState(false);


  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: draft, isLoading } = useQuery({
    enabled: !!user && !!id,
    queryKey: ["article_drafts", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("article_drafts").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Draft | null;
    },
  });

  const { data: sourceItems = [] } = useQuery({
    enabled: !!draft?.source_item_ids?.length,
    queryKey: ["draft_sources", id, draft?.source_item_ids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items").select("id,title_he,url").in("id", draft!.source_item_ids);
      if (error) throw error;
      return (data ?? []) as SourceItem[];
    },
  });

  // Load saved social posts
  const { data: savedPosts } = useQuery({
    enabled: !!user && !!id,
    queryKey: ["social_posts", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("social_posts").select("platform,content").eq("draft_id", id);
      if (error) throw error;
      return data as { platform: Platform; content: string }[];
    },
  });

  useEffect(() => {
    if (savedPosts?.length) {
      const posts: Partial<SocialPosts> = {};
      savedPosts.forEach((p) => { posts[p.platform] = p.content; });
      if (posts.linkedin && posts.facebook && posts.instagram && posts.twitter) {
        setSocialPosts(posts as SocialPosts);
      }
    }
  }, [savedPosts]);

  // ── Form state ───────────────────────────────────────────────────────────────

  const [form, setForm] = useState<Pick<Draft, "title" | "intro" | "body" | "closing">>({
    title: "", intro: "", body: "", closing: "",
  });
  useEffect(() => {
    if (draft) setForm({ title: draft.title ?? "", intro: draft.intro ?? "", body: draft.body ?? "", closing: draft.closing ?? "" });
  }, [draft]);

  // Initialize activeSources with DB source items once they load
  useEffect(() => {
    if (sourceItems.length > 0 && !sourcesInitialized) {
      setActiveSources(sourceItems.map((s) => ({ kind: "db" as const, id: s.id, title: s.title_he, url: s.url })));
      setSourcesInitialized(true);
    }
  }, [sourceItems, sourcesInitialized]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("article_drafts")
        .update({ title: form.title, intro: form.intro, body: form.body, closing: form.closing })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("נשמר"); qc.invalidateQueries({ queryKey: ["article_drafts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("article_drafts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("הטיוטה נמחקה"); qc.invalidateQueries({ queryKey: ["article_drafts"] }); nav("/drafts"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── AI Actions ───────────────────────────────────────────────────────────────

  const runRefine = async (action: AiAction, customInstruction?: string) => {
    setRefineLoading(true);
    setShowRephraseInput(false);
    try {
      const { data, error } = await supabase.functions.invoke("refine-section", {
        body: {
          draft_id: id, section: activeSection, action, tone: activeTone,
          custom_instruction: customInstruction || undefined,
          article_context: { title: form.title, intro: form.intro ?? "", body: form.body ?? "", closing: form.closing ?? "" },
        },
      });
      if (error) throw new Error(error.message);
      const refined: string = (data as any)?.refined;
      if (!refined) throw new Error("AI לא החזיר תוצאה");
      setForm((f) => ({ ...f, [activeSection]: refined }));
      toast.success(`${SECTION_LABELS[activeSection]} עודכן`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ב-AI");
    } finally { setRefineLoading(false); }
  };

  const runRegenerateWithContext = async () => {
    if (activeSources.length === 0) return;
    setRegenerateLoading(true);
    try {
      const dbIds = activeSources.filter((s) => s.kind === "db").map((s) => (s as Extract<UnifiedSource, { kind: "db" }>).id);
      const webSources = activeSources.filter((s) => s.kind === "web") as Extract<UnifiedSource, { kind: "web" }>[];
      const webContext = webSources.map((b) => `${b.title}\n${b.snippet}\nמקור: ${b.url}`).join("\n\n---\n\n");
      const { data, error } = await supabase.functions.invoke("generate-article", {
        body: {
          item_ids: dbIds.length ? dbIds : draft?.source_item_ids,
          web_context: webContext || undefined,
          style_note: draft?.style_note,
          target_words: "medium",
        },
      });
      if (error) throw new Error(error.message);
      const newDraftId = (data as any)?.draft_id;
      if (!newDraftId) throw new Error("לא התקבל מזהה טיוטה");
      qc.invalidateQueries({ queryKey: ["article_drafts"] });
      nav(`/drafts/${newDraftId}`);
      toast.success("מאמר חדש נוצר עם המקורות שנבחרו");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ביצירת מאמר");
    } finally { setRegenerateLoading(false); }
  };

  const runResearch = async () => {
    if (!researchQuery.trim()) return;
    setResearchLoading(true);
    setResearchBlocks([]);
    try {
      const { data, error } = await supabase.functions.invoke("research-web", {
        body: { query: researchQuery, context: form.title },
      });
      if (error) throw new Error(error.message);
      setResearchBlocks((data as any)?.blocks ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally { setResearchLoading(false); }
  };

  const toggleBlock = (block: ResearchBlock) => {
    setActiveSources((prev) => {
      const exists = prev.some((s) => s.kind === "web" && s.url === block.url);
      if (exists) return prev.filter((s) => !(s.kind === "web" && s.url === block.url));
      return [...prev, { kind: "web" as const, ...block }];
    });
  };

  const removeSource = (src: UnifiedSource) => {
    setActiveSources((prev) =>
      src.kind === "db"
        ? prev.filter((s) => !(s.kind === "db" && s.id === src.id))
        : prev.filter((s) => !(s.kind === "web" && s.url === src.url))
    );
  };

  const generateSocialPosts = async () => {
    setSocialLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-posts", {
        body: { draft_id: id },
      });
      if (error) throw new Error(error.message);
      const posts = (data as any)?.posts as SocialPosts;
      if (!posts) throw new Error("AI לא החזיר פוסטים");
      setSocialPosts(posts);
      qc.invalidateQueries({ queryKey: ["social_posts", id] });
      toast.success("הפוסטים נוצרו");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ביצירת פוסטים");
    } finally { setSocialLoading(false); }
  };

  const copyPlatform = async (platform: Platform) => {
    const text = socialPosts?.[platform] ?? "";
    await navigator.clipboard.writeText(text).catch(() => toast.error("לא ניתן להעתיק"));
    setCopiedPlatform(platform);
    setTimeout(() => setCopiedPlatform(null), 1500);
  };

  const refineSocialPost = async (platform: Platform) => {
    if (!socialAiInstruction.trim()) return;
    setSocialAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-posts", {
        body: {
          draft_id: id,
          refine_platform: platform,
          refine_instruction: socialAiInstruction,
          current_content: socialPosts?.[platform] ?? "",
        },
      });
      if (error) throw new Error(error.message);
      const refined = (data as any)?.posts?.[platform];
      if (!refined) throw new Error("AI לא החזיר תוצאה");
      setSocialPosts((p) => p ? { ...p, [platform]: refined } : p);
      setSocialAiPlatform(null);
      setSocialAiInstruction("");
      toast.success(`פוסט ${platform} עודכן`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ב-AI");
    } finally { setSocialAiLoading(false); }
  };

  const copyHtmlToClipboard = async () => {
    const opts = { title: form.title, intro: form.intro ?? "", body: form.body ?? "", closing: form.closing ?? "" };
    const html = buildEmailBodyHtml(opts);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) }),
      ]);
    } catch {
      await navigator.clipboard.writeText(`${form.title}\n\n${fullText}`).catch(() => {});
    }
  };

  const openOutlook = async () => {
    await copyHtmlToClipboard();
    const a = document.createElement("a");
    a.href = `mailto:?subject=${encodeURIComponent(form.title)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.info("Outlook נפתח — הדבק את המאמר המעוצב בגוף (Ctrl+V)");
  };

  const openGmail = async () => {
    await copyHtmlToClipboard();
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(form.title)}`, "_blank");
    toast.info("Gmail נפתח — הדבק את המאמר המעוצב בגוף (Ctrl+V)");
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const fullText = useMemo(
    () => [form.intro, form.body, form.closing].filter((s) => s?.trim()).join("\n\n"),
    [form],
  );
  const onCopy = async () => {
    await navigator.clipboard.writeText(`${form.title}\n\n${fullText}`).catch(() => toast.error("לא ניתן להעתיק"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Loading / not found ──────────────────────────────────────────────────────

  if (isLoading) return <AppLayout><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppLayout>;
  if (!draft) return <AppLayout><div className="surface-card p-12 text-center text-muted-foreground">הטיוטה לא נמצאה. <Link to="/drafts" className="text-accent hover:underline">חזור לטיוטות</Link></div></AppLayout>;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav("/drafts")} className="gap-1.5">
          <ArrowRight className="h-4 w-4" /> כל הטיוטות
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onCopy} className="gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "הועתק" : "העתק"}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={openOutlook}>
            <Mail className="h-4 w-4" /> Outlook
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={openGmail}>
            <Share2 className="h-4 w-4" /> Gmail
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> מחק</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>למחוק את הטיוטה?</AlertDialogTitle><AlertDialogDescription>הפעולה אינה הפיכה.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>ביטול</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate()}>מחק</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמור
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1 mb-5 bg-muted/40 rounded-lg p-1 w-fit">
        {([{ id: "editor", label: "עריכה" }, { id: "social", label: "פוסטים לרשתות" }] as const).map((t) => (
          <button key={t.id} type="button" onClick={() => setMainTab(t.id)}
            className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5",
              mainTab === t.id ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            )}>
            {t.id === "social" && <Share2 className="h-3.5 w-3.5" />}
            {t.label}
            {t.id === "social" && socialPosts && <span className="text-[10px] bg-accent/20 text-accent rounded-full px-1.5">✓</span>}
          </button>
        ))}
      </div>

      {/* ── EDITOR TAB ─────────────────────────────────────────────────────────── */}
      {mainTab === "editor" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Editor */}
          <Card className="p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-xs uppercase tracking-wider text-muted-foreground">כותרת</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="text-xl font-bold" />
            </div>
            {(["intro", "body", "closing"] as Section[]).map((sec) => (
              <div key={sec} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{SECTION_LABELS[sec]}</Label>
                  <button type="button" onClick={() => setActiveSection(sec)}
                    className={cn("text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                      activeSection === sec ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted-foreground hover:text-foreground"
                    )}>
                    {activeSection === sec ? "נבחר לעריכת AI" : "בחר לעריכת AI"}
                  </button>
                </div>
                <Textarea id={sec} value={(form[sec] as string) ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [sec]: e.target.value }))}
                  rows={sec === "body" ? 14 : 4}
                  className={cn("leading-relaxed transition-colors", activeSection === sec && "ring-1 ring-accent/40")} />
              </div>
            ))}
          </Card>

          {/* Sidebar */}
          <aside className="space-y-4">
            {/* AI Refine */}
            <Card className="p-4 space-y-4">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><div className="text-sm font-semibold text-primary">כלי AI</div></div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">קטע פעיל</div>
                <div className="flex flex-wrap gap-1">
                  {(["intro", "body", "closing"] as Section[]).map((sec) => (
                    <button key={sec} type="button" onClick={() => setActiveSection(sec)}
                      className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors",
                        activeSection === sec ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:border-accent/50"
                      )}>{SECTION_LABELS[sec]}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">טון</div>
                <Select value={activeTone} onValueChange={(v) => setActiveTone(v as Tone)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{TONES.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                {AI_ACTIONS.map((action) => (
                  <Button key={action.id} variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-xs"
                    disabled={refineLoading}
                    onClick={() => action.id === "rephrase" ? setShowRephraseInput((v) => !v) : runRefine(action.id)}>
                    {refineLoading && activeSection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : action.icon}
                    {action.label} — {SECTION_LABELS[activeSection]}
                  </Button>
                ))}
              </div>

              {showRephraseInput && (
                <div className="space-y-2 border border-accent/30 rounded-md p-3 bg-accent/5">
                  <div className="text-xs text-muted-foreground">מה לשנות? (השאר ריק לניסוח כללי)</div>
                  <Textarea
                    placeholder="לדוגמה: תהפוך את זה לפחות טכני, הוסף נתוני שוק..."
                    value={rephraseInstruction}
                    onChange={(e) => setRephraseInstruction(e.target.value)}
                    rows={2}
                    className="text-xs"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runRefine("rephrase", rephraseInstruction); }}}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1" disabled={refineLoading}
                      onClick={() => runRefine("rephrase", rephraseInstruction)}>
                      {refineLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      בצע ניסוח
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => { setShowRephraseInput(false); setRephraseInstruction(""); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {/* Unified Sources Panel */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-accent" />
                  <div className="text-sm font-semibold text-primary">מקורות המאמר</div>
                </div>
                <span className="text-xs text-muted-foreground">{activeSources.length} מקורות</span>
              </div>

              {/* Active sources list */}
              {activeSources.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {activeSources.map((src) => {
                    const key = src.kind === "db" ? src.id : src.url;
                    const title = src.title;
                    const url = src.url;
                    return (
                      <div key={key} className="flex items-start gap-1.5 text-xs group">
                        <span className={cn(
                          "shrink-0 mt-0.5 rounded px-1 py-0.5 text-[10px] font-medium",
                          src.kind === "db" ? "bg-muted text-muted-foreground" : "bg-accent/15 text-accent"
                        )}>
                          {src.kind === "db" ? "DB" : "WEB"}
                        </span>
                        <span className="flex-1 leading-tight line-clamp-2 text-foreground/80 pt-0.5">
                          {url
                            ? <a href={url} target="_blank" rel="noreferrer" className="hover:text-accent">{title}</a>
                            : title}
                        </span>
                        <button type="button" onClick={() => removeSource(src)}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5 opacity-0 group-hover:opacity-100">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button size="sm" className="w-full h-8 text-xs gap-1.5" disabled={regenerateLoading || activeSources.length === 0}
                onClick={runRegenerateWithContext}>
                {regenerateLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {regenerateLoading ? "יוצר מאמר..." : "צור מאמר עם מקורות אלה"}
              </Button>

              {/* Search to add more sources */}
              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-xs text-muted-foreground font-medium">הוסף מקורות מהאינטרנט</div>
                <div className="flex gap-2">
                  <Input placeholder="נושא לחיפוש..." value={researchQuery}
                    onChange={(e) => setResearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runResearch()}
                    className="h-8 text-xs flex-1" />
                  <Button size="sm" variant="outline" className="h-8 shrink-0"
                    disabled={researchLoading || !researchQuery.trim()} onClick={runResearch}>
                    {researchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "חפש"}
                  </Button>
                </div>

                {researchBlocks.length > 0 && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {researchBlocks.map((block) => {
                      const inList = activeSources.some((s) => s.kind === "web" && s.url === block.url);
                      return (
                        <div key={block.url}
                          className={cn("p-2 rounded-md border text-xs cursor-pointer transition-colors",
                            inList ? "border-accent/50 bg-accent/5" : "border-border hover:border-accent/30"
                          )}
                          onClick={() => toggleBlock(block)}>
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-medium text-foreground leading-tight line-clamp-2">{block.title}</span>
                            {inList
                              ? <Check className="h-3 w-3 text-accent shrink-0 mt-0.5" />
                              : <Plus className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                          </div>
                          <p className="text-muted-foreground mt-1 line-clamp-2">{block.snippet}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            {draft.style_note && (
              <Card className="p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">הערת סגנון</div>
                <p className="text-sm text-foreground/80">{draft.style_note}</p>
              </Card>
            )}
          </aside>
        </div>
      )}

      {/* ── SOCIAL POSTS TAB ──────────────────────────────────────────────────── */}
      {mainTab === "social" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-primary">פוסטים לרשתות חברתיות</h2>
              <p className="text-sm text-muted-foreground">AI ממיר את המאמר לפוסט ייעודי לכל פלטפורמה — בעברית</p>
            </div>
            <Button onClick={generateSocialPosts} disabled={socialLoading} className="gap-2">
              {socialLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {socialPosts ? "עדכן פוסטים" : "צור פוסטים"}
            </Button>
          </div>

          {!socialPosts && !socialLoading && (
            <div className="surface-card p-12 text-center text-muted-foreground">
              <Share2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>לחץ על "צור פוסטים" כדי להמיר את המאמר לפוסטים מותאמים לכל רשת</p>
            </div>
          )}

          {socialLoading && (
            <div className="surface-card p-12 text-center text-muted-foreground animate-pulse">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
              <p>AI יוצר פוסטים ל-4 פלטפורמות...</p>
            </div>
          )}

          {socialPosts && !socialLoading && (
            <div className="grid gap-4 md:grid-cols-2">
              {PLATFORMS.map((platform) => {
                const content = editingPlatform === platform.id
                  ? undefined // use textarea value
                  : socialPosts[platform.id] ?? "";
                const charCount = (socialPosts[platform.id] ?? "").length;
                const overLimit = charCount > platform.maxChars;

                return (
                  <Card key={platform.id} className="p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className={cn("flex items-center gap-2 font-semibold text-sm", platform.color)}>
                        {platform.icon} {platform.label}
                      </div>
                      <div className={cn("text-xs", overLimit ? "text-destructive font-medium" : "text-muted-foreground")}>
                        {charCount} / {platform.maxChars}
                      </div>
                    </div>

                    {editingPlatform === platform.id ? (
                      <Textarea
                        autoFocus
                        defaultValue={socialPosts[platform.id]}
                        rows={6}
                        className="text-sm leading-relaxed"
                        onChange={(e) => setSocialPosts((p) => p ? { ...p, [platform.id]: e.target.value } : p)}
                      />
                    ) : (
                      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-6">
                        {socialPosts[platform.id]}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-border mt-auto flex-wrap">
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                        onClick={() => copyPlatform(platform.id)}>
                        {copiedPlatform === platform.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedPlatform === platform.id ? "הועתק" : "העתק"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                        onClick={() => setEditingPlatform(editingPlatform === platform.id ? null : platform.id)}>
                        {editingPlatform === platform.id
                          ? <><Check className="h-3.5 w-3.5" /> סיום עריכה</>
                          : <><Wand2 className="h-3.5 w-3.5" /> ערוך</>}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                        onClick={() => {
                          if (socialAiPlatform === platform.id) { setSocialAiPlatform(null); setSocialAiInstruction(""); }
                          else { setSocialAiPlatform(platform.id); setSocialAiInstruction(""); setEditingPlatform(null); }
                        }}>
                        <Sparkles className="h-3.5 w-3.5" />
                        {socialAiPlatform === platform.id ? "סגור AI" : "AI עריכה"}
                      </Button>
                      {overLimit && (
                        <span className="text-xs text-destructive mr-auto">חורג מהמגבלה</span>
                      )}
                    </div>

                    {socialAiPlatform === platform.id && (
                      <div className="space-y-2 border border-accent/30 rounded-md p-3 bg-accent/5 mt-2">
                        <div className="text-xs text-muted-foreground">מה לשנות בפוסט?</div>
                        <Textarea
                          autoFocus
                          placeholder="לדוגמה: קצר ב-30%, הוסף קריאה לפעולה, שנה טון..."
                          value={socialAiInstruction}
                          onChange={(e) => setSocialAiInstruction(e.target.value)}
                          rows={2}
                          className="text-xs"
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); refineSocialPost(platform.id); } }}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs flex-1" disabled={socialAiLoading || !socialAiInstruction.trim()}
                            onClick={() => refineSocialPost(platform.id)}>
                            {socialAiLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            בצע
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => { setSocialAiPlatform(null); setSocialAiInstruction(""); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
};

export default DraftDetail;
