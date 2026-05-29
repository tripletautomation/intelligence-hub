import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSources, useItems } from "@/hooks/useIntelligence";
import { toast } from "sonner";
import { formatHeRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SourceManager, type SourceManagerHandle } from "@/components/SourceManager";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Globe2, Loader2, Rss, FileText, CalendarDays, Key, PenLine, CheckCircle2, Circle, Layers, Plus, Trash2, GripVertical, Sparkles, PlayCircle } from "lucide-react";
import { UserAccessManager } from "@/components/UserAccessManager";
import { ChevronDown, AlertTriangle, Activity, BrainCircuit, Save } from "lucide-react";
import type { TopicCategory } from "@/lib/types";

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
      { id: "o3", label: "o3 — חשיבה מתקדמת" },
      { id: "o3-mini", label: "o3 mini — חשיבה מהירה" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini — מהיר וזול" },
      { id: "gpt-4o-mini", label: "GPT-4o mini — מהיר וזול" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 nano — הכי זול" },
    ],
  },
  {
    id: "google",
    label: "Google (Gemini)",
    envKey: "GOOGLE_API_KEY",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro — הכי חזק" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash — מהיר" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite — מהיר וזול" },
    ],
  },
  {
    id: "lovable",
    label: "Lovable AI Gateway",
    envKey: "LOVABLE_API_KEY",
    models: [
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro via Gateway" },
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

// ─── API Keys Section ─────────────────────────────────────────────────────────
const API_KEY_DEFS = [
  { name: "OPENAI_API_KEY", label: "OpenAI API Key" },
  { name: "ANTHROPIC_API_KEY", label: "Anthropic API Key" },
  { name: "GOOGLE_API_KEY", label: "Google (Gemini) API Key" },
];

const ApiKeysSection = () => {
  const qc = useQueryClient();
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const { data: existingKeys = [] } = useQuery<{ key_name: string }[]>({
    queryKey: ["admin_api_keys"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_api_keys").select("key_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const existingSet = new Set(existingKeys.map((k) => k.key_name));

  const saveKey = useMutation({
    mutationFn: async (keyName: string) => {
      const val = inputs[keyName]?.trim();
      if (!val) throw new Error("הזן ערך למפתח");
      const { error } = await (supabase as any)
        .from("admin_api_keys")
        .upsert({ key_name: keyName, key_value: val, updated_at: new Date().toISOString() });
      if (error) throw error;
      return keyName;
    },
    onSuccess: (keyName) => {
      toast.success("מפתח נשמר");
      setInputs((prev) => ({ ...prev, [keyName]: "" }));
      qc.invalidateQueries({ queryKey: ["admin_api_keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Key className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-bold text-primary">מפתחות API</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        שמור מפתחות API כאן — הם נשמרים מוצפנים ב-DB ומשמשים את כל פונקציות ה-AI.
      </p>
      <div className="space-y-3">
        {API_KEY_DEFS.map((def) => (
          <div key={def.name} className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary">{def.label}</p>
                <p className="text-[10px] font-mono text-muted-foreground/70">{def.name}</p>
              </div>
              {existingSet.has(def.name) ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> מוגדר
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Circle className="h-3.5 w-3.5" /> לא מוגדר
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={existingSet.has(def.name) ? "הזן ערך חדש להחלפה" : "הזן מפתח..."}
                value={inputs[def.name] ?? ""}
                onChange={(e) => setInputs((prev) => ({ ...prev, [def.name]: e.target.value }))}
                className="flex-1 font-mono text-sm"
                dir="ltr"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!inputs[def.name]?.trim() || saveKey.isPending}
                onClick={() => saveKey.mutate(def.name)}
                className="gap-1.5 shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                שמור
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Writing Style Section ────────────────────────────────────────────────────
const WritingStyleSection = () => {
  const qc = useQueryClient();
  const [text, setText] = useState<string | null>(null);

  const { data: saved, isLoading } = useQuery<{ prompt_text: string | null }>({
    queryKey: ["ai_config", "writing_style"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_config").select("prompt_text").eq("id", "writing_style").maybeSingle();
      if (error) throw error;
      return data ?? { prompt_text: "" };
    },
  });

  const activeText = text ?? saved?.prompt_text ?? "";

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("ai_config")
        .upsert({ id: "writing_style", provider: "none", model_id: "none", prompt_text: activeText, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הנחיות הכתיבה נשמרו");
      setText(null);
      qc.invalidateQueries({ queryKey: ["ai_config", "writing_style"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isDirty = text !== null && text !== (saved?.prompt_text ?? "");

  if (isLoading) return null;

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <PenLine className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-bold text-primary">הנחיות כתיבת מאמרים</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        הנחיות אלו יוזרקו לכל יצירת מאמר וסיכום — פורמט, סגנון, דגשים, מבנה. ישמרו בכל הפקות.
      </p>
      <Textarea
        value={activeText}
        onChange={(e) => setText(e.target.value)}
        placeholder={`לדוגמה:\n- כתוב בעברית פורמלית, גוף שלישי\n- מבנה: כותרת → הקדמה (2 משפטים) → 3 נקודות עיקריות → סיכום\n- הדגש השפעה על שוק הנדל"ן הישראלי\n- אל תשתמש בז'רגון טכני מורכב`}
        className="min-h-[160px] text-sm font-mono leading-relaxed mb-3"
        dir="rtl"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={!isDirty || save.isPending}
          onClick={() => save.mutate()}
          className="gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          {save.isPending ? "שומר..." : "שמור הנחיות"}
        </Button>
      </div>
    </div>
  );
};

// ─── Topic Categories Section ─────────────────────────────────────────────────
const TopicCategoriesSection = () => {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editKeywords, setEditKeywords] = useState("");

  const { data: categories = [], isLoading } = useQuery<TopicCategory[]>({
    queryKey: ["topic_categories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("topic_categories").select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addCategory = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error("הזן שם קטגוריה");
      const keywords = newKeywords.split(",").map((k) => k.trim()).filter(Boolean);
      const maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) : 0;
      const { error } = await (supabase as any)
        .from("topic_categories")
        .insert({ name, keywords, sort_order: maxOrder + 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("קטגוריה נוספה");
      setNewName("");
      setNewKeywords("");
      qc.invalidateQueries({ queryKey: ["topic_categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCategory = useMutation({
    mutationFn: async (id: string) => {
      const name = editName.trim();
      if (!name) throw new Error("הזן שם קטגוריה");
      const keywords = editKeywords.split(",").map((k) => k.trim()).filter(Boolean);
      const { error } = await (supabase as any)
        .from("topic_categories")
        .update({ name, keywords, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("קטגוריה עודכנה");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["topic_categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("topic_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("קטגוריה נמחקה");
      qc.invalidateQueries({ queryKey: ["topic_categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (cat: TopicCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditKeywords(cat.keywords.join(", "));
  };

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-bold text-primary">קטגוריות נושא לדשבורד</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        הגדר נושאים ומילות מפתח — הדשבורד יקבץ ידיעות לפיהם. פריטים שלא מתאימים → "כללי".
      </p>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">טוען...</div>
      ) : (
        <div className="space-y-2 mb-4">
          {categories.map((cat) => (
            <div key={cat.id} className="rounded-lg border border-border p-3">
              {editingId === cat.id ? (
                <div className="space-y-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="שם קטגוריה"
                    className="text-sm"
                    dir="rtl"
                  />
                  <Input
                    value={editKeywords}
                    onChange={(e) => setEditKeywords(e.target.value)}
                    placeholder="מילות מפתח מופרדות בפסיק: data center, מרכז נתונים, cloud"
                    className="text-sm font-mono"
                    dir="ltr"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 text-xs">ביטול</Button>
                    <Button size="sm" onClick={() => updateCategory.mutate(cat.id)} disabled={updateCategory.isPending} className="h-7 text-xs gap-1">
                      <Save className="h-3 w-3" /> שמור
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-primary">{cat.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cat.keywords.map((kw) => (
                        <span key={kw} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(cat)} className="h-7 w-7 p-0">
                      <PenLine className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteCategory.mutate(cat.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new category */}
      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <p className="text-xs text-muted-foreground font-medium">הוסף קטגוריה חדשה</p>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={'שם הקטגוריה (למשל: נדל"ן)'}
          className="text-sm"
          dir="rtl"
        />
        <Input
          value={newKeywords}
          onChange={(e) => setNewKeywords(e.target.value)}
          placeholder={'מילות מפתח מופרדות בפסיק: real estate, נדל"ן, property'}
          className="text-sm font-mono"
          dir="ltr"
          onKeyDown={(e) => e.key === "Enter" && addCategory.mutate()}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => addCategory.mutate()} disabled={!newName.trim() || addCategory.isPending} className="gap-1.5 h-7 text-xs">
            <Plus className="h-3 w-3" /> הוסף קטגוריה
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Prompt Templates Section ────────────────────────────────────────────────
const PROMPT_TEMPLATE_IDS = [
  { id: "article_linkedin", label: 'מאמר LinkedIn — סגנון מנכ"ל', description: "מאמר 1000-1400 מילים לפרסום ב-LinkedIn ובבלוג, גוף שלישי, ללא סימני AI." },
  { id: "article_blog_he", label: "מאמר בלוג — עברית", description: "מאמר ארוך 1500-2500 מילים לבלוג החברה, עברית, עם תת-כותרות H2." },
  { id: "article_blog_en", label: "מאמר בלוג — אנגלית", description: "Long-form blog article 1500-2500 words, English, with H2 subheadings." },
  { id: "social_linkedin_en", label: "פוסט LinkedIn — אנגלית", description: "פוסט 1300-1800 תווים, אנגלית, hook חזק → תובנה → נקודות → CTA." },
  { id: "social_linkedin_he", label: "פוסט LinkedIn — עברית", description: "פוסט 1300-1800 תווים, עברית, מבנה זהה לאנגלית." },
  { id: "image_hero", label: "תמונת Hero (16:9) — בלוג", description: "הנחיה לתמונת כותרת מאמר, יחס 16:9, brand Triple T." },
  { id: "image_square", label: "תמונת סקוור (1:1) — פוסטים", description: "הנחיה לתמונה ריבועית לפוסטים ברשתות חברתיות." },
  { id: "image_newsletter", label: "תמונת ניוזלטר (3:1)", description: "הנחיה לתמונת כותרת ניוזלטר, יחס 3:1." },
  { id: "image_infographic", label: "אינפוגרפיקה (4:5)", description: "הנחיה לתמונה ויזואלית עם נתונים, יחס 4:5." },
];

const SinglePromptTemplate = ({ id, label, description }: { id: string; label: string; description: string }) => {
  const qc = useQueryClient();
  const [text, setText] = useState<string | null>(null);

  const { data: saved, isLoading } = useQuery<{ system_prompt: string }>({
    queryKey: ["prompt_templates", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("prompt_templates").select("system_prompt").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ?? { system_prompt: "" };
    },
  });

  const activeText = text ?? saved?.system_prompt ?? "";

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("prompt_templates")
        .upsert({ id, label, system_prompt: activeText, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("פרומפט נשמר");
      setText(null);
      qc.invalidateQueries({ queryKey: ["prompt_templates", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isDirty = text !== null && text !== (saved?.system_prompt ?? "");

  if (isLoading) return <div className="text-xs text-muted-foreground">טוען...</div>;

  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <div>
        <p className="text-sm font-medium text-primary">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Textarea
        value={activeText}
        onChange={(e) => setText(e.target.value)}
        placeholder="השאר ריק לשימוש בפרומפט ברירת המחדל המובנה. הזן הנחיות ספציפיות להוסיף או לדרוס."
        className="min-h-[100px] text-sm font-mono leading-relaxed resize-y"
        dir="rtl"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/60">
          {activeText.length === 0 ? "ריק — ישתמש בברירת המחדל המובנה" : `${activeText.length} תווים`}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!isDirty || save.isPending}
          onClick={() => save.mutate()}
          className="gap-1.5 h-7 text-xs"
        >
          <Save className="h-3 w-3" />
          {save.isPending ? "שומר..." : "שמור"}
        </Button>
      </div>
    </div>
  );
};

const PromptTemplatesSection = () => {
  const [openGroup, setOpenGroup] = useState<string>("articles");

  const groups = [
    { id: "articles", label: "מאמרים", templates: PROMPT_TEMPLATE_IDS.filter((t) => t.id.startsWith("article")) },
    { id: "social", label: "פוסטים לרשתות", templates: PROMPT_TEMPLATE_IDS.filter((t) => t.id.startsWith("social")) },
    { id: "images", label: "תמונות", templates: PROMPT_TEMPLATE_IDS.filter((t) => t.id.startsWith("image")) },
  ];

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-bold text-primary">פרומפטים לסוגי תוכן</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        כתוב הנחיות ייחודיות לכל סוג תוכן. השאר ריק לשימוש בפרומפט הברירת מחדל המובנה.
      </p>
      <div className="flex gap-2 mb-4">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setOpenGroup(g.id)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors",
              openGroup === g.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      {groups.filter((g) => g.id === openGroup).map((g) => (
        <div key={g.id} className="space-y-3">
          {g.templates.map((t) => (
            <SinglePromptTemplate key={t.id} {...t} />
          ))}
        </div>
      ))}
    </div>
  );
};

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
  const [weeklyRunning, setWeeklyRunning] = useState(false);
  const [weeklyResult, setWeeklyResult] = useState<{ drafts: number; errors?: string[] } | null>(null);

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
        <ApiKeysSection />
        <WritingStyleSection />
        <PromptTemplatesSection />
        <TopicCategoriesSection />

        {/* ── Auto-generate weekly ───────────────────────────────────────────── */}
        <div className="surface-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <div>
              <h2 className="text-lg font-bold text-primary">יצירה שבועית אוטומטית</h2>
              <p className="text-sm text-muted-foreground">
                מייצר טיוטות מאמרים מהידיעות של 7 הימים האחרונים. רץ אוטומטית כל שישי 07:00.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-border p-3 bg-muted/30 text-sm text-muted-foreground space-y-1">
            <p>📦 <strong>מה נוצר בכל ריצה:</strong></p>
            <ul className="list-disc list-inside space-y-0.5 text-xs pr-2">
              <li>מאמר שבועי מקיף — בלוג עברית + אנגלית + LinkedIn</li>
              <li>2-3 מאמרים ממוקדים לפי נושא — LinkedIn + פוסטים + image prompt</li>
            </ul>
            <p className="text-xs pt-1">כל הטיוטות נשמרות בסטטוס "טיוטה" ומחכות לאישורך בדף המאמרים.</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={async () => {
                setWeeklyRunning(true);
                setWeeklyResult(null);
                try {
                  const { data, error } = await supabase.functions.invoke("auto-generate-weekly", {
                    body: { days_back: 7 },
                  });
                  if (error) {
                    // Try to extract the real error body
                    let detail = error.message;
                    try { detail = JSON.stringify((error as any).context ?? error); } catch {}
                    throw new Error(detail);
                  }
                  const d = data as any;
                  setWeeklyResult({ drafts: d?.drafts_created?.length ?? 0, errors: d?.errors });
                  toast.success(`${d?.drafts_created?.length ?? 0} טיוטות נוצרו בהצלחה`);
                  qc.invalidateQueries({ queryKey: ["article_drafts"] });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "שגיאה";
                  setWeeklyResult({ drafts: 0, errors: [msg] });
                  toast.error("שגיאה — ראי פרטים בתיבה מטה");
                } finally {
                  setWeeklyRunning(false);
                }
              }}
              disabled={weeklyRunning}
              className="gap-2"
            >
              {weeklyRunning
                ? <><Loader2 className="h-4 w-4 animate-spin" /> מייצר טיוטות...</>
                : <><PlayCircle className="h-4 w-4" /> הפעל עכשיו</>}
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={async () => {
                setWeeklyRunning(true);
                setWeeklyResult(null);
                try {
                  const { data, error } = await supabase.functions.invoke("auto-generate-weekly", {
                    body: { days_back: 7, dry_run: true },
                  });
                  if (error) throw new Error(JSON.stringify((error as any).context ?? error.message));
                  const d = data as any;
                  setWeeklyResult({ drafts: 0, errors: [`Dry run: ${JSON.stringify(d)}`] });
                } catch (e) {
                  setWeeklyResult({ drafts: 0, errors: [e instanceof Error ? e.message : "שגיאה"] });
                } finally {
                  setWeeklyRunning(false);
                }
              }}
              disabled={weeklyRunning}
              className="gap-1.5 text-xs h-8"
            >
              בדוק (dry run)
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={async () => {
                // Raw fetch to see the actual HTTP response
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch(
                  `https://iwhxpppfaegqvjneghnk.supabase.co/functions/v1/auto-generate-weekly`,
                  {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${session?.access_token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ dry_run: true, days_back: 7 }),
                  }
                );
                const text = await res.text();
                setWeeklyResult({ drafts: 0, errors: [`HTTP ${res.status}: ${text}`] });
              }}
              className="gap-1.5 text-xs h-8"
            >
              Raw test
            </Button>
          </div>

          {weeklyResult && (
            <div className={cn(
              "rounded-md p-3 text-sm",
              weeklyResult.errors?.length ? "bg-yellow-50 border border-yellow-200 text-yellow-800" : "bg-emerald-50 border border-emerald-200 text-emerald-800"
            )}>
              <p className="font-medium">נוצרו {weeklyResult.drafts} טיוטות — ממתינות לאישורך בדף המאמרים</p>
              {weeklyResult.errors?.map((e, i) => (
                <p key={i} className="text-xs mt-1 opacity-70">{e}</p>
              ))}
            </div>
          )}
        </div>

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
