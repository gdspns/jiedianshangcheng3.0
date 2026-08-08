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

const GB = 1073741824;

function normalizeTrafficLimitBytes(value: any): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1024 * 1024 ? n * GB : n;
}

function trafficUsedBytes(up: any, down: any): number {
  const u = Number(up || 0);
  const d = Number(down || 0);
  return (Number.isFinite(u) ? u : 0) + (Number.isFinite(d) ? d : 0);
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
        // Re-enable client — 3x-ui auto-disables clients when traffic exceeds limit.
        // Resetting totalGB alone does NOT flip enable back to true.
        c.enable = true;
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

// 3x-ui may not immediately enforce over-quota clients until the inbound/client
// is saved. During hourly checks, explicitly disable clients that are already
// over their current totalGB and save the inbound, matching the manual "编辑→保存" effect.
async function disableClientIfOverQuota(
  panelUrl: string,
  cookie: string,
  inbound: any,
  settings: any,
  email: string,
  isSocks5: boolean,
): Promise<{ disabled?: boolean; overQuota?: boolean; skipped?: string; error?: string; used?: number; total?: number }> {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  if (!Array.isArray(inbound.clientStats)) {
    try {
      const listRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/list`, {
        headers: { Cookie: cookie, Accept: "application/json" },
      });
      const listBody = await safeJson(listRes);
      const listedInbound = Array.isArray(listBody?.obj)
        ? listBody.obj.find((item: any) => Number(item?.id) === Number(inbound.id))
        : null;
      if (listedInbound) {
        inbound = { ...inbound, ...listedInbound, settings: inbound.settings || listedInbound.settings };
        try { settings = JSON.parse(inbound.settings || "{}"); } catch {}
      }
    } catch (e) { console.error("quota stats list err:", e); }
  }
  let newSettingsStr = inbound.settings || "{}";
  let inboundEnable = inbound.enable;
  let used = 0;
  let total = 0;

  if (isSocks5) {
    used = trafficUsedBytes(inbound.up, inbound.down);
    total = normalizeTrafficLimitBytes(inbound.total);
    if (total <= 0) return { skipped: "unlimited" };
    if (used < total) return { skipped: "under-quota", used, total };
    if (inbound.enable === false) return { overQuota: true, skipped: "already-disabled", used, total };
    inboundEnable = false;
  } else {
    const clients = Array.isArray(settings.clients) ? settings.clients : [];
    const target = clients.find((c: any) => c?.email === email);
    if (!target) return { error: "client-not-found" };

    const keys = [target.email, target.id, target.password, target.pass, email]
      .filter((v: any): v is string => typeof v === "string" && v.length > 0);
    const clientStats = inbound.clientStats?.find((s: any) => {
      const statsKey = typeof s?.email === "string" ? s.email : "";
      return statsKey.length > 0 && keys.includes(statsKey);
    });

    used = trafficUsedBytes(clientStats?.up, clientStats?.down);
    total = normalizeTrafficLimitBytes(target.totalGB || clientStats?.total);
    if (total <= 0) return { skipped: "unlimited" };
    if (used < total) return { skipped: "under-quota", used, total };
    if (target.enable === false) return { overQuota: true, skipped: "already-disabled", used, total };

    target.enable = false;
    newSettingsStr = JSON.stringify(settings);

    const clientKey = target.id || target.password || target.email || "";
    if (clientKey) {
      try {
        await fetchUnsafe(`${baseUrl}/panel/api/inbounds/updateClient/${encodeURIComponent(clientKey)}`, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ id: inbound.id, settings: JSON.stringify({ clients: [target] }) }),
        });
      } catch (e) { console.error("quota disable updateClient err:", e); }
    }
  }

  const formData = new URLSearchParams();
  formData.append("up", String(inbound.up));
  formData.append("down", String(inbound.down));
  formData.append("total", String(inbound.total));
  formData.append("remark", inbound.remark || "");
  formData.append("enable", String(inboundEnable));
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
  if (body?.success === true) return { disabled: true, overQuota: true, used, total };
  return { error: "quota-disable-failed", used, total };
}

async function enforceQuotaOnAllPanels(supabase: any, triggerSource: string) {
  const { data: panels } = await supabase.from("panels").select("*").eq("enabled", true);
  const { data: cfg } = await supabase.from("admin_config").select("panel_url, panel_user, panel_pass").limit(1).single();
  const allPanels: any[] = [...(panels || [])];
  if (cfg?.panel_url && !allPanels.some((p) => p.panel_url === cfg.panel_url)) {
    allPanels.push({ panel_url: cfg.panel_url, panel_user: cfg.panel_user, panel_pass: cfg.panel_pass });
  }

  const results: any[] = [];
  let checked = 0;
  let enforced = 0;
  let skipped = 0;
  let failed = 0;

  // 上一次强制关闭时记录的已用流量，用于判断「已禁用但仍在跑流量」的客户端
  const prevUsed = new Map<string, number>();
  try {
    const { data: lastLog } = await supabase
      .from("cron_execution_logs")
      .select("details")
      .eq("job_name", "enforce-disabled-quota")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    for (const r of (lastLog?.details?.results || [])) {
      if (r?.identifier && typeof r.used === "number") prevUsed.set(String(r.identifier), r.used);
    }
  } catch {}

  for (const panel of allPanels) {
    let needXrayRestart = false;
    const cookie = await login3xui(panel.panel_url, panel.panel_user, panel.panel_pass);
    if (!cookie) {
      failed++;
      results.push({ panel: panel.panel_url, error: "login-failed" });
      continue;
    }

    const baseUrl = panel.panel_url.replace(/\/+$/, "");
    const listRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/list`, {
      headers: { Cookie: cookie, Accept: "application/json" },
    });
    const listBody = await safeJson(listRes);
    if (!listBody?.success || !Array.isArray(listBody.obj)) {
      failed++;
      results.push({ panel: panel.panel_url, error: "list-failed" });
      continue;
    }

    for (const inbound of listBody.obj) {
      let settings: any = {};
      try { settings = JSON.parse(inbound.settings || "{}"); } catch {}
      let changed = false;

      const clients = Array.isArray(settings.clients) ? settings.clients : [];
      for (const c of clients) {
        const identifier = c.id || c.password || c.email || "";
        if (!identifier) continue;
        checked++;
        const statKeys = [c.email, c.id, c.password, c.pass, identifier]
          .filter((v: any): v is string => typeof v === "string" && v.length > 0);
        const stats = inbound.clientStats?.find((s: any) =>
          typeof s?.email === "string" && statKeys.includes(s.email)
        );
        const used = trafficUsedBytes(stats?.up, stats?.down);
        const total = normalizeTrafficLimitBytes(c.totalGB || stats?.total);
        if (total <= 0 || used < total) {
          skipped++;
          continue;
        }

        const wasEnabledInSettings = c.enable !== false;
        const runtimeMayStillBeEnabled = stats?.enable !== false;
        if (wasEnabledInSettings) {
          c.enable = false;
          changed = true;
          needXrayRestart = true; // 新关闭：需要重启 Xray 才能踢掉已建立的连接
        }
        // 已是 enable=false 的超额客户端：只要流量仍在增长、运行态仍是启用、
        // 或没有上一次快照（无法判断是否还在跑），都必须整条 inbound 保存并重启 Xray，
        // 否则已建立的旧连接会一直存活（之前"看着已关闭却还能用"的根因）。
        const before = prevUsed.get(String(identifier));
        const stillAliveSuspect = typeof before !== "number" || used > before || runtimeMayStillBeEnabled;
        if (!wasEnabledInSettings && stillAliveSuspect) {
          needXrayRestart = true;
          changed = true; // 触发 /panel/api/inbounds/update，等同于面板里手动「编辑→保存」
        }

        const clientKey = c.id || c.password || c.email || "";
        let updateClientApplied = false;
        let updateClientError = "";
        // 无论 settings 里是否已经是 enable=false，都强制调用 updateClient，
        // 让 3x-ui / Xray 立即应用关闭状态（旧逻辑会漏掉 alreadyDisabled 的在线连接）
        if (clientKey) {
          try {
            const clientUpdateRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/updateClient/${encodeURIComponent(clientKey)}`, {
              method: "POST",
              headers: { Cookie: cookie, "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ id: inbound.id, settings: JSON.stringify({ clients: [{ ...c, enable: false }] }) }),
            });
            const clientUpdateBody = await safeJson(clientUpdateRes);
            updateClientApplied = clientUpdateBody?.success === true;
            if (!updateClientApplied) updateClientError = "update-client-failed";
          } catch (e) {
            updateClientError = String(e);
          }
        }

        if (wasEnabledInSettings || updateClientApplied) enforced++;
        else skipped++;
        if (updateClientError) failed++;


        results.push({
          panel: panel.panel_url,
          inboundId: inbound.id,
          identifier,
          remark: c.email || "",
          used,
          total,
          runtimeEnable: stats?.enable,
          alreadyDisabled: !wasEnabledInSettings && !runtimeMayStillBeEnabled,
          updateClientApplied,
          error: updateClientError || undefined,
        });
      }

      const accounts = Array.isArray(settings.accounts) ? settings.accounts : [];
      for (const a of accounts) {
        const identifier = a.user || a.username || a.pass || a.password || "";
        if (!identifier) continue;
        checked++;
        const used = trafficUsedBytes(inbound.up, inbound.down);
        const total = normalizeTrafficLimitBytes(inbound.total);
        if (total <= 0 || used < total) {
          skipped++;
          continue;
        }
        if (inbound.enable !== false) {
          inbound.enable = false;
          changed = true;
        }
        enforced++;
        results.push({
          panel: panel.panel_url,
          inboundId: inbound.id,
          identifier,
          remark: inbound.remark || "",
          used,
          total,
          socks5: true,
          alreadyDisabled: inbound.enable === false && !changed,
        });
      }

      if (!changed && !results.some((r) => r.panel === panel.panel_url && Number(r.inboundId) === Number(inbound.id))) {
        continue;
      }

      const formData = new URLSearchParams();
      formData.append("up", String(inbound.up));
      formData.append("down", String(inbound.down));
      formData.append("total", String(inbound.total));
      formData.append("remark", inbound.remark || "");
      formData.append("enable", String(inbound.enable));
      formData.append("expiryTime", String(inbound.expiryTime || 0));
      formData.append("listen", inbound.listen || "");
      formData.append("port", String(inbound.port));
      formData.append("protocol", inbound.protocol);
      formData.append("settings", JSON.stringify(settings));
      formData.append("streamSettings", inbound.streamSettings || "");
      formData.append("sniffing", inbound.sniffing || "");
      formData.append("allocate", inbound.allocate || "");

      const updateRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/update/${inbound.id}`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      const updateBody = await safeJson(updateRes);
      if (updateBody?.success !== true) {
        failed++;
        results.push({ panel: panel.panel_url, inboundId: inbound.id, error: "inbound-save-failed" });
      }
    }

    // 重启 Xray：3x-ui 只有重启内核才会踢掉超额客户端已建立的连接
    if (needXrayRestart) {
      let restarted = false;
      let restartError = "";
      // 3x-ui has moved this route across versions. Try current API routes first,
      // then retain legacy routes for older installations.
      for (const path of [
        "/panel/api/server/restartXrayService",
        "/panel/api/setting/restartXrayService",
        "/panel/setting/restartXrayService",
        "/server/restartXrayService",
      ]) {
        try {
          const res = await fetchUnsafe(`${baseUrl}${path}`, {
            method: "POST",
            headers: { Cookie: cookie, Accept: "application/json" },
          });
          const body = await safeJson(res);
          if (body?.success === true) { restarted = true; break; }
          restartError = `${path}:${res.status}`;
        } catch (e) {
          restartError = String(e).slice(0, 120);
        }
      }
      results.push({ panel: panel.panel_url, xrayRestarted: restarted, error: restarted ? undefined : `restart-failed ${restartError}` });
    }
  }


  try {
    await supabase.from("cron_execution_logs").insert({
      job_name: "enforce-disabled-quota",
      checked,
      reset_count: enforced,
      skipped_count: skipped,
      failed_count: failed,
      trigger_source: triggerSource,
      details: { panels: allPanels.length, results: results.slice(0, 200) },
    });
  } catch {}

  return { success: true, enforceQuota: true, panels: allPanels.length, checked, enforced, skipped, failed, results };
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

    if (body?.enforceQuota === true) {
      const triggerSource = body?.source === "cron" ? "cron" : "manual";
      const result = await enforceQuotaOnAllPanels(supabase, triggerSource);
      return new Response(JSON.stringify({ ...result, ranAt: new Date().toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    let recordsQuery = supabase
      .from("client_records")
      .select("*");
    if (body?.uuid && typeof body.uuid === "string") recordsQuery = recordsQuery.eq("uuid", body.uuid);
    const { data: records } = await recordsQuery;

    // Load rules + plans + plan_regions for default-GB resolution
    const { data: rules } = await supabase
      .from("traffic_default_rules")
      .select("*")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    const { data: plans } = await supabase.from("plans").select("id, category, region_id");
    const { data: planRegions } = await supabase.from("plan_regions").select("plan_id, region_id");
    const { data: regionsList } = await supabase.from("regions").select("id, name");
    const planMap = new Map<string, { category: string; region_id: string | null }>();
    for (const p of plans || []) planMap.set(p.id, { category: p.category || "", region_id: p.region_id || null });
    const planRegionMap = new Map<string, string[]>();
    for (const pr of planRegions || []) {
      const arr = planRegionMap.get(pr.plan_id) || [];
      arr.push(pr.region_id);
      planRegionMap.set(pr.plan_id, arr);
    }
    const regionNameList: { id: string; name: string }[] = (regionsList || [])
      .filter((r: any) => r && r.name)
      .map((r: any) => ({ id: r.id, name: String(r.name) }));

    function resolveDefaultGB(rec: any, inboundRemark?: string): number {
      const planInfo = rec.plan_id ? planMap.get(rec.plan_id) : null;
      let planCategory = planInfo?.category || "";
      const regionIds: string[] = [];
      if (planInfo?.region_id) regionIds.push(planInfo.region_id);
      if (rec.plan_id && planRegionMap.has(rec.plan_id)) {
        for (const rid of planRegionMap.get(rec.plan_id)!) if (!regionIds.includes(rid)) regionIds.push(rid);
      }
      // Fallback: infer region(s) from inbound remark by matching region names (e.g. "马来西亚-住宅独享" -> 马来西亚)
      if (inboundRemark) {
        const rk = String(inboundRemark);
        for (const r of regionNameList) {
          if (r.name && rk.includes(r.name) && !regionIds.includes(r.id)) regionIds.push(r.id);
        }
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
      // Priority 2: scope=region with matching region (from plan or inferred from inbound remark)
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
      async function pushSkipWithQuotaCheck(reason: string) {
        const quota = await disableClientIfOverQuota(rec.panel_url, cookie!, found.inbound, found.settings, found.email, rec.is_socks5);
        if (quota?.error) results.push({ uuid: rec.uuid, skipped: reason, reset: false, error: quota.error, used: quota.used, total: quota.total });
        else results.push({ uuid: rec.uuid, skipped: reason, quotaDisabled: quota.disabled === true, overQuota: quota.overQuota === true, used: quota.used, total: quota.total });
      }

      if (expiry <= 0) { await pushSkipWithQuotaCheck("no-expiry"); continue; }

      // Compute most recent monthly anchor at or before now, derived from expiry.
      // E.g. expiry = July 4 19:00 → anchors at June 4 19:00, May 4 19:00, ...
      let anchor = expiry;
      while (anchor > now) {
        const d = new Date(anchor);
        d.setUTCMonth(d.getUTCMonth() - 1);
        anchor = d.getTime();
        if (anchor <= 0) break;
      }
      if (anchor <= 0 || anchor > now) { await pushSkipWithQuotaCheck("no-anchor"); continue; }
      // Catch up on missed resets: reset whenever the current anchor hasn't been
      // processed yet, regardless of how long ago the anchor was. This fixes the
      // bug where a single missed cron tick would leave a client on their
      // creation-time totalGB (often 0 = unlimited) for the whole month.
      // Guard against back-filling brand-new clients that were created AFTER the
      // anchor — they were never supposed to be reset at that anchor.
      const createdMs = rec.created_at ? new Date(rec.created_at).getTime() : 0;
      const lastReset = Number(rec.last_reset_expiry) || 0;
      if (lastReset === 0 && createdMs > anchor) {
        await pushSkipWithQuotaCheck("created-after-anchor");
        continue;
      }
      if (lastReset >= anchor) {
        await pushSkipWithQuotaCheck("already-reset");
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
    const quotaDisabledCount = results.filter((r: any) => r.quotaDisabled === true).length;
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
        details: { quotaDisabled: quotaDisabledCount, results: results.slice(0, 200) },
      });
    } catch (_) {}
    return new Response(JSON.stringify({
      success: true,
      checked: records?.length || 0,
      reset: resetCount,
      quotaDisabled: quotaDisabledCount,
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
