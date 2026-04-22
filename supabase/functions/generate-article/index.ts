import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ItemRow {
  id: string;
  title_he: string;
  summary_he: string | null;
  why_it_matters: string | null;
  url: string | null;
  tags_ai: string[] | null;
  item_type: string;
  region: string | null;
}

const SYSTEM_PROMPT = `אתה עורך תוכן מקצועי הכותב מאמרי דעה / ניתוח קצרים בעברית עבור קהל מקצועי בתחום התשתיות, מרכזי הנתונים, וטכנולוגיה.
המשימה: לקבל מספר פריטי תוכן (כתבות / מחקרים / אירועים) ולהפיק מהם **מאמר אחד קוהרנטי** — לא תקציר משורשר.

דרישות:
- כתוב בעברית רהוטה, מקצועית, לא מתורגמת.
- שמר על הרעיונות המרכזיים מהפריטים אבל ארגן אותם סביב תזה אחת.
- אל תמציא עובדות או נתונים שלא הופיעו בחומר.
- חלק את המאמר ל: כותרת, פתיח (hook), גוף, וסיכום.
- אורך כולל מומלץ: 350-550 מילים.
- אם נותן המשתמש הערת סגנון — כבד אותה.

החזר את התוצאה דרך הכלי emit_article_draft בלבד. אין להחזיר טקסט חופשי.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return json({ error: "missing auth" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const itemIds: string[] = Array.isArray(body?.item_ids) ? body.item_ids : [];
    const styleNote: string | null = typeof body?.style_note === "string" && body.style_note.trim()
      ? body.style_note.trim() : null;

    if (itemIds.length < 1 || itemIds.length > 10) {
      return json({ error: "יש לבחור בין 1 ל-10 פריטים" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: items, error: itemsErr } = await admin
      .from("items")
      .select("id,title_he,summary_he,why_it_matters,url,tags_ai,item_type,region")
      .in("id", itemIds);
    if (itemsErr) return json({ error: itemsErr.message }, 500);
    if (!items || items.length === 0) return json({ error: "לא נמצאו פריטים" }, 404);

    const sourceBlock = (items as ItemRow[])
      .map((it, idx) => {
        const lines = [
          `[#${idx + 1}] ${it.title_he}`,
          it.summary_he ? `סיכום: ${it.summary_he}` : null,
          it.why_it_matters ? `למה זה חשוב: ${it.why_it_matters}` : null,
          it.tags_ai?.length ? `תגיות: ${it.tags_ai.join(", ")}` : null,
          it.url ? `מקור: ${it.url}` : null,
        ].filter(Boolean);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");

    const userPrompt = [
      `להלן ${items.length} פריטי תוכן. הפק מהם מאמר אחד קוהרנטי לפי ההנחיות.`,
      styleNote ? `\nהערת סגנון מהמשתמש:\n${styleNote}` : "",
      `\n--- פריטי המקור ---\n${sourceBlock}`,
    ].join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_article_draft",
            description: "Emit the generated article draft.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "כותרת המאמר בעברית" },
                intro: { type: "string", description: "פתיח/הוק קצר (1-2 פסקאות)" },
                body: { type: "string", description: "גוף המאמר. ניתן להשתמש בפסקאות מופרדות בשורה ריקה." },
                closing: { type: "string", description: "סיכום קצר וחד" },
              },
              required: ["title", "intro", "body", "closing"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_article_draft" } },
      }),
    });

    if (aiResp.status === 429) return json({ error: "חרגת ממכסת הבקשות. נסה שוב בעוד דקה." }, 429);
    if (aiResp.status === 402) return json({ error: "אזל הקרדיט ב-Lovable AI. הוסף קרדיטים בהגדרות הסביבה." }, 402);
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("ai gateway error", aiResp.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    if (!args) return json({ error: "AI לא החזיר תוצאה תקפה" }, 500);

    let parsed: { title: string; intro: string; body: string; closing: string };
    try {
      parsed = JSON.parse(args);
    } catch {
      return json({ error: "AI החזיר JSON לא תקין" }, 500);
    }

    const { data: inserted, error: insertErr } = await admin
      .from("article_drafts")
      .insert({
        user_id: userId,
        title: parsed.title,
        intro: parsed.intro,
        body: parsed.body,
        closing: parsed.closing,
        source_item_ids: itemIds,
        style_note: styleNote,
      })
      .select("id")
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);

    return json({ draft_id: inserted.id });
  } catch (e) {
    console.error("generate-article fatal", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה לא ידועה" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}