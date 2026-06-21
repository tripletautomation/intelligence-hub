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
  instagram: string;
  facebook: string;
  image_prompt: string;
}

async function getApiKey(admin: ReturnType<typeof createClient>, envName: string): Promise<string | undefined> {
  const { data } = await admin.from("admin_api_keys").select("key_value").eq("key_name", envName).maybeSingle();
  return data?.key_value || Deno.env.get(envName);
}

const SYSTEM_PROMPT = `You are a professional LinkedIn content strategist specializing in data centers, cloud infrastructure, and enterprise technology for Triple T — a leading tech consulting firm.
You will receive a Hebrew article and generate 5 outputs via the emit_social_posts tool.

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

3. instagram — Instagram caption in HEBREW:
   - 600-1200 תווים, טון יותר נגיש וסיפורי מלינקדאין אבל עדיין מקצועי
   - שורה ראשונה = hook חזק שעוצר את הגלילה
   - פסקאות קצרות עם רווחים, אפשר אימוג'ים בודדים ומדודים (לא יותר מ-3-4)
   - קריאה לפעולה קצרה בסוף (תגובה / שמירה / שיתוף)
   - 5-10 האשטגים רלוונטיים בסוף (שילוב עברית ואנגלית)

4. facebook — Facebook post in HEBREW:
   - 400-900 תווים, טון שיחתי, מזמין דיון
   - hook פותח → תובנה אחת מרכזית → שאלה פתוחה לקהל בסוף
   - 0-3 האשטגים בלבד (פייסבוק לא אוהב הרבה האשטגים)

5. image_prompt — Image generation prompt in ENGLISH:
   - TripleT visual identity — always apply ALL of these:
     * Background: deep charcoal (#1A1F2E) or dark navy (#0D1B2A) — no exceptions
     * Accent: electric blue / cyan glow (#00A8FF) — used for highlights, light streaks, or edge lighting on the subject
     * Lighting: cinematic single-source rim lighting, dramatic deep shadows
     * Composition: subject centered or rule-of-thirds; leave the bottom-left 15% of frame clean and dark (space for text overlay)
   - The SUBJECT must be specific to the article's topic: data centers → server racks / cooling infrastructure / fiber cable bundles; AI / HPC → GPU clusters / heat sink arrays; cybersecurity → SOC monitors / encrypted data flows; cloud → aerial data-center campus at night
   - Style anchor: "dark premium tech editorial photography, cinematic blue-electric accent glow, deep dramatic shadows, ultra-sharp 4K, award-winning commercial photography, shot on Hasselblad H6D"
   - Do NOT use: white backgrounds, people / faces / hands, generic office stock, bright or cheerful tones, abstract blobs, lens flare on entire frame
   - Length: 130-200 words

Style rules for all text posts (linkedin_en, linkedin_he, instagram, facebook):
- Do NOT use em dash to connect sentences. Use a comma, colon, or start a new sentence instead.
- Do NOT use phrases like: "In today's rapidly evolving landscape", "It's worth noting", "Needless to say"
- Write direct, sharp, human — not AI-sounding

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
    linkedin_en: "1300-1800 characters, English, professional tone, 3-5 English hashtags at end",
    linkedin_he: "1300-1800 תווים, עברית, טון מקצועי, 3-5 האשטגים עבריים בסוף",
    instagram: "600-1200 תווים, עברית, טון נגיש וסיפורי, hook בשורה ראשונה, 5-10 האשטגים בסוף",
    facebook: "400-900 תווים, עברית, טון שיחתי, שאלה פתוחה בסוף, 0-3 האשטגים",
    image_prompt: "130-200 words, detailed scene description for AI image generator, English",
  };
  const isHebrew = platform === "linkedin_he" || platform === "instagram" || platform === "facebook";
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
  instructions?: string,
): Promise<SocialPosts> {
  const userPrompt = [
    instructions ? `Article writing instructions (use to guide tone and angle of posts):\n${instructions}\n` : "",
    `Article title: ${article.title}`,
    ``,
    `Intro (Hebrew): ${article.intro}`,
    ``,
    `Body (Hebrew): ${article.body}`,
    ``,
    `Closing (Hebrew): ${article.closing}`,
    ``,
    `Generate all 5 outputs as specified.`,
  ].join("\n");

  const tool = {
    type: "function",
    function: {
      name: "emit_social_posts",
      description: "Emit LinkedIn EN, LinkedIn HE, Instagram (HE), Facebook (HE), and Image Prompt",
      parameters: {
        type: "object",
        properties: {
          linkedin_en: { type: "string", description: "LinkedIn post in English — 1300-1800 chars, professional thought-leadership, 3-5 English hashtags" },
          linkedin_he: { type: "string", description: "LinkedIn post in Hebrew — 1300-1800 chars, professional thought-leadership, 3-5 Hebrew hashtags" },
          instagram: { type: "string", description: "Instagram caption in Hebrew — 600-1200 chars, accessible storytelling tone, hook first line, 5-10 hashtags" },
          facebook: { type: "string", description: "Facebook post in Hebrew — 400-900 chars, conversational, opens a discussion, ends with an open question, 0-3 hashtags" },
          image_prompt: { type: "string", description: "Detailed image generation prompt in English — 130-200 words, TripleT visual identity" },
        },
        required: ["linkedin_en", "linkedin_he", "instagram", "facebook", "image_prompt"],
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
        max_tokens: 4000,
        temperature: 0.7,
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
    const instructions: string | undefined = typeof body?.instructions === "string" && body.instructions.trim()
      ? body.instructions.trim() : undefined;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load article
    const { data: draft, error: draftErr } = await admin
      .from("article_drafts").select("title,intro,body,closing").eq("id", draftId).maybeSingle();
    if (draftErr || !draft) return json({ error: "draft not found" }, 404);

    // Load AI config. Use the full default model (Sonnet) for the multi-platform
    // generation — quality matters across 5 outputs — and a cheaper light model
    // only for single-post refinement edits.
    const { data: aiConfig } = await admin
      .from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle();
    const provider = aiConfig?.provider ?? "anthropic";
    const fullModelId = aiConfig?.model_id ?? "claude-sonnet-4-6";
    const lightModelId = getLightModel(provider);

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
      const refined = await refineSinglePost(refinePlatform, currentContent, refineInstruction, draft as any, apiKey, provider, lightModelId);
      await admin.from("social_posts").upsert(
        { draft_id: draftId, user_id: userId, platform: refinePlatform, content: refined, updated_at: new Date().toISOString() },
        { onConflict: "draft_id,platform" },
      );
      return json({ posts: { [refinePlatform]: refined } });
    }

    const posts = await generatePosts(draft as any, apiKey, provider, fullModelId, instructions);

    const rows = (["linkedin_en", "linkedin_he", "instagram", "facebook", "image_prompt"] as const).map((platform) => ({
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
