import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://fenlandangelsradio.co.uk",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("Not signed in");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) throw new Error("Invalid FAR login");

    const admin = createClient(url, service);
    const { data: me, error: meError } = await admin.from("far_admins").select("role").eq("user_id", user.id).single();
    if (meError || !me || !["owner","deputy_manager"].includes(me.role)) throw new Error("Management access required");

    const body = await req.json();
    if (body.action !== "invite") throw new Error("Unsupported action");
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim();
    const role = String(body.role || "staff");
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];

    const roles = ["deputy_manager","admin","presenter","news","events","sales","staff"];
    const allowedPermissions = ["cloud_live","audience","events","inbox","applications","advertising"];
    if (!email || !displayName || !roles.includes(role)) throw new Error("Invalid staff details");
    if (permissions.some((p: string) => !allowedPermissions.includes(p))) throw new Error("Invalid permission");
    if (role === "deputy_manager" && me.role !== "owner") throw new Error("Only the Owner can appoint a Deputy Station Manager");

    // Resolve an existing Auth account first so changing staff access never
    // burns another invitation email. Supabase Admin currently has no
    // get-user-by-email call, so page through users server-side.
    let authUser: any = null;
    for (let page = 1; page <= 20 && !authUser; page++) {
      const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listError) throw listError;
      authUser = listed.users.find((u: any) => String(u.email || "").toLowerCase() === email) || null;
      if (listed.users.length < 1000) break;
    }

    let invited = false;
    if (!authUser) {
      const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: displayName },
        redirectTo: "https://fenlandangelsradio.co.uk/admin-dashboard.html"
      });
      if (inviteError) throw inviteError;
      if (!invite.user) throw new Error("No user returned by Supabase Auth");
      authUser = invite.user;
      invited = true;
    }

    // Audience Analytics is compulsory for every FAR staff account.
    const effectivePermissions = Array.from(new Set(["audience", ...permissions]));
    const { error: accessError } = await admin.from("far_admins").upsert({
      user_id: authUser.id,
      display_name: displayName,
      role,
      permissions: effectivePermissions
    }, { onConflict: "user_id" });
    if (accessError) throw accessError;

    return new Response(JSON.stringify({
      ok: true,
      invited,
      existing_user: !invited,
      message: invited ? "Staff invitation sent and access saved." : "Existing account found — FAR access updated."
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Request failed" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
