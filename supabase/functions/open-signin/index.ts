// open-signin: Creates or updates a user without email verification.
// Uses service role admin API — email_confirm forced true.

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
    const email: string = (typeof body?.email === "string" ? body.email.trim() : "").toLowerCase();
    const password: string = typeof body?.password === "string" ? body.password : "";
    const name: string = typeof body?.name === "string" ? body.name.trim() : "";

    if (!email || !password) return json({ error: "email and password required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Try create first (new user path)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { first_name: name } : undefined,
    });

    if (!createErr && created?.user) {
      console.log("created new user", created.user.id);
      return json({ ok: true });
    }

    console.log("createUser error (likely existing):", createErr?.message);

    // User exists — find by iterating pages
    let existingUser: { id: string; email?: string; email_confirmed_at?: string | null } | null = null;
    let page = 1;
    while (!existingUser) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr || !list) break;
      const found = list.users.find((u) => u.email?.toLowerCase() === email);
      if (found) { existingUser = found; break; }
      if (list.users.length < 1000) break; // last page
      page++;
    }

    if (!existingUser) {
      console.error("user not found after create failed for:", email);
      return json({ error: "user not found" }, 500);
    }

    // Force confirm + sync password (in case password changed between attempts)
    const { error: updateErr } = await admin.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
      password,
    });

    if (updateErr) {
      console.error("updateUserById error:", updateErr.message);
      return json({ error: updateErr.message }, 500);
    }

    console.log("confirmed existing user", existingUser.id);
    return json({ ok: true });

  } catch (e) {
    console.error("open-signin fatal:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
