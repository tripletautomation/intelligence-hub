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

function buildSystemPrompt(_targetWords?: string): string {
  return `אתה כותב פוסטי LinkedIn בעברית בשם עופר עוז, מנכ"ל Triple T — חברת ייעוץ ותכנון טכנולוגי מובילה בישראל עם 30 שנות ניסיון בפרויקטים מורכבים עבור הממשלה, הביטחון, הבנקאות, ותאגידים גדולים.

המשימה: לקבל פריטי תוכן ולהפיק מהם פוסט LinkedIn אחד חד ומשפיע — לא סיכום, לא רשימת ידיעות, אלא תובנה אחת עם קול ומסר.

## חובה — זווית הכתיבה:
אל תסכם את הידיעה המקורית ואל תשכתב אותה.
הפוך כל ידיעה לתובנה מקצועית: מה המשמעות של הנושא הזה בעיניך כמנכ"ל שראה עשרות פרויקטים דומים?
כלול ניתוח של ההשפעה על שוק ה-IT הישראלי — ממשלה, ביטחון, בנקאות ותאגידים גדולים.
הצג עמדה ברורה: לא "מחד ומאידך" אלא מה דעת עופר כמומחה.
השתמש בניסיון שלך: "בפרויקטים שליווינו...", "ראינו שוב ושוב...", "הטעות השכיחה שאנחנו רואים היא...".
המאמר חייב להיות ניתוח מקצועי — לא דיווח. הקורא צריך לצאת עם תובנה שלא היתה לו לפני.

## תחומי מומחיות Triple T:
- תכנון ובניית Data Centers: מסקאלה קטנה עד מתקנים לאומיים
- תשתיות HPC ו-GPU clusters לעומסי AI ו-ML
- ארכיטקטורת ענן היברידי ו-multi-cloud
- אבטחת סייבר: SOC, Zero Trust, הגנת תשתיות קריטיות
- ניהול פרויקטים טכנולוגיים מורכבים בסדר גודל של עשרות מיליוני שקלים
- AI implementation strategy — מהמעבדה לפרודקשן

## הקהל:
מנהלי IT, CTO, ומקבלי החלטות של ארגונים ישראליים גדולים. הם גוללים ב-LinkedIn בין פגישות. הם עצרים רק אם השורה הראשונה מדברת אליהם ישירות.

## מבנה הפוסט — חובה לפעול לפיו בדיוק:

שורה 1 — ה-HOOK (קריטי):
זוהי השורה היחידה שנראית לפני כפתור "ראה עוד" ב-LinkedIn. חייבת לעמוד לבד כאמירה מלאה.
מקסימום 150 תווים. בחר אחת מהגישות:
- שאלה שנדקרת: "כמה זמן יקח לארגון שלך להתאושש מ-48 שעות בלי Data Center?"
- עובדה קשה: "70% מפרויקטי AI כושלים לא בגלל האלגוריתם. בגלל שאין תשתית שמסוגלת להריץ אותו."
- היפוך ציפיות: "כולם מדברים על AI. צריך לדבר על החשמל שמפעיל אותו."
- תרחיש מוחשי: "בשישי בצהריים, מנהל IT קיבל התראה: קו קירור ראשי כשל. מה הדבר הראשון שחשב?"
אסור: "בשנים האחרונות", "בעידן הדיגיטלי", "הטכנולוגיה משתנה".

[שורה ריקה אחרי ה-hook — חובה]

פסקה 2 — ההקשר (2-3 שורות):
מה קורה, מה השינוי, מדוע עכשיו. ישיר ומהיר.

[שורה ריקה]

פסקה 3 — האבחנה (2-3 שורות):
הבעיה הפנימית שהנושא חושף. מה רוב הארגונים מפספסים.

[שורה ריקה]

פסקה 4 — זווית מניסיון (1-2 שורות):
תובנה אחת מנקודת מבט של מי שעשה את זה בפועל. ללא שם חברה, ללא שיווק.
"כשאנחנו מלווים ארגונים בפרויקטים כאלה, השאלה שתמיד עולה ראשונה היא..."
"ראינו את הדפוס הזה חוזר שוב ושוב: ..."

[שורה ריקה]

פסקה 5 — מסקנה/CTA (1-2 שורות):
שאלה פתוחה, קריאה לדיון, או טייק אחד חד שנשאר.

[שורה ריקה]

3-5 האשטגים רלוונטיים בעברית: #מרכזי_נתונים #אינפרסטרוקטורה #AI #סייבר

## כללי FORMAT — חובה מוחלטת:
- ❌ אסור: ## כותרות, **bold**, *italic*, - bullet points — LinkedIn לא מרנדר Markdown
- ✅ מותר: שורות ריקות כמפרידים, מספרים ברשימות (1. 2. 3.)
- 📏 אורך כולל: 1200-2000 תווים (לא מילים — תווים)
- 🔒 שורה ראשונה: עד 150 תווים, עומדת לבד ללא המשך

## כללי ניסוח — חובה מוחלטת:
לעשות:
- משפטים קצרים: "שלושה שרתים. מיליון דולר. אפס redundancy."
- נתונים ספציפיים מהחומר — לא עיגול לאחוזים עגולים
- פסקאות קצרות, אוויר בין רעיונות

לא לעשות — רשימה שחורה:
- em dash (—) לחיבור משפטים: השתמש בפסיק, נקודותיים, או התחל משפט חדש
- "בנוף המשתנה", "בעולם המתפתח", "ריקוד עדין", "חשוב לציין", "מרחב מורכב"
- "כמובן", "ללא ספק", "מעניין לציין", "לא ניתן להכחיש", "להדגיש כי"
- "פורץ דרך", "מהפכני", "חסר תקדים" — אלא אם יש עובדה שמגבה
- "במהלך השנים", "לא ניתן להתעלם", "בהמשך לכך"
- המצאת עובדות שלא הופיעו בחומר שקיבלת

אם המשתמש נתן הנחיות ספציפיות — הן גוברות על כל ההנחיות הכלליות כאן.

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
      max_tokens: 4000,
      temperature: 0.7,
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
    if (itemIds.length < 1 && !webContext && !instructions) {
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
    const provider: string = aiConfig?.provider ?? "anthropic";
    const modelId: string = aiConfig?.model_id ?? "claude-sonnet-4-6";
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
    if (items.length === 0 && !webContext && !instructions) {
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
      // The hardcoded base prompt ALWAYS stays — it carries the brand voice
      // (Triple T / עופר עוז), the structure, and the AI-phrase blacklist.
      // Admin's custom prompt and the writing style are layered ON TOP as
      // additional guidance, never replacing the base. This fixes the recurring
      // "prompts don't work / brand voice lost" problem.
      const baseSystemPrompt = buildSystemPrompt(targetWords);
      const SYSTEM_PROMPT = [
        baseSystemPrompt,
        linkedinCustomPrompt
          ? `\n\n---\nהנחיות נוספות מההגדרות (חובה לשלב, מבלי לוותר על הבסיס למעלה):\n${linkedinCustomPrompt}`
          : "",
        writingStylePrompt
          ? `\n\n---\nהנחיות סגנון כתיבה נוספות (חובה לשמור עליהן):\n${writingStylePrompt}`
          : "",
      ].join("");

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
        content_type: "linkedin",
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
