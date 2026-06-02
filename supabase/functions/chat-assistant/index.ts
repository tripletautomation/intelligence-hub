// chat-assistant: conversational AI with access to collected news, drafts + web search
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Message { role: "user" | "assistant"; content: string; }

interface ItemRow {
  id: string;
  title_he: string;
  summary_he: string | null;
  why_it_matters: string | null;
  tags_ai: string[] | null;
  created_at: string;
  region: string | null;
  url: string | null;
}

interface DraftRow {
  id: string;
  title: string;
  body: string | null;
  content_type: string | null;
  created_at: string;
  status: string | null;
}

interface ResearchBlock { title: string; snippet: string; url: string; relevance: number; }
interface DraftResult { id: string; title: string; content_type: string | null; created_at: string; excerpt: string; }

// ─── Tools ───────────────────────────────────────────────────────────────────

const TOOL_CREATE_CONTENT = {
  name: "create_content",
  description: "Create a LinkedIn post, Hebrew blog, or English blog draft from the news items. Use when the user explicitly asks to write, create, or generate a post or article.",
  input_schema: {
    type: "object",
    properties: {
      content_type: { type: "string", enum: ["linkedin", "blog_he", "blog_en"], description: "Type of content to create" },
      item_ids: { type: "array", items: { type: "string" }, description: "FULL UUID strings (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) copied exactly from after 'ID:' in the news list. CRITICAL: do NOT use the bracket index like [1] or [24] — those are display numbers only. Only valid UUIDs will be accepted." },
      web_context: { type: "string", description: "Additional web search context if web search was performed" },
      instructions: { type: "string", description: "Specific instructions for the content — angle, tone, focus" },
      explanation: { type: "string", description: "Brief explanation to show the user why these items were chosen" },
    },
    required: ["content_type", "instructions", "explanation"],
  },
};

const TOOL_SEARCH_WEB = {
  name: "search_web",
  description: "Search the internet for recent news or information on a topic not found in the collected items. Use when the user asks about something not well covered by the collected news.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query in English" },
      context: { type: "string", description: "Additional context to guide the search" },
    },
    required: ["query"],
  },
};

const TOOL_SEARCH_DRAFTS = {
  name: "search_drafts",
  description: "Search previously created article drafts and posts. Use when the user asks about content that was written before, wants to find a specific article, or asks 'what did we write about X'.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Topic or keyword to search for in the drafts (in Hebrew or English)" },
      content_type: { type: "string", enum: ["linkedin", "blog_he", "blog_en", "any"], description: "Filter by content type. Use 'any' to search all types." },
    },
    required: ["query"],
  },
};

const TOOLS_ANTHROPIC = [TOOL_CREATE_CONTENT, TOOL_SEARCH_WEB, TOOL_SEARCH_DRAFTS];

const TOOLS_OPENAI = TOOLS_ANTHROPIC.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const messages: Message[] = Array.isArray(body?.messages) ? body.messages : [];
    const daysBack: number = typeof body?.days_back === "number" ? body.days_back : 14;

    if (messages.length === 0) return json({ error: "messages required" }, 400);

    // Load AI config
    const [configRes, writingStyleRes] = await Promise.all([
      admin.from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle(),
      admin.from("ai_config").select("prompt_text").eq("id", "writing_style").maybeSingle(),
    ]);
    const provider: string = configRes.data?.provider ?? "openai";
    const modelId: string = configRes.data?.model_id ?? "gpt-4.1";

    async function getApiKey(envName: string): Promise<string> {
      const { data } = await admin.from("admin_api_keys").select("key_value").eq("key_name", envName).maybeSingle();
      return data?.key_value || Deno.env.get(envName) || "";
    }

    // Load recent news items
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const { data: items } = await admin
      .from("items")
      .select("id,title_he,summary_he,why_it_matters,tags_ai,created_at,region,url")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40);

    const allItems = (items ?? []) as ItemRow[];

    // Load recent drafts list (titles only for context — no body to save tokens)
    const { data: recentDrafts } = await admin
      .from("article_drafts")
      .select("id,title,content_type,created_at,status")
      .order("created_at", { ascending: false })
      .limit(30);

    const allDrafts = (recentDrafts ?? []) as DraftRow[];

    const CONTENT_TYPE_LABEL: Record<string, string> = {
      linkedin: "פוסט LinkedIn",
      blog_he: "מאמר עברית",
      blog_en: "Blog English",
    };

    // Format items for context
    const itemsContext = allItems.length > 0
      ? allItems.map((it, i) => {
          const date = new Date(it.created_at).toLocaleDateString("he-IL");
          const tags = it.tags_ai?.slice(0, 3).join(", ") ?? "";
          const region = it.region === "israel" ? "🇮🇱" : it.region === "global" ? "🌍" : "";
          return `[${i + 1}] ID:${it.id} ${region} ${date}\n${it.title_he}\n${it.summary_he ? `סיכום: ${it.summary_he.slice(0, 150)}` : ""}${it.why_it_matters ? `\nחשיבות: ${it.why_it_matters.slice(0, 100)}` : ""}${tags ? `\nתגיות: ${tags}` : ""}`;
        }).join("\n\n---\n\n")
      : "אין ידיעות שנאספו בתקופה זו.";

    // Format draft list for context (titles only)
    const draftsListContext = allDrafts.length > 0
      ? allDrafts.map((d, i) => {
          const date = new Date(d.created_at).toLocaleDateString("he-IL");
          const typeLabel = CONTENT_TYPE_LABEL[d.content_type ?? ""] ?? d.content_type ?? "";
          return `[${i + 1}] DRAFT_ID:${d.id} | ${typeLabel} | ${date} | "${d.title}"`;
        }).join("\n")
      : "אין טיוטות שנוצרו עדיין.";

    const systemPrompt = `אתה עוזר אישי מודיעיני של Triple T — חברת ייעוץ טכנולוגי ישראלית המתמחה ב-Data Centers, תשתיות מחשוב, סייבר ו-AI.

יש לך גישה ל-${allItems.length} ידיעות שנאספו ב-${daysBack} הימים האחרונים, ולרשימת כל הטיוטות שנוצרו.

## ידיעות שנאספו:
${itemsContext}

## טיוטות ומאמרים שנוצרו (${allDrafts.length} טיוטות):
${draftsListContext}

## הנחיות:
- ענה בעברית תמיד, בצורה תמציתית ומקצועית
- כשעונה על שאלות על הידיעות — הסתמך על הידיעות לעיל ונקב בפרטים ספציפיים
- כשמבקשים ליצור תוכן (פוסט/מאמר) — השתמש בכלי create_content
- כשמידע לא נמצא בידיעות הקיימות — השתמש בכלי search_web לחיפוש ברשת
- כשמבקשים למצוא מאמרים/פוסטים שנכתבו בעבר על נושא מסוים — השתמש בכלי search_drafts
- אל תמציא עובדות שלא הופיעו בידיעות
${writingStyleRes.data?.prompt_text ? `\n## סגנון כתיבה:\n${writingStyleRes.data.prompt_text}` : ""}`;

    // ─── Tool helpers ──────────────────────────────────────────────────────────

    const doWebSearch = async (query: string, context?: string): Promise<ResearchBlock[]> => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/research-web`, {
          method: "POST",
          headers: { "Authorization": authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ query, context }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data?.blocks ?? []) as ResearchBlock[];
      } catch { return []; }
    };

    const doSearchDrafts = async (query: string, contentType?: string): Promise<DraftResult[]> => {
      try {
        let q = admin
          .from("article_drafts")
          .select("id,title,body,content_type,created_at,status")
          .order("created_at", { ascending: false })
          .limit(20);

        if (contentType && contentType !== "any") {
          q = q.eq("content_type", contentType);
        }

        const { data } = await q;
        if (!data) return [];

        const queryLower = query.toLowerCase();
        const matched = (data as DraftRow[]).filter((d) =>
          d.title?.toLowerCase().includes(queryLower) ||
          d.body?.toLowerCase().includes(queryLower)
        ).slice(0, 5);

        return matched.map((d) => ({
          id: d.id,
          title: d.title,
          content_type: d.content_type,
          created_at: d.created_at,
          excerpt: (d.body ?? "").slice(0, 200).replace(/\n+/g, " "),
        }));
      } catch { return []; }
    };

    // ── Call AI with tool support ──────────────────────────────────────────────

    let assistantMessage = "";
    let action: Record<string, unknown> | null = null;
    let webBlocks: ResearchBlock[] = [];
    let draftResults: DraftResult[] = [];
    let citedItemIds: string[] = [];

    const handleToolCall = async (name: string, args: Record<string, any>): Promise<string> => {
      if (name === "search_web") {
        const blocks = await doWebSearch(args.query, args.context);
        webBlocks = blocks;
        return blocks.length > 0
          ? blocks.map((b) => `${b.title}\n${b.snippet}\nמקור: ${b.url}`).join("\n\n---\n\n")
          : "לא נמצאו תוצאות.";
      }
      if (name === "search_drafts") {
        const drafts = await doSearchDrafts(args.query, args.content_type);
        draftResults = drafts;
        if (drafts.length === 0) return "לא נמצאו טיוטות על הנושא הזה.";
        return drafts.map((d) => {
          const typeLabel = CONTENT_TYPE_LABEL[d.content_type ?? ""] ?? "";
          const date = new Date(d.created_at).toLocaleDateString("he-IL");
          return `DRAFT_ID:${d.id} | ${typeLabel} | ${date}\nכותרת: ${d.title}\nתוכן: ${d.excerpt}...`;
        }).join("\n\n---\n\n");
      }
      if (name === "create_content") {
        action = { type: "create_content", ...args };
        return "מכין טיוטה...";
      }
      return "";
    };

    if (provider === "anthropic") {
      const apiKey = await getApiKey("ANTHROPIC_API_KEY");

      const callAnthropic = async (msgs: { role: string; content: unknown }[]) => {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: modelId, max_tokens: 2048, system: systemPrompt, tools: TOOLS_ANTHROPIC, messages: msgs }),
        });
        if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
        return res.json();
      };

      const anthropicMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      let result = await callAnthropic(anthropicMessages);

      if (result.stop_reason === "tool_use") {
        const toolUse = result.content.find((b: any) => b.type === "tool_use");
        if (toolUse) {
          const toolResult = await handleToolCall(toolUse.name, toolUse.input);
          if (toolUse.name === "create_content") {
            assistantMessage = toolUse.input.explanation ?? "מכין את הטיוטה עבורך...";
          } else {
            const continued = await callAnthropic([
              ...anthropicMessages,
              { role: "assistant", content: result.content },
              { role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: toolResult }] },
            ]);
            const textBlock = continued.content?.find((b: any) => b.type === "text");
            assistantMessage = textBlock?.text ?? "";
          }
        }
      } else {
        const textBlock = result.content?.find((b: any) => b.type === "text");
        assistantMessage = textBlock?.text ?? "";
      }

    } else {
      // OpenAI / Lovable
      const apiKey = provider === "openai" ? await getApiKey("OPENAI_API_KEY") : await getApiKey("LOVABLE_API_KEY");
      const baseUrl = provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://ai.gateway.lovable.dev/v1/chat/completions";

      const callOpenAI = async (msgs: unknown[]) => {
        const res = await fetch(baseUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelId, messages: [{ role: "system", content: systemPrompt }, ...msgs], tools: TOOLS_OPENAI, tool_choice: "auto" }),
        });
        if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
        return res.json();
      };

      const openAIMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      let result = await callOpenAI(openAIMessages);
      const choice = result.choices?.[0];

      if (choice?.finish_reason === "tool_calls") {
        const toolCall = choice.message?.tool_calls?.[0];
        if (toolCall) {
          const args = JSON.parse(toolCall.function.arguments ?? "{}");
          const toolResult = await handleToolCall(toolCall.function.name, args);

          if (toolCall.function.name === "create_content") {
            assistantMessage = args.explanation ?? "מכין את הטיוטה עבורך...";
          } else {
            // Pass the assistant message with tool_calls intact (not stringified)
            const continued = await callOpenAI([
              ...openAIMessages,
              { role: "assistant", content: null, tool_calls: choice.message.tool_calls },
              { role: "tool", content: toolResult, tool_call_id: toolCall.id },
            ]);
            assistantMessage = continued.choices?.[0]?.message?.content ?? "";
          }
        }
      } else {
        assistantMessage = choice?.message?.content ?? "";
      }
    }

    // Clean up ID markers from the final message
    const idMatches = assistantMessage.matchAll(/ID:([a-f0-9-]{36})/g);
    citedItemIds = [...new Set([...idMatches].map((m) => m[1]))];
    assistantMessage = assistantMessage
      .replace(/ID:[a-f0-9-]{36}/g, "")
      .replace(/DRAFT_ID:[a-f0-9-]{36}/g, "")
      .trim();

    return json({ message: assistantMessage, action, cited_item_ids: citedItemIds, web_blocks: webBlocks, draft_results: draftResults });

  } catch (e) {
    console.error("chat-assistant error:", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה לא ידועה" }, 500);
  }
});
