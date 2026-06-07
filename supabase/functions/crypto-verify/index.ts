import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function resolveRenewalDefaultGB(supabase: any, uuid: string, inboundRemark: string): Promise<number> {
  const { data: rec } = await supabase
    .from("client_records")
    .select("plan_id, default_traffic_gb")
    .eq("uuid", uuid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: rules } = await supabase.from("traffic_default_rules").select("*").eq("enabled", true).order("sort_order", { ascending: true });
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
  const planInfo = rec?.plan_id ? planMap.get(rec.plan_id) : null;
  let planCategory = planInfo?.category || "";
  const regionIds: string[] = [];
  if (planInfo?.region_id) regionIds.push(planInfo.region_id);
  if (rec?.plan_id && planRegionMap.has(rec.plan_id)) {
    for (const rid of planRegionMap.get(rec.plan_id)!) if (!regionIds.includes(rid)) regionIds.push(rid);
  }
  if (inboundRemark) {
    for (const r of regionsList || []) if (r?.name && inboundRemark.includes(String(r.name)) && !regionIds.includes(r.id)) regionIds.push(r.id);
    if (!planCategory) {
      const lower = inboundRemark.toLowerCase();
      if (lower.includes("共享") || lower.includes("shared")) planCategory = "shared";
      else if (lower.includes("独享") || lower.includes("exclusive")) planCategory = "exclusive";
    }
  }
  const byPlan = (rules || []).find((r: any) => r.scope === "plan" && r.plan_id && r.plan_id === rec?.plan_id);
  if (byPlan) return Number(byPlan.default_traffic_gb) || 0;
  const byRegion = (rules || []).find((r: any) => r.scope === "region" && r.region_id && regionIds.includes(r.region_id));
  if (byRegion) return Number(byRegion.default_traffic_gb) || 0;
  if (planCategory) {
    const cat = String(planCategory).toLowerCase();
    const normalized = cat.includes("exclusive") ? "exclusive" : cat.includes("shared") ? "shared" : cat;
    const byCat = (rules || []).find((r: any) => r.scope === normalized);
    if (byCat) return Number(byCat.default_traffic_gb) || 0;
  }
  const byAll = (rules || []).find((r: any) => r.scope === "all");
  if (byAll) return Number(byAll.default_traffic_gb) || 0;
  const byExc = (rules || []).find((r: any) => r.scope === "exclusive");
  if (byExc) return Number(byExc.default_traffic_gb) || 0;
  const byShr = (rules || []).find((r: any) => r.scope === "shared");
  if (byShr) return Number(byShr.default_traffic_gb) || 0;
  return Number(rec?.default_traffic_gb) || 0;
}

// Helper: fetch with SSL fallback
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

// Login to 3x-ui
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
    const body = await res.json();
    return body.success && cookie ? cookie : null;
  } catch {
    return null;
  }
}

// Find client by UUID/username/password (supports VMESS/VLESS/Trojan + SOCKS5)
async function findClient(panelUrl: string, cookie: string, identifier: string) {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const res = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/list`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  const data = await res.json();
  if (!data?.success || !data?.obj) return null;
  for (const inbound of data.obj) {
    try {
      const settings = JSON.parse(inbound.settings || "{}");
      const entries = [
        ...(Array.isArray(settings.clients) ? settings.clients : []),
        ...(Array.isArray(settings.accounts) ? settings.accounts : []),
      ];
      for (const entry of entries) {
        const candidateKeys = [entry?.id, entry?.email, entry?.user, entry?.username, entry?.pass, entry?.password]
          .filter((v: any): v is string => typeof v === "string" && v.length > 0);
        if (candidateKeys.includes(identifier)) {
          const isSocks5 = Array.isArray(settings.accounts) && settings.accounts.includes(entry);
          const email = entry.email || inbound.remark || entry.user || entry.username || "";
          const expiryTime = isSocks5 ? inbound.expiryTime || 0 : entry.expiryTime || 0;
          return { inboundId: inbound.id, inboundRemark: inbound.remark || "", email, expiryTime, isSocks5 };
        }
      }
    } catch {}
  }
  return null;
}

// Add traffic quota to a client (does NOT reset used traffic or change expiry)
async function addClientTraffic(
  panelUrl: string,
  cookie: string,
  inboundId: number,
  email: string,
  addBytes: number,
  isSocks5: boolean,
): Promise<boolean> {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const inboundRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/get/${inboundId}`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  const inboundData = await inboundRes.json();
  if (!inboundData?.success || !inboundData?.obj) return false;
  const inbound = inboundData.obj;
  let newSettingsStr = inbound.settings || "{}";
  let newTotal = Number(inbound.total) || 0;
  if (isSocks5) {
    newTotal = newTotal + addBytes;
  } else {
    // Re-enable the client too in case xray disabled it after the previous quota was exhausted.
    const settings = JSON.parse(inbound.settings || "{}");
    let found = false;
    let updatedClient: any = null;
    let clientKey = "";
    for (const entry of settings.clients || []) {
      if (entry.email === email) {
        entry.totalGB = (Number(entry.totalGB) || 0) + addBytes;
        entry.enable = true;
        updatedClient = entry;
        clientKey = entry.id || entry.password || entry.email || "";
        found = true;
        break;
      }
    }
    if (!found) return false;
    newSettingsStr = JSON.stringify(settings);

    if (clientKey && updatedClient) {
      const clientRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/updateClient/${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: inboundId, settings: JSON.stringify({ clients: [updatedClient] }) }),
      });
      const clientBody = await clientRes.json();
      if (clientBody?.success === true) return true;
    }
  }
  const formData = new URLSearchParams();
  formData.append("up", String(inbound.up));
  formData.append("down", String(inbound.down));
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
  const updateRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/update/${inboundId}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  const updateBody = await updateRes.json();
  return updateBody?.success === true;
}

// Extend client expiry; if already over quota, start the renewed period with fresh default traffic.
async function extendExpiry(
  panelUrl: string,
  cookie: string,
  inboundId: number,
  email: string,
  currentExpiry: number,
  durationDays: number,
  isSocks5: boolean,
  renewalDefaultBytes = 0,
): Promise<boolean> {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const now = Date.now();
  const baseTime = (currentExpiry > 0 && currentExpiry > now) ? currentExpiry : now;
  const newExpiry = baseTime + durationDays * 24 * 60 * 60 * 1000;
  const inboundRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/get/${inboundId}`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  const inboundData = await inboundRes.json();
  if (!inboundData?.success || !inboundData?.obj) return false;

  const inbound = inboundData.obj;
  const settings = JSON.parse(inbound.settings || "{}");
  const targetClient = (settings.clients || []).find((c: any) => c.email === email);
  const statKeys = [
    email,
    targetClient?.email,
    targetClient?.id,
    targetClient?.password,
    targetClient?.pass,
  ].filter((v: any): v is string => typeof v === "string" && v.length > 0);
  const clientStats = inbound.clientStats?.find((s: any) => typeof s?.email === "string" && statKeys.includes(s.email));
  const currentTotal = isSocks5
    ? normalizeTrafficLimitBytes(inbound.total)
    : normalizeTrafficLimitBytes(targetClient?.totalGB || clientStats?.total);
  const currentUsed = isSocks5 ? trafficUsedBytes(inbound.up, inbound.down) : trafficUsedBytes(clientStats?.up, clientStats?.down);
  const isOverQuota = currentTotal > 0 && (currentUsed >= currentTotal || (!isSocks5 && !clientStats && targetClient?.enable === false));

  if (isSocks5) {
    const formData = new URLSearchParams();
    formData.append("up", String(isOverQuota ? 0 : inbound.up));
    formData.append("down", String(isOverQuota ? 0 : inbound.down));
    formData.append("total", String(isOverQuota && renewalDefaultBytes > 0 ? renewalDefaultBytes : inbound.total));
    formData.append("remark", inbound.remark || "");
    formData.append("enable", String(inbound.enable));
    formData.append("expiryTime", String(newExpiry));
    formData.append("listen", inbound.listen || "");
    formData.append("port", String(inbound.port));
    formData.append("protocol", inbound.protocol);
    formData.append("settings", inbound.settings || "{}");
    formData.append("streamSettings", inbound.streamSettings || "");
    formData.append("sniffing", inbound.sniffing || "");
    formData.append("allocate", inbound.allocate || "");
    const updateRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/update/${inboundId}`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const updateBody = await updateRes.json();
    return updateBody?.success === true;
  }

  let found = false;
  let updatedClient: any = null;
  let clientKey = "";
  const newExpiryDate = new Date(newExpiry);
  const month = newExpiryDate.getMonth() + 1;
  const day = newExpiryDate.getDate();
  // Match "X月X日到期" or "X月X号到期" — works for 自助 prefix and manually-added clients
  const dateRegex = /(\d+)月(\d+)[日号]到期/;
  for (const c of settings.clients || []) {
    if (c === targetClient) {
      c.expiryTime = newExpiry;
      c.enable = true;
      if (isOverQuota && renewalDefaultBytes > 0) c.totalGB = renewalDefaultBytes;
      clientKey = c.id || c.password || c.email || "";
      const matched = (c.email || "").match(dateRegex);
      if (matched) {
        const suffix = matched[0].includes("号") ? "号" : "日";
        c.email = c.email.replace(dateRegex, `${month}月${day}${suffix}到期`);
      }
      updatedClient = c;
      found = true;
      break;
    }
  }
  if (!found) return false;

  if (isOverQuota) {
    try {
      const resetKey = clientStats?.email || email;
      const resetRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(resetKey)}`, {
        method: "POST",
        headers: { Cookie: cookie, Accept: "application/json" },
      });
      console.log("resetClientTraffic on crypto renewal result:", await resetRes.text());
    } catch (err) {
      console.error("resetClientTraffic on crypto renewal failed:", err);
    }
  }

  if (clientKey && updatedClient) {
    const clientRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/updateClient/${encodeURIComponent(clientKey)}`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: inboundId, settings: JSON.stringify({ clients: [updatedClient] }) }),
    });
    const clientBody = await clientRes.json();
    if (clientBody?.success === true) return true;
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

  const updateRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/update/${inboundId}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  const updateBody = await updateRes.json();
  return updateBody?.success === true;
}

// USDT TRC20 contract address on TRON
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// Check TRC20 (USDT) transactions
async function checkTrc20Transactions(address: string, apiKey: string, expectedAmount: number, sinceTimestamp: number): Promise<{ found: boolean; txHash?: string }> {
  const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?only_to=true&limit=50&min_timestamp=${sinceTimestamp}&contract_address=${USDT_CONTRACT}`;
  const res = await fetch(url, {
    headers: { "TRON-PRO-API-KEY": apiKey, Accept: "application/json" },
  });
  const data = await res.json();

  for (const tx of data?.data || []) {
    // USDT has 6 decimals
    const value = Number(tx.value) / 1e6;
    if (Math.abs(value - expectedAmount) < 0.0001 && tx.to === address) {
      return { found: true, txHash: tx.transaction_id };
    }
  }
  return { found: false };
}

// Check TRX native transactions
async function checkTrxTransactions(address: string, apiKey: string, expectedAmount: number, sinceTimestamp: number): Promise<{ found: boolean; txHash?: string }> {
  const url = `https://api.trongrid.io/v1/accounts/${address}/transactions?only_to=true&limit=50&min_timestamp=${sinceTimestamp}`;
  const res = await fetch(url, {
    headers: { "TRON-PRO-API-KEY": apiKey, Accept: "application/json" },
  });
  const data = await res.json();

  for (const tx of data?.data || []) {
    const contract = tx.raw_data?.contract?.[0];
    if (contract?.type === "TransferContract") {
      // TRX has 6 decimals (SUN)
      const value = Number(contract.parameter?.value?.amount || 0) / 1e6;
      if (Math.abs(value - expectedAmount) < 0.0001) {
        return { found: true, txHash: tx.txID };
      }
    }
  }
  return { found: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, orderId } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "verify") {
      if (!orderId) {
        return new Response(JSON.stringify({ error: "缺少订单ID" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get order
      const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (!order || order.status !== "pending") {
        return new Response(JSON.stringify({ 
          success: false, 
          error: order?.status === "fulfilled" ? "订单已完成" : "订单不存在或已处理" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get config
      const { data: config } = await supabase.from("admin_config").select("*").limit(1).single();
      if (!config?.crypto_address || !config?.crypto_key) {
        return new Response(JSON.stringify({ success: false, error: "加密货币配置未完成" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sinceTs = new Date(order.created_at).getTime();
      let result: { found: boolean; txHash?: string };

      if (order.crypto_currency === "USDT") {
        result = await checkTrc20Transactions(config.crypto_address, config.crypto_key, order.crypto_amount, sinceTs);
      } else if (order.crypto_currency === "TRX") {
        result = await checkTrxTransactions(config.crypto_address, config.crypto_key, order.crypto_amount, sinceTs);
      } else {
        return new Response(JSON.stringify({ success: false, error: "未知币种" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!result.found) {
        return new Response(JSON.stringify({ success: false, status: "pending", message: "暂未检测到链上转账，请稍后重试" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Payment found! Update order
      await supabase.from("orders").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        tx_hash: result.txHash,
      }).eq("id", order.id);

      // Use order_type field to determine handling
      const isBuyNewOrder = order.order_type === "buy_new";
      const isTopupOrder = order.order_type === "topup_traffic" || String(order.plan_name || "").includes("流量充值");

      // Extend expiry / add traffic via 3x-ui (skip for buy_new — handled by create-client)
      let clientRemark = "";
      let fulfilled = false;
      if (!isBuyNewOrder) {
        const { data: panelsList } = await supabase
          .from("panels")
          .select("*")
          .eq("enabled", true)
          .order("is_primary", { ascending: false })
          .order("sort_order", { ascending: true });
        const fallbackPanel = { panel_url: config.panel_url, panel_user: config.panel_user, panel_pass: config.panel_pass };
        const panelsToTry = (panelsList && panelsList.length > 0) ? panelsList : [fallbackPanel];

        for (const p of panelsToTry) {
          const cookie = await login3xui(p.panel_url, p.panel_user, p.panel_pass);
          if (!cookie) continue;
          const client = await findClient(p.panel_url, cookie, order.uuid);
          if (!client) continue;
          clientRemark = client.email || "";
          let success = false;
          if (isTopupOrder) {
            const addBytes = (Number(order.months) || 0) * 1073741824;
            success = await addClientTraffic(p.panel_url, cookie, client.inboundId, client.email, addBytes, client.isSocks5);
          } else {
            const durationDays = order.duration_days || (order.months * 30);
            const defaultGB = await resolveRenewalDefaultGB(supabase, order.uuid, client.inboundRemark || "");
            success = await extendExpiry(
              p.panel_url,
              cookie,
              client.inboundId,
              client.email,
              client.expiryTime,
              durationDays,
              client.isSocks5,
              defaultGB > 0 ? defaultGB * GB : 0,
            );
          }
          if (success) {
            await supabase.from("orders").update({
              status: "fulfilled",
              fulfilled_at: new Date().toISOString(),
              ...(clientRemark && !order.email ? { email: clientRemark } : {}),
            }).eq("id", order.id);
            fulfilled = true;
          }
          break;
        }

        // Send email notification only for renewal orders
        // New purchase emails are sent by create-client after UUID/remark are generated
        if (config.resend_api_key && config.notify_email) {
          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${config.resend_api_key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "通知 <onboarding@resend.dev>",
                to: [config.notify_email],
                subject: `💰 加密货币续费成功 - ${order.plan_name}`,
                html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#10b981;">💰 加密货币续费成功通知</h2>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;">订单ID</td><td style="padding:8px;border:1px solid #e5e7eb;">${order.id}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;">UUID</td><td style="padding:8px;border:1px solid #e5e7eb;">${order.uuid}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;">用户备注</td><td style="padding:8px;border:1px solid #e5e7eb;">${clientRemark || "未找到"}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;">套餐</td><td style="padding:8px;border:1px solid #e5e7eb;">${order.plan_name}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;">币种</td><td style="padding:8px;border:1px solid #e5e7eb;">${order.crypto_currency}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;">金额</td><td style="padding:8px;border:1px solid #e5e7eb;">${order.crypto_amount} ${order.crypto_currency}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;">TX Hash</td><td style="padding:8px;border:1px solid #e5e7eb;word-break:break-all;">${result.txHash || ""}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;">续期状态</td><td style="padding:8px;border:1px solid #e5e7eb;">${fulfilled ? "✅ 已续期" : "❌ 续期失败"}</td></tr>
                  </table>
                  <p style="color:#6b7280;font-size:12px;">此邮件由系统自动发送</p>
                </div>`,
              }),
            });
          } catch (emailErr) {
            console.error("Failed to send email notification:", emailErr);
          }
        }
      }

      if (fulfilled) {
        return new Response(JSON.stringify({ success: true, status: "fulfilled", txHash: result.txHash }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, status: "paid_unfulfilled", txHash: result.txHash, message: "支付已确认，但续期操作失败，请联系站长" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Crypto verify error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
