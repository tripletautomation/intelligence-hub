import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
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
  Globe, Plus, X, Linkedin, Image,
  Share2, ChevronDown, ChevronUp, Lightbulb, ExternalLink, Eye, Pencil, Send,
} from "lucide-react";
import { toast } from "sonner";
import { buildEmailBodyHtml } from "@/lib/articleHtml";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebSourceData { title: string; url: string; snippet?: string; note?: string; }

interface Draft {
  id: string;
  title: string;
  intro: string | null;
  body: string | null;
  closing: string | null;
  instructions: string | null;
  source_notes: Record<string, string> | null;
  web_sources: WebSourceData[] | null;
  source_item_ids: string[];
  style_note: string | null;
  content_type: string | null;
  status: string | null;
  published_at: string | null;
  created_at: string;
}

interface SourceItem { id: string; title_he: string; url: string | null; }

interface ResearchBlock { title: string; snippet: string; url: string; relevance: number; }

type UnifiedSource =
  | { kind: "db"; id: string; title: string; url: string | null; note: string }
  | { kind: "web"; title: string; snippet: string; url: string; relevance: number; note: string };

interface SocialPosts { linkedin_en: string; linkedin_he: string; image_prompt: string; }

type AiAction = "regenerate" | "expand" | "condense" | "rephrase";
type Tone = "formal" | "analytical" | "concise";
type MainTab = "editor" | "social" | "images";
type ImageType = "hero" | "square" | "newsletter" | "infographic";
type Platform = "linkedin_en" | "linkedin_he" | "image_prompt";

// ─── Constants ────────────────────────────────────────────────────────────────

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

const PLATFORMS: { id: Platform; label: string; icon: React.ReactNode; idealMin: number | null; idealMax: number | null; hardMax: number | null; color: string; isPrompt?: boolean }[] = [
  { id: "linkedin_en", label: "LinkedIn — English", icon: <Linkedin className="h-4 w-4" />, idealMin: 1300, idealMax: 1800, hardMax: 3000, color: "text-blue-600" },
  { id: "linkedin_he", label: "LinkedIn — עברית",   icon: <Linkedin className="h-4 w-4" />, idealMin: 1300, idealMax: 1800, hardMax: 3000, color: "text-blue-700" },
  { id: "image_prompt", label: "Image Prompt", icon: <Image className="h-4 w-4" />, idealMin: null, idealMax: null, hardMax: null, color: "text-purple-600", isPrompt: true },
];

function sourceKey(src: UnifiedSource): string {
  return src.kind === "db" ? `db:${src.id}` : `web:${src.url}`;
}

function renderMarkdown(md: string, isLinkedIn = false): string {
  if (isLinkedIn) {
    const escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.split(/\n\n+/).map((p) => `<p style="margin-bottom:0.8em">${p.replace(/\n/g, "<br>")}</p>`).join("");
  }
  const escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const withHeadings = escaped
    .replace(/^## (.+)$/gm, "\x00h2\x01$1\x00/h2\x01")
    .replace(/^# (.+)$/gm, "\x00h1\x01$1\x00/h1\x01");
  const withInline = withHeadings
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
  return withInline
    .split(/\n\n+/)
    .map((block) => {
      if (block.startsWith("\x00h1\x01")) return `<h1 style="font-size:1.4em;font-weight:700;margin:1.2em 0 0.4em">${block.replace(/\x00\/?h1\x01/g, "")}</h1>`;
      if (block.startsWith("\x00h2\x01")) return `<h2 style="font-size:1.15em;font-weight:600;margin:1em 0 0.3em">${block.replace(/\x00\/?h2\x01/g, "")}</h2>`;
      return `<p style="margin-bottom:0.8em;line-height:1.7">${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DraftDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [mainTab, setMainTab] = useState<MainTab>("editor");
  const [editorView, setEditorView] = useState<"edit" | "preview">("edit");
  const [copied, setCopied] = useState(false);
  const [activeTone, setActiveTone] = useState<Tone>("formal");
  const [refineLoading, setRefineLoading] = useState(false);

  // Sources
  const [activeSources, setActiveSources] = useState<UnifiedSource[]>([]);
  const [sourcesInitialized, setSourcesInitialized] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Web research
  const [researchQuery, setResearchQuery] = useState("");
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchBlocks, setResearchBlocks] = useState<ResearchBlock[]>([]);
  const [regenerateLoading, setRegenerateLoading] = useState(false);

  // Rephrase
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

  // Image prompts
  const [imagePrompts, setImagePrompts] = useState<Partial<Record<ImageType, string>>>({});
  const [imageLoading, setImageLoading] = useState(false);
  const [copiedImage, setCopiedImage] = useState<ImageType | null>(null);

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
      savedPosts.forEach((p) => { (posts as any)[p.platform] = p.content; });
      if (posts.linkedin_en && posts.linkedin_he && posts.image_prompt) {
        setSocialPosts(posts as SocialPosts);
      }
    }
  }, [savedPosts]);

  const { data: savedImages } = useQuery({
    enabled: !!user && !!id,
    queryKey: ["content_images", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("content_images").select("image_type,prompt").eq("draft_id", id);
      if (error) throw error;
      return data as { image_type: ImageType; prompt: string }[];
    },
  });

  useEffect(() => {
    if (savedImages?.length) {
      const imgs: Partial<Record<ImageType, string>> = {};
      savedImages.forEach((img) => { imgs[img.image_type] = img.prompt; });
      setImagePrompts(imgs);
    }
  }, [savedImages]);

  // ── Form state ───────────────────────────────────────────────────────────────

  const [form, setForm] = useState<{ title: string; body: string; instructions: string }>({
    title: "", body: "", instructions: "",
  });

  useEffect(() => {
    if (draft) {
      const merged = [draft.intro, draft.body, draft.closing]
        .filter((s) => s?.trim())
        .join("\n\n");
      setForm({
        title: draft.title ?? "",
        body: merged,
        instructions: draft.instructions ?? "",
      });
    }
  }, [draft]);

  // Initialize activeSources with DB items + web_sources from draft.
  // Runs once when both draft and (if needed) sourceItems are ready.
  useEffect(() => {
    if (sourcesInitialized || !draft) return;
    const hasDbItems = (draft.source_item_ids?.length ?? 0) > 0;
    if (hasDbItems && sourceItems.length === 0) return; // wait for DB items

    const savedNotes: Record<string, string> = (draft.source_notes as Record<string, string>) ?? {};
    const webSourcesData: WebSourceData[] = Array.isArray(draft.web_sources) ? (draft.web_sources as WebSourceData[]) : [];

    const dbSources = sourceItems.map((s) => ({
      kind: "db" as const,
      id: s.id,
      title: s.title_he,
      url: s.url,
      note: savedNotes[`db:${s.id}`] ?? "",
    }));

    const webSources = webSourcesData.map((s) => ({
      kind: "web" as const,
      title: s.title,
      snippet: s.snippet ?? "",
      url: s.url,
      relevance: 0,
      note: s.note ?? savedNotes[`web:${s.url}`] ?? "",
    }));

    setActiveSources([...dbSources, ...webSources]);
    setSourcesInitialized(true);
  }, [draft, sourceItems, sourcesInitialized]);

  // If draft refetches and now has web_sources (e.g. just created), merge them in
  useEffect(() => {
    if (!sourcesInitialized || !draft) return;
    const webSourcesData: WebSourceData[] = Array.isArray(draft.web_sources) ? (draft.web_sources as WebSourceData[]) : [];
    if (webSourcesData.length === 0) return;

    setActiveSources((prev) => {
      const existingWebUrls = new Set(prev.filter((s) => s.kind === "web").map((s) => s.url));
      const newOnes = webSourcesData
        .filter((s) => !existingWebUrls.has(s.url))
        .map((s) => ({
          kind: "web" as const,
          title: s.title,
          snippet: s.snippet ?? "",
          url: s.url,
          relevance: 0,
          note: s.note ?? "",
        }));
      return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
    });
  }, [draft?.web_sources, sourcesInitialized]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const buildSourceNotes = () => {
    const notes: Record<string, string> = {};
    activeSources.forEach((src) => {
      if (src.note.trim()) notes[sourceKey(src)] = src.note.trim();
    });
    return notes;
  };

  const buildWebSources = (): WebSourceData[] =>
    activeSources
      .filter((s) => s.kind === "web")
      .map((s) => {
        const ws = s as Extract<UnifiedSource, { kind: "web" }>;
        return { title: ws.title, url: ws.url, snippet: ws.snippet, note: ws.note };
      });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("article_drafts")
        .update({
          title: form.title,
          intro: "",
          body: form.body,
          closing: "",
          instructions: form.instructions || null,
          source_notes: buildSourceNotes(),
          web_sources: buildWebSources(),
        })
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

  const [markingPublished, setMarkingPublished] = useState(false);

  const markPublished = async () => {
    setMarkingPublished(true);
    try {
      const { error } = await (supabase as any)
        .from("article_drafts")
        .update({ published_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("המאמר סומן כפורסם");
      qc.invalidateQueries({ queryKey: ["article_drafts", id] });
      qc.invalidateQueries({ queryKey: ["article_drafts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בסימון פרסום");
    } finally {
      setMarkingPublished(false);
    }
  };

  // ── AI Actions ───────────────────────────────────────────────────────────────

  const runRefine = async (action: AiAction, customInstruction?: string) => {
    setRefineLoading(true);
    setShowRephraseInput(false);
    try {
      const { data, error } = await supabase.functions.invoke("refine-section", {
        body: {
          draft_id: id,
          section: "body",
          action,
          tone: activeTone,
          custom_instruction: customInstruction || undefined,
          article_instructions: form.instructions || undefined,
          article_context: { title: form.title, intro: "", body: form.body, closing: "" },
        },
      });
      if (error) throw new Error(error.message);
      const refined: string = (data as any)?.refined;
      if (!refined) throw new Error("AI לא החזיר תוצאה");
      setForm((f) => ({ ...f, body: refined }));
      toast.success("המאמר עודכן");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ב-AI");
    } finally { setRefineLoading(false); }
  };

  const runRegenerateWithContext = async () => {
    if (activeSources.length === 0) return;
    setRegenerateLoading(true);
    try {
      const dbIds = activeSources
        .filter((s) => s.kind === "db")
        .map((s) => (s as Extract<UnifiedSource, { kind: "db" }>).id);
      const webSources = activeSources.filter((s) => s.kind === "web") as Extract<UnifiedSource, { kind: "web" }>[];
      const webContext = webSources
        .map((b) => `${b.title}\n${b.snippet}\nמקור: ${b.url}${b.note ? `\nהערה: ${b.note}` : ""}`)
        .join("\n\n---\n\n");
      const sourceNotes = buildSourceNotes();

      const { data, error } = await supabase.functions.invoke("generate-article", {
        body: {
          item_ids: dbIds.length ? dbIds : draft?.source_item_ids,
          web_context: webContext || undefined,
          instructions: form.instructions || undefined,
          source_notes: Object.keys(sourceNotes).length ? sourceNotes : undefined,
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
      return [...prev, { kind: "web" as const, ...block, note: "" }];
    });
  };

  const removeSource = (src: UnifiedSource) => {
    setActiveSources((prev) =>
      src.kind === "db"
        ? prev.filter((s) => !(s.kind === "db" && s.id === src.id))
        : prev.filter((s) => !(s.kind === "web" && s.url === src.url))
    );
  };

  const updateSourceNote = (src: UnifiedSource, note: string) => {
    setActiveSources((prev) =>
      prev.map((s) =>
        sourceKey(s) === sourceKey(src) ? { ...s, note } : s
      )
    );
  };

  const toggleNoteExpanded = (key: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const generateSocialPosts = async () => {
    setSocialLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-posts", {
        body: {
          draft_id: id,
          instructions: form.instructions || undefined,
        },
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

  const generateImagePromptsAll = async () => {
    setImageLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-image-prompts", {
        body: { draft_id: id, types: ["hero", "square", "newsletter", "infographic"] },
      });
      if (error) throw new Error(error.message);
      const prompts = (data as any)?.prompts as Partial<Record<ImageType, string>>;
      if (!prompts) throw new Error("AI לא החזיר הנחיות");
      setImagePrompts(prompts);
      qc.invalidateQueries({ queryKey: ["content_images", id] });
      toast.success("הנחיות תמונות נוצרו");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ביצירת הנחיות");
    } finally { setImageLoading(false); }
  };

  const copyImagePrompt = async (type: ImageType) => {
    await navigator.clipboard.writeText(imagePrompts[type] ?? "").catch(() => toast.error("לא ניתן להעתיק"));
    setCopiedImage(type);
    setTimeout(() => setCopiedImage(null), 1500);
  };

  const updateImagePrompt = async (type: ImageType, value: string) => {
    setImagePrompts((p) => ({ ...p, [type]: value }));
    await (supabase as any).from("content_images").upsert(
      { draft_id: id, user_id: user?.id, image_type: type, prompt: value, updated_at: new Date().toISOString() },
      { onConflict: "draft_id,image_type" }
    );
  };

  const copyPlatform = async (platform: Platform) => {
    await navigator.clipboard.writeText(socialPosts?.[platform] ?? "").catch(() => toast.error("לא ניתן להעתיק"));
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
      toast.success(`פוסט עודכן`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ב-AI");
    } finally { setSocialAiLoading(false); }
  };

  const copyHtmlToClipboard = async () => {
    const opts = {
      title: form.title,
      intro: "",
      body: form.body ?? "",
      closing: "",
      contentType: draft?.content_type ?? undefined,
    };
    const html = buildEmailBodyHtml(opts);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) }),
      ]);
    } catch {
      await navigator.clipboard.writeText(`${form.title}\n\n${form.body}`).catch(() => {});
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

  const onCopy = async () => {
    await navigator.clipboard.writeText(`${form.title}\n\n${form.body}`).catch(() => toast.error("לא ניתן להעתיק"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Loading / not found ──────────────────────────────────────────────────────

  if (isLoading) return <AppLayout><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppLayout>;
  if (!draft) return <AppLayout><div className="surface-card p-12 text-center text-muted-foreground">הטיוטה לא נמצאה. <Link to="/drafts" className="text-accent hover:underline">חזור לטיוטות</Link></div></AppLayout>;

  const isEn = draft?.content_type === "blog_en";
  const textDir = isEn ? "ltr" : "rtl";
  const textAlign = isEn ? "text-left" : "text-right";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav("/drafts")} className="gap-1.5">
          <ArrowRight className="h-4 w-4" /> כל הטיוטות
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          {draft?.content_type === "linkedin" && (
            <Button
              size="sm"
              className="gap-1.5 bg-[#0077b5] hover:bg-[#005885] text-white"
              onClick={() => {
                navigator.clipboard.writeText(form.body?.trim() ?? "").catch(() => {});
                window.open("https://www.linkedin.com/feed/", "_blank");
                toast.success("הטקסט הועתק — הדבק בפוסט החדש ב-LinkedIn");
              }}
            >
              <Linkedin className="h-4 w-4" />
              פרסם ב-LinkedIn
            </Button>
          )}
          {draft?.status === "approved" && !draft?.published_at && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-green-500/40 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
              onClick={markPublished}
              disabled={markingPublished}
            >
              {markingPublished ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              סמן כפורסם
            </Button>
          )}
          {draft?.published_at && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-600/10 text-green-700 border border-green-600/20 dark:text-green-400">
              פורסם {new Date(draft.published_at).toLocaleDateString("he-IL", { day: "numeric", month: "long" })}
            </span>
          )}
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
        {([
          { id: "editor", label: "עריכה", icon: null },
          { id: "social", label: "פוסטים לרשתות", icon: <Share2 className="h-3.5 w-3.5" /> },
          { id: "images", label: "תמונות", icon: <Image className="h-3.5 w-3.5" /> },
        ] as const).map((t) => (
          <button key={t.id} type="button" onClick={() => setMainTab(t.id)}
            className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5",
              mainTab === t.id ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            )}>
            {t.icon}
            {t.label}
            {t.id === "social" && socialPosts && <span className="text-[10px] bg-accent/20 text-accent rounded-full px-1.5">✓</span>}
            {t.id === "images" && Object.keys(imagePrompts).length > 0 && <span className="text-[10px] bg-accent/20 text-accent rounded-full px-1.5">{Object.keys(imagePrompts).length}</span>}
          </button>
        ))}
      </div>

      {/* ── EDITOR TAB ─────────────────────────────────────────────────────────── */}
      {mainTab === "editor" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main editor area */}
          <div className="space-y-4">
            {/* Instructions card */}
            <Card className="p-4 border-accent/30 bg-accent/5 space-y-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-accent" />
                <div className="text-sm font-semibold text-primary">הנחיות ל-AI</div>
                <span className="text-xs text-muted-foreground">— מה לכתוב, זווית, נקודות שחשוב לכלול</span>
              </div>
              <Textarea
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="לדוגמה: תתמקד בהשפעה על Data Centers בישראל, הוסף נתוני שוק, הזווית צריכה להיות מעשית ולא אקדמית. הדגש שלוש נקודות: עלות, זמן, אבטחה."
                rows={3}
                className="text-sm resize-none bg-background"
                dir="rtl"
              />
            </Card>

            {/* Article editor */}
            <Card className="p-6 space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-xs uppercase tracking-wider text-muted-foreground">כותרת</Label>
                <Input
                  id="title"
                  value={form.title}
                  dir={textDir}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className={cn("text-xl font-bold", textAlign)}
                />
              </div>

              {/* AI action bar */}
              <div className="flex items-center gap-2 flex-wrap border-b border-border pb-3">
                <span className="text-xs text-muted-foreground ml-1">AI:</span>
                {refineLoading
                  ? <Loader2 className="h-4 w-4 animate-spin text-accent mx-1" />
                  : AI_ACTIONS.map((action) => (
                      <Button
                        key={action.id}
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-xs gap-1.5"
                        disabled={refineLoading}
                        onClick={() => {
                          if (action.id === "rephrase") {
                            setShowRephraseInput((v) => !v);
                          } else {
                            runRefine(action.id);
                          }
                        }}
                      >
                        {action.icon} {action.label}
                      </Button>
                    ))
                }
                <div className="flex items-center gap-1.5 mr-auto">
                  <span className="text-xs text-muted-foreground">טון:</span>
                  <Select value={activeTone} onValueChange={(v) => setActiveTone(v as Tone)}>
                    <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{TONES.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {/* Rephrase input */}
              {showRephraseInput && (
                <div className="space-y-2 border border-accent/30 rounded-md p-3 bg-accent/5">
                  <div className="text-xs text-muted-foreground">הנחייה לניסוח מחדש</div>
                  <Textarea
                    autoFocus
                    placeholder="לדוגמה: תהפוך את זה לפחות טכני, הוסף נתוני שוק..."
                    value={rephraseInstruction}
                    onChange={(e) => setRephraseInstruction(e.target.value)}
                    rows={2}
                    className="text-xs"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runRefine("rephrase", rephraseInstruction); } }}
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

              {/* Unified content editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">תוכן המאמר</Label>
                  <div className="flex rounded-md border border-border overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setEditorView("edit")}
                      className={cn("flex items-center gap-1 px-2.5 py-1 transition-colors", editorView === "edit" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      <Pencil className="h-3 w-3" /> עריכה
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorView("preview")}
                      className={cn("flex items-center gap-1 px-2.5 py-1 transition-colors border-r border-border", editorView === "preview" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      <Eye className="h-3 w-3" /> תצוגה מקדימה
                    </button>
                  </div>
                </div>
                {editorView === "edit" ? (
                  <AutoResizeTextarea
                    id="body"
                    value={form.body ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    minRows={20}
                    dir={textDir}
                    className={cn("text-sm leading-relaxed", textAlign)}
                  />
                ) : (
                  <div
                    className={cn("min-h-[420px] p-5 rounded-md border border-border bg-muted/20 text-sm overflow-auto", textAlign)}
                    dir={textDir}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body ?? "", draft?.content_type === "linkedin") }}
                  />
                )}
              </div>

              {/* Source links */}
              {activeSources.some((s) => s.url) && (
                <div className="border-t border-border pt-4 space-y-1.5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">מקורות</div>
                  <div className="space-y-1">
                    {activeSources.filter((s) => s.url).map((src) => (
                      <div key={sourceKey(src)} className="flex items-start gap-1.5 text-xs">
                        <span className={cn(
                          "shrink-0 mt-0.5 rounded px-1 py-0.5 text-[10px] font-medium",
                          src.kind === "db" ? "bg-muted text-muted-foreground" : "bg-accent/15 text-accent"
                        )}>
                          {src.kind === "db" ? "DB" : "WEB"}
                        </span>
                        <a
                          href={src.url!}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-accent hover:underline leading-relaxed line-clamp-1 flex-1"
                        >
                          {src.title} — <span className="font-mono text-[10px]">{src.url}</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            {/* Sources */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-accent" />
                  <div className="text-sm font-semibold text-primary">מקורות המאמר</div>
                </div>
                <span className="text-xs text-muted-foreground">{activeSources.length} מקורות</span>
              </div>

              {activeSources.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {activeSources.map((src) => {
                    const key = sourceKey(src);
                    const isExpanded = expandedNotes.has(key);
                    return (
                      <div key={key} className="border border-border rounded-md p-2 space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <span className={cn(
                            "shrink-0 mt-0.5 rounded px-1 py-0.5 text-[10px] font-medium",
                            src.kind === "db" ? "bg-muted text-muted-foreground" : "bg-accent/15 text-accent"
                          )}>
                            {src.kind === "db" ? "DB" : "WEB"}
                          </span>
                          <span className="flex-1 text-xs leading-tight line-clamp-2 text-foreground/80 pt-0.5">
                            {src.url
                              ? <a href={src.url} target="_blank" rel="noreferrer" className="hover:text-accent">{src.title}</a>
                              : src.title}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              title={isExpanded ? "סגור הערה" : "הוסף הערה"}
                              onClick={() => toggleNoteExpanded(key)}
                              className="p-1 rounded text-muted-foreground hover:text-accent transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSource(src)}
                              className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <Textarea
                            autoFocus
                            placeholder="מה לקחת מהמקור הזה? (לדוגמה: השתמש בנתון X, הזכר את הגישה Y)"
                            value={src.note}
                            onChange={(e) => updateSourceNote(src, e.target.value)}
                            rows={2}
                            className="text-xs resize-none"
                            dir="rtl"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                size="sm"
                className="w-full h-8 text-xs gap-1.5"
                disabled={regenerateLoading || activeSources.length === 0}
                onClick={runRegenerateWithContext}
              >
                {regenerateLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {regenerateLoading ? "יוצר מאמר..." : "צור מאמר עם מקורות אלה"}
              </Button>

              {/* Search to add more sources */}
              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-xs text-muted-foreground font-medium">הוסף מקורות מהאינטרנט</div>
                <div className="flex gap-2">
                  <Input
                    placeholder="נושא לחיפוש..."
                    value={researchQuery}
                    onChange={(e) => setResearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runResearch()}
                    className="h-8 text-xs flex-1"
                  />
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
          </aside>
        </div>
      )}

      {/* ── SOCIAL POSTS TAB ──────────────────────────────────────────────────── */}
      {mainTab === "social" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-primary">פוסטים לרשתות חברתיות</h2>
              <p className="text-sm text-muted-foreground">AI ממיר את המאמר לפוסט ייעודי לכל פלטפורמה</p>
            </div>
            <Button onClick={generateSocialPosts} disabled={socialLoading} className="gap-2">
              {socialLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {socialPosts ? "עדכן פוסטים" : "צור פוסטים"}
            </Button>
          </div>

          {form.instructions && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-accent/30 bg-accent/5 text-xs text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
              <span>ההנחיות ל-AI מהעורך ישמשו גם ביצירת הפוסטים</span>
            </div>
          )}

          {!socialPosts && !socialLoading && (
            <div className="surface-card p-12 text-center text-muted-foreground">
              <Share2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>לחץ על "צור פוסטים" כדי להמיר את המאמר לפוסטים מותאמים לכל רשת</p>
            </div>
          )}

          {socialLoading && (
            <div className="surface-card p-12 text-center text-muted-foreground animate-pulse">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
              <p>AI יוצר פוסטים ל-3 פלטפורמות...</p>
            </div>
          )}

          {socialPosts && !socialLoading && (
            <div className="grid gap-4 lg:grid-cols-2">
              {PLATFORMS.map((platform) => {
                const content = socialPosts[platform.id] ?? "";
                const charCount = content.length;
                const charColorClass = platform.idealMin === null ? "text-muted-foreground"
                  : charCount < platform.idealMin! ? "text-yellow-500"
                  : charCount <= platform.idealMax! ? "text-green-500 font-medium"
                  : charCount <= platform.hardMax! ? "text-orange-500 font-medium"
                  : "text-destructive font-medium";

                return (
                  <Card key={platform.id} className={cn("p-5 flex flex-col gap-3", platform.isPrompt && "lg:col-span-2")}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className={cn("flex items-center gap-2 font-semibold text-sm", platform.color)}>
                        {platform.icon} {platform.label}
                      </div>
                      {platform.idealMin !== null ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">אידאלי: {platform.idealMin}-{platform.idealMax}</span>
                          <span className={cn("text-xs tabular-nums", charColorClass)}>{charCount}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">העתק והכנס למחולל תמונות</span>
                      )}
                    </div>

                    <AutoResizeTextarea
                      value={content}
                      minRows={platform.isPrompt ? 5 : 8}
                      className={cn("text-sm", platform.isPrompt && "font-mono text-xs")}
                      dir={platform.id === "linkedin_he" ? "rtl" : "ltr"}
                      readOnly={platform.isPrompt}
                      onChange={(e) => setSocialPosts((p) => p ? { ...p, [platform.id]: e.target.value } : p)}
                    />

                    <div className="flex items-center gap-2 pt-1 border-t border-border flex-wrap">
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                        onClick={() => copyPlatform(platform.id)}>
                        {copiedPlatform === platform.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedPlatform === platform.id ? "הועתק" : "העתק"}
                      </Button>
                      {!platform.isPrompt && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                          onClick={() => {
                            if (socialAiPlatform === platform.id) { setSocialAiPlatform(null); setSocialAiInstruction(""); }
                            else { setSocialAiPlatform(platform.id); setSocialAiInstruction(""); }
                          }}>
                          <Sparkles className="h-3.5 w-3.5" />
                          {socialAiPlatform === platform.id ? "סגור AI" : "שפר עם AI"}
                        </Button>
                      )}
                    </div>

                    {socialAiPlatform === platform.id && (
                      <div className="space-y-2 border border-accent/30 rounded-md p-3 bg-accent/5">
                        <div className="text-xs text-muted-foreground">מה לשנות בפוסט?</div>
                        <Textarea
                          autoFocus
                          placeholder="לדוגמה: קצר ב-30%, שפר את ה-hook, הוסף קריאה לפעולה..."
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

      {/* ── IMAGES TAB ────────────────────────────────────────────────────────── */}
      {mainTab === "images" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-primary">הנחיות תמונות</h2>
              <p className="text-sm text-muted-foreground">
                העתק הנחיה לאחד ממחוללי התמונות (DALL-E 3, Gemini Imagen, Midjourney).
              </p>
            </div>
            <Button onClick={generateImagePromptsAll} disabled={imageLoading} className="gap-1.5">
              {imageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {imageLoading ? "מייצר..." : Object.keys(imagePrompts).length > 0 ? "עדכן הכל" : "צור הכל"}
            </Button>
          </div>

          {([
            { type: "hero" as ImageType, label: "Hero — כותרת בלוג/מאמר", ratio: "16:9", hint: "לתמונת כותרת רחבה של מאמר" },
            { type: "square" as ImageType, label: "סקוור — LinkedIn / פוסטים", ratio: "1:1", hint: "לפוסטים ברשתות חברתיות" },
            { type: "newsletter" as ImageType, label: "ניוזלטר — כותרת", ratio: "3:1", hint: "לבאנר כותרת ניוזלטר" },
            { type: "infographic" as ImageType, label: "אינפוגרפיקה — נתונים", ratio: "4:5", hint: "לתמונה ויזואלית עם נתונים" },
          ]).map(({ type, label, ratio, hint }) => {
            const prompt = imagePrompts[type] ?? "";
            const isCopied = copiedImage === type;
            return (
              <Card key={type} className="p-5 space-y-3 border-border">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Image className="h-4 w-4 text-accent" />
                      <span className="text-sm font-semibold text-primary">{label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{ratio}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
                  </div>
                  {prompt && (
                    <Button size="sm" variant="outline" onClick={() => copyImagePrompt(type)} className="gap-1.5 shrink-0 h-8">
                      {isCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {isCopied ? "הועתק!" : "העתק"}
                    </Button>
                  )}
                </div>
                <AutoResizeTextarea
                  value={prompt}
                  onChange={(e) => updateImagePrompt(type, e.target.value)}
                  placeholder={imageLoading ? "מייצר הנחיה..." : "לחץ 'צור הכל' לייצור הנחיות, או הזן ידנית."}
                  className="text-sm font-mono leading-relaxed min-h-[80px] resize-y"
                  dir="ltr"
                />
                {prompt && (
                  <p className="text-[10px] text-muted-foreground">
                    {prompt.split(" ").length} מילים · הכנס ל-DALL-E 3: 1792×1024 ({ratio})
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
};

export default DraftDetail;
