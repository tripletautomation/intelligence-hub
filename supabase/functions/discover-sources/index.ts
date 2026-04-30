// discover-sources: Search the web for potential ingestion sources
// Uses Tavily search + OpenAI to classify and extract structured source candidates

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY")!;

interface DiscoveredSource {
  name: string;
  url: string;
  description_he: string;
  suggested_type: "rss" | "page";
  suggested_category: "industry_news" | "events" | "research" | "other";
  rss_url: string | null;
}

async function tavilySearch(query: string, limit: number) {
  const fullQuery = `${query} site OR blog OR RSS OR news data center technology infrastructure`;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: fullQuery,
      search_depth: "basic",
      max_results: Math.min(Math.max(limit, 5), 20),
      include_raw_content: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return Array.isArray(data?.results) ? data.results : [];
}

async function classifySources(
  query: string,
  results: Array<{ url?: string; title?: string; content?: string }>,
): Promise<DiscoveredSource[]> {
  const compact = results
    .slice(0, 15)
    .map((r, i) =>
      `--- RESULT ${i + 1} ---\nURL: ${r.url ?? ""}\nTITLE: ${r.title ?? ""}\nSNIPPET: ${(r.content ?? "").slice(0, 600)}`
    )
    .join("\n\n");

  const sys =
    "You analyze web search results and identify quality SOURCES (websites, blogs, news sites, RSS feeds, portals) " +
    "relevant to data centers, cloud infrastructure, IT, and technology — especially Israeli or global industry publications. " +
    "For each result that represents a useful, ongoing content source (not a single article or product page): " +
    "1) Extract the root domain as `url` (e.g. https://www.datacenterdynamics.com). " +
    "2) Detect if it likely has an RSS feed (`suggested_type: 'rss'`) or requires page scraping (`suggested_type: 'page'`). " +
    "3) Classify category: 'industry_news', 'events', 'research', or 'other'. " +
    "4) If you can infer the RSS URL from the domain (e.g. /feed, /rss, /rss.xml), set `rss_url`. Otherwise null. " +
    "5) Write a short Hebrew description (`description_he`). " +
    "6) Use the domain/publisher as `name`. " +
    "Skip results that are single articles, e-commerce stores, generic directories, or unrelated to tech/data-centers. " +
    "Return at most 8 high-quality source candidates.";

  const user = `User search query: "${query}"\n\nSearch results:\n${compact}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      tools: [
        {
          type: "function",
          function: {
            name: "store_sources",
            description: "Store classified source candidates.",
            parameters: {
              type: "object",
              properties: {
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      url: { type: "string" },
                      description_he: { type: "string" },
                      suggested_type: { type: "string", enum: ["rss", "page"] },
                      suggested_category: { type: "string", enum: ["industry_news", "events", "research", "other"] },
                      rss_url: { type: ["string", "null"] },
                    },
                    required: ["name", "url", "description_he", "suggested_type", "suggested_category", "rss_url"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["sources"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "store_sources" } },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limited (429)");
    const t = await res.text();
    throw new Error(`AI error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];
  try {
    const parsed = JSON.parse(args);
    return Array.isArray(parsed.sources) ? parsed.sources : [];
  } catch { return []; }
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

    if (!TAVILY_API_KEY) throw new Error("TAVILY_API_KEY missing");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

    const body = await req.json().catch(() => ({}));
    const query: string = body?.query?.trim() ?? "";
    const limit: number = body?.limit ?? 10;

    if (!query || query.length < 2) return json({ error: "query is required" }, 400);

    const searchResults = await tavilySearch(query, limit);
    if (searchResults.length === 0) return json({ sources: [] });

    const sources = await classifySources(query, searchResults);
    return json({ sources, raw_count: searchResults.length });

  } catch (e) {
    console.error("discover-sources error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
