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
}

function buildSystemPrompt(language: "he" | "en"): string {
  if (language === "en") {
    return `You are writing a thought leadership blog post in English on behalf of Triple T — a technology consulting and planning company with 30 years of experience in data centers, computing infrastructure, cybersecurity, and AI.

Mission: Create a long-form, well-structured blog article from the provided source items.

Requirements:
- Length: 1500-2500 words
- Structure: Introduction (2-3 paragraphs) → 3-4 main sections with H2 headings → Conclusion with CTA
- Tone: Professional, insightful, forward-thinking — not corporate buzzword-heavy
- Write as a subject matter expert sharing genuine insights
- Each section should have a clear thesis and supporting evidence from the sources
- Use concrete examples, data points, and industry context
- Avoid generic openings like "In today's rapidly evolving landscape..."
- End with a compelling call-to-action relevant to Triple T's consulting services

Format the body with ## for H2 section headings.
Do not use AI clichés or filler phrases.

Return the result ONLY via the emit_blog_draft tool.`;
  }

  return `אתה כותב מאמר בלוג מקצועי בעברית בשם Triple T — חברת ייעוץ ותכנון טכנולוגי עם 30 שנות ניסיון בתשתיות מחשוב, Data Centers, סייבר ו-AI.

משימה: הפק מאמר מעמיק ומובנה מפריטי המקור שסופקו.

דרישות:
- אורך: 1500-2500 מילים
- מבנה: מבוא (2-3 פסקאות) ← 3-4 סעיפים עיקריים עם כותרות H2 ← סיכום + CTA
- סגנון: מקצועי, תובנתי, מבוסס נתונים — לא שיווקי ולא בירוקרטי
- כתוב מנקודת מבט של מומחה המשתף תובנות אמיתיות
- כל סעיף עם טענה ברורה ותימוכין מהמקורות
- השתמש בדוגמאות קונקרטיות, נתונים ולהקשר עסקי
- אל תפתח ב"בעולם המשתנה" או שיגרות דומות
- סיים בקריאה לפעולה רלוונטית לשירותי ייעוץ של Triple T

פרמט את גוף המאמר עם ## לכותרות H2.
אל תשתמש בסימני AI או ביטויים שחוקים.

החזר את התוצאה דרך הכלי emit_blog_draft בלבד.`;
}

const EMIT_TOOL = {
  type: "function",
  function: {
    name: "emit_blog_draft",
    description: "Emit the generated blog post draft.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Blog post title" },
        intro: { type: "string", description: "Opening intro (2-3 paragraphs)" },
        body: { type: "string", description: "Main body with ## H2 section headings (3-4 sections)" },
        closing: { type: "string", description: "Conclusion paragraph + CTA" },
      },
      required: ["title", "intro", "body", "closing"],
      additionalProperties: false,
    },
  },
};

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
      tool_choice: { type: "function", function: { name: "emit_blog_draft" } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI did not return a valid result");
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
      max_tokens: 4096,
      system: systemPrompt,
      tools: [{
        name: "emit_blog_draft",
        description: EMIT_TOOL.function.description,
        input_schema: EMIT_TOOL.function.parameters,
      }],
      tool_choice: { type: "tool", name: "emit_blog_draft" },
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const toolUse = j?.content?.find((b: any) => b.type === "tool_use");
  if (!toolUse?.input) throw new Error("AI did not return a valid result");
  return toolUse.input;
}

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
      tool_choice: { type: "function", function: { name: "emit_blog_draft" } },
    }),
  });
  if (res.status === 429) throw Object.assign(new Error("rate_limit"), { status: 429 });
  if (res.status === 402) throw Object.assign(new Error("no_credits"), { status: 402 });
  if (!res.ok) throw new Error(`Lovable error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI did not return a valid result");
  return JSON.parse(args);
}

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
    const language: "he" | "en" = body?.language === "en" ? "en" : "he";
    const contentType = language === "en" ? "blog_en" : "blog_he";
    const styleNote: string | null = typeof body?.style_note === "string" && body.style_note.trim()
      ? body.style_note.trim() : null;
    const instructions: string | null = typeof body?.instructions === "string" && body.instructions.trim()
      ? body.instructions.trim() : null;
    const sourceNotes: Record<string, string> = (body?.source_notes && typeof body.source_notes === "object")
      ? body.source_notes : {};
    const webContext: string | null = typeof body?.web_context === "string" && body.web_context.trim()
      ? body.web_context.trim() : null;

    if (itemIds.length > 10) return json({ error: "Maximum 10 source items" }, 400);
    if (itemIds.length < 1 && !webContext) return json({ error: "At least one source required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    async function getApiKey(envName: string): Promise<string | undefined> {
      const { data } = await admin.from("admin_api_keys").select("key_value").eq("key_name", envName).maybeSingle();
      return data?.key_value || Deno.env.get(envName);
    }

    const [articleConfigRes, defaultConfigRes, writingStyleRes, promptTemplateRes] = await Promise.all([
      admin.from("ai_config").select("provider,model_id").eq("id", "article").maybeSingle(),
      admin.from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle(),
      admin.from("ai_config").select("prompt_text").eq("id", "writing_style").maybeSingle(),
      admin.from("prompt_templates").select("system_prompt").eq("id", `article_${contentType}`).maybeSingle(),
    ]);

    const aiConfig = articleConfigRes.data ?? defaultConfigRes.data;
    const provider: string = aiConfig?.provider ?? "openai";
    const modelId: string = aiConfig?.model_id ?? "gpt-4.1";
    const writingStylePrompt: string = writingStyleRes.data?.prompt_text?.trim() ?? "";
    const customPrompt: string = promptTemplateRes.data?.system_prompt?.trim() ?? "";

    let items: ItemRow[] = [];
    if (itemIds.length > 0) {
      const { data, error: itemsErr } = await admin
        .from("items")
        .select("id,title_he,summary_he,why_it_matters,url,tags_ai")
        .in("id", itemIds);
      if (itemsErr) return json({ error: itemsErr.message }, 500);
      items = (data ?? []) as ItemRow[];
    }

    const sourceBlock = items
      .map((it, idx) => {
        const note = sourceNotes[`db:${it.id}`];
        const lines = [
          `[#${idx + 1}] ${it.title_he}`,
          it.summary_he ? `Summary: ${it.summary_he}` : null,
          it.why_it_matters ? `Why it matters: ${it.why_it_matters}` : null,
          it.tags_ai?.length ? `Tags: ${it.tags_ai.join(", ")}` : null,
          it.url ? `Source: ${it.url}` : null,
          note ? `Specific note for this source: ${note}` : null,
        ].filter(Boolean);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");

    const userPrompt = [
      items.length > 0
        ? `Create a blog post from these ${items.length} source items:`
        : "Create a blog post from the following web research:",
      instructions ? `\nUser instructions for this article:\n${instructions}` : "",
      styleNote ? `\nStyle note: ${styleNote}` : "",
      webContext ? `\n--- Web research ---\n${webContext}` : "",
      items.length > 0 ? `\n--- Source items ---\n${sourceBlock}` : "",
    ].join("\n");

    // If admin wrote a custom template → it IS the system prompt (replaces hardcoded base).
    // Writing style appended as supplementary guidelines on top of whichever base is used.
    const baseSystemPrompt = customPrompt || buildSystemPrompt(language);
    const SYSTEM_PROMPT = writingStylePrompt
      ? `${baseSystemPrompt}\n\n---\nAdditional writing style guidelines (must follow):\n${writingStylePrompt}`
      : baseSystemPrompt;

    let parsed: { title: string; intro: string; body: string; closing: string };

    try {
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
      if (e?.status === 429) return json({ error: "Rate limit reached. Please try again in a minute." }, 429);
      if (e?.status === 402) return json({ error: "No credits. Add credits in settings." }, 402);
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
        content_type: contentType,
      })
      .select("id")
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);
    return json({ draft_id: inserted.id, content_type: contentType });

  } catch (e) {
    console.error("generate-blog-post fatal", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
