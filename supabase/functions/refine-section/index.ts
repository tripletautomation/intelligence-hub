import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getLightModel(provider: string): string {
  if (provider === "anthropic") return "claude-haiku-4-5-20251001";
  if (provider === "openai") return "gpt-4o-mini";
  return "google/gemini-2.5-pro";
}

type Action = "regenerate" | "expand" | "condense" | "rephrase";
type Tone = "formal" | "analytical" | "concise";
type Section = "intro" | "body" | "closing";

interface RefineRequest {
  draft_id: string;
  section: Section;
  action: Action;
  tone?: Tone;
  article_context: { title: string; intro: string; body: string; closing: string };
}

const SECTION_LABELS: Record<Section, string> = {
  intro: "פתיח",
  body: "גוף המאמר",
  closing: "סיכום",
};

const ACTION_INSTRUCTIONS: Record<Action, string> = {
  regenerate: "כתוב את הקטע מחדש לחלוטין — שמור על המסר אך שנה את הניסוח.",
  expand: "הרחב את הקטע בכ-30-50% — הוסף עומק, דוגמאות או פרספקטיבה נוספת.",
  condense: "קצר את הקטע בכ-30% — שמור רק על הנקודות המרכזיות.",
  rephrase: "נסח מחדש את הקטע — שמור על אותו תוכן אך שנה את המבנה ואת הסגנון.",
};

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  formal: "סגנון רשמי ומקצועי.",
  analytical: "סגנון אנליטי עם דגש על נתונים ומסקנות.",
  concise: "סגנון תמציתי וישיר — כל מילה נחשבת.",
};

async function callAI(
  provider: string,
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  env: { lovable?: string; anthropic?: string; openai?: string },
): Promise<string> {
  if (provider === "anthropic") {
    if (!env.anthropic) throw new Error("ANTHROPIC_API_KEY missing");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.anthropic,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const j = await res.json();
    return j.content?.[0]?.text ?? "";
  }

  if (provider === "openai") {
    if (!env.openai) throw new Error("OPENAI_API_KEY missing");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.openai}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? "";
  }

  // Default: Lovable AI Gateway
  if (!env.lovable) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.lovable}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Lovable AI error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
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

    const body: RefineRequest = await req.json();
    const { draft_id, section, action, tone, article_context } = body;
    const custom_instruction: string | undefined = typeof (body as any).custom_instruction === "string"
      ? (body as any).custom_instruction.trim() || undefined
      : undefined;
    const article_instructions: string | undefined = typeof (body as any).article_instructions === "string"
      ? (body as any).article_instructions.trim() || undefined
      : undefined;

    if (!draft_id || !section || !action) return json({ error: "חסרים פרמטרים" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load draft from DB — fallback if article_context not sent by frontend
    let ctx = article_context;
    if (!ctx?.title && !ctx?.body) {
      const { data: draftRow } = await admin
        .from("article_drafts")
        .select("title,intro,body,closing")
        .eq("id", draft_id)
        .maybeSingle();
      if (!draftRow) return json({ error: "הטיוטה לא נמצאה" }, 404);
      ctx = { title: draftRow.title ?? "", intro: draftRow.intro ?? "", body: draftRow.body ?? "", closing: draftRow.closing ?? "" };
    }

    // Read AI config — use light (fast/cheap) model tier for editing tasks
    const [aiConfigRes, writingStyleRes] = await Promise.all([
      admin.from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle(),
      admin.from("ai_config").select("prompt_text").eq("id", "writing_style").maybeSingle(),
    ]);
    const provider = aiConfigRes.data?.provider ?? "anthropic";
    const modelId = getLightModel(provider);
    const writingStylePrompt: string = writingStyleRes.data?.prompt_text?.trim() ?? "";

    async function getApiKey(envName: string): Promise<string | undefined> {
      const { data } = await admin.from("admin_api_keys").select("key_value").eq("key_name", envName).maybeSingle();
      return data?.key_value || Deno.env.get(envName);
    }

    const sectionLabel = SECTION_LABELS[section];
    const actionInstruction = ACTION_INSTRUCTIONS[action];
    const toneInstruction = tone ? TONE_INSTRUCTIONS[tone] : "";

    const systemPromptBase = `אתה עורך תוכן מקצועי הכותב בעברית רהוטה ומקצועית.
תקבל קטע ממאמר ותבצע עליו פעולת עריכה ספציפית.
החזר את הקטע הערוך בלבד — ללא הסבר, ללא כותרות, ללא מרכאות.`;
    const systemPrompt = writingStylePrompt
      ? `${systemPromptBase}\n\nהנחיות סגנון קבועות (שמור עליהן):\n${writingStylePrompt}`
      : systemPromptBase;

    let effectiveAction = actionInstruction;
    if (action === "rephrase" && custom_instruction) {
      effectiveAction = `נסח מחדש לפי ההנחייה הספציפית הבאה: ${custom_instruction}`;
    } else if (action === "regenerate" && article_instructions) {
      effectiveAction = `כתוב את הקטע מחדש לחלוטין בהתאם להנחיות הבאות של המשתמש:\n${article_instructions}`;
    }

    const sectionText = (ctx as any)[section] ?? ctx.body ?? "";
    const userPrompt = `כותרת המאמר: "${ctx.title}"

קטע לעריכה (${sectionLabel}):
${sectionText}

הקשר — שאר המאמר:
פתיח: ${section !== "intro" ? (ctx.intro?.slice(0, 200) ?? "") : "[זה הקטע הנוכחי]"}
גוף: ${section !== "body" ? (ctx.body?.slice(0, 300) ?? "") : "[זה הקטע הנוכחי]"}
סיכום: ${section !== "closing" ? (ctx.closing?.slice(0, 150) ?? "") : "[זה הקטע הנוכחי]"}

פעולה: ${effectiveAction}
${toneInstruction ? `סגנון: ${toneInstruction}` : ""}

החזר את הקטע הערוך בלבד:`;

    const refined = await callAI(
      provider,
      modelId,
      systemPrompt,
      userPrompt,
      {
        lovable: await getApiKey("LOVABLE_API_KEY"),
        anthropic: await getApiKey("ANTHROPIC_API_KEY"),
        openai: await getApiKey("OPENAI_API_KEY"),
      },
    );

    return json({ refined: refined.trim() });
  } catch (e) {
    console.error("refine-section error", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה לא ידועה" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
