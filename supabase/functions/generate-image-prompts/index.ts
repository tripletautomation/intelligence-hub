import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ImageType = "hero" | "square" | "newsletter" | "infographic";

const IMAGE_SPECS: Record<ImageType, { ratio: string; usage: string; dimensions: string }> = {
  hero: { ratio: "16:9", usage: "blog article header image", dimensions: "1792x1024" },
  square: { ratio: "1:1", usage: "LinkedIn and social media post", dimensions: "1024x1024" },
  newsletter: { ratio: "3:1", usage: "email newsletter header banner", dimensions: "1536x512" },
  infographic: { ratio: "4:5", usage: "data visualization and infographic", dimensions: "1024x1280" },
};

// Brand anchor shared by all image types
const BRAND_ANCHOR = `Triple T brand aesthetic: dark charcoal or deep navy background, dramatic cinematic lighting, electric blue accent glow on edges and highlights, ultra-sharp 4K resolution, dark premium tech photography style, deep dramatic shadows, award-winning commercial photography look, shot on Hasselblad medium format camera.`;

function buildImagePromptSystem(imageType: ImageType, customPrompt: string): string {
  const spec = IMAGE_SPECS[imageType];

  const typeGuidance: Record<ImageType, string> = {
    hero: `The image is a HERO banner for a blog article (aspect ratio ${spec.ratio}, ${spec.dimensions}px).
Subject should be visually impactful and related to the article topic — data center server rows, GPU clusters, fiber optic cables, or abstract tech infrastructure.
Composition: wide, cinematic, subject centered or rule-of-thirds. Leave breathing room for text overlay.
Style: ${BRAND_ANCHOR}`,

    square: `The image is a SQUARE social media post (aspect ratio ${spec.ratio}, ${spec.dimensions}px).
Subject must be immediately recognizable at small sizes — strong focal point, bold contrast.
Composition: centered, minimal clutter, high visual impact.
Style: ${BRAND_ANCHOR}`,

    newsletter: `The image is a NEWSLETTER HEADER BANNER (aspect ratio ${spec.ratio}, ${spec.dimensions}px).
Wide and thin format. Subject should work as a panoramic strip — abstract tech patterns, server room aerial view, or network visualization.
Composition: horizontal flow, subtle and professional.
Style: ${BRAND_ANCHOR}`,

    infographic: `The image is an INFOGRAPHIC VISUAL (aspect ratio ${spec.ratio}, ${spec.dimensions}px).
Vertical format. Incorporate data visualization aesthetics — graphs, charts, network nodes, or structured data flows.
Design should look editorial and professional, not generic stock photo.
Style: ${BRAND_ANCHOR}`,
  };

  const base = `You are an expert AI image prompt engineer specializing in professional tech and B2B content.
Generate a highly detailed, specific image generation prompt for ${spec.usage}.

${typeGuidance[imageType]}

The prompt you write will be fed directly into DALL-E 3 or Gemini Imagen.
Requirements:
- Write in English, 100-180 words
- Be specific about subject, lighting, composition, color palette, camera angle
- Reference the article content to make the image thematically relevant
- Do NOT include text overlays, logos, or people's faces
- Do NOT use generic descriptions like "modern technology" — be specific
- Output ONLY the image prompt text, nothing else`;

  return customPrompt ? `${base}\n\nAdditional brand guidelines:\n${customPrompt}` : base;
}

const EMIT_TOOL = {
  type: "function",
  function: {
    name: "emit_image_prompts",
    description: "Emit generated image prompts for each requested type.",
    parameters: {
      type: "object",
      properties: {
        hero: { type: "string", description: "Hero image prompt (16:9)" },
        square: { type: "string", description: "Square image prompt (1:1)" },
        newsletter: { type: "string", description: "Newsletter header prompt (3:1)" },
        infographic: { type: "string", description: "Infographic prompt (4:5)" },
      },
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
      tool_choice: { type: "function", function: { name: "emit_image_prompts" } },
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
      max_tokens: 2048,
      system: systemPrompt,
      tools: [{
        name: "emit_image_prompts",
        description: EMIT_TOOL.function.description,
        input_schema: EMIT_TOOL.function.parameters,
      }],
      tool_choice: { type: "tool", name: "emit_image_prompts" },
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
      tool_choice: { type: "function", function: { name: "emit_image_prompts" } },
    }),
  });
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
    const draftId: string = body?.draft_id;
    const requestedTypes: ImageType[] = Array.isArray(body?.types)
      ? body.types.filter((t: string) => ["hero", "square", "newsletter", "infographic"].includes(t))
      : ["hero", "square", "newsletter", "infographic"];

    if (!draftId) return json({ error: "draft_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch draft for context
    const { data: draft, error: draftErr } = await admin
      .from("article_drafts")
      .select("title,intro,body,closing")
      .eq("id", draftId)
      .single();
    if (draftErr || !draft) return json({ error: "draft not found" }, 404);

    async function getApiKey(envName: string): Promise<string | undefined> {
      const { data } = await admin.from("admin_api_keys").select("key_value").eq("key_name", envName).maybeSingle();
      return data?.key_value || Deno.env.get(envName);
    }

    // Get AI config (use fast/default model — image prompts don't need heavy models)
    const [defaultConfigRes, ...customPromptResults] = await Promise.all([
      admin.from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle(),
      ...requestedTypes.map((t) =>
        admin.from("prompt_templates").select("system_prompt").eq("id", `image_${t}`).maybeSingle()
      ),
    ]);

    const aiConfig = defaultConfigRes.data;
    const provider: string = aiConfig?.provider ?? "openai";
    const modelId: string = aiConfig?.model_id ?? "gpt-4o-mini";

    const articleContext = [
      `Title: ${draft.title}`,
      draft.intro ? `Intro: ${draft.intro.slice(0, 300)}` : "",
      draft.body ? `Key content: ${draft.body.slice(0, 400)}` : "",
    ].filter(Boolean).join("\n");

    const results: Partial<Record<ImageType, string>> = {};

    for (let i = 0; i < requestedTypes.length; i++) {
      const imageType = requestedTypes[i];
      const customPromptRow = customPromptResults[i];
      const customPrompt: string = (customPromptRow as any)?.data?.system_prompt?.trim() ?? "";

      const systemPrompt = buildImagePromptSystem(imageType, customPrompt);
      const userPrompt = `Generate an image prompt for a ${imageType} (${IMAGE_SPECS[imageType].ratio}) image based on this article:\n\n${articleContext}`;

      try {
        let parsed: Record<string, string>;
        if (provider === "anthropic") {
          const key = await getApiKey("ANTHROPIC_API_KEY");
          if (!key) throw new Error("ANTHROPIC_API_KEY missing");
          parsed = await callAnthropic(modelId, userPrompt, key, systemPrompt);
        } else if (provider === "openai") {
          const key = await getApiKey("OPENAI_API_KEY");
          if (!key) throw new Error("OPENAI_API_KEY missing");
          parsed = await callOpenAI(modelId, userPrompt, key, systemPrompt);
        } else {
          const key = await getApiKey("LOVABLE_API_KEY");
          if (!key) throw new Error("LOVABLE_API_KEY missing");
          parsed = await callLovable(modelId, userPrompt, key, systemPrompt);
        }
        results[imageType] = parsed[imageType] ?? "";
      } catch (e) {
        console.error(`Error generating ${imageType} prompt:`, e);
        results[imageType] = "";
      }
    }

    // Upsert to content_images table
    const upserts = requestedTypes
      .filter((t) => results[t])
      .map((t) => ({
        draft_id: draftId,
        user_id: userId,
        image_type: t,
        prompt: results[t]!,
        updated_at: new Date().toISOString(),
      }));

    if (upserts.length > 0) {
      const { error: upsertErr } = await admin
        .from("content_images")
        .upsert(upserts, { onConflict: "draft_id,image_type" });
      if (upsertErr) console.error("upsert error:", upsertErr);
    }

    return json({ prompts: results });
  } catch (e) {
    console.error("generate-image-prompts fatal", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
