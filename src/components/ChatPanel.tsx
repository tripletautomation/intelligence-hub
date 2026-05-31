import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Send, Sparkles, Globe, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  action?: {
    type: "create_content";
    content_type: "linkedin" | "blog_he" | "blog_en";
    item_ids?: string[];
    web_context?: string;
    instructions?: string;
    explanation?: string;
  };
  web_blocks?: { title: string; url: string; snippet: string }[];
  creating?: boolean;
}

const QUICK_CHIPS = [
  { label: "סכם את השבוע", prompt: "תסכם את הידיעות הכי חשובות מהשבוע האחרון" },
  { label: "מה חדש ב-AI?", prompt: "מה קרה לאחרונה בתחום ה-AI ומודלי שפה גדולים?" },
  { label: "חדשות סייבר", prompt: "תסכם את חדשות הסייבר האחרונות" },
  { label: "Data Centers", prompt: "מה קרה לאחרונה בתחום Data Centers ותשתיות מחשוב?" },
];

const CONTENT_TYPE_LABELS: Record<string, string> = {
  linkedin: "פוסט LinkedIn",
  blog_he: "מאמר בלוג — עברית",
  blog_en: "Blog Post — English",
};

interface Props {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ChatPanel = ({ onClose }: Props) => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "שלום! אני Assistant של Triple T. ניתן לשאול שאלות על הידיעות שנאספו, לבקש סיכום, לחפש מידע ברשת, וליצור טיוטות מאמרים ופוסטים. במה אוכל לעזור?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("chat-assistant", {
        body: { messages: history, days_back: 14 },
      });
      if (error) throw new Error(error.message);

      const d = data as any;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: d.message ?? "לא התקבלה תשובה.",
          action: d.action ?? undefined,
          web_blocks: d.web_blocks?.length ? d.web_blocks : undefined,
        },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בתקשורת עם Assistant");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "אירעה שגיאה. נסי שוב." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const createDraft = async (msgIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg?.action) return;

    setMessages((prev) => prev.map((m, i) => i === msgIdx ? { ...m, creating: true } : m));

    try {
      const { action } = msg;
      let draftId: string | null = null;

      // Build web_context from conversation if no specific sources were given
      const hasItems = (action.item_ids ?? []).length > 0;
      const hasWebContext = !!action.web_context;
      const conversationContext = (!hasItems && !hasWebContext)
        ? messages
            .slice(Math.max(0, msgIdx - 6), msgIdx + 1)
            .filter((m) => m.role === "assistant")
            .map((m) => m.content)
            .join("\n\n")
        : undefined;

      if (action.content_type === "linkedin") {
        const { data, error } = await supabase.functions.invoke("generate-article", {
          body: {
            item_ids: action.item_ids ?? [],
            web_context: action.web_context || conversationContext || undefined,
            instructions: action.instructions || undefined,
            target_words: "medium",
          },
        });
        if (error) throw new Error(error.message);
        draftId = (data as any)?.draft_id;
      } else {
        const { data, error } = await supabase.functions.invoke("generate-blog-post", {
          body: {
            item_ids: action.item_ids ?? [],
            language: action.content_type === "blog_en" ? "en" : "he",
            web_context: action.web_context || conversationContext || undefined,
            instructions: action.instructions || undefined,
          },
        });
        if (error) throw new Error(error.message);
        draftId = (data as any)?.draft_id;
      }

      if (!draftId) throw new Error("לא התקבל מזהה טיוטה");
      qc.invalidateQueries({ queryKey: ["article_drafts"] });
      toast.success("הטיוטה נוצרה!");
      nav(`/drafts/${draftId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ביצירת טיוטה");
      setMessages((prev) => prev.map((m, i) => i === msgIdx ? { ...m, creating: false } : m));
    }
  };

  return (
    <div className="flex flex-col h-full w-[380px] border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-primary">עוזר אישי</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => sendMessage(chip.prompt)}
            disabled={loading}
            className="px-2.5 py-1 rounded-full text-xs border border-border bg-muted/50 text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-accent transition-colors disabled:opacity-50"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, idx) => (
          <div key={idx} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
              msg.role === "user"
                ? "bg-accent text-accent-foreground rounded-br-sm"
                : "bg-muted text-foreground rounded-bl-sm"
            )}>
              {/* Web blocks */}
              {msg.web_blocks && msg.web_blocks.length > 0 && (
                <div className="mb-2 space-y-1.5">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    <Globe className="h-3 w-3" /> מקורות מהרשת
                  </div>
                  {msg.web_blocks.slice(0, 3).map((b) => (
                    <a
                      key={b.url}
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block p-1.5 rounded-md border border-border bg-background/60 hover:bg-background text-xs"
                    >
                      <div className="font-medium text-foreground line-clamp-1 flex items-center gap-1">
                        {b.title} <ExternalLink className="h-2.5 w-2.5 opacity-50 shrink-0" />
                      </div>
                      <div className="text-muted-foreground line-clamp-1 mt-0.5">{b.snippet}</div>
                    </a>
                  ))}
                </div>
              )}

              {/* Message text */}
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {/* Action button */}
              {msg.action?.type === "create_content" && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <Button
                    size="sm"
                    className="gap-1.5 h-7 text-xs w-full"
                    disabled={msg.creating}
                    onClick={() => createDraft(idx)}
                  >
                    {msg.creating
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> יוצר טיוטה...</>
                      : <><Sparkles className="h-3 w-3" /> צור {CONTENT_TYPE_LABELS[msg.action.content_type]}</>}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>חושב...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="שאלה, בקשה לסיכום, 'צור לי פוסט על X'..."
            rows={2}
            className="text-sm resize-none flex-1"
            dir="rtl"
            disabled={loading}
          />
          <Button
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
            disabled={!input.trim() || loading}
            onClick={() => sendMessage(input)}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Enter לשליחה · Shift+Enter לירידת שורה</p>
      </div>
    </div>
  );
};
