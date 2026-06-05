import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchUnsafe(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const errStr = String(err);
    if (errStr.includes("certificate") || errStr.includes("SSL") || errStr.includes("TLS")) {
      const httpUrl = url.replace(/^https:\/\//, "http://");
      if (httpUrl !== url) return await fetch(httpUrl, init);
    }
    throw err;
  }
}

async function safeJson(res: Response): Promise<any> {
  try { const t = await res.text(); return t ? JSON.parse(t) : null; } catch { return null; }
}

async function login3xui(panelUrl: string, username: string, password: string): Promise<string | null> {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  try {
    const res = await fetchUnsafe(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) return null;
    const match = setCookie.match(/([^=]+=[^;]+)/);
    const cookie = match ? match[1] : null;
    const body = await safeJson(res);
    return body?.success && cookie ? cookie : null;
  } catch { return null; }
}

// Find a client (by identifier = uuid/username) inside a specific inbound
async function findClientInInbound(panelUrl: string, cookie: string, inboundId: number, identifier: string) {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const res = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/get/${inboundId}`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  const data = await safeJson(res);
  if (!data?.success || !data?.obj) return null;
  const inbound = data.obj;
  let settings: any = {};
  try { settings = JSON.parse(inbound.settings || "{}"); } catch {}
  const entries = [
    ...(Array.isArray(settings.clients) ? settings.clients : []),
    ...(Array.isArray(settings.accounts) ? settings.accounts : []),
  ];
  for (const entry of entries) {
    const keys = [entry?.id, entry?.email, entry?.user, entry?.username, entry?.pass, entry?.password]
      .filter((v: any): v is string => typeof v === "string" && v.length > 0);
    if (keys.includes(identifier)) {
      const isSocks5 = Array.isArray(settings.accounts) && settings.accounts.includes(entry);
      const email = entry.email || inbound.remark || entry.user || entry.username || "";
      const expiryTime = isSocks5 ? (inbound.expiryTime || 0) : (entry.expiryTime || 0);
      return { inbound, settings, entry, email, expiryTime, isSocks5 };
    }
  }
  return null;
}

// Reset client (zero used traffic + restore totalGB to default)
async function resetClientToDefault(
  panelUrl: string,
  cookie: string,
  inbound: any,
  settings: any,
  email: string,
  isSocks5: boolean,
  defaultBytes: number,
): Promise<boolean> {
  const baseUrl = panelUrl.replace(/\/+$/, "");

  // 1) Reset traffic counters for this specific client (standard protocols)
  if (!isSocks5 && email) {
    try {
      await fetchUnsafe(`${baseUrl}/panel/api/inbounds/${inbound.id}/resetClientTraffic/${encodeURIComponent(email)}`, {
        method: "POST",
        headers: { Cookie: cookie, Accept: "application/json" },
      });
    } catch (e) { console.error("resetClientTraffic err:", e); }
  }

  // 2) Build updated settings / total
  let newSettingsStr = inbound.settings || "{}";
  let newTotal = Number(inbound.total) || 0;
  let newUp = inbound.up;
  let newDown = inbound.down;

  if (isSocks5) {
    // SOCKS5: counters live on inbound itself
    newTotal = defaultBytes;
    newUp = 0;
    newDown = 0;
  } else {
    let found = false;
    for (const c of settings.clients || []) {
      if (c.email === email) {
        c.totalGB = defaultBytes;
        found = true;
        break;
      }
    }
    if (!found) return false;
    newSettingsStr = JSON.stringify(settings);
  }

  const formData = new URLSearchParams();
  formData.append("up", String(newUp));
  formData.append("down", String(newDown));
  formData.append("total", String(newTotal));
  formData.append("remark", inbound.remark || "");
  formData.append("enable", String(inbound.enable));
  formData.append("expiryTime", String(inbound.expiryTime || 0));
  formData.append("listen", inbound.listen || "");
  formData.append("port", String(inbound.port));
  formData.append("protocol", inbound.protocol);
  formData.append("settings", newSettingsStr);
  formData.append("streamSettings", inbound.streamSettings || "");
  formData.append("sniffing", inbound.sniffing || "");
  formData.append("allocate", inbound.allocate || "");

  const res = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/update/${inbound.id}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  const body = await safeJson(res);
  return body?.success === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch {}

    // ===== Backfill: scan ALL inbounds on ALL configured panels and record every client =====
    if (body?.backfill === true) {
      const { data: existing } = await supabase.from("client_records").select("uuid, inbound_id, panel_url");
      const existSet = new Set((existing || []).map((r: any) => `${r.panel_url}::${r.inbound_id}::${r.uuid}`));

      const { data: panels } = await supabase.from("panels").select("*").eq("enabled", true);
      const { data: cfg } = await supabase.from("admin_config").select("panel_url, panel_user, panel_pass").limit(1).single();
      const allPanels: any[] = [...(panels || [])];
      if (cfg?.panel_url && !allPanels.some((p) => p.panel_url === cfg.panel_url)) {
        allPanels.push({ panel_url: cfg.panel_url, panel_user: cfg.panel_user, panel_pass: cfg.panel_pass });
      }

      // Lookup tables for enriching records when we can match orders → plan
      const { data: orders } = await supabase
        .from("orders").select("uuid, plan_name, inbound_id, email, status")
        .eq("status", "fulfilled");
      const orderByUuid = new Map<string, any>();
      for (const o of orders || []) if (o.uuid && !orderByUuid.has(o.uuid)) orderByUuid.set(o.uuid, o);
      const { data: plans } = await supabase.from("plans").select("id, title, traffic_gb");
      const planByTitle = new Map<string, any>();
      for (const p of plans || []) planByTitle.set(p.title, p);

      const results: any[] = [];
      let scanned = 0, inserted = 0;

      for (const panel of allPanels) {
        const cookie = await login3xui(panel.panel_url, panel.panel_user, panel.panel_pass);
        if (!cookie) { results.push({ panel: panel.panel_url, error: "login-failed" }); continue; }
        const baseUrl = panel.panel_url.replace(/\/+$/, "");
        const listRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/list`, {
          headers: { Cookie: cookie, Accept: "application/json" },
        });
        const listBody = await safeJson(listRes);
        if (!listBody?.success || !Array.isArray(listBody.obj)) {
          results.push({ panel: panel.panel_url, error: "list-failed" }); continue;
        }

        for (const inbound of listBody.obj) {
          let settings: any = {};
          try { settings = JSON.parse(inbound.settings || "{}"); } catch {}
          const clients = Array.isArray(settings.clients) ? settings.clients : [];
          const accounts = Array.isArray(settings.accounts) ? settings.accounts : [];

          // Standard protocols: each client entry is one user
          for (const c of clients) {
            const identifier = c.id || c.password || c.user || c.username || c.email;
            if (!identifier) continue;
            scanned++;
            const key = `${panel.panel_url}::${inbound.id}::${identifier}`;
            if (existSet.has(key)) continue;
            const email = c.email || inbound.remark || "";
            const ord = orderByUuid.get(identifier);
            const plan = ord ? planByTitle.get(ord.plan_name) : null;
            const { error: insErr } = await supabase.from("client_records").insert({
              uuid: identifier,
              plan_id: plan?.id || null,
              plan_title: ord?.plan_name || "",
              default_traffic_gb: plan ? Number(plan.traffic_gb) || 0 : 0,
              panel_url: panel.panel_url,
              inbound_id: inbound.id,
              client_email: email,
              is_socks5: false,
              last_reset_expiry: 0,
            });
            if (!insErr) { inserted++; existSet.add(key); }
            else results.push({ uuid: identifier, error: insErr.message });
          }

          // SOCKS5 / HTTP: accounts; each is one user
          for (const a of accounts) {
            const identifier = a.user || a.username || a.pass || a.password;
            if (!identifier) continue;
            scanned++;
            const key = `${panel.panel_url}::${inbound.id}::${identifier}`;
            if (existSet.has(key)) continue;
            const email = inbound.remark || a.user || a.username || "";
            const ord = orderByUuid.get(identifier);
            const plan = ord ? planByTitle.get(ord.plan_name) : null;
            const { error: insErr } = await supabase.from("client_records").insert({
              uuid: identifier,
              plan_id: plan?.id || null,
              plan_title: ord?.plan_name || "",
              default_traffic_gb: plan ? Number(plan.traffic_gb) || 0 : 0,
              panel_url: panel.panel_url,
              inbound_id: inbound.id,
              client_email: email,
              is_socks5: true,
              last_reset_expiry: 0,
            });
            if (!insErr) { inserted++; existSet.add(key); }
            else results.push({ uuid: identifier, error: insErr.message });
          }
        }
      }

      const failedCount = results.filter((r: any) => r?.error).length;
      try {
        await supabase.from("cron_execution_logs").insert({
          job_name: "auto-backfill-client-records",
          checked: scanned,
          reset_count: inserted,
          skipped_count: Math.max(0, scanned - inserted - failedCount),
          failed_count: failedCount,
          trigger_source: body?.source === "cron" ? "cron" : "manual",
          details: { panels: allPanels.length, results: results.slice(0, 50) },
        });
      } catch {}

      return new Response(JSON.stringify({
        success: true, backfill: true, panels: allPanels.length, scanned, inserted, results,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    // Load all client records
    const { data: records } = await supabase
      .from("client_records")
      .select("*");

    // Load rules + plans + plan_regions for default-GB resolution
    const { data: rules } = await supabase
      .from("traffic_default_rules")
      .select("*")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    const { data: plans } = await supabase.from("plans").select("id, category, region_id");
    const { data: planRegions } = await supabase.from("plan_regions").select("plan_id, region_id");
    const planMap = new Map<string, { category: string; region_id: string | null }>();
    for (const p of plans || []) planMap.set(p.id, { category: p.category || "", region_id: p.region_id || null });
    const planRegionMap = new Map<string, string[]>();
    for (const pr of planRegions || []) {
      const arr = planRegionMap.get(pr.plan_id) || [];
      arr.push(pr.region_id);
      planRegionMap.set(pr.plan_id, arr);
    }

    function resolveDefaultGB(rec: any, inboundRemark?: string): number {
      const planInfo = rec.plan_id ? planMap.get(rec.plan_id) : null;
      let planCategory = planInfo?.category || "";
      const regionIds: string[] = [];
      if (planInfo?.region_id) regionIds.push(planInfo.region_id);
      if (rec.plan_id && planRegionMap.has(rec.plan_id)) {
        for (const rid of planRegionMap.get(rec.plan_id)!) if (!regionIds.includes(rid)) regionIds.push(rid);
      }
      // Fallback category inference from inbound remark text (e.g. "美国住宅共享224" -> shared)
      if (!planCategory && inboundRemark) {
        const rk = String(inboundRemark).toLowerCase();
        if (rk.includes("共享") || rk.includes("shared")) planCategory = "shared";
        else if (rk.includes("独享") || rk.includes("exclusive")) planCategory = "exclusive";
      }
      // Priority 1: scope=plan with matching plan_id
      const byPlan = (rules || []).find((r: any) => r.scope === "plan" && r.plan_id && r.plan_id === rec.plan_id);
      if (byPlan) return Number(byPlan.default_traffic_gb) || 0;
      // Priority 2: scope=region with matching region
      const byRegion = (rules || []).find((r: any) => r.scope === "region" && r.region_id && regionIds.includes(r.region_id));
      if (byRegion) return Number(byRegion.default_traffic_gb) || 0;
      // Priority 3: scope = exclusive/shared matching plan category (substring match,
      // so categories like "new_exclusive" / "renew_exclusive" also match scope "exclusive")
      if (planCategory) {
        const cat = String(planCategory).toLowerCase();
        const normalized = cat.includes("exclusive") ? "exclusive"
          : cat.includes("shared") ? "shared" : cat;
        const byCat = (rules || []).find((r: any) => r.scope === normalized);
        if (byCat) return Number(byCat.default_traffic_gb) || 0;
      }
      // Priority 4: scope=all
      const byAll = (rules || []).find((r: any) => r.scope === "all");
      if (byAll) return Number(byAll.default_traffic_gb) || 0;
      // Priority 5: for orphan clients without plan info, fall back to the
      // generic exclusive rule (default behavior), then shared.
      const byExc = (rules || []).find((r: any) => r.scope === "exclusive");
      if (byExc) return Number(byExc.default_traffic_gb) || 0;
      const byShr = (rules || []).find((r: any) => r.scope === "shared");
      if (byShr) return Number(byShr.default_traffic_gb) || 0;
      // Fallback: original baseline recorded at purchase
      return Number(rec.default_traffic_gb) || 0;
    }

    const now = Date.now();
    const cookieCache = new Map<string, string | null>();
    const results: any[] = [];

    for (const rec of records || []) {
      const key = `${rec.panel_url}`;
      let cookie = cookieCache.get(key) ?? null;
      if (!cookieCache.has(key)) {
        const { data: panels } = await supabase
          .from("panels")
          .select("*")
          .eq("panel_url", rec.panel_url)
          .eq("enabled", true)
          .limit(1);
        let user = "", pass = "";
        if (panels && panels[0]) { user = panels[0].panel_user; pass = panels[0].panel_pass; }
        else {
          const { data: cfg } = await supabase.from("admin_config").select("panel_url, panel_user, panel_pass").limit(1).single();
          if (cfg && cfg.panel_url === rec.panel_url) { user = cfg.panel_user; pass = cfg.panel_pass; }
        }
        if (user) cookie = await login3xui(rec.panel_url, user, pass);
        cookieCache.set(key, cookie);
      }
      if (!cookie) { results.push({ uuid: rec.uuid, skipped: "no-cookie" }); continue; }

      const found = await findClientInInbound(rec.panel_url, cookie, rec.inbound_id, rec.uuid);
      if (!found) { results.push({ uuid: rec.uuid, skipped: "not-found" }); continue; }

      const effectiveGB = resolveDefaultGB(rec, found.inbound?.remark || "");
      // Skip "unlimited" (0) — no point resetting to unlimited
      if (effectiveGB <= 0) { results.push({ uuid: rec.uuid, skipped: "unlimited" }); continue; }

      const expiry = found.expiryTime || 0;
      if (expiry <= 0) { results.push({ uuid: rec.uuid, skipped: "no-expiry" }); continue; }

      // Compute most recent monthly anchor at or before now, derived from expiry.
      // E.g. expiry = July 4 19:00 → anchors at June 4 19:00, May 4 19:00, ...
      let anchor = expiry;
      while (anchor > now) {
        const d = new Date(anchor);
        d.setUTCMonth(d.getUTCMonth() - 1);
        anchor = d.getTime();
        if (anchor <= 0) break;
      }
      if (anchor <= 0 || anchor > now) { results.push({ uuid: rec.uuid, skipped: "no-anchor" }); continue; }
      // Only reset if the anchor falls within the last hour (i.e. it's "this hour's" anchor).
      // Prevents back-filling past anchors that were missed because the client was created later.
      const ONE_HOUR = 3600 * 1000;
      if (now - anchor > ONE_HOUR) {
        results.push({ uuid: rec.uuid, skipped: "not-due-this-hour", anchor: new Date(anchor).toISOString() });
        continue;
      }
      if (Number(rec.last_reset_expiry) >= Number(anchor)) {
        results.push({ uuid: rec.uuid, skipped: "already-reset" });
        continue;
      }

      const defaultBytes = effectiveGB * 1073741824;
      const ok = await resetClientToDefault(
        rec.panel_url, cookie, found.inbound, found.settings,
        found.email, rec.is_socks5, defaultBytes,
      );

      if (ok) {
        await supabase.from("client_records")
          .update({ last_reset_expiry: anchor, client_email: found.email })
          .eq("id", rec.id);
        results.push({ uuid: rec.uuid, reset: true, gb: effectiveGB, anchor: new Date(anchor).toISOString() });
      } else {
        results.push({ uuid: rec.uuid, reset: false, error: "update-failed" });
      }
    }

    const resetCount = results.filter((r: any) => r.reset === true).length;
    const failedCount = results.filter((r: any) => r.reset === false || r.error).length;
    const skippedCount = results.filter((r: any) => r.skipped).length;
    const triggerSource = (body && body.source) ? String(body.source) : (req.headers.get("user-agent")?.includes("pg_net") ? "cron" : "manual");
    try {
      await supabase.from("cron_execution_logs").insert({
        job_name: "auto-reset-traffic",
        checked: records?.length || 0,
        reset_count: resetCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
        trigger_source: triggerSource,
        details: { results: results.slice(0, 200) },
      });
    } catch (_) {}
    return new Response(JSON.stringify({
      success: true,
      checked: records?.length || 0,
      reset: resetCount,
      skipped: skippedCount,
      failed: failedCount,
      results,
      ranAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("auto-reset-traffic error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
