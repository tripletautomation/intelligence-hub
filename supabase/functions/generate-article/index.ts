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
    short: "אורך כולל: 400-600 מילים.",
    medium: "אורך כולל: 700-900 מילים.",
    long: "אורך כולל: 1000-1400 מילים — מעמיק עם דוגמאות, נתונים וניתוח.",
  }[targetWords];

  return `אתה כותב thought leadership בעברית בשם עופר עוז, מנכ"ל Triple T — חברת ייעוץ ותכנון טכנולוגי עם 30 שנות ניסיון בתשתיות מחשוב, Data Centers, סייבר ו-AI.

המשימה: לקבל פריטי תוכן ולהפיק מהם **מאמר דעה קוהרנטי אחד** — לא תקציר משורשר.

סגנון הכתיבה:
- פתח בדרך מעניינת ומשתנה בכל מאמר — לפעמים שאלה מאתגרת, לפעמים עובדה מפתיעה, לפעמים תרחיש, לפעמים ציטוט — תמיד hook שמושך לקרוא הלאה.
- בנה קשת סיפורית ברורה: הנחת מוצא → הפתעה/גילוי → ניתוח מעמיק → השלכה עסקית.
- השתמש במשפטים קצרים ותכליתיים לנקודות מפתח חשובות (דוגמה: "48 פעמים. על GPU בודד. בשעות.").
- הוסף כותרות ביניים מודגשות שמחלקות את הגוף לקטעים ברורים.
- חבר תמיד לעולם Data Centers, תשתיות, סייבר, AI — מהזווית המעשית של Triple T.
- כתוב בגוף ראשון או שלישי — לפי מה שמתאים לנושא. אל תתחיל תמיד ב"אני".
- סיים עם מסר חד ובלתי-נשכח שנשאר בראש הקורא.
- כתוב בעברית רהוטה ומקצועית, לא מתורגמת, לא ביורוקרטית.
- אל תמציא עובדות שלא הופיעו בחומר.
- ${lengthGuide}
- אם נותן המשתמש הערת סגנון — כבד אותה.

חשוב: כתוב כמו בן אדם, לא כמו AI:
- אל תשתמש ב-em dash (—) לחיבור משפטים. השתמש בפסיק, נקודותיים, או פשוט התחל משפט חדש.
- אל תשתמש בביטויים כמו: "בנוף המשתנה", "בעולם המתפתח", "ריקוד עדין", "חשוב לציין"
- אל תתחיל משפטים עם "כמובן", "ללא ספק", "מעניין לציין"
- כתוב ישיר, חד, אנושי

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
    const instructions: string | null = typeof body?.instructions === "string" && body.instructions.trim()
      ? body.instructions.trim() : null;
    const sourceNotes: Record<string, string> = (body?.source_notes && typeof body.source_notes === "object")
      ? body.source_notes : {};
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
    const [articleConfigRes, defaultConfigRes, writingStyleRes, linkedinTemplateRes] = await Promise.all([
      admin.from("ai_config").select("provider,model_id").eq("id", "article").maybeSingle(),
      admin.from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle(),
      admin.from("ai_config").select("prompt_text").eq("id", "writing_style").maybeSingle(),
      admin.from("prompt_templates").select("system_prompt").eq("id", "article_linkedin").maybeSingle(),
    ]);
    const aiConfig = articleConfigRes.data ?? defaultConfigRes.data;
    const provider: string = aiConfig?.provider ?? "openai";
    const modelId: string = aiConfig?.model_id ?? "gpt-4.1";
    const writingStylePrompt: string = writingStyleRes.data?.prompt_text?.trim() ?? "";
    const linkedinCustomPrompt: string = linkedinTemplateRes.data?.system_prompt?.trim() ?? "";

    // Read API key from DB first, fall back to env secret
    async function getApiKey(envName: string): Promise<string | undefined> {
      const { data } = await admin.from("admin_api_keys").select("key_value").eq("key_name", envName).maybeSingle();
      return data?.key_value || Deno.env.get(envName);
    }

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
        const note = sourceNotes[`db:${it.id}`];
        const lines = [
          `[#${idx + 1}] ${it.title_he}`,
          it.summary_he ? `סיכום: ${it.summary_he}` : null,
          it.why_it_matters ? `למה זה חשוב: ${it.why_it_matters}` : null,
          it.tags_ai?.length ? `תגיות: ${it.tags_ai.join(", ")}` : null,
          it.url ? `מקור: ${it.url}` : null,
          note ? `הנחייה ספציפית למקור זה: ${note}` : null,
        ].filter(Boolean);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");

    const userPrompt = [
      items.length > 0
        ? `להלן ${items.length} פריטי תוכן. הפק מהם מאמר אחד קוהרנטי לפי ההנחיות.`
        : `הפק מאמר קוהרנטי מהמידע הבא מהרשת, לפי ההנחיות.`,
      instructions ? `\nהנחיות המשתמש לכתיבת המאמר:\n${instructions}` : "",
      styleNote ? `\nהערת סגנון:\n${styleNote}` : "",
      webContext ? `\n--- מידע מהרשת ---\n${webContext}` : "",
      items.length > 0 ? `\n--- פריטי המקור ---\n${sourceBlock}` : "",
    ].join("\n");

    let parsed: { title: string; intro: string; body: string; closing: string };

    try {
      // If admin wrote a custom prompt → it IS the system prompt (replaces hardcoded base).
      // Writing style appended as supplementary guidelines on top of whichever base is used.
      const baseSystemPrompt = linkedinCustomPrompt || buildSystemPrompt(targetWords);
      const SYSTEM_PROMPT = writingStylePrompt
        ? `${baseSystemPrompt}\n\n---\nהנחיות סגנון כתיבה נוספות (חובה לשמור עליהן):\n${writingStylePrompt}`
        : baseSystemPrompt;

      if (provider === "anthropic") {
        const key = await getApiKey("ANTHROPIC_API_KEY");
        if (!key) return json({ error: "ANTHROPIC_API_KEY missing" }, 500);
        parsed = await callAnthropic(modelId, userPrompt, key, SYSTEM_PROMPT);
      } else if (provider === "openai") {
        const key = await getApiKey("OPENAI_API_KEY");
        if (!key) return json({ error: "OPENAI_API_KEY missing" }, 500);
        parsed = await callOpenAI(modelId, userPrompt, key, SYSTEM_PROMPT);
      } else {
        const key = await getApiKey("LOVABLE_API_KEY");
        if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);
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
