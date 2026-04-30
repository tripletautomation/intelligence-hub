import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ItemRow {
  id: string;
  title_he: string;
  summary_he: string | null;
  why_it_matters: string | null;
  url: string | null;
  tags_ai: string[] | null;
  item_type: string;
  region: string | null;
}

function buildSystemPrompt(targetWords: "short" | "medium" | "long"): string {
  const lengthGuide = {
    short: "אורך כולל מומלץ: 200-300 מילים — תמציתי ולעניין.",
    medium: "אורך כולל מומלץ: 350-550 מילים — מאוזן ומעמיק.",
    long: "אורך כולל מומלץ: 600-900 מילים — מעמיק עם דוגמאות ופרספקטיבה.",
  }[targetWords];

  return `אתה עורך תוכן מקצועי הכותב מאמרי דעה / ניתוח קצרים בעברית עבור קהל מקצועי בתחום התשתיות, מרכזי הנתונים, וטכנולוגיה.
המשימה: לקבל מספר פריטי תוכן (כתבות / מחקרים / אירועים) ולהפיק מהם **מאמר אחד קוהרנטי** — לא תקציר משורשר.

דרישות:
- כתוב בעברית רהוטה, מקצועית, לא מתורגמת.
- שמר על הרעיונות המרכזיים מהפריטים אבל ארגן אותם סביב תזה אחת.
- אל תמציא עובדות או נתונים שלא הופיעו בחומר.
- חלק את המאמר ל: כותרת, פתיח (hook), גוף, וסיכום.
- ${lengthGuide}
- אם נותן המשתמש הערת סגנון — כבד אותה.

החזר את התוצאה דרך הכלי emit_article_draft בלבד. אין להחזיר טקסט חופשי.`;
}

const EMIT_TOOL = {
  type: "function",
  function: {
    name: "emit_article_draft",
    description: "Emit the generated article draft.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "כותרת המאמר בעברית" },
        intro: { type: "string", description: "פתיח/הוק קצר (1-2 פסקאות)" },
        body: { type: "string", description: "גוף המאמר. ניתן להשתמש בפסקאות מופרדות בשורה ריקה." },
        closing: { type: "string", description: "סיכום קצר וחד" },
      },
      required: ["title", "intro", "body", "closing"],
      additionalProperties: false,
    },
  },
};

// ─── Provider Adapters ────────────────────────────────────────────────────────

async function callLovable(modelId: string, userPrompt: string, apiKey: string, systemPrompt: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [EMIT_TOOL],
      tool_choice: { type: "function", function: { name: "emit_article_draft" } },
    }),
  });
  if (res.status === 429) throw Object.assign(new Error("rate_limit"), { status: 429 });
  if (res.status === 402) throw Object.assign(new Error("no_credits"), { status: 402 });
  if (!res.ok) throw new Error(`Lovable error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI לא החזיר תוצאה תקפה");
  return JSON.parse(args);
}

async function callOpenAI(modelId: string, userPrompt: string, apiKey: string, systemPrompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [EMIT_TOOL],
      tool_choice: { type: "function", function: { name: "emit_article_draft" } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI לא החזיר תוצאה תקפה");
  return JSON.parse(args);
}

async function callAnthropic(modelId: string, userPrompt: string, apiKey: string, systemPrompt: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 2048,
      system: systemPrompt,
      tools: [{
        name: "emit_article_draft",
        description: EMIT_TOOL.function.description,
        input_schema: EMIT_TOOL.function.parameters,
      }],
      tool_choice: { type: "tool", name: "emit_article_draft" },
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const toolUse = j?.content?.find((b: any) => b.type === "tool_use");
  if (!toolUse?.input) throw new Error("AI לא החזיר תוצאה תקפה");
  return toolUse.input;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const itemIds: string[] = Array.isArray(body?.item_ids) ? body.item_ids : [];
    const styleNote: string | null = typeof body?.style_note === "string" && body.style_note.trim()
      ? body.style_note.trim() : null;
    const targetWords: "short" | "medium" | "long" =
      body?.target_words === "short" ? "short" :
      body?.target_words === "long" ? "long" : "medium";
    const webContext: string | null = typeof body?.web_context === "string" && body.web_context.trim()
      ? body.web_context.trim() : null;

    if (itemIds.length > 10) {
      return json({ error: "ניתן לבחור עד 10 פריטים בו-זמנית" }, 400);
    }
    if (itemIds.length < 1 && !webContext) {
      return json({ error: "יש לבחור לפחות מקור אחד" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Read AI config — "article" row for writing, fall back to "default"
    const { data: articleConfig } = await admin
      .from("ai_config").select("provider,model_id").eq("id", "article").maybeSingle();
    const { data: defaultConfig } = await admin
      .from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle();
    const aiConfig = articleConfig ?? defaultConfig;
    const provider: string = aiConfig?.provider ?? "openai";
    const modelId: string = aiConfig?.model_id ?? "gpt-4.1";

    let items: ItemRow[] = [];
    if (itemIds.length > 0) {
      const { data, error: itemsErr } = await admin
        .from("items")
        .select("id,title_he,summary_he,why_it_matters,url,tags_ai,item_type,region")
        .in("id", itemIds);
      if (itemsErr) return json({ error: itemsErr.message }, 500);
      items = (data ?? []) as ItemRow[];
    }
    if (items.length === 0 && !webContext) {
      return json({ error: "לא נמצאו פריטים" }, 404);
    }

    const sourceBlock = (items as ItemRow[])
      .map((it, idx) => {
        const lines = [
          `[#${idx + 1}] ${it.title_he}`,
          it.summary_he ? `סיכום: ${it.summary_he}` : null,
          it.why_it_matters ? `למה זה חשוב: ${it.why_it_matters}` : null,
          it.tags_ai?.length ? `תגיות: ${it.tags_ai.join(", ")}` : null,
          it.url ? `מקור: ${it.url}` : null,
        ].filter(Boolean);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");

    const userPrompt = [
      items.length > 0
        ? `להלן ${items.length} פריטי תוכן. הפק מהם מאמר אחד קוהרנטי לפי ההנחיות.`
        : `הפק מאמר קוהרנטי מהמידע הבא מהרשת, לפי ההנחיות.`,
      styleNote ? `\nהערת סגנון מהמשתמש:\n${styleNote}` : "",
      webContext ? `\n--- מידע מהרשת ---\n${webContext}` : "",
      items.length > 0 ? `\n--- פריטי המקור ---\n${sourceBlock}` : "",
    ].join("\n");

    let parsed: { title: string; intro: string; body: string; closing: string };

    try {
      const SYSTEM_PROMPT = buildSystemPrompt(targetWords);

      if (provider === "anthropic") {
        const key = Deno.env.get("ANTHROPIC_API_KEY");
        if (!key) return json({ error: "ANTHROPIC_API_KEY missing in Edge Function secrets" }, 500);
        parsed = await callAnthropic(modelId, userPrompt, key, SYSTEM_PROMPT);
      } else if (provider === "openai") {
        const key = Deno.env.get("OPENAI_API_KEY");
        if (!key) return json({ error: "OPENAI_API_KEY missing in Edge Function secrets" }, 500);
        parsed = await callOpenAI(modelId, userPrompt, key, SYSTEM_PROMPT);
      } else {
        const key = Deno.env.get("LOVABLE_API_KEY");
        if (!key) return json({ error: "LOVABLE_API_KEY missing in Edge Function secrets" }, 500);
        parsed = await callLovable(modelId, userPrompt, key, SYSTEM_PROMPT);
      }
    } catch (e: any) {
      if (e?.status === 429) return json({ error: "חרגת ממכסת הבקשות. נסה שוב בעוד דקה." }, 429);
      if (e?.status === 402) return json({ error: "אזל הקרדיט. הוסף קרדיטים בהגדרות הסביבה." }, 402);
      console.error("ai call error", e);
      return json({ error: e?.message ?? "AI gateway error" }, 500);
    }

    const { data: inserted, error: insertErr } = await admin
      .from("article_drafts")
      .insert({
        user_id: userId,
        title: parsed.title,
        intro: parsed.intro,
        body: parsed.body,
        closing: parsed.closing,
        source_item_ids: itemIds,
        style_note: styleNote,
      })
      .select("id")
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);
    return json({ draft_id: inserted.id });

  } catch (e) {
    console.error("generate-article fatal", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה לא ידועה" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
