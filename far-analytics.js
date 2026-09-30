/* FAR first-party audience analytics
   Anonymous device/session IDs only. No names, email addresses or precise location. */
(() => {
  const SUPABASE_URL = "https://nkdjnrycpdiwburtkzen.supabase.co";
  const SUPABASE_KEY = "sb_publishable_jswOUS7A8Uw3RqQXj3kxQw_dZaJYC_2";
  const ENDPOINT = SUPABASE_URL + "/rest/v1/far_audience_events";
  const DEVICE_KEY = "far_analytics_device_v1";
  const SESSION_KEY = "far_analytics_session_v1";

  function id(prefix) {
    const raw = (crypto.randomUUID ? crypto.randomUUID() :
      Date.now().toString(36) + Math.random().toString(36).slice(2));
    return prefix + "_" + raw;
  }
  function stored(key, prefix, sessionOnly=false) {
    const store = sessionOnly ? sessionStorage : localStorage;
    let value = store.getItem(key);
    if (!value) { value = id(prefix); store.setItem(key, value); }
    return value;
  }
  const deviceId = stored(DEVICE_KEY, "d");
  const sessionId = stored(SESSION_KEY, "s", true);

  function installedMode() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }
  function send(eventType, extra={}) {
    const cfg=window.FAR_EVENTS_CONFIG||{};
    if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return Promise.resolve(false);
    const body={event_type:eventType,device_id:deviceId,session_id:sessionId,source:extra.source||(installedMode()?"pwa":"website"),page:location.pathname,listen_session_id:extra.listen_session_id||null,duration_seconds:Number.isFinite(extra.duration_seconds)?Math.max(0,Math.round(extra.duration_seconds)):null};
    return fetch(cfg.SUPABASE_URL+"/functions/v1/far-audience",{method:"POST",mode:"cors",cache:"no-store",credentials:"omit",keepalive:true,headers:{apikey:cfg.SUPABASE_ANON_KEY,Authorization:"Bearer "+cfg.SUPABASE_ANON_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.ok).catch(()=>false);
  }

  let listenId = null;
  let listenStarted = 0;
  let heartbeat = null;

  function startListening(source) {
    if (listenId) return;
    listenId = id("l");
    listenStarted = Date.now();
    send("listen_start", {source, listen_session_id: listenId});
    heartbeat = setInterval(() => {
      if (!listenId) return;
      send("listen_heartbeat", {
        source,
        listen_session_id: listenId,
        duration_seconds: (Date.now() - listenStarted) / 1000
      });
    }, 30000);
  }
  function stopListening(source) {
    if (!listenId) return;
    const current = listenId;
    const duration = (Date.now() - listenStarted) / 1000;
    clearInterval(heartbeat);
    heartbeat = null;
    listenId = null;
    send("listen_stop", {source, listen_session_id: current, duration_seconds: duration});
  }

  window.FARAnalytics = {
    send,
    deviceId,
    sessionId,
    installedMode,
    startListening,
    stopListening
  };

  // One visit/open per browser session and page view separately.
  send(installedMode() ? "app_open" : "website_visit");
})();