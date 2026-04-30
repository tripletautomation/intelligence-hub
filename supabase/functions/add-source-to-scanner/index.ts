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

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url;
  }
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
    const { name, url, category } = body as {
      name?: string;
      url?: string;
      category?: string;
    };

    if (!url) return json({ error: "url is required" }, 400);

    const baseUrl = extractDomain(url);
    const sourceName = (name ?? baseUrl).slice(0, 120);
    const cat = ["events", "industry_news", "research"].includes(category ?? "")
      ? category!
      : "events";

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Check for duplicate by base domain URL
    const { data: existing } = await admin
      .from("sources")
      .select("id")
      .eq("url", baseUrl)
      .maybeSingle();

    if (existing) {
      return json({ source_id: existing.id, already_existed: true });
    }

    const { data: inserted, error } = await admin
      .from("sources")
      .insert({
        name: sourceName,
        display_name: sourceName,
        url: baseUrl,
        type: "page",
        category: cat,
        active: true,
        status: "pending",
        region: "global",
        priority: 5,
      })
      .select("id")
      .single();

    if (error) throw error;

    return json({ source_id: inserted.id, already_existed: false });
  } catch (e) {
    console.error("add-source-to-scanner error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
