// RSS auto-detection helper.
// Given a site URL (or RSS URL), tries:
//   1. the URL itself
//   2. common RSS path patterns
//   3. <link rel="alternate" type="application/rss+xml|atom+xml"> in the HTML <head>
// Returns one of: valid | invalid | not_found | manual_review.
// Admin-only (requires authenticated user; UI further checks admin role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const UA = "DC-Intel-Bot/1.0 (+lovable; detect-rss)";
const TIMEOUT_MS = 7000;

const COMMON_PATHS = [
  "/rss", "/feed", "/rss.xml", "/feed.xml", "/atom.xml",
  "/rss/", "/feed/", "/index.xml", "/blog/rss", "/blog/feed",
  "/news/rss", "/news/feed",
];

type Outcome =
  | { result: "valid"; rss_url: string; item_count: number; via: "input" | "pattern" | "alternate" }
  | { result: "invalid"; rss_url: string; reason: string }
  | { result: "not_found"; tried: string[] }
  | { result: "manual_review"; reason: string };

const fetchSafe = async (url: string, accept = "*/*") => {
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, "Accept": accept },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
};

const looksLikeFeed = (xml: string) =>
  /<rss[\s>]/i.test(xml) || /<feed[\s>]/i.test(xml) || /<rdf:RDF/i.test(xml);

const countItems = (xml: string) =>
  (xml.match(/<item[\s>]/gi)?.length ?? 0) + (xml.match(/<entry[\s>]/gi)?.length ?? 0);

const tryAsFeed = async (url: string): Promise<{ ok: true; item_count: number } | { ok: false; reason: string }> => {
  const r = await fetchSafe(url, "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*");
  if (!r) return { ok: false, reason: "fetch_failed" };
  if (!r.ok) return { ok: false, reason: `http_${r.status}` };
  const text = (await r.text()).slice(0, 200_000);
  if (!looksLikeFeed(text)) return { ok: false, reason: "not_a_feed" };
  return { ok: true, item_count: countItems(text) };
};

const extractAlternateLinks = (html: string, baseUrl: string): string[] => {
  const out: string[] = [];
  // Match <link ... rel="alternate" ... type="application/rss+xml|atom+xml" ... href="...">
  const linkRe = /<link\b[^>]*>/gi;
  const matches = html.match(linkRe) ?? [];
  for (const tag of matches) {
    if (!/rel\s*=\s*["']?alternate["']?/i.test(tag)) continue;
    if (!/type\s*=\s*["'](application\/(rss|atom)\+xml|application\/xml|text\/xml)["']/i.test(tag)) continue;
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    try {
      out.push(new URL(hrefMatch[1], baseUrl).toString());
    } catch { /* ignore */ }
  }
  // dedupe, preserve order
  return [...new Set(out)];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url } = await req.json().catch(() => ({ url: "" }));
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || url.length > 1000) {
      const outcome: Outcome = { result: "manual_review", reason: "invalid_url" };
      return new Response(JSON.stringify(outcome), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tried: string[] = [];

    // Step 1: try the URL as-is
    tried.push(url);
    const direct = await tryAsFeed(url);
    if (direct.ok) {
      const outcome: Outcome = { result: "valid", rss_url: url, item_count: direct.item_count, via: "input" };
      return new Response(JSON.stringify({ ...outcome, tried }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: try common RSS paths off the origin
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      const outcome: Outcome = { result: "manual_review", reason: "invalid_url" };
      return new Response(JSON.stringify({ ...outcome, tried }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const path of COMMON_PATHS) {
      const candidate = origin + path;
      if (tried.includes(candidate)) continue;
      tried.push(candidate);
      const r = await tryAsFeed(candidate);
      if (r.ok) {
        const outcome: Outcome = { result: "valid", rss_url: candidate, item_count: r.item_count, via: "pattern" };
        return new Response(JSON.stringify({ ...outcome, tried }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Step 3: fetch HTML and look for <link rel="alternate"> feeds
    const htmlResp = await fetchSafe(url, "text/html,*/*");
    if (htmlResp && htmlResp.ok) {
      const ct = htmlResp.headers.get("content-type") ?? "";
      const html = (await htmlResp.text()).slice(0, 300_000);
      if (/html|xml/i.test(ct) || /<html[\s>]/i.test(html)) {
        const alternates = extractAlternateLinks(html, url);
        for (const candidate of alternates) {
          if (tried.includes(candidate)) continue;
          tried.push(candidate);
          const r = await tryAsFeed(candidate);
          if (r.ok) {
            const outcome: Outcome = { result: "valid", rss_url: candidate, item_count: r.item_count, via: "alternate" };
            return new Response(JSON.stringify({ ...outcome, tried }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
    }

    // If the original URL responded but wasn't a feed, mark invalid; otherwise not_found.
    const outcome: Outcome =
      direct.reason && direct.reason.startsWith("http_")
        ? { result: "not_found", tried }
        : direct.reason === "not_a_feed"
          ? { result: "not_found", tried }
          : { result: "not_found", tried };

    return new Response(JSON.stringify(outcome), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ result: "manual_review", reason: e instanceof Error ? e.message : "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
