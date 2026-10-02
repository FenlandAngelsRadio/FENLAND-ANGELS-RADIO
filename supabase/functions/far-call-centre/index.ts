import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sshConfigured, serverBridge } from "../_shared/server-bridge.ts";
const cors = {
  "Access-Control-Allow-Origin": "https://fenlandangelsradio.co.uk",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return reply({ error: "Sign in to FAR Admin." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: loginError } = await caller.auth.getUser();
    if (loginError || !user) return reply({ error: "Your sign-in has expired." }, 401);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: staff, error } = await db.from("far_admins")
      .select("role,permissions").eq("user_id", user.id).maybeSingle();
    const role = String(staff?.role || "").toLowerCase();
    const permissions = Array.isArray(staff?.permissions) ? staff.permissions : [];
    if (error || !staff || !(["owner", "deputy_manager"].includes(role) || permissions.includes("cloud_live"))) {
      return reply({ error: "Your account does not have Cloud Live access." }, 403);
    }
    const body = await req.json();
    const phoneActions = ['phone_settings','phone_save','phone_upload_start','phone_upload_chunk','phone_upload_finish'];
    if (!["list", "act", ...phoneActions].includes(body.action)) return reply({ error: "Choose a valid call control." }, 400);
    if (phoneActions.includes(body.action) && !['owner','deputy_manager'].includes(role)) return reply({error:'Station management access is required.'},403);
    if (body.action === "act" && (typeof body.id !== "string" || !Number.isInteger(body.version)
        || !["screen", "ready", "hold", "put_on_air", "mute", "end", "answer_private", "voicemail"].includes(body.operation))) {
      return reply({ error: "Refresh the queue and choose a call." }, 400);
    }
    const bridge = Deno.env.get("FAR_CALL_CENTRE_URL"), token = Deno.env.get("FAR_CALL_STAFF_TOKEN");
    if ((!bridge || !token) && !sshConfigured()) return reply({ error: "The phone service is not connected yet." }, 503);
    const payload = { action: body.action, id: body.id, operation: body.operation,
      version: body.version, options:body.options,slot:body.slot,size:body.size,
      upload:body.upload,offset:body.offset,data:body.data,
      actor: { id: user.id, role, permissions } };
    let result, status;
    if (sshConfigured()) {
      const response = await serverBridge('calls', 'POST', '/queue', payload);
      result = response.data; status = response.status;
    } else {
      const parsed = new URL(bridge!);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid bridge configuration');
      const response = await fetch(bridge!.replace(/\/$/, '') + '/queue', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      result = await response.json(); status = response.status;
    }
    if (status !== 200) return reply({ error: result.error || 'The call action could not be confirmed.' }, status);
    // Defence in depth: no private caller details for ordinary Cloud Live staff.
    if (Array.isArray(result.calls) && !["owner", "deputy_manager"].includes(role)) {
      result.calls = result.calls.filter((call: { category: string }) => call.category !== "business");
      result.private_access = false;
    }
    return reply(result);
  } catch {
    return reply({ error: "Call service unavailable. Refresh before trying again." }, 503);
  }
});
