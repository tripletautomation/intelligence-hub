// Page-based events ingestion: Firecrawl (render) + Lovable AI (structured extraction)
// - Manual trigger only
// - Targets sources where type='page' and category='events'
// - Stores into public.items with item_type='event'
// - Logs runs to public.ingestion_runs (triggered_by='manual-page-events')

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
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

interface ExtractedEvent {
  title: string;
  event_date: string | null;        // ISO 8601 if known, else null
  location: string | null;          // city / venue / "online"
  is_online: boolean;
  source_link: string;              // absolute URL
  summary_he: string;
  why_it_matters_he: string;
  title_he: string;
}

function isUsableContent(md: string): boolean {
  if (!md || md.length < 300) return false;
  const n = md.replace(/\s+/g, " ").trim().toLowerCase();
  if (n.includes("sorry, we couldn't find this page")) return false;
  if (n.includes("page not found")) return false;
  return true;
}

async function tavilyExtract(urls: string[]): Promise<{ markdown: string; resolvedUrl: string } | null> {
  const res = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      urls,
      extract_depth: "advanced", // JS-heavy sites need advanced rendering
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const results: Array<{ url: string; raw_content: string }> = data?.results ?? [];
  for (const result of results) {
    if (isUsableContent(result.raw_content)) {
      return { markdown: result.raw_content, resolvedUrl: result.url };
    }
  }
  return null;
}

async function tavilySearchFallback(sourceName: string, sourceUrl: string): Promise<{ markdown: string; resolvedUrl: string } | null> {
  // Extract hostname to build a site-specific query
  let hostname = sourceUrl;
  try { hostname = new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { /* keep as-is */ }
  const query = `${sourceName} upcoming events 2025 2026 site:${hostname}`;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: "advanced",
      max_results: 10,
      include_raw_content: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const results: Array<{ url: string; raw_content?: string; content?: string }> = data?.results ?? [];
  // Combine all result snippets into one markdown blob for the AI to parse
  const combined = results
    .map((r) => `=== ${r.url} ===\n${r.raw_content || r.content || ""}`)
    .join("\n\n");
  if (!combined || combined.length < 200) return null;
  return { markdown: combined, resolvedUrl: sourceUrl };
}

async function tavilyScrape(url: string, sourceName: string): Promise<{ markdown: string; resolvedUrl: string }> {
  const candidates = [url];
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("datacenterdynamics.com")) {
      candidates.push(
        "https://www.datacenterdynamics.com/en/conferences/",
        "https://www.datacenterdynamics.com/en/broadcasts/upcoming/",
      );
    }
    if (parsed.hostname.includes("idca.org.il")) {
      candidates.push(
        "https://www.idca.org.il/en/events",
        "https://www.idca.org.il/events",
        "https://idca.org.il/en/events",
      );
    }
  } catch { /* ignore invalid URL */ }

  const uniqueCandidates = [...new Set(candidates)];

  // 1. Try direct extract with advanced rendering
  const extracted = await tavilyExtract(uniqueCandidates);
  if (extracted) return extracted;

  // 2. Fallback: search-based scrape (works when extract can't render JS pages)
  const searchResult = await tavilySearchFallback(sourceName, url);
  if (searchResult) return searchResult;

  throw new Error(`Could not get usable content for: ${uniqueCandidates[0]}`);
}

async function extractEvents(
  pageUrl: string,
  markdown: string,
  debug: { raw?: string; mdLen?: number; finishReason?: string; rawArgs?: string; mdSentLen?: number; candidateCount?: number },
): Promise<ExtractedEvent[]> {
  debug.mdLen = markdown.length;
  // Heuristic count of "raw candidates" — any line that mentions a date keyword or month.
  const monthRx = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i;
  const dateRx = /\b(20\d{2}|register|upcoming|webinar|conference|summit|event)\b/i;
  debug.candidateCount = markdown
    .split(/\n+/)
    .filter((l) => l.length > 8 && (monthRx.test(l) || dateRx.test(l)))
    .length;
  const today = new Date().toISOString().split("T")[0]; // e.g. 2026-04-30
  const cutoffDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const sys =
    "You extract structured event records from a scraped events listing page (markdown). " +
    `Today's date is ${today}. ` +
    `Extract ONLY events scheduled between ${cutoffDate} (60 days ago) and 12 months from now. ` +
    "CRITICAL: Pages often have an 'Upcoming' section followed by an 'Archive', 'Past Events', or 'Webinar Archive' section. " +
    "Extract from the UPCOMING section only. When you encounter a section header containing words like 'Archive', 'Past', 'Historical', 'Previous' — STOP and do not extract further. " +
    "The page may have multiple upcoming sections like 'This month', 'Next month', 'Future events' — include all of them. " +
    "Skip navigation, cookie banners, ads, footers, generic news articles, and marketing copy without a date or registration link. " +
    "Translate title and summary to Hebrew. Provide a 1-sentence Hebrew 'why it matters' for an Israeli data-center professional. " +
    "If event_date is unknown or ambiguous but the event clearly seems upcoming, set event_date to null and still include it. " +
    "Use ISO 8601 with timezone if possible. Resolve relative URLs against the page URL. " +
    "Aim for completeness: it is better to return 15 future events than only 3.";
  // Send more of the page so later sections (next month, future) are not truncated away.
  const mdToSend = markdown.slice(0, 60000);
  debug.mdSentLen = mdToSend.length;
  const user = `Today's date: ${today}\nPage URL: ${pageUrl}\n\nPage markdown:\n${mdToSend}`;

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
            name: "store_events",
            description: "Store the list of extracted events.",
            parameters: {
              type: "object",
              properties: {
                events: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      title_he: { type: "string" },
                      event_date: { type: ["string", "null"] },
                      location: { type: ["string", "null"] },
                      is_online: { type: "boolean" },
                      source_link: { type: "string" },
                      summary_he: { type: "string" },
                      why_it_matters_he: { type: "string" },
                    },
                    required: ["title", "title_he", "event_date", "location", "is_online", "source_link", "summary_he", "why_it_matters_he"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["events"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "store_events" } },
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
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
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
      triggered_by: "manual-page-events",
    })
    .select()
    .single();
  if (runErr) throw runErr;
  const runId = runRow.id;

  const errors: { stage: string; url?: string; message: string }[] = [];
  let fetched = 0, inserted = 0, skipped = 0;

  try {
    const { markdown: md, resolvedUrl } = await tavilyScrape(source.url, source.name);
    const debug: { raw?: string; mdLen?: number; finishReason?: string; rawArgs?: string; mdSentLen?: number; candidateCount?: number } = {};
    const events = await extractEvents(resolvedUrl, md, debug);
    fetched = events.length;
    // Always emit a debug breadcrumb so we can see scrape/extract stats in the run logs.
    errors.push({
      stage: "debug",
      url: resolvedUrl,
      message: `md_len=${debug.mdLen} md_sent=${debug.mdSentLen} raw_candidates=${debug.candidateCount} extracted=${events.length} finish=${debug.finishReason}`,
    });
    if (events.length === 0) {
      errors.push({
        stage: "ai-empty",
        url: resolvedUrl,
        message: `No events extracted. md_len=${debug.mdLen} finish=${debug.finishReason} raw=${debug.raw ?? ""} args=${debug.rawArgs ?? ""}`,
      });
    }
    const now = new Date();
    // Allow events up to 60 days in the past (still relevant/recent)
    const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    for (const ev of events) {
      try {
        if (!ev.source_link || !ev.title_he) {
          skipped++;
          errors.push({ stage: "skip-missing-fields", url: ev.source_link, message: `missing source_link or title_he (title="${ev.title ?? ""}")` });
          continue;
        }
        // Skip events older than 60 days
        if (ev.event_date) {
          const evDate = new Date(ev.event_date);
          if (!isNaN(evDate.getTime()) && evDate < cutoff) {
            skipped++;
            errors.push({ stage: "skip-past-event", url: ev.source_link, message: `event_date ${ev.event_date} is older than 60 days` });
            continue;
          }
        }
        const { data: existing } = await admin
          .from("items")
          .select("id")
          .eq("url", ev.source_link)
          .maybeSingle();
        if (existing) {
          skipped++;
          errors.push({ stage: "skip-duplicate", url: ev.source_link, message: `already in items` });
          continue;
        }

        const eventDateIso = ev.event_date ? safeIso(ev.event_date) : null;

        const { error: insErr } = await admin.from("items").insert({
          source_id: source.id,
          item_type: "event",
          region: source.region ?? "israel",
          url: ev.source_link,
          published_at: eventDateIso,
          title_orig: ev.title,
          summary_orig: null,
          title_he: ev.title_he,
          summary_he: ev.summary_he,
          why_it_matters: ev.why_it_matters_he,
          tags_ai: [],
          relevance_score: 60,
          is_seed: false,
          event_date: eventDateIso,
          event_location: ev.location,
          event_is_online: ev.is_online,
          event_register_url: ev.source_link,
        });
        if (insErr) {
          if ((insErr as any).code === "23505") {
            skipped++;
            errors.push({ stage: "skip-unique", url: ev.source_link, message: insErr.message });
          }
          else errors.push({ stage: "insert", url: ev.source_link, message: insErr.message });
        } else {
          inserted++;
        }
      } catch (e) {
        errors.push({
          stage: "item",
          url: ev.source_link,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Debug/skip breadcrumbs are informational — they should not flip the status to error.
    const realErrors = errors.filter(
      (e) => !["debug", "skip-duplicate", "skip-missing-fields", "skip-unique"].includes(e.stage),
    );
    const status = realErrors.length === 0 ? "success" : inserted > 0 ? "partial" : "error";
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

function safeIso(s: string): string | null {
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
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
      .eq("category", "events")
      .neq("status", "archived")
      .not("url", "is", null);
    if (sourceId) q = q.eq("id", sourceId);

    const { data: sources, error } = await q;
    if (error) throw error;
    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ error: "no active page-event sources" }), {
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
    console.error("ingest-page-events error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
