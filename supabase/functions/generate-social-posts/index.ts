// generate-social-posts: Convert an article draft into 4 platform-specific posts (Hebrew)
// Saves results to public.social_posts (upsert by draft_id + platform)

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

interface SocialPosts {
  linkedin: string;
  facebook: string;
  instagram: string;
  twitter: string;
}

const SYSTEM_PROMPT = `אתה מומחה שיווק דיגיטלי המתמחה בתחום הטכנולוגיה ומרכזי הנתונים.
קבלת מאמר מקצועי ועליך להפוך אותו ל-4 פוסטים ייעודיים לרשתות חברתיות — כולם בעברית.

כללים לכל פלטפורמה:
- LinkedIn: 800-1200 תווים. Thought Leadership מקצועי. ציר מרכזי ברור. 3-5 hashtags רלוונטיים בסוף.
- Facebook: 400-600 תווים. טון חם ונגיש. שאלה מעניינת בסוף. 0-2 hashtags.
- Instagram: 120-250 תווים. ויזואלי ותמציתי. 15-20 hashtags רלוונטיים בשורה נפרדת.
- X/Twitter: עד 270 תווים. משפט אחד חד ומחודד + ציטוט/עובדה מרכזית. 1-2 hashtags.

החזר אך ורק דרך הכלי emit_social_posts.`;

async function refineSinglePost(
  platform: string,
  currentContent: string,
  instruction: string,
  article: { title: string; intro: string; body: string; closing: string },
  apiKey: string,
  provider: string,
  modelId: string,
): Promise<string> {
  const PLATFORM_LIMITS: Record<string, string> = {
    linkedin: "800-1200 תווים, hashtags בסוף",
    facebook: "400-600 תווים, שאלה בסוף, 0-2 hashtags",
    instagram: "120-250 תווים + 15-20 hashtags בשורה נפרדת",
    twitter: "עד 270 תווים, חד ומחודד",
  };
  const sys = `אתה מומחה שיווק דיגיטלי. קבלת פוסט ל-${platform} ועליך לערוך אותו לפי הנחיה ספציפית.
החזר את הפוסט המעודכן בלבד — ללא הסבר, ללא מרכאות.
שמור על מגבלות הפלטפורמה: ${PLATFORM_LIMITS[platform] ?? ""}.`;
  const userPrompt = `מאמר מקורי — כותרת: "${article.title}"
פתיח: ${(article.intro ?? "").slice(0, 200)}

פוסט ${platform} נוכחי:
${currentContent}

הנחייה לעריכה: ${instruction}

החזר את הפוסט המעודכן בלבד:`;

  let text = "";
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: modelId, max_tokens: 1024, system: sys, messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
    const j = await res.json();
    text = j?.content?.[0]?.text ?? "";
  } else {
    const baseUrl = provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId, messages: [{ role: "system", content: sys }, { role: "user", content: userPrompt }] }),
    });
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const j = await res.json();
    text = j?.choices?.[0]?.message?.content ?? "";
  }
  if (!text) throw new Error("AI לא החזיר תוצאה");
  return text.trim();
}

async function generatePosts(
  article: { title: string; intro: string; body: string; closing: string },
  apiKey: string,
  provider: string,
  modelId: string,
): Promise<SocialPosts> {
  const userPrompt = `כותרת: ${article.title}

פתיח: ${article.intro}

גוף: ${article.body}

סיכום: ${article.closing}

הפק פוסטים ל-4 פלטפורמות לפי ההנחיות.`;

  const tool = {
    type: "function",
    function: {
      name: "emit_social_posts",
      description: "Emit 4 platform-specific social media posts",
      parameters: {
        type: "object",
        properties: {
          linkedin: { type: "string", description: "פוסט LinkedIn — מקצועי, 800-1200 תווים, hashtags בסוף" },
          facebook: { type: "string", description: "פוסט Facebook — נגיש, 400-600 תווים, שאלה בסוף" },
          instagram: { type: "string", description: "פוסט Instagram — תמציתי, 120-250 תווים + hashtags בשורה נפרדת" },
          twitter: { type: "string", description: "פוסט X/Twitter — עד 270 תווים, חד ומחודד" },
        },
        required: ["linkedin", "facebook", "instagram", "twitter"],
        additionalProperties: false,
      },
    },
  };

  let argsJson: string;

  if (provider === "anthropic") {
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
        system: SYSTEM_PROMPT,
        tools: [{ name: "emit_social_posts", description: tool.function.description, input_schema: tool.function.parameters }],
        tool_choice: { type: "tool", name: "emit_social_posts" },
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const j = await res.json();
    const toolUse = j?.content?.find((b: any) => b.type === "tool_use");
    if (!toolUse?.input) throw new Error("AI לא החזיר תוצאה");
    argsJson = JSON.stringify(toolUse.input);
  } else if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_social_posts" } },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const j = await res.json();
    argsJson = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "";
  } else {
    // Lovable AI Gateway (default)
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_social_posts" } },
      }),
    });
    if (!res.ok) throw new Error(`Lovable AI error ${res.status}: ${await res.text()}`);
    const j = await res.json();
    argsJson = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "";
  }

  if (!argsJson) throw new Error("AI לא החזיר תוצאה תקפה");
  return JSON.parse(argsJson) as SocialPosts;
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
    const draftId: string = body?.draft_id ?? "";
    if (!draftId) return json({ error: "draft_id is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load article
    const { data: draft, error: draftErr } = await admin
      .from("article_drafts").select("title,intro,body,closing").eq("id", draftId).maybeSingle();
    if (draftErr || !draft) return json({ error: "draft not found" }, 404);

    // Load AI config — use light (fast/cheap) model tier for social post formatting
    const { data: aiConfig } = await admin
      .from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle();
    const provider = aiConfig?.provider ?? "openai";
    const modelId = getLightModel(provider);

    const apiKey =
      provider === "anthropic" ? Deno.env.get("ANTHROPIC_API_KEY") :
      provider === "openai" ? Deno.env.get("OPENAI_API_KEY") :
      Deno.env.get("LOVABLE_API_KEY");

    if (!apiKey) return json({ error: `API key missing for provider: ${provider}` }, 500);

    // Refine a single platform post
    const refinePlatform: string | undefined = body?.refine_platform;
    const refineInstruction: string = body?.refine_instruction ?? "";
    const currentContent: string | undefined = body?.current_content;
    if (refinePlatform && currentContent !== undefined) {
      const refined = await refineSinglePost(refinePlatform, currentContent, refineInstruction, draft as any, apiKey, provider, modelId);
      await admin.from("social_posts").upsert(
        { draft_id: draftId, user_id: userId, platform: refinePlatform, content: refined, updated_at: new Date().toISOString() },
        { onConflict: "draft_id,platform" },
      );
      return json({ posts: { [refinePlatform]: refined } });
    }

    const posts = await generatePosts(draft as any, apiKey, provider, modelId);

    // Upsert 4 posts
    const rows = (["linkedin", "facebook", "instagram", "twitter"] as const).map((platform) => ({
      draft_id: draftId,
      user_id: userId,
      platform,
      content: posts[platform],
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await admin
      .from("social_posts")
      .upsert(rows, { onConflict: "draft_id,platform" });

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    return json({ posts });

  } catch (e) {
    console.error("generate-social-posts error", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
