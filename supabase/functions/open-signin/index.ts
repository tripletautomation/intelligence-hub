// open-signin: Creates or confirms a user without email verification.
// Uses service role admin API so email_confirm is forced true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const email: string = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password: string = typeof body?.password === "string" ? body.password : "";
    const name: string = typeof body?.name === "string" ? body.name.trim() : "";

    if (!email || !password) return json({ error: "email and password required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Try to create user with email pre-confirmed
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { first_name: name } : undefined,
    });

    if (createErr) {
      // User already exists — just confirm them (in case they signed up before this flow)
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
      if (existing && !existing.email_confirmed_at) {
        await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
      }
    }

    return json({ ok: true });
  } catch (e) {
    console.error("open-signin error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
