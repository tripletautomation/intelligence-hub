import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function buildImagePrompt(title: string, intro: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write DALL-E 3 image prompts for Triple T — a premium Israeli tech consulting firm. " +
            "Always apply the TripleT visual identity: deep charcoal (#1A1F2E) or dark navy (#0D1B2A) background; " +
            "electric blue / cyan glow accent (#00A8FF) on highlights, light streaks, or edge-lit surfaces; " +
            "cinematic single-source rim lighting with deep dramatic shadows; " +
            "bottom-left 15% of frame left clean and dark for text overlay. " +
            "Subject must be specific to the article topic: data centers → server racks / cooling pipes / fiber bundles; " +
            "AI/HPC → GPU clusters / heat-sink arrays; cybersecurity → SOC monitors / data-flow streams; cloud → aerial data-center campus at night. " +
            "Style anchor: 'dark premium tech editorial photography, cinematic blue-electric accent glow, deep dramatic shadows, ultra-sharp 4K, award-winning commercial photography, shot on Hasselblad H6D'. " +
            "Forbidden: white backgrounds, people, faces, hands, generic office stock, bright cheerful tones. " +
            "Return 2-3 sentences only — the image prompt itself, nothing else.",
        },
        {
          role: "user",
          content: `Article title: ${title}\nIntro: ${(intro ?? "").slice(0, 400)}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`GPT error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

async function generateImage(prompt: string, size: "1792x1024" | "1024x1024", apiKey: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size,
      quality: "standard",
      response_format: "url",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as any)?.error?.message ?? `DALL-E error ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error("DALL-E לא החזיר תמונה");
  return url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const draftId: string = body?.draft_id;
    if (!draftId) return json({ error: "draft_id is required" }, 400);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY missing" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: draft, error: draftErr } = await admin
      .from("article_drafts")
      .select("title,intro,body")
      .eq("id", draftId)
      .maybeSingle();

    if (draftErr) return json({ error: draftErr.message }, 500);
    if (!draft) return json({ error: "Draft not found" }, 404);

    const prompt = await buildImagePrompt(draft.title ?? "", draft.intro ?? "", apiKey);

    // Generate landscape and square in parallel
    const [landscape_url, square_url] = await Promise.all([
      generateImage(prompt, "1792x1024", apiKey),
      generateImage(prompt, "1024x1024", apiKey),
    ]);

    return json({ landscape_url, square_url, prompt });
  } catch (e) {
    console.error("generate-social-images error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
