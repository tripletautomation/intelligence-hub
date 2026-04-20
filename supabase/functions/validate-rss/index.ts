// Lightweight RSS URL validator — fetches the URL and checks it parses as a feed.
// Admin-only (requires authenticated user; the UI further checks admin role before calling).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url } = await req.json().catch(() => ({ url: "" }));
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || url.length > 1000) {
      return new Response(JSON.stringify({ valid: false, reason: "invalid_url" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: { "User-Agent": "DC-Intel-Bot/1.0 (+lovable; validate)" },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ valid: false, reason: "fetch_failed", message: e instanceof Error ? e.message : String(e) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ valid: false, reason: "http_error", status: resp.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const xml = (await resp.text()).slice(0, 200_000);
    const looksLikeFeed =
      /<rss[\s>]/i.test(xml) || /<feed[\s>]/i.test(xml) || /<rdf:RDF/i.test(xml);
    if (!looksLikeFeed) {
      return new Response(
        JSON.stringify({ valid: false, reason: "not_a_feed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const itemCount =
      (xml.match(/<item[\s>]/gi)?.length ?? 0) + (xml.match(/<entry[\s>]/gi)?.length ?? 0);

    return new Response(
      JSON.stringify({ valid: true, item_count: itemCount, content_type: resp.headers.get("content-type") }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ valid: false, reason: "server_error", message: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
