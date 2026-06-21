// schedule-post: queue one or more platform posts for later publishing.
// Body: { draft_id?, items: [{ platform, content, scheduled_at, media_prompt? }] }
// Returns the inserted scheduled_posts rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_PLATFORMS = new Set([
  "linkedin_he", "linkedin_en", "instagram", "facebook", "blog", "newsletter",
]);

interface ScheduleItem {
  platform?: string;
  content?: string;
  scheduled_at?: string;
  media_prompt?: string | null;
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
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const draftId: string | null = typeof body?.draft_id === "string" ? body.draft_id : null;
    const items: ScheduleItem[] = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) return json({ error: "items array is required" }, 400);

    const rows = [];
    for (const it of items) {
      if (!it.platform || !VALID_PLATFORMS.has(it.platform)) {
        return json({ error: `invalid platform: ${it.platform}` }, 400);
      }
      if (!it.content || !it.content.trim()) {
        return json({ error: `content is required for ${it.platform}` }, 400);
      }
      const t = it.scheduled_at ? new Date(it.scheduled_at).getTime() : NaN;
      if (Number.isNaN(t)) {
        return json({ error: `invalid scheduled_at for ${it.platform}` }, 400);
      }
      rows.push({
        draft_id: draftId,
        platform: it.platform,
        content: it.content.trim(),
        media_prompt: it.media_prompt ?? null,
        scheduled_at: new Date(t).toISOString(),
        status: "queued",
        user_id: userId,
        updated_at: new Date().toISOString(),
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: inserted, error } = await admin
      .from("scheduled_posts")
      .insert(rows)
      .select("id,platform,scheduled_at,status");

    if (error) throw error;
    return json({ scheduled: inserted, count: inserted?.length ?? 0 });
  } catch (e) {
    console.error("schedule-post error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
