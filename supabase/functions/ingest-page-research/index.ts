// Page-based research ingestion: Firecrawl (render) + Lovable AI (structured extraction)
// - Manual trigger only
// - Targets sources where type='page' and category='research'
// - Stores into public.items with item_type='research'
// - Logs runs to public.ingestion_runs (triggered_by='manual-page-research')

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

interface ExtractedResearch {
  title: string;
  title_he: string;
  summary_he: string;
  why_it_matters_he: string;
  source_link: string;       // absolute URL to the whitepaper/report landing page
  published_at: string | null; // ISO 8601 if known, else null
  topic_tags: string[];
  relevance_score: number;   // 0-100
}

async function firecrawlScrape(url: string): Promise<{ markdown: string; resolvedUrl: string }> {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 2500,
      timeout: 25000,
      proxy: "stealth",
      blockAds: true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Firecrawl http ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const md: string | undefined = data?.data?.markdown ?? data?.markdown;
  if (!md) throw new Error("Firecrawl returned no markdown");
  if (md.length < 500) throw new Error(`Firecrawl returned short markdown (${md.length} chars)`);
  return { markdown: md, resolvedUrl: url };
}

async function extractResearch(
  pageUrl: string,
  markdown: string,
  debug: { raw?: string; mdLen?: number; finishReason?: string; rawArgs?: string },
): Promise<ExtractedResearch[]> {
  debug.mdLen = markdown.length;
  const sys =
    "You extract structured RESEARCH records from a scraped index page (markdown) of whitepapers, reports, studies, or analyses. " +
    "Return ONLY concrete research artifacts (whitepaper / report / study / analysis / industry survey). " +
    "Skip navigation, cookie banners, ads, footers, generic news articles, blog posts, podcasts, videos, and event/conference listings. " +
    "Translate title and summary to Hebrew. Provide a 1-sentence Hebrew 'why it matters' for an Israeli data-center professional. " +
    "Provide 1-5 short topic tags in English (lowercase, no punctuation), e.g. ['cooling','sustainability','ai-workloads']. " +
    "Provide a relevance_score 0-100 for an Israeli data-center / cloud / infrastructure audience. " +
    "If published_at is unknown, set it to null. Use ISO 8601 if possible. " +
    "Resolve relative URLs against the page URL. source_link must be the canonical landing page of the whitepaper/report.";
  const user = `Page URL: ${pageUrl}\n\nPage markdown (truncated):\n${markdown.slice(0, 30000)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "store_research",
            description: "Store the list of extracted research items.",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      title_he: { type: "string" },
                      summary_he: { type: "string" },
                      why_it_matters_he: { type: "string" },
                      source_link: { type: "string" },
                      published_at: { type: ["string", "null"] },
                      topic_tags: { type: "array", items: { type: "string" } },
                      relevance_score: { type: "number" },
                    },
                    required: ["title", "title_he", "summary_he", "why_it_matters_he", "source_link", "published_at", "topic_tags", "relevance_score"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "store_research" } },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limited (429)");
    if (res.status === 402) throw new Error("AI credits exhausted (402)");
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  debug.finishReason = choice?.finish_reason;
  const call = choice?.message?.tool_calls?.[0];
  const rawArgs: string | undefined = call?.function?.arguments;
  debug.rawArgs = rawArgs ? rawArgs.slice(0, 1000) : undefined;
  debug.raw = JSON.stringify({
    finish_reason: choice?.finish_reason,
    has_tool_call: !!call,
    content_preview: typeof choice?.message?.content === "string" ? choice.message.content.slice(0, 300) : null,
  });
  if (!rawArgs) return [];
  try {
    const parsed = JSON.parse(rawArgs);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function safeIso(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function ingestPageSource(source: {
  id: string;
  name: string;
  url: string;
  region: string | null;
}) {
  const { data: runRow, error: runErr } = await admin
    .from("ingestion_runs")
    .insert({
      source_id: source.id,
      source_name: source.name,
      status: "running",
      triggered_by: "manual-page-research",
    })
    .select()
    .single();
  if (runErr) throw runErr;
  const runId = runRow.id;

  const errors: { stage: string; url?: string; message: string }[] = [];
  let fetched = 0, inserted = 0, skipped = 0;

  try {
    const { markdown: md, resolvedUrl } = await firecrawlScrape(source.url);
    const debug: { raw?: string; mdLen?: number; finishReason?: string; rawArgs?: string } = {};
    const items = await extractResearch(resolvedUrl, md, debug);
    fetched = items.length;
    if (items.length === 0) {
      errors.push({
        stage: "ai-empty",
        url: resolvedUrl,
        message: `No research items extracted. md_len=${debug.mdLen} finish=${debug.finishReason} raw=${debug.raw ?? ""} args=${debug.rawArgs ?? ""}`,
      });
    }
    for (const it of items) {
      try {
        if (!it.source_link || !it.title_he) {
          skipped++;
          continue;
        }
        const { data: existing } = await admin
          .from("items")
          .select("id")
          .eq("url", it.source_link)
          .maybeSingle();
        if (existing) {
          skipped++;
          continue;
        }

        const publishedIso = safeIso(it.published_at);
        const score = Math.max(0, Math.min(100, Math.round(it.relevance_score ?? 60)));

        const { error: insErr } = await admin.from("items").insert({
          source_id: source.id,
          item_type: "research",
          region: source.region ?? "global",
          url: it.source_link,
          published_at: publishedIso,
          title_orig: it.title,
          summary_orig: null,
          title_he: it.title_he,
          summary_he: it.summary_he,
          why_it_matters: it.why_it_matters_he,
          tags_ai: Array.isArray(it.topic_tags) ? it.topic_tags.slice(0, 8) : [],
          relevance_score: score,
          is_seed: false,
        });
        if (insErr) {
          if ((insErr as any).code === "23505") skipped++;
          else errors.push({ stage: "insert", url: it.source_link, message: insErr.message });
        } else {
          inserted++;
        }
      } catch (e) {
        errors.push({
          stage: "item",
          url: it.source_link,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const status = errors.length === 0 ? "success" : inserted > 0 ? "partial" : "error";
    await admin.from("ingestion_runs").update({
      finished_at: new Date().toISOString(),
      status, fetched, inserted, skipped,
      errors_json: errors.length ? errors : null,
    }).eq("id", runId);

    return { source: source.name, fetched, inserted, skipped, errors: errors.length, status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("ingestion_runs").update({
      finished_at: new Date().toISOString(),
      status: "error", fetched, inserted, skipped,
      errors_json: [...errors, { stage: "fatal", message }],
    }).eq("id", runId);
    return { source: source.name, fetched, inserted, skipped, errors: errors.length + 1, status: "error", message };
  }
}

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

    const body = await req.json().catch(() => ({}));
    const sourceId: string | undefined = body.source_id;

    let q = admin
      .from("sources")
      .select("id,name,url,region,type,category")
      .eq("active", true)
      .eq("type", "page")
      .eq("category", "research")
      .neq("status", "archived")
      .not("url", "is", null);
    if (sourceId) q = q.eq("id", sourceId);

    const { data: sources, error } = await q;
    if (error) throw error;
    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ error: "no active page-research sources" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const s of sources) {
      const r = await ingestPageSource(s as any);
      results.push(r);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ingest-page-research error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});