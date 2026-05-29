// auto-generate-weekly
// Generates a weekly digest article + 2-3 topic-focused articles
// Called by pg_cron every Friday morning, or manually from Admin

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ItemRow {
  id: string;
  title_he: string;
  summary_he: string | null;
  why_it_matters: string | null;
  url: string | null;
  tags_ai: string[] | null;
  item_type: string;
  region: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Forward the caller's JWT so inner functions (generate-article etc.) can auth
    const authHeader = req.headers.get("Authorization") ?? `Bearer ${SERVICE_KEY}`;

    const body = await req.json().catch(() => ({}));
    const daysBack: number = typeof body?.days_back === "number" ? body.days_back : 7;
    const dryRun: boolean = body?.dry_run === true;

    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    // Fetch items from the past N days
    const { data: items, error: itemsErr } = await admin
      .from("items")
      .select("id,title_he,summary_he,why_it_matters,url,tags_ai,item_type,region,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30);

    if (itemsErr) {
      console.error("items query error:", itemsErr);
      return json({ error: itemsErr.message }, 500);
    }
    if (!items || items.length === 0) return json({ message: "אין ידיעות חדשות לשבוע זה", drafts_created: [] });

    const allItems = items as ItemRow[];

    // Group items by primary tag for focused articles
    const tagGroups: Record<string, ItemRow[]> = {};
    allItems.forEach((item) => {
      const tag = item.tags_ai?.[0]?.toLowerCase() ?? "כללי";
      if (!tagGroups[tag]) tagGroups[tag] = [];
      tagGroups[tag].push(item);
    });

    // Pick top 3 tag groups with most items (excluding single-item groups when possible)
    const sortedGroups = Object.entries(tagGroups)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .filter(([, groupItems]) => groupItems.length >= 1);

    // Helper — calls another edge function, forwarding the caller's JWT
    const invokeFunction = async (fnName: string, payload: Record<string, unknown>) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${fnName} failed (${res.status}): ${text.slice(0, 200)}`);
      }
      return res.json();
    };

    if (dryRun) {
      return json({
        dry_run: true,
        total_items: allItems.length,
        weekly_digest_items: allItems.map((i) => i.id),
        focused_topics: sortedGroups.map(([tag, its]) => ({
          tag,
          item_count: its.length,
          item_ids: its.map((i) => i.id),
        })),
      });
    }

    const createdDrafts: { type: string; tag?: string; draft_id: string }[] = [];
    const errors: string[] = [];

    // ── 1. Weekly digest — blog_he + blog_en + linkedin ───────────────────────
    const digestIds = allItems.slice(0, 12).map((i) => i.id);
    const digestInstructions = "זהו מאמר סיכום שבועי של Triple T. כלול את ההתפתחויות החשובות מהשבוע, חבר אותן לנרטיב אחד קוהרנטי, וסיים עם תובנה שבועית מרכזית.";

    for (const type of ["blog_he", "blog_en", "linkedin"] as const) {
      try {
        let result;
        if (type === "linkedin") {
          result = await invokeFunction("generate-article", {
            item_ids: digestIds,
            instructions: digestInstructions,
            target_words: "long",
          });
        } else {
          result = await invokeFunction("generate-blog-post", {
            item_ids: digestIds,
            language: type === "blog_en" ? "en" : "he",
            instructions: digestInstructions,
          });
        }
        if (result?.draft_id) {
          createdDrafts.push({ type: `weekly_${type}`, draft_id: result.draft_id });
          // Generate social posts + image prompt for the digest linkedin draft
          if (type === "linkedin") {
            try {
              await invokeFunction("generate-social-posts", {
                draft_id: result.draft_id,
                instructions: digestInstructions,
              });
            } catch (e) {
              errors.push(`social posts for weekly digest: ${(e as Error).message}`);
            }
          }
        }
      } catch (e) {
        errors.push(`weekly_${type}: ${(e as Error).message}`);
      }
    }

    // ── 2. Focused articles — linkedin per topic group ────────────────────────
    for (const [tag, groupItems] of sortedGroups) {
      const groupIds = groupItems.slice(0, 7).map((i) => i.id);
      const focusedInstructions = `מאמר ממוקד על: ${tag}. התמקד בהתפתחויות הספציפיות בנושא זה והשלכותיהן על ארגונים טכנולוגיים.`;

      try {
        const result = await invokeFunction("generate-article", {
          item_ids: groupIds,
          instructions: focusedInstructions,
          target_words: "medium",
        });
        if (result?.draft_id) {
          createdDrafts.push({ type: "focused_linkedin", tag, draft_id: result.draft_id });
          try {
            await invokeFunction("generate-social-posts", {
              draft_id: result.draft_id,
              instructions: focusedInstructions,
            });
          } catch (e) {
            errors.push(`social posts for ${tag}: ${(e as Error).message}`);
          }
        }
      } catch (e) {
        errors.push(`focused_${tag}: ${(e as Error).message}`);
      }
    }

    return json({
      message: `נוצרו ${createdDrafts.length} טיוטות`,
      drafts_created: createdDrafts,
      errors: errors.length ? errors : undefined,
      stats: {
        total_items_scanned: allItems.length,
        digest_items: digestIds.length,
        focused_topics: sortedGroups.map(([tag, its]) => ({ tag, items: its.length })),
      },
    });

  } catch (e) {
    console.error("auto-generate-weekly fatal", e);
    return json({ error: e instanceof Error ? e.message : "שגיאה לא ידועה" }, 500);
  }
});
