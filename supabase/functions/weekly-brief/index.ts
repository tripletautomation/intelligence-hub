// weekly-brief: Discovers 3-5 top news items of the week, adds them to the feed,
// and creates blog drafts (HE + EN) + a Hebrew connecting social post.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface TavilyResult {
  url?: string;
  title?: string;
  content?: string;
  published_date?: string;
}

interface DiscoveredItem {
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

async function getApiKey(
  admin: ReturnType<typeof createClient>,
  envName: string,
): Promise<string | undefined> {
  const { data } = await admin
    .from("admin_api_keys")
    .select("key_value")
    .eq("key_name", envName)
    .maybeSingle();
  return data?.key_value || Deno.env.get(envName);
}

async function tavilySearch(
  query: string,
  apiKey: string,
  days = 7,
): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 8,
      include_raw_content: false,
      days,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return Array.isArray(data?.results) ? (data.results as TavilyResult[]) : [];
}

async function extractTopItems(
  allResults: TavilyResult[],
  openaiKey: string,
  maxItems = 5,
): Promise<DiscoveredItem[]> {
  const compact = allResults
    .slice(0, 20)
    .map((r, i) => {
      const dateLine = r.published_date ? `Published: ${r.published_date}` : "";
      return [
        `[${i + 1}] URL: ${r.url ?? "?"}`,
        dateLine,
        `Title: ${r.title ?? ""}`,
        (r.content ?? "").slice(0, 600),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");

  const systemPrompt = `אתה עוזר מחקר ל-Triple T — חברת ייעוץ טכנולוגי בתחום תשתיות מחשוב, Data Centers, סייבר ו-AI.
קיבלת תוצאות חיפוש מהרשת מ-7 הימים האחרונים. בחר את ${maxItems} הידיעות הכי מעניינות ורלוונטיות.
קריטריונים לבחירה: חדשנות, השפעה על שוק ה-IT, רלוונטיות לישראל, נתונים קונקרטיים.
החזר תוצאות דרך הכלי emit_news_items בלבד.`;

  const TOOL = {
    type: "function",
    function: {
      name: "emit_news_items",
      description: "Emit the selected news items",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            maxItems,
            items: {
              type: "object",
              properties: {
                title_he: { type: "string" },
                summary_he: { type: "string" },
                why_it_matters: { type: "string" },
                url: { type: "string" },
                source_name: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                relevance_score: { type: "number", minimum: 0, maximum: 100 },
                region: { type: "string", enum: ["israel", "global"] },
                published_date: { type: "string" },
              },
              required: ["title_he", "summary_he", "why_it_matters", "url"],
            },
          },
        },
        required: ["items"],
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `תוצאות חיפוש (7 ימים אחרונים):\n${compact}\n\nבחר את ${maxItems} הידיעות הכי מעניינות לקהל של מנהלי IT ותשתיות בישראל.`,
        },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "emit_news_items" } },
      max_tokens: 2000,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return [];
  const parsed = JSON.parse(toolCall.function.arguments ?? "{}");
  return (parsed?.items ?? []) as DiscoveredItem[];
}

async function addItemToFeed(
  admin: ReturnType<typeof createClient>,
  item: DiscoveredItem,
): Promise<string> {
  const { data: existing } = await admin
    .from("items")
    .select("id")
    .eq("url", item.url)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: inserted, error } = await admin
    .from("items")
    .insert({
      item_type: "news",
      url: item.url,
      title_he: item.title_he,
      summary_he: item.summary_he ?? null,
      why_it_matters: item.why_it_matters ?? null,
      tags_ai: item.tags ?? [],
      relevance_score: item.relevance_score ?? 75,
      region: item.region ?? "global",
      published_at: item.published_date ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  return inserted.id as string;
}

const WEEKLY_QUERIES = [
  "data center infrastructure Israel 2025",
  "AI GPU HPC enterprise technology latest",
  "cloud cybersecurity enterprise news this week",
  "Israeli tech infrastructure government defense",
];

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

    const [tavilyKey, openaiKey] = await Promise.all([
      getApiKey(admin, "TAVILY_API_KEY"),
      getApiKey(admin, "OPENAI_API_KEY"),
    ]);
    if (!tavilyKey) return json({ error: "TAVILY_API_KEY missing" }, 500);
    if (!openaiKey) return json({ error: "OPENAI_API_KEY missing" }, 500);

    // 1. Search Tavily across all domains in parallel
    const searchResults = await Promise.allSettled(
      WEEKLY_QUERIES.map((q) => tavilySearch(q, tavilyKey, 7)),
    );
    const allResults: TavilyResult[] = [];
    const seenUrls = new Set<string>();
    for (const r of searchResults) {
      if (r.status === "fulfilled") {
        for (const item of r.value) {
          if (item.url && !seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            allResults.push(item);
          }
        }
      }
    }

    if (allResults.length === 0) return json({ error: "No results from Tavily" }, 500);

    // 2. Extract top 5 items via AI
    const topItems = await extractTopItems(allResults, openaiKey, 5);
    if (topItems.length === 0) return json({ error: "AI returned no items" }, 500);

    // 3. Add items to feed
    const itemIds: string[] = [];
    for (const item of topItems) {
      const id = await addItemToFeed(admin, item);
      itemIds.push(id);
    }

    // 4. Generate blog posts (HE + EN) via generate-blog-post
    const baseUrl = SUPABASE_URL.replace("/rest/v1", "");
    const funcUrl = `${baseUrl}/functions/v1`;

    const [blogHeRes, blogEnRes] = await Promise.all([
      fetch(`${funcUrl}/generate-blog-post`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: itemIds,
          language: "he",
          instructions: "זהו בריף שבועי — צור מאמר שמחבר את כל הידיעות לנרטיב אחד קוהרנטי עם הזווית המקצועית של עופר",
        }),
      }),
      fetch(`${funcUrl}/generate-blog-post`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: itemIds,
          language: "en",
          instructions: "Weekly brief — create a cohesive article connecting all items into one narrative with Ofer's professional angle",
        }),
      }),
    ]);

    const blogHeData = await blogHeRes.json().catch(() => ({}));
    const blogEnData = await blogEnRes.json().catch(() => ({}));

    // 5. Generate Hebrew social post connecting all items
    const blogHeDraftId = blogHeData?.draft_id as string | undefined;
    let socialPostId: string | null = null;

    if (blogHeDraftId) {
      const socialRes = await fetch(`${funcUrl}/generate-social-posts`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: blogHeDraftId,
          instructions: "צור פוסט LinkedIn בעברית שמחבר את כל הנושאים השבועיים לנרטיב אחד עם קריאה לדיון",
        }),
      });
      const socialData = await socialRes.json().catch(() => ({}));
      socialPostId = socialData?.id ?? blogHeDraftId;
    }

    return json({
      items_found: topItems.length,
      item_ids: itemIds,
      items: topItems.map((it) => ({
        title_he: it.title_he,
        url: it.url,
        why_it_matters: it.why_it_matters,
      })),
      drafts: {
        blog_he_id: blogHeData?.draft_id ?? null,
        blog_en_id: blogEnData?.draft_id ?? null,
      },
      social_post_draft_id: socialPostId,
    });
  } catch (e) {
    console.error("weekly-brief error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
