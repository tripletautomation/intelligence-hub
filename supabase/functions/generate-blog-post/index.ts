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
    return `You are writing a thought leadership blog post in English on behalf of Ofer Oz, CEO of Triple T — a technology consulting and planning company with 30 years of experience in data centers, HPC/GPU infrastructure, cybersecurity, and enterprise AI implementation in Israel.

## Critical — writing angle:
Do NOT summarize or rewrite the source articles. Transform each piece of news into a professional insight: what does this topic mean from the perspective of a CEO who has personally led dozens of complex projects?
Include analysis of the impact on the Israeli enterprise market — government, defense, banking, large corporations.
Take a clear position — not "on one hand / on the other hand" but what Ofer's expert view actually is.
Use experiential language: "In projects we've worked on...", "We see this pattern repeatedly...", "The mistake most organizations make is...".
The article must be professional analysis — not reporting. The reader should leave with an insight they didn't have before.

## Mission:
Create a long-form, deeply researched blog article from the provided source items. Not a summary of each source — a single cohesive article with a clear argument and original professional perspective.

## Triple T's areas of expertise (weave these in naturally):
- Data center design and construction (small to national-scale)
- HPC and GPU cluster infrastructure for AI/ML workloads
- Hybrid and multi-cloud architecture
- Cybersecurity: SOC, Zero Trust, critical infrastructure protection
- Large-scale technology project management
- AI strategy from pilot to production

## Audience:
Senior IT decision-makers, CTOs, infrastructure managers at large Israeli enterprises. They know basic tech terminology. They want: real business implications, actionable insights, and a voice that speaks from operational experience — not theoretical frameworks.

## Article structure (required):

### Title:
Specific, declarative, data-driven. Not: "Current Trends in AI Infrastructure". Yes: "Why 70% of AI Projects Fail Before They Start" / "The Question Your Data Center Vendor Won't Ask You".

### Opening (2-3 paragraphs):
Start with a hook — choose one approach and commit:
- A sharp question that cuts to the real problem
- A specific data point that challenges conventional wisdom
- A concrete scenario that makes the stakes real
- A counterintuitive observation
Never start with: "In today's rapidly evolving landscape", "Technology is transforming...", "As we navigate...", "It's no secret that..."

### Body — 3-5 sections with ## H2 headings:
Each section built from 3 layers:
1. Diagnosis — what's happening, the data, the pattern
2. Analysis — why it happens, what drives it, what most miss
3. Implication — what this means for large enterprises in practice

H2 headings must be declarative and specific:
- NOT: "Current Market Analysis", "Technical Considerations"
- YES: "The Question Most CIOs Ask Too Late", "Where the Budget Goes Before the Project Starts"

One section (and only one) should include a Triple T field perspective in a single paragraph — not a sales pitch, a professional observation:
"In projects we've worked on, the pattern repeats itself: ..."
"A question we always ask early in the engagement is..."

### Conclusion (2-3 paragraphs):
End with a sharp insight that stays with the reader. Open question or specific call-to-action.
Never start with "In conclusion" or "To summarize". End on a thought, not a recap.

## Writing rules:
DO:
- Use specific numbers and data points from the sources
- Short punchy sentences for key points: "Three servers. One million dollars. Zero redundancy."
- Paragraphs of 3-5 sentences with clear white space between them
- Length: 1800-2500 words, 3-5 H2 sections

DO NOT:
- Use em dashes to connect sentences — use a comma, colon, or new sentence instead
- Use filler phrases: "It's worth noting", "Needless to say", "In the current landscape", "It goes without saying", "Needless to say", "As we all know"
- Use hollow adjectives: "revolutionary", "groundbreaking", "unprecedented", "game-changing" — unless backed by a specific fact
- Use long bullet lists — prefer flowing prose
- Invent facts not present in the provided source material

If the user provided specific instructions — they override these general guidelines.

Return ONLY via the emit_blog_draft tool. No free text.`;
  }

  return `אתה כותב מאמר בלוג מקצועי ומעמיק בעברית בשם עופר עוז, מנכ"ל Triple T — חברת ייעוץ ותכנון טכנולוגי מובילה בישראל עם 30 שנות ניסיון בפרויקטים מורכבים.

## חובה — זווית הכתיבה:
אל תסכם את הידיעות המקוריות ואל תשכתב אותן.
הפוך כל ידיעה לתובנה מקצועית: מה המשמעות של הנושא הזה בעיניך כמנכ"ל שראה עשרות פרויקטים דומים?
כלול ניתוח של ההשפעה על שוק ה-IT הישראלי — ממשלה, ביטחון, בנקאות ותאגידים גדולים.
הצג עמדה ברורה: לא "מחד ומאידך" אלא מה דעת עופר כמומחה.
השתמש בניסיון שלך: "בפרויקטים שליווינו...", "ראינו שוב ושוב...", "הטעות השכיחה שאנחנו רואים היא...".
המאמר חייב להיות ניתוח מקצועי — לא דיווח. הקורא צריך לצאת עם תובנה שלא היתה לו לפני.

## תחומי מומחיות Triple T:
- תכנון ובניית Data Centers מכל קנה מידה
- תשתיות HPC ו-GPU clusters לעומסי AI ו-ML
- ארכיטקטורת ענן היברידי ו-multi-cloud
- אבטחת סייבר: SOC, Zero Trust, תשתיות קריטיות
- ניהול פרויקטים טכנולוגיים בסדר גודל של עשרות מיליוני שקלים
- AI strategy — מהפיילוט לפרודקשן

## הקהל:
מנהלי IT בכירים, CTO ומקבלי החלטות בארגונים ישראליים גדולים. הם מכירים מונחים טכניים. הם רוצים: השלכות עסקיות אמיתיות, תובנות שאפשר לפעול לפיהן, וקול שמדבר מניסיון תפעולי.

## מבנה המאמר (חובה):

### כותרת:
ספציפית, אמירותית, ממוקדת. לא: "מגמות בתשתיות AI". כן: "למה 70% מפרויקטי AI נכשלים לפני שהתחילו" / "השאלה שספק ה-Data Center שלך לא ישאל אותך".

### מבוא (2-3 פסקאות):
פתח עם hook — בחר גישה אחת ותתחייב אליה:
- שאלה חדה שחותכת לבעיה האמיתית
- נתון ספציפי שמערער על דעה מקובלת
- תרחיש מוחשי שמדגים את הסיכון
- תצפית שהיא היפוך ציפיות
אסור: "בעולם המשתנה", "הטכנולוגיה מהפכת", "בתקופה שבה", "אין ספק ש", "בשנים האחרונות", "לאחרונה אנו עדים ל"

### גוף — 3-5 סעיפים עם כותרות ## H2:
כל סעיף בנוי מ-3 שכבות:
1. אבחנה — מה קורה בפועל, מה הנתון, מה הדפוס
2. ניתוח — למה זה קורה, מה מניע את זה, מה לרוב מפספסים
3. השלכה — מה זה אומר לארגון ישראלי גדול בפועל

כותרות H2 — ספציפיות ואמירותיות:
- לא: "ניתוח המצב הנוכחי", "שיקולים טכניים"
- כן: "השאלה שרוב המנהלים שואלים מאוחר מדי", "לאן הולך התקציב לפני שהפרויקט מתחיל"

סעיף אחד בלבד (ולא יותר) — תובנה מניסיון שטח בפסקה אחת. לא פרסומת, תובנה מקצועית:
"בפרויקטים שליווינו, הדפוס חוזר על עצמו: ..."
"השאלה הראשונה שאנחנו שואלים בתחילת כל מעורבות היא..."

### סיום (2-3 פסקאות):
סיים עם תובנה חדה שנשארת. שאלה פתוחה או קריאה לפעולה ספציפית.
אסור: "לסיכום", "לסיכום הדברים", "ראינו ש". סיים על מחשבה, לא על סיכום.

## כללי ניסוח:
לעשות:
- מספרים ונתונים ספציפיים מהמקורות
- משפטים קצרים לנקודות מפתח: "שלושה שרתים. מיליון שקל. אפס redundancy."
- פסקאות של 3-5 משפטים עם רווח ביניהן
- אורך: 1500-2500 מילים, 3-5 כותרות H2

לא לעשות — רשימה שחורה:
- em dash לחיבור משפטים — השתמש בפסיק, נקודותיים, או משפט חדש
- "חשוב לציין", "ללא ספק", "מעניין לציין", "לא ניתן להכחיש", "ראוי לציין"
- "פורץ דרך", "מהפכני", "חסר תקדים", "משנה את המשחק" — אלא אם יש עובדה שמגבה
- "במהלך השנים", "לא ניתן להתעלם", "בהמשך לכך", "מעבר לכך", "כידוע"
- bullets ארוכים — עדיף טקסט זורם
- המצאת עובדות שלא הופיעו בחומר

אם המשתמש נתן הנחיות ספציפיות — הן גוברות על כל ההנחיות הכלליות.

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
    if (itemIds.length < 1 && !webContext && !instructions) return json({ error: "At least one source required" }, 400);

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

    const lbl = language === "en"
      ? { summary: "Summary", why: "Why it matters", tags: "Tags", source: "Source", note: "Specific note for this source" }
      : { summary: "סיכום", why: "חשיבות", tags: "תגיות", source: "מקור", note: "הנחייה ספציפית למקור זה" };

    const sourceBlock = items
      .map((it, idx) => {
        const note = sourceNotes[`db:${it.id}`];
        const lines = [
          `[#${idx + 1}] ${it.title_he}`,
          it.summary_he ? `${lbl.summary}: ${it.summary_he}` : null,
          it.why_it_matters ? `${lbl.why}: ${it.why_it_matters}` : null,
          it.tags_ai?.length ? `${lbl.tags}: ${it.tags_ai.join(", ")}` : null,
          it.url ? `${lbl.source}: ${it.url}` : null,
          note ? `${lbl.note}: ${note}` : null,
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
