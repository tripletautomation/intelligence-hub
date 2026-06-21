// dispatch-due-posts: invoked hourly by pg_cron (service role).
// Finds queued posts whose time has arrived, marks them "due", and emails the
// ready-to-paste content + a deep link to open the platform composer.
// This is the "one-click publish" bridge until real platform APIs are wired.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Intelligence Hub <onboarding@resend.dev>";
const FALLBACK_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "tripletautomation@gmail.com";

const PLATFORM_LABELS: Record<string, string> = {
  linkedin_he: "LinkedIn (עברית)",
  linkedin_en: "LinkedIn (English)",
  instagram: "Instagram",
  facebook: "Facebook",
  blog: "בלוג",
  newsletter: "Newsletter",
};

function composerLink(platform: string): string | null {
  switch (platform) {
    case "linkedin_he":
    case "linkedin_en":
      return "https://www.linkedin.com/feed/?shareActive=true";
    case "instagram":
      return "https://www.instagram.com/";
    case "facebook":
      return "https://www.facebook.com/";
    default:
      return null; // blog / newsletter — no external composer
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface DuePost {
  id: string;
  platform: string;
  content: string;
  scheduled_at: string;
  user_id: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildEmailHtml(posts: DuePost[]): string {
  const blocks = posts.map((p) => {
    const link = composerLink(p.platform);
    const linkHtml = link
      ? `<a href="${link}" style="display:inline-block;margin-top:8px;padding:8px 14px;background:#00A8FF;color:#fff;text-decoration:none;border-radius:6px;font-size:13px">פתח ${esc(PLATFORM_LABELS[p.platform] ?? p.platform)} →</a>`
      : "";
    return `
      <div style="margin:0 0 24px;padding:16px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa">
        <div style="font-weight:700;color:#0D1B2A;margin-bottom:8px">${esc(PLATFORM_LABELS[p.platform] ?? p.platform)}</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;color:#1A1F2E;margin:0">${esc(p.content)}</pre>
        ${linkHtml}
      </div>`;
  }).join("");

  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;padding:24px;background:#fff;font-family:'Segoe UI',Arial,sans-serif">
    <div style="max-width:640px;margin:0 auto">
      <h2 style="color:#0D1B2A;margin:0 0 4px">תוכן מתוזמן מוכן לפרסום</h2>
      <p style="color:#6b7280;margin:0 0 20px;font-size:14px">${posts.length} פוסטים הגיע זמנם. העתק את הטקסט והדבק בפלטפורמה בלחיצה.</p>
      ${blocks}
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">נשלח אוטומטית מ-Intelligence Hub · TripleT</p>
    </div>
  </body></html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured — skipping email send");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const nowIso = new Date().toISOString();

    // 1. Find queued posts whose time has arrived
    const { data: due, error: dueErr } = await admin
      .from("scheduled_posts")
      .select("id,platform,content,scheduled_at,user_id")
      .eq("status", "queued")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true });

    if (dueErr) throw dueErr;
    const posts = (due ?? []) as DuePost[];
    if (posts.length === 0) return json({ dispatched: 0 });

    // 2. Mark them due
    const ids = posts.map((p) => p.id);
    await admin
      .from("scheduled_posts")
      .update({ status: "due", updated_at: nowIso })
      .in("id", ids);

    // 3. Group by user
    const byUser = new Map<string | null, DuePost[]>();
    for (const p of posts) {
      const key = p.user_id ?? null;
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key)!.push(p);
    }

    // 4. Resolve recipient email per user and send
    let emailsSent = 0;
    for (const [userId, userPosts] of byUser) {
      let email = FALLBACK_EMAIL;
      if (userId) {
        const { data: u } = await admin.auth.admin.getUserById(userId);
        if (u?.user?.email) email = u.user.email;
      }
      const subject = `תוכן מתוזמן מוכן לפרסום (${userPosts.length})`;
      const html = buildEmailHtml(userPosts);
      if (await sendEmail(email, subject, html)) emailsSent++;
    }

    return json({ dispatched: posts.length, emails_sent: emailsSent });
  } catch (e) {
    console.error("dispatch-due-posts error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
