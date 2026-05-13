// generate-social-posts: LinkedIn English, LinkedIn Hebrew, Image Prompt
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
  linkedin_en: string;
  linkedin_he: string;
  image_prompt: string;
}

async function getApiKey(admin: ReturnType<typeof createClient>, envName: string): Promise<string | undefined> {
  const { data } = await admin.from("admin_api_keys").select("key_value").eq("key_name", envName).maybeSingle();
  return data?.key_value || Deno.env.get(envName);
}

const SYSTEM_PROMPT = `You are a professional LinkedIn content strategist specializing in data centers, cloud infrastructure, and enterprise technology for Triple T — a leading tech consulting firm.
You will receive a Hebrew article and generate 3 outputs via the emit_social_posts tool.

LinkedIn Best Practices to follow:
- First line is CRITICAL — it must be a compelling hook (question, surprising fact, bold statement) that appears before "see more"
- Use short paragraphs (2-3 lines max) with blank lines between them — NEVER a wall of text
- Write conversationally but professionally
- 3-5 hashtags at the end only
- Ideal length: 1300-1800 characters

1. linkedin_en — LinkedIn post in ENGLISH:
   - 1300-1800 characters
   - Thought leadership tone from the perspective of an industry expert
   - Hook first line → insight → supporting points → call to reflection
   - Blank lines between paragraphs (\\n\\n)
   - 3-5 relevant English hashtags at the end

2. linkedin_he — LinkedIn post in HEBREW:
   - 1300-1800 תווים
   - אותה מבנה: hook → תובנה → נקודות תומכות → סיום חד
   - רווחים בין פסקאות (\\n\\n) — לא גוש טקסט אחד
   - 3-5 האשטגים עבריים בסוף בלבד

3. image_prompt — Image generation prompt in ENGLISH:
   - Detailed, vivid prompt for Midjourney / DALL-E / Stable Diffusion
   - Describe scene, mood, style, composition, lighting
   - Visually represents the article's core theme
   - Style keywords: "professional photography", "corporate", "tech", "cinematic"
   - 100-200 words

Return ONLY via the emit_social_posts tool. No free text.`;

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
    linkedin_en: "1000-1500 characters, English, professional tone, 2-3 English hashtags at end",
    linkedin_he: "1000-1500 תווים, עברית, טון מקצועי, 2-3 האשטגים עבריים בסוף",
    image_prompt: "100-200 words, detailed scene description for AI image generator, English",
  };
  const isHebrew = platform === "linkedin_he";
  const sys = isHebrew
    ? `אתה מומחה שיווק דיגיטלי. ערוך את הפוסט לפי הנחיה ספציפית.\nהחזר את הפוסט המעודכן בלבד.\nמגבלות: ${PLATFORM_LIMITS[platform] ?? ""}`
    : `You are a digital marketing expert. Edit the post according to the specific instruction.\nReturn only the updated post.\nConstraints: ${PLATFORM_LIMITS[platform] ?? ""}`;
  const userPrompt = `Article title: "${article.title}"
Intro: ${(article.intro ?? "").slice(0, 200)}

Current ${platform} post:
${currentContent}

Edit instruction: ${instruction}

Return only the updated post:`;

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
  if (!text) throw new Error("AI did not return a result");
  return text.trim();
}

async function generatePosts(
  article: { title: string; intro: string; body: string; closing: string },
  apiKey: string,
  provider: string,
  modelId: string,
): Promise<SocialPosts> {
  const userPrompt = `Article title: ${article.title}

Intro (Hebrew): ${article.intro}

Body (Hebrew): ${article.body}

Closing (Hebrew): ${article.closing}

Generate all 3 outputs as specified.`;

  const tool = {
    type: "function",
    function: {
      name: "emit_social_posts",
      description: "Emit LinkedIn EN, LinkedIn HE, and Image Prompt",
      parameters: {
        type: "object",
        properties: {
          linkedin_en: { type: "string", description: "LinkedIn post in English — 1000-1500 chars, professional, 2-3 English hashtags" },
          linkedin_he: { type: "string", description: "LinkedIn post in Hebrew — 1000-1500 chars, professional, 2-3 Hebrew hashtags" },
          image_prompt: { type: "string", description: "Detailed image generation prompt in English — 100-200 words for Midjourney/DALL-E" },
        },
        required: ["linkedin_en", "linkedin_he", "image_prompt"],
        additionalProperties: false,
      },
    },
  };

  let argsJson: string;

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
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
    if (!toolUse?.input) throw new Error("AI did not return a valid result");
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

  if (!argsJson) throw new Error("AI did not return a valid result");
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

    // Load AI config — use light model for social formatting
    const { data: aiConfig } = await admin
      .from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle();
    const provider = aiConfig?.provider ?? "openai";
    const modelId = getLightModel(provider);

    const apiKey = await getApiKey(admin,
      provider === "anthropic" ? "ANTHROPIC_API_KEY" :
      provider === "openai" ? "OPENAI_API_KEY" :
      "LOVABLE_API_KEY"
    );
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

    const rows = (["linkedin_en", "linkedin_he", "image_prompt"] as const).map((platform) => ({
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
