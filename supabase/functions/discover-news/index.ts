// discover-news: Tavily search + AI extraction of news/article items
// Ephemeral — does NOT write to DB. User selects items to add via add-news-to-feed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface DiscoveredNewsItem {
  title_he: string;
  summary_he: string;
  why_it_matters: string;
  url: string;
  source_name: string | null;
  tags: string[];
  relevance_score: number;
  region: "israel" | "global";
  published_date: string | null;
}

interface TavilyResult {
  url?: string;
  title?: string;
  content?: string;
  published_date?: string;
}

async function tavilySearch(query: string, apiKey: string, maxResults = 12, days?: number) {
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    search_depth: "basic",
    max_results: maxResults,
    include_raw_content: false,
  };
  if (days && days < 365) body.days = days;

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const results = data?.results ?? [];
  return Array.isArray(results) ? results as TavilyResult[] : [];
}

// Post-filter by days cutoff (Tavily's days param is not always reliable)
function filterByDays(results: TavilyResult[], days: number): TavilyResult[] {
  if (days >= 365) return results;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return results.filter((r) => {
    if (!r.published_date) return true; // keep items with unknown dates
    const t = new Date(r.published_date).getTime();
    return isNaN(t) || t >= cutoff;
  });
}

async function extractNews(
  query: string,
  region: string,
  rawResults: TavilyResult[],
  apiKey: string,
): Promise<DiscoveredNewsItem[]> {
  // Include published_date in the context so AI can copy it through reliably
  const compact = rawResults
    .slice(0, 10)
    .map((r, i) => {
      const dateLine = r.published_date ? `Published: ${r.published_date}` : "";
      return [
        `[${i + 1}] URL: ${r.url ?? "?"}`,
        dateLine,
        `Title: ${r.title ?? ""}`,
        (r.content ?? "").slice(0, 1000),
      ].filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");

  const systemPrompt = `אתה עוזר מחקר ל-Triple T — חברת ייעוץ טכנולוגי בתחום תשתיות מחשוב, Data Centers, סייבר ו-AI.
קיבלת תוצאות חיפוש מהרשת. חלץ מהן ידיעות רלוונטיות בעלות ערך עסקי עבור מנהלי IT ותשתיות בישראל.
החזר תוצאות דרך הכלי emit_news_items בלבד.`;

  const userPrompt = `נושא החיפוש: "${query}"
אזור מועדף: ${region}

תוצאות חיפוש:
${compact}

הנחיות:
- תרגם כותרות לעברית (אבל שמור את ה-URL המקורי המדויק כפי שהוא מופיע בתוצאות)
- סכם ב-2-3 משפטים עברית תמציתיים
- כתוב "למה זה חשוב" מנקודת מבט של מנהל IT/תשתיות ישראלי
- תייג עם 2-4 תגיות רלוונטיות (data-center, cybersecurity, AI, cloud, networking וכו')
- דרג רלוונטיות 0-100 לתחום תשתיות מחשוב
- החזר רק פריטים עם relevance_score >= 50
- זהה אם הידיעה רלוונטית לישראל (region: israel) או גלובלית (region: global)
- העתק את ה-published_date בדיוק כפי שהוא מופיע ב-"Published:" — אל תשנה אותו`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "emit_news_items",
          description: "Emit extracted news items",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                maxItems: 8,
                items: {
                  type: "object",
                  properties: {
                    title_he: { type: "string" },
                    summary_he: { type: "string" },
                    why_it_matters: { type: "string" },
                    url: { type: "string", description: "URL המקורי המדויק מהתוצאות" },
                    source_name: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    relevance_score: { type: "number" },
                    region: { type: "string", enum: ["israel", "global"] },
                    published_date: { type: "string", description: "התאריך מ-Published: — העתק בדיוק. אם אין, השמט." },
                  },
                  required: ["title_he", "summary_he", "why_it_matters", "url", "tags", "relevance_score", "region"],
                },
              },
            },
            required: ["items"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "emit_news_items" } },
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];
  const parsed = JSON.parse(args);

  // Fallback: also build URL → published_date map from Tavily for items where AI didn't copy the date
  const publishedByUrl = new Map<string, string | null>();
  for (const r of rawResults) {
    if (r.url) {
      publishedByUrl.set(r.url, r.published_date ?? null);
      // Also index without trailing slash for fuzzy match
      publishedByUrl.set(r.url.replace(/\/$/, ""), r.published_date ?? null);
    }
  }

  const items: DiscoveredNewsItem[] = (parsed.items ?? []).map((it: any) => {
    const urlKey = (it.url ?? "").replace(/\/$/, "");
    const dateFromTavily = publishedByUrl.get(it.url) ?? publishedByUrl.get(urlKey) ?? null;
    return {
      title_he: it.title_he,
      summary_he: it.summary_he,
      why_it_matters: it.why_it_matters,
      url: it.url,
      source_name: it.source_name ?? null,
      tags: Array.isArray(it.tags) ? it.tags : [],
      relevance_score: it.relevance_score,
      region: it.region,
      // Prefer Tavily's date (reliable), fall back to AI-copied date
      published_date: dateFromTavily ?? it.published_date ?? null,
    };
  });

  return items.sort((a, b) => b.relevance_score - a.relevance_score);
}

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const query: string = typeof body?.query === "string" ? body.query.trim() : "";
    const region: string = body?.region ?? "any";
    const days: number = typeof body?.days === "number" ? body.days : 30;

    if (!query) return json({ error: "query is required" }, 400);

    const { data: tavilyKeyRow } = await admin.from("admin_api_keys").select("key_value").eq("key_name", "TAVILY_API_KEY").maybeSingle();
    const { data: openaiKeyRow } = await admin.from("admin_api_keys").select("key_value").eq("key_name", "OPENAI_API_KEY").maybeSingle();
    const TAVILY_API_KEY = tavilyKeyRow?.key_value || Deno.env.get("TAVILY_API_KEY");
    const OPENAI_API_KEY = openaiKeyRow?.key_value || Deno.env.get("OPENAI_API_KEY");

    if (!TAVILY_API_KEY) return json({ error: "TAVILY_API_KEY missing" }, 500);
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY missing" }, 500);

    const searchQuery = [
      query,
      region === "israel" ? "Israel" : "",
      "data center infrastructure AI cybersecurity technology news",
    ].filter(Boolean).join(" ");

    let rawResults = await tavilySearch(searchQuery, TAVILY_API_KEY, 15, days);

    // Post-filter: enforce date cutoff strictly on our side
    rawResults = filterByDays(rawResults, days);

    if (rawResults.length === 0) return json({ items: [] });

    const items = await extractNews(query, region, rawResults, OPENAI_API_KEY);
    return json({ items });

  } catch (e) {
    console.error("discover-news error", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה" }, 500);
  }
});
