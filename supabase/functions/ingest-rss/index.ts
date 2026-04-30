// Phase 1 RSS ingestion: DCD + Calcalist Tech
// - Manual trigger only (no cron)
// - Dedup by url (DB unique index + pre-check)
// - Classify: news | event | research | vendor (heuristics)
// - Enrich with Lovable AI (gemini-3-flash-preview) via tool calling
// - Log every run to public.ingestion_runs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

interface ParsedEntry {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

interface Enriched {
  title_he: string;
  summary_he: string;
  why_it_matters: string;
  region: "israel" | "global";
  topic_tags: string[];
  relevance_score: number;
  is_relevant: boolean;
}

// ---------- helpers ----------
const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

function parseRss(xml: string): ParsedEntry[] {
  const items: ParsedEntry[] = [];
  // Match <item>...</item> OR <entry>...</entry> (Atom)
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/g) ?? [];
  for (const block of blocks) {
    const get = (tag: string): string => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const m = block.match(re);
      if (!m) return "";
      let v = m[1].trim();
      // Handle CDATA
      v = v.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
      return decodeEntities(v).trim();
    };
    let link = get("link");
    if (!link) {
      // Atom: <link href="..." />
      const m = block.match(/<link[^>]*href="([^"]+)"/i);
      if (m) link = m[1];
    }
    const title = stripHtml(get("title"));
    const description = stripHtml(get("description") || get("summary") || get("content:encoded"));
    const pubDate = get("pubDate") || get("published") || get("updated") || null;
    if (title && link) {
      items.push({ title, link, description, pubDate });
    }
  }
  return items;
}

function classify(title: string, url: string): "news" | "event" | "research" | "vendor" {
  const t = `${title} ${url}`.toLowerCase();
  if (/\b(event|webinar|conference|summit|expo|meetup)\b/.test(t)) return "event";
  if (/\b(whitepaper|white-paper|report|study|research|analysis)\b/.test(t)) return "research";
  return "news";
}

async function enrich(entry: ParsedEntry, sourceRegion: string): Promise<Enriched | null> {
  const sys =
    "You are an analyst for an Israeli data-center industry intelligence platform. The platform covers ONLY: data centers, cloud/hyperscalers, computing infrastructure, networking/telecom infra, AI infrastructure, cooling, power, sustainability for IT, semiconductors, enterprise IT, cybersecurity for infra, and related M&A/regulation. Set is_relevant=false for anything off-topic (general business, consumer products, politics, sports, entertainment, generic SaaS news, mobile apps, gaming, crypto price moves, lifestyle tech). When is_relevant=false, set relevance_score below 30. Translate and summarize in Hebrew either way.";
  const user = `Article:
Title: ${entry.title}
Description: ${entry.description.slice(0, 1500)}
URL: ${entry.link}
Source region hint: ${sourceRegion}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "store_item",
            description: "Store the enriched intelligence item.",
            parameters: {
              type: "object",
              properties: {
                title_he: { type: "string", description: "Hebrew title, concise" },
                summary_he: { type: "string", description: "Hebrew summary, max 2 sentences" },
                why_it_matters: { type: "string", description: "Hebrew, 1 sentence, Israeli data-center perspective" },
                region: { type: "string", enum: ["israel", "global"] },
                topic_tags: { type: "array", items: { type: "string" }, description: "3-6 lowercase English tags" },
                relevance_score: { type: "integer", minimum: 0, maximum: 100 },
                is_relevant: { type: "boolean", description: "True only if the article is about data centers, computing/IT infrastructure, or directly related technology. False for unrelated topics." },
              },
              required: ["title_he", "summary_he", "why_it_matters", "region", "topic_tags", "relevance_score", "is_relevant"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "store_item" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) return null;
  try {
    return JSON.parse(call.function.arguments) as Enriched;
  } catch {
    return null;
  }
}

async function ingestSource(source: {
  id: string;
  name: string;
  rss_url: string;
  region: string | null;
  type: string | null;
}, maxItems: number) {
  // Open run log
  const { data: runRow, error: runErr } = await admin
    .from("ingestion_runs")
    .insert({
      source_id: source.id,
      source_name: source.name,
      status: "running",
      triggered_by: "manual",
    })
    .select()
    .single();
  if (runErr) throw runErr;
  const runId = runRow.id;

  const errors: { stage: string; url?: string; message: string }[] = [];
  let fetched = 0,
    inserted = 0,
    skipped = 0;

  try {
    const resp = await fetch(source.rss_url, {
      headers: { "User-Agent": "DC-Intel-Bot/1.0 (+lovable)" },
    });
    if (!resp.ok) throw new Error(`RSS fetch ${resp.status}`);
    const xml = await resp.text();
    const entries = parseRss(xml).slice(0, maxItems);
    fetched = entries.length;

    for (const entry of entries) {
      try {
        // Dedup pre-check
        const { data: existing } = await admin
          .from("items")
          .select("id")
          .eq("url", entry.link)
          .maybeSingle();
        if (existing) {
          skipped++;
          continue;
        }

        const enriched = await enrich(entry, source.region ?? "global");
        if (!enriched) {
          errors.push({ stage: "enrich", url: entry.link, message: "no tool call" });
          continue;
        }

        // Skip off-topic articles (not related to data centers / computing / tech infrastructure)
        if (enriched.is_relevant === false || enriched.relevance_score < 30) {
          skipped++;
          continue;
        }

        const itemType = classify(entry.title, entry.link);
        const publishedAt = entry.pubDate ? new Date(entry.pubDate).toISOString() : null;

        const { error: insErr } = await admin.from("items").insert({
          source_id: source.id,
          item_type: itemType,
          region: enriched.region,
          url: entry.link,
          published_at: publishedAt,
          title_orig: entry.title,
          summary_orig: entry.description.slice(0, 2000),
          title_he: enriched.title_he,
          summary_he: enriched.summary_he,
          why_it_matters: enriched.why_it_matters,
          tags_ai: enriched.topic_tags,
          relevance_score: enriched.relevance_score,
          is_seed: false,
        });
        if (insErr) {
          // 23505 = unique violation (race)
          if ((insErr as any).code === "23505") {
            skipped++;
          } else {
            errors.push({ stage: "insert", url: entry.link, message: insErr.message });
          }
        } else {
          inserted++;
        }
      } catch (e) {
        errors.push({
          stage: "item",
          url: entry.link,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const status = errors.length === 0 ? "success" : inserted > 0 ? "partial" : "error";
    await admin
      .from("ingestion_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        fetched,
        inserted,
        skipped,
        errors_json: errors.length ? errors : null,
      })
      .eq("id", runId);

    return { source: source.name, fetched, inserted, skipped, errors: errors.length, status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from("ingestion_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "error",
        fetched,
        inserted,
        skipped,
        errors_json: [...errors, { stage: "fatal", message }],
      })
      .eq("id", runId);
    return { source: source.name, fetched, inserted, skipped, errors: errors.length + 1, status: "error", message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require authenticated caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const sourceId: string | undefined = body.source_id;
    const maxItems: number = Math.min(Math.max(Number(body.max_items) || 10, 1), 25);

    let q = admin
      .from("sources")
      .select("id,name,rss_url,region,type")
      .eq("active", true)
      .eq("is_seed", false)
      .neq("status", "archived")
      .not("rss_url", "is", null);
    if (sourceId) q = q.eq("id", sourceId);
    const { data: sources, error } = await q;
    if (error) throw error;
    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ error: "no active sources with rss_url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const s of sources) {
      const r = await ingestSource(s as any, maxItems);
      results.push(r);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ingest-rss error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
