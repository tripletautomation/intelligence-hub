// Phase 1.5 Research ingestion (separate stream)
// - Reads DCD main RSS (no new source needed)
// - AI strictly classifies each entry as research or not (whitepaper/report/study/in-depth analysis)
// - Only inserts when is_research = true; stores as item_type = 'research'
// - Manual trigger only
// - Separate run logs via ingestion_runs (triggered_by = 'manual-research')

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

const DCD_RSS_URL = "https://www.datacenterdynamics.com/en/rss/";
const DCD_SOURCE_NAME = "DCD";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

interface ParsedEntry {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

interface ResearchEnriched {
  is_research: boolean;
  research_type?: "whitepaper" | "report" | "study" | "analysis" | "survey" | "other";
  title_he: string;
  summary_he: string;
  why_it_matters: string;
  region: "israel" | "global";
  topic_tags: string[];
  relevance_score: number;
}

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
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/g) ?? [];
  for (const block of blocks) {
    const get = (tag: string): string => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const m = block.match(re);
      if (!m) return "";
      let v = m[1].trim();
      v = v.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
      return decodeEntities(v).trim();
    };
    let link = get("link");
    if (!link) {
      const m = block.match(/<link[^>]*href="([^"]+)"/i);
      if (m) link = m[1];
    }
    const title = stripHtml(get("title"));
    const description = stripHtml(get("description") || get("summary") || get("content:encoded"));
    const pubDate = get("pubDate") || get("published") || get("updated") || null;
    if (title && link) items.push({ title, link, description, pubDate });
  }
  return items;
}

async function classifyAndEnrich(entry: ParsedEntry): Promise<ResearchEnriched | null> {
  const sys =
    "You are a strict research classifier for an Israeli data-center intelligence platform. " +
    "Mark is_research=TRUE ONLY for substantive research content: whitepapers, industry reports, market studies, surveys, in-depth multi-page analyses, or research-backed forecasts. " +
    "Mark is_research=FALSE for: news articles, product launches, company announcements, opinion pieces, short blog posts, event coverage, interviews. " +
    "Be strict — when in doubt, mark FALSE. " +
    "If is_research=TRUE, also produce a Hebrew translation, summary, why-it-matters, region, tags, and relevance score (0-100) for Israeli data-center professionals.";
  const user = `Article:
Title: ${entry.title}
Description: ${entry.description.slice(0, 2000)}
URL: ${entry.link}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "store_research_item",
            description: "Classify and (if research) store the enriched research item.",
            parameters: {
              type: "object",
              properties: {
                is_research: { type: "boolean", description: "TRUE only for whitepapers/reports/studies/in-depth analyses. Strict." },
                research_type: { type: "string", enum: ["whitepaper", "report", "study", "analysis", "survey", "other"] },
                title_he: { type: "string" },
                summary_he: { type: "string", description: "Hebrew, max 2 sentences" },
                why_it_matters: { type: "string", description: "Hebrew, 1 sentence, Israeli data-center perspective" },
                region: { type: "string", enum: ["israel", "global"] },
                topic_tags: { type: "array", items: { type: "string" }, description: "3-6 lowercase English tags" },
                relevance_score: { type: "integer", minimum: 0, maximum: 100 },
              },
              required: ["is_research", "title_he", "summary_he", "why_it_matters", "region", "topic_tags", "relevance_score"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "store_research_item" } },
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
    return JSON.parse(call.function.arguments) as ResearchEnriched;
  } catch {
    return null;
  }
}

async function findDcdSource(): Promise<{ id: string; name: string } | null> {
  const { data } = await admin
    .from("sources")
    .select("id,name")
    .eq("active", true)
    .eq("is_seed", false)
    .ilike("name", `%${DCD_SOURCE_NAME}%`)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

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

    const body = await req.json().catch(() => ({}));
    const maxItems: number = Math.min(Math.max(Number(body.max_items) || 15, 1), 30);

    const dcdSource = await findDcdSource();
    const sourceId = dcdSource?.id ?? null;
    const sourceName = dcdSource?.name ?? "DCD (research filter)";

    const { data: runRow, error: runErr } = await admin
      .from("ingestion_runs")
      .insert({
        source_id: sourceId,
        source_name: `${sourceName} — research`,
        status: "running",
        triggered_by: "manual-research",
      })
      .select()
      .single();
    if (runErr) throw runErr;
    const runId = runRow.id;

    const errors: { stage: string; url?: string; message: string }[] = [];
    let fetched = 0;
    let inserted = 0;
    let skipped = 0;

    try {
      const resp = await fetch(DCD_RSS_URL, {
        headers: { "User-Agent": "DC-Intel-Bot/1.0 (+lovable; research)" },
      });
      if (!resp.ok) throw new Error(`RSS fetch ${resp.status}`);
      const xml = await resp.text();
      const entries = parseRss(xml).slice(0, maxItems);
      fetched = entries.length;

      for (const entry of entries) {
        try {
          // Dedup pre-check on url (research stream must not duplicate news rows either)
          const { data: existing } = await admin
            .from("items")
            .select("id,item_type")
            .eq("url", entry.link)
            .maybeSingle();
          if (existing) {
            skipped++;
            continue;
          }

          const enriched = await classifyAndEnrich(entry);
          if (!enriched) {
            errors.push({ stage: "classify", url: entry.link, message: "no tool call" });
            continue;
          }
          if (!enriched.is_research) {
            skipped++;
            continue;
          }

          const publishedAt = entry.pubDate ? new Date(entry.pubDate).toISOString() : null;
          const tags = Array.from(new Set([
            ...(enriched.topic_tags ?? []),
            "research",
            ...(enriched.research_type ? [enriched.research_type] : []),
          ]));

          const { error: insErr } = await admin.from("items").insert({
            source_id: sourceId,
            item_type: "research",
            region: enriched.region,
            url: entry.link,
            published_at: publishedAt,
            title_orig: entry.title,
            summary_orig: entry.description.slice(0, 2000),
            title_he: enriched.title_he,
            summary_he: enriched.summary_he,
            why_it_matters: enriched.why_it_matters,
            tags_ai: tags,
            relevance_score: enriched.relevance_score,
            is_seed: false,
          });
          if (insErr) {
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

      return new Response(
        JSON.stringify({
          ok: true,
          stream: "research",
          source: sourceName,
          fetched,
          inserted,
          skipped,
          errors: errors.length,
          status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      return new Response(
        JSON.stringify({ ok: false, stream: "research", error: message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    console.error("ingest-research error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
