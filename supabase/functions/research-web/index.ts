// research-web: Tavily search → OpenAI extraction → returns content blocks for article enrichment
// Ephemeral — does NOT write to DB. User selects relevant blocks in the UI.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResearchBlock {
  title: string;
  snippet: string;
  url: string;
  relevance: number;
}

async function tavilySearch(query: string, apiKey: string, days?: number) {
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    search_depth: "basic",
    max_results: 10,
    include_raw_content: false,
  };
  // When a recency window is requested, switch to the news topic so Tavily
  // actually honors `days` (it ignores `days` for the default general topic).
  if (days && days > 0) {
    body.topic = "news";
    body.days = days;
  }
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const results = data?.results ?? [];
  return Array.isArray(results) ? results : [];
}

async function extractBlocks(
  query: string,
  context: string,
  results: Array<{ url?: string; title?: string; content?: string }>,
  apiKey: string,
): Promise<ResearchBlock[]> {
  const compact = results
    .slice(0, 8)
    .map((r, i) =>
      `[${i + 1}] URL: ${r.url ?? "?"}\nTitle: ${r.title ?? ""}\n${
        (r.content ?? "").slice(0, 1500)
      }`,
    )
    .join("\n\n---\n\n");

  const systemPrompt = `אתה עוזר מחקר לכתיבת מאמרים בתחום תשתיות מידע ומרכזי נתונים.
קבלת תוצאות חיפוש מהרשת. חלץ ממנה קטעי מידע רלוונטיים ותמציתיים לנושא הנתון.
החזר אך ורק דרך הכלי extract_blocks — אין להחזיר טקסט חופשי.`;

  const userPrompt = `נושא המאמר: "${query}"
${context ? `הקשר נוסף: ${context}` : ""}

תוצאות החיפוש:
${compact}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_blocks",
          description: "Extract relevant research blocks from search results",
          parameters: {
            type: "object",
            properties: {
              blocks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "כותרת קצרה לבלוק התוכן" },
                    snippet: { type: "string", description: "תקציר תמציתי של המידע הרלוונטי (2-4 משפטים)" },
                    url: { type: "string", description: "URL המקור" },
                    relevance: { type: "number", description: "רלוונטיות 0-100" },
                  },
                  required: ["title", "snippet", "url", "relevance"],
                },
                maxItems: 6,
              },
            },
            required: ["blocks"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_blocks" } },
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];
  const parsed = JSON.parse(args);
  return (parsed.blocks ?? []).sort((a: ResearchBlock, b: ResearchBlock) => b.relevance - a.relevance);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!TAVILY_API_KEY) return json({ error: "TAVILY_API_KEY missing" }, 500);
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY missing" }, 500);

    const body = await req.json().catch(() => ({}));
    const query: string = typeof body?.query === "string" ? body.query.trim() : "";
    const context: string = typeof body?.context === "string" ? body.context.trim() : "";
    const days: number | undefined = typeof body?.days === "number" && body.days > 0 ? body.days : undefined;

    if (!query) return json({ error: "query is required" }, 400);

    const searchQuery = `${query} data center infrastructure technology`;
    const rawResults = await tavilySearch(searchQuery, TAVILY_API_KEY, days);

    if (rawResults.length === 0) return json({ blocks: [] });

    const blocks = await extractBlocks(query, context, rawResults, OPENAI_API_KEY);
    return json({ blocks });

  } catch (e) {
    console.error("research-web error", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
