import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store, max-age=0",
};

const BASE = 300.62;
const SINCE = "2026-09-29T22:18:59.24036Z";

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req) => {
 if (req.method === "OPTIONS") {
  return new Response(null, { status: 204, headers: cors });
}

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // ----------------------------------------
    // GET = ONE CENTRAL LISTENER-HOURS TOTAL
    // ----------------------------------------
    if (req.method === "GET") {
      const now = Date.now(), until = new Date(now).toISOString();
      const rows: any[] = [];
      let complete = false;
      for (let offset = 0; offset < 500000;) {
        const { data, error } = await db.from("far_icecast_snapshots")
          .select("id,created_at,listeners,stream_online")
          .gte("created_at", SINCE).lte("created_at", until)
          .order("created_at", { ascending: true }).order("id", { ascending: true })
          .range(offset, offset + 499);
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error("Invalid audience history page.");
        if (!data.length) { complete = true; break; }
        rows.push(...data);
        offset += data.length;
      }
      if (!complete) throw new Error("Audience history exceeds reporting limit.");
      let added = 0;

      for (let i = 0; i < rows.length; i++) {
        const start = new Date(rows[i].created_at).getTime();
        if (!Number.isFinite(start) || rows[i].stream_online === false ||
            !Number.isFinite(Number(rows[i].listeners))) continue;

        const next =
          i + 1 < rows.length
            ? new Date(rows[i + 1].created_at).getTime()
            : Math.min(now, start + 300000);

        const milliseconds = Math.max(
          0,
          Math.min(300000, next - start, now - start)
        );

        added +=
          Math.max(0, Number(rows[i].listeners)) *
          milliseconds /
          3600000;
      }

      return json({
        ok: true,
        baseline_hours: BASE,
        added_hours: added,
        lifetime_hours: BASE + added,
        updated_at: until,
        samples: rows.length,
      });
    }

    // ----------------------------------------
    // POST = WEBSITE / APP LISTENER TRACKING
    // ----------------------------------------
    if (req.method === "POST") {
      const body = await req.json();

      const allowed = new Set([
        "website_visit",
        "app_open",
        "app_install",
        "listen_start",
        "listen_heartbeat",
        "listen_stop",
      ]);

      if (!allowed.has(String(body.event_type || ""))) {
        return json({ error: "Invalid event" }, 400);
      }

      const row = {
        event_type: String(body.event_type),

        device_id: String(body.device_id || "")
          .slice(0, 100),

        session_id: String(body.session_id || "")
          .slice(0, 100),

        source:
          body.source === "pwa"
            ? "pwa"
            : "website",

        page:
          String(body.page || "")
            .slice(0, 300) || null,

        listen_session_id:
          body.listen_session_id
            ? String(body.listen_session_id).slice(0, 100)
            : null,

        duration_seconds:
          Number.isFinite(Number(body.duration_seconds))
            ? Math.max(
                0,
                Math.round(Number(body.duration_seconds))
              )
            : null,
      };

      if (
        row.device_id.length < 3 ||
        row.session_id.length < 3
      ) {
        return json({ error: "Invalid session" }, 400);
      }

      const { error } = await db
        .from("far_audience_events")
        .insert(row);

      if (error) throw error;

      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Request failed",
      },
      500
    );
  }
});