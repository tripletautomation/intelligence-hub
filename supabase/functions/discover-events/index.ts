// Discover Events: Firecrawl Search + Lovable AI structured extraction
// Returns ephemeral structured event records — does NOT write to public.items.
// User explicitly saves results into public.saved_discoveries from the UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY")!;

interface DiscoveredEvent {
  title: string;
  event_date: string | null;
  location: string | null;
  is_online: boolean;
  source_name: string | null;
  source_url: string;
  summary: string;
  why_it_matters: string;
}

interface FilterPayload {
  query: string;
  month?: string | null;       // e.g. "2026-06" or free text
  location?: string | null;
  organization?: string | null;
  topic?: string | null;
  format?: "online" | "physical" | "hybrid" | "any" | null;
  limit?: number;
}

function buildSearchQuery(p: FilterPayload): string {
  const parts = [p.query.trim()];
  if (p.organization) parts.push(p.organization);
  if (p.topic) parts.push(p.topic);
  if (p.location) parts.push(p.location);
  if (p.month) parts.push(p.month);
  if (p.format === "online") parts.push("webinar OR online");
  if (p.format === "physical") parts.push("conference");
  parts.push("event OR conference OR summit OR webinar");
  return parts.filter(Boolean).join(" ");
}

async function tavilySearch(query: string, limit: number) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: Math.min(Math.max(limit, 5), 20),
      include_raw_content: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const results = data?.results ?? [];
  return Array.isArray(results) ? results : [];
}

async function extractEvents(
  userQuery: string,
  results: Array<{ url?: string; title?: string; content?: string }>,
): Promise<DiscoveredEvent[]> {
  const compact = results
    .slice(0, 12)
    .map((r, i) => {
      const content = (r.content ?? "").slice(0, 4000);
      return `--- RESULT ${i + 1} ---\nURL: ${r.url ?? ""}\nTITLE: ${r.title ?? ""}\nCONTENT:\n${content}`;
    })
    .join("\n\n");

  const today = new Date().toISOString().split("T")[0];
  const sys =
    "You convert web search results into structured EVENT records (conferences, summits, webinars, broadcasts, meetups). " +
    `Today's date is ${today}. ` +
    "Strict rules: " +
    `1) ONLY extract events whose date is AFTER ${today} (i.e. future events). If an event clearly has a past date, skip it entirely. ` +
    "2) If a page has an 'Upcoming' section AND an 'Archive'/'Past' section, extract ONLY from the Upcoming section. " +
    "3) Skip news articles, blog posts, vendor product pages, generic landing pages, archives of past events. " +
    "4) Translate title/summary to Hebrew. " +
    "5) why_it_matters: one short Hebrew sentence explaining relevance to an Israeli data-center / IT infrastructure professional given the user's query. " +
    "6) event_date: ISO 8601 with timezone if known, else null. Do NOT invent dates. " +
    "7) source_url MUST be the absolute URL of the result. source_name = publisher / organizer brand. " +
    "8) Return at most 10 high-quality FUTURE events.";

  const user = `Today: ${today}\nUser query: ${userQuery}\n\nSearch results:\n${compact}`;

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
            description: "Store extracted structured event records.",
            parameters: {
              type: "object",
              properties: {
                events: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      event_date: { type: ["string", "null"] },
                      location: { type: ["string", "null"] },
                      is_online: { type: "boolean" },
                      source_name: { type: ["string", "null"] },
                      source_url: { type: "string" },
                      summary: { type: "string" },
                      why_it_matters: { type: "string" },
                    },
                    required: [
                      "title", "event_date", "location", "is_online",
                      "source_name", "source_url", "summary", "why_it_matters",
                    ],
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
    if (res.status === 429) throw new Error("AI rate limited (429). נסי שוב בעוד רגע.");
    if (res.status === 402) throw new Error("AI credits exhausted (402). יש להוסיף קרדיטים.");
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];
  try {
    const parsed = JSON.parse(args);
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
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

    if (!TAVILY_API_KEY) throw new Error("TAVILY_API_KEY missing");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

    const body: FilterPayload = await req.json().catch(() => ({ query: "" }));
    if (!body.query || body.query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullQuery = buildSearchQuery(body);
    const searchResults = await tavilySearch(fullQuery, body.limit ?? 10);
    if (searchResults.length === 0) {
      return new Response(JSON.stringify({ events: [], query: fullQuery }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const events = await extractEvents(body.query, searchResults);

    const now = new Date();
    // Hard filter: drop any event with a known past date — strictly future only
    const futureOnly = events.filter((e) => {
      if (!e.event_date) return true; // keep events with unknown date
      const d = new Date(e.event_date);
      return isNaN(d.getTime()) || d >= now;
    });

    // Optional client-side format hint reinforcement
    const filtered = body.format && body.format !== "any"
      ? futureOnly.filter((e) => {
          if (body.format === "online") return e.is_online === true;
          if (body.format === "physical") return e.is_online === false;
          return true;
        })
      : futureOnly;

    return new Response(JSON.stringify({ events: filtered, query: fullQuery, raw_count: searchResults.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("discover-events error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});