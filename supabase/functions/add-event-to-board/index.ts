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
    const ev = body?.event as {
      title?: string;
      event_date?: string | null;
      location?: string | null;
      is_online?: boolean;
      source_name?: string | null;
      source_url?: string;
      summary?: string;
      why_it_matters?: string;
    };

    if (!ev?.source_url || !ev?.title) {
      return json({ error: "event.source_url and event.title are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Check for duplicate by URL
    const { data: existing } = await admin
      .from("items")
      .select("id")
      .eq("url", ev.source_url)
      .eq("item_type", "event")
      .maybeSingle();

    if (existing) {
      return json({ item_id: existing.id, already_existed: true });
    }

    const { data: inserted, error } = await admin
      .from("items")
      .insert({
        item_type: "event",
        url: ev.source_url,
        title_he: ev.title,
        summary_he: ev.summary ?? null,
        why_it_matters: ev.why_it_matters ?? null,
        event_date: ev.event_date ?? null,
        event_location: ev.location ?? null,
        event_is_online: ev.is_online ?? false,
        event_register_url: ev.source_url,
        region: ev.is_online ? "global" : null,
        published_at: new Date().toISOString(),
        relevance_score: 70,
      })
      .select("id")
      .single();

    if (error) throw error;

    return json({ item_id: inserted.id, already_existed: false });
  } catch (e) {
    console.error("add-event-to-board error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
