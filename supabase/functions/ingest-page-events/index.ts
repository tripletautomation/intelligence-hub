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
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;

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

async function firecrawlScrape(url: string): Promise<string> {
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
      waitFor: 8000,
      timeout: 60000,
      proxy: "stealth",
      blockAds: true,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Firecrawl ${res.status}: ${(data?.error ?? JSON.stringify(data)).toString().slice(0, 300)}`);
  }
  const md: string | undefined = data?.data?.markdown ?? data?.markdown;
  if (!md) throw new Error("Firecrawl returned no markdown");
  if (md.length < 500) {
    throw new Error(`Firecrawl returned suspiciously short markdown (${md.length} chars) — likely blocked or not rendered`);
  }
  return md;
}

async function extractEvents(
  pageUrl: string,
  markdown: string,
  debug: { raw?: string; mdLen?: number; finishReason?: string; rawArgs?: string },
): Promise<ExtractedEvent[]> {
  debug.mdLen = markdown.length;
  const sys =
    "You extract structured event records from a scraped events page (markdown). " +
    "Return ONLY events that are clearly listed as upcoming or recent events. Skip navigation, footers, generic links. " +
    "Translate title and summary to Hebrew. Provide a 1-sentence Hebrew 'why it matters' for an Israeli data-center professional. " +
    "If event_date is unknown or ambiguous, set it to null. Use ISO 8601 with timezone if possible. " +
    "Resolve relative URLs against the page URL.";
  const user = `Page URL: ${pageUrl}\n\nPage markdown (truncated):\n${markdown.slice(0, 18000)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
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
    const md = await firecrawlScrape(source.url);
    const debug: { raw?: string; mdLen?: number; finishReason?: string; rawArgs?: string } = {};
    const events = await extractEvents(source.url, md, debug);
    fetched = events.length;
    if (events.length === 0) {
      errors.push({
        stage: "ai-empty",
        url: source.url,
        message: `No events extracted. md_len=${debug.mdLen} finish=${debug.finishReason} raw=${debug.raw ?? ""} args=${debug.rawArgs ?? ""}`,
      });
    }
    for (const ev of events) {
      try {
        if (!ev.source_link || !ev.title_he) {
          skipped++;
          continue;
        }
        const { data: existing } = await admin
          .from("items")
          .select("id")
          .eq("url", ev.source_link)
          .maybeSingle();
        if (existing) {
          skipped++;
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
          if ((insErr as any).code === "23505") skipped++;
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
