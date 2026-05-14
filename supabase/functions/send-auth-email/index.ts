const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "onboarding@resend.dev";
const FROM_NAME = "Intelligence Hub";

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

function buildEmail(actionType: string, confirmationUrl: string, userEmail: string) {
  const subjects: Record<string, string> = {
    signup: "אמת את החשבון שלך — Intelligence Hub",
    recovery: "איפוס סיסמה — Intelligence Hub",
    email_change: "אמת שינוי כתובת מייל — Intelligence Hub",
    invite: "הוזמנת ל-Intelligence Hub",
  };
  const headings: Record<string, string> = {
    signup: "ברוך הבא! אמת את החשבון שלך",
    recovery: "איפוס סיסמה",
    email_change: "אמת שינוי כתובת מייל",
    invite: "הוזמנת להצטרף",
  };
  const actions: Record<string, string> = {
    signup: "אמת חשבון",
    recovery: "אפס סיסמה",
    email_change: "אמת שינוי",
    invite: "קבל הזמנה",
  };

  const subject = subjects[actionType] ?? "הודעה מ-Intelligence Hub";
  const heading = headings[actionType] ?? "הודעה";
  const action = actions[actionType] ?? "לחץ כאן";

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;max-width:560px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#6366f1;font-weight:700;">Triple T</p>
          <h1 style="margin:0 0 24px;font-size:22px;color:#0f172a;">${heading}</h1>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">הכתובת: <strong>${userEmail}</strong></p>
          <p style="margin:0 0 28px;font-size:14px;color:#475569;">לחצי על הכפתור למטה כדי להמשיך:</p>
          <a href="${confirmationUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">${action}</a>
          <p style="margin:28px 0 0;font-size:12px;color:#94a3b8;">הקישור תקף ל-24 שעות. אם לא ביקשת זאת — ניתן להתעלם ממייל זה.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();

    const userEmail: string = payload?.user?.email ?? "";
    const emailData = payload?.email_data ?? {};
    const actionType: string = emailData?.email_action_type ?? "signup";
    const tokenHash: string = emailData?.token_hash ?? emailData?.token ?? "";
    const redirectTo: string = emailData?.redirect_to ?? emailData?.site_url ?? "";
    const siteUrl: string = emailData?.site_url ?? "https://hub-sapir1.vercel.app";

    const confirmationUrl = `${siteUrl}/auth/v1/verify?token=${tokenHash}&type=${actionType}&redirect_to=${encodeURIComponent(redirectTo || siteUrl)}`;

    if (!userEmail || !tokenHash) {
      return json({ error: "missing email or token" }, 400);
    }

    const { subject, html } = buildEmail(actionType, confirmationUrl, userEmail);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM}>`,
        to: [userEmail],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return json({ error: err }, 500);
    }

    const data = await res.json();
    console.log("Email sent:", data.id, "to:", userEmail, "type:", actionType);
    return json({});
  } catch (e) {
    console.error("send-auth-email error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
