import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getApiKey(admin: ReturnType<typeof createClient>, envName: string): Promise<string | undefined> {
  const { data } = await admin.from("admin_api_keys").select("key_value").eq("key_name", envName).maybeSingle();
  return data?.key_value || Deno.env.get(envName);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const itemId: string = body?.item_id ?? "";
    if (!itemId) return json({ error: "item_id is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load item
    const { data: item, error: itemErr } = await admin
      .from("items")
      .select("id,title_he,summary_he,why_it_matters,url,tags_ai,item_type,published_at")
      .eq("id", itemId)
      .maybeSingle();
    if (itemErr || !item) return json({ error: "item not found" }, 404);

    // Load AI config — use default model for summarization
    const { data: aiConfig } = await admin
      .from("ai_config").select("provider,model_id").eq("id", "default").maybeSingle();
    const provider: string = aiConfig?.provider ?? "openai";
    const modelId: string = aiConfig?.model_id ?? "gpt-4o-mini";

    const apiKey = await getApiKey(admin,
      provider === "anthropic" ? "ANTHROPIC_API_KEY" :
      provider === "openai" ? "OPENAI_API_KEY" :
      "LOVABLE_API_KEY"
    );
    if (!apiKey) return json({ error: `API key missing for provider: ${provider}` }, 500);

    const systemPrompt = `אתה אנליסט מודיעין עסקי המתמחה בתחום מרכזי הנתונים, תשתיות ענן וטכנולוגיה.
תקבל פריט מידע ועליך להחזיר סיכום מובנה דרך הכלי emit_summary.
הסיכום צריך להיות בעברית מקצועית, תמציתית ומדויקת.`;

    const userPrompt = `כותרת: ${item.title_he}
${item.summary_he ? `\nסיכום קיים: ${item.summary_he}` : ""}
${item.why_it_matters ? `\nלמה זה חשוב: ${item.why_it_matters}` : ""}
${item.tags_ai?.length ? `\nתגיות: ${(item.tags_ai as string[]).join(", ")}` : ""}
${item.url ? `\nמקור: ${item.url}` : ""}

הפק סיכום מובנה ומעמיק של פריט זה.`;

    const emitTool = {
      name: "emit_summary",
      description: "Emit a structured intelligence brief",
      parameters: {
        type: "object",
        properties: {
          brief: { type: "string", description: "סיכום תמציתי ב-2-3 משפטים — המהות בלבד" },
          key_points: {
            type: "array",
            items: { type: "string" },
            description: "3-4 נקודות מפתח קצרות מהפריט",
          },
          implications: { type: "string", description: "השלכה עסקית/אסטרטגית קצרה — משפט אחד" },
        },
        required: ["brief", "key_points", "implications"],
        additionalProperties: false,
      },
    };

    let result: { brief: string; key_points: string[]; implications: string };

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 1024,
          system: systemPrompt,
          tools: [{ name: emitTool.name, description: emitTool.description, input_schema: emitTool.parameters }],
          tool_choice: { type: "tool", name: "emit_summary" },
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
      const j = await res.json();
      const toolUse = j?.content?.find((b: any) => b.type === "tool_use");
      if (!toolUse?.input) throw new Error("AI לא החזיר תוצאה תקפה");
      result = toolUse.input;
    } else if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          tools: [{ type: "function", function: emitTool }],
          tool_choice: { type: "function", function: { name: "emit_summary" } },
        }),
      });
      if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
      const j = await res.json();
      const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) throw new Error("AI לא החזיר תוצאה תקפה");
      result = JSON.parse(args);
    } else {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          tools: [{ type: "function", function: emitTool }],
          tool_choice: { type: "function", function: { name: "emit_summary" } },
        }),
      });
      if (!res.ok) throw new Error(`Lovable AI error ${res.status}: ${await res.text()}`);
      const j = await res.json();
      const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) throw new Error("AI לא החזיר תוצאה תקפה");
      result = JSON.parse(args);
    }

    return json(result);

  } catch (e) {
    console.error("summarize-item error", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה לא ידועה" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
