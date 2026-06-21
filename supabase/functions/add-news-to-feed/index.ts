// add-news-to-feed: Promotes a discovered news item to the shared items feed.
// Any authenticated user can add; duplicates (same URL) are silently deduplicated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const item = body?.item as {
      title_he?: string;
      summary_he?: string;
      why_it_matters?: string;
      url?: string;
      source_name?: string | null;
      tags?: string[];
      relevance_score?: number;
      region?: "israel" | "global";
      published_date?: string | null;
    };

    if (!item?.url || !item?.title_he) {
      return json({ error: "item.url and item.title_he are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Check for duplicate URL
    const { data: existing } = await admin
      .from("items")
      .select("id")
      .eq("url", item.url)
      .maybeSingle();

    if (existing) {
      return json({ item_id: existing.id, already_existed: true });
    }

    const { data: inserted, error } = await admin
      .from("items")
      .insert({
        item_type: "news",
        url: item.url,
        title_he: item.title_he,
        summary_he: item.summary_he ?? null,
        why_it_matters: item.why_it_matters ?? null,
        tags_ai: item.tags ?? [],
        relevance_score: item.relevance_score ?? 75,
        region: item.region ?? "global",
        // Use the article's real publication date when available; fall back to
        // ingestion time only if the source provided no parseable date.
        published_at: (() => {
          if (item.published_date) {
            const t = new Date(item.published_date).getTime();
            if (!Number.isNaN(t)) return new Date(t).toISOString();
          }
          return new Date().toISOString();
        })(),
      })
      .select("id")
      .single();

    if (error) throw error;
    return json({ item_id: inserted.id, already_existed: false });

  } catch (e) {
    console.error("add-news-to-feed error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
