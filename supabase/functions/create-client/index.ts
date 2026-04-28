import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: fetch with automatic HTTP fallback when HTTPS has cert issues
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

// Safe JSON parse from Response (handles empty/truncated body)
async function safeJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text || text.trim().length === 0) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Login to 3x-ui and get session cookie
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
  } catch (err) {
    console.error("3x-ui login failed:", err);
    return null;
  }
}

// Generate random string
function randomStr(len: number, charset: string): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => charset[b % charset.length]).join("");
}

// Generate random UUID v4
function randomUUID(): string {
  return crypto.randomUUID();
}

async function notifyStockIfNeeded(supabase: any, config: any, regionId: string | null, scopeInboundIds: string[] = []) {
  if (!regionId || !config.resend_api_key || !config.notify_email) return;

  let stockRegionName = "未知地区";
  const { data: rn } = await supabase.from("regions").select("name").eq("id", regionId).single();
  if (rn?.name) stockRegionName = rn.name;

  let query = supabase.from("region_inbounds").select("current_clients, max_clients").eq("region_id", regionId);
  if (scopeInboundIds.length > 0) query = query.in("id", scopeInboundIds);
  const { data: inbounds } = await query;
  if (!inbounds || inbounds.length === 0) {
    const { data: regionStock } = await supabase.from("regions").select("current_clients, max_clients").eq("id", regionId).single();
    if (!regionStock || !regionStock.max_clients || regionStock.max_clients <= 0) return;
    const remaining = Math.max(0, (regionStock.max_clients || 0) - (regionStock.current_clients || 0));
    if (remaining !== 0 && remaining !== 1) return;
    const subject = remaining === 0 ? `🚨 地区【${stockRegionName}】库存已耗尽` : `⚠️ 地区【${stockRegionName}】库存仅剩最后 1 个`;
    const body = remaining === 0
      ? `<h2>库存耗尽通知</h2><p>地区 <strong>${stockRegionName}</strong> 所有名额已全部售罄。</p><p>前端商品已自动置灰，无法继续购买。请尽快补货！</p><hr><p style="color:#999;font-size:12px;">此邮件由系统自动发送</p>`
      : `<h2>库存即将耗尽提醒</h2><p>地区 <strong>${stockRegionName}</strong> 仅剩最后 <strong>1</strong> 个名额可售。</p><p>请及时补货以避免售罄。</p><hr><p style="color:#999;font-size:12px;">此邮件由系统自动发送</p>`;
    await sendAdminEmail(config, subject, body);
    return;
  }

  let unlimited = false;
  let totalRemaining = 0;
  for (const r of inbounds) {
    const max = r.max_clients || 0;
    const cur = r.current_clients || 0;
    if (max <= 0) { unlimited = true; break; }
    totalRemaining += Math.max(0, max - cur);
  }
  if (unlimited || (totalRemaining !== 0 && totalRemaining !== 1)) return;

  const subject = totalRemaining === 0
    ? `🚨 地区【${stockRegionName}】库存已耗尽`
    : `⚠️ 地区【${stockRegionName}】库存仅剩最后 1 个`;
  const body = totalRemaining === 0
    ? `<h2>库存耗尽通知</h2><p>地区 <strong>${stockRegionName}</strong> 所有入站名额已全部售罄。</p><p>前端商品已自动置灰，无法继续购买。请尽快补货！</p><hr><p style="color:#999;font-size:12px;">此邮件由系统自动发送</p>`
    : `<h2>库存即将耗尽提醒</h2><p>地区 <strong>${stockRegionName}</strong> 仅剩最后 <strong>1</strong> 个名额可售。</p><p>请及时补货以避免售罄。</p><hr><p style="color:#999;font-size:12px;">此邮件由系统自动发送</p>`;
  await sendAdminEmail(config, subject, body);
}

async function sendAdminEmail(config: any, subject: string, html: string): Promise<boolean> {
  if (!config.resend_api_key || !config.notify_email) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resend_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "系统通知 <onboarding@resend.dev>",
        to: [config.notify_email],
        subject,
        html,
      }),
    });
    const body = await safeJson(res);
    if (!res.ok) {
      console.error("Admin email send failed:", { status: res.status, body, subject });
      return false;
    }
    console.log("Admin email sent:", { subject, id: body?.id || null });
    return true;
  } catch (emailErr) {
    console.error("Admin email send error:", emailErr);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, regionId } = await req.json();

    if (!orderId) {
      return new Response(JSON.stringify({ error: "缺少 orderId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get order - must be paid/fulfilled and type "new"
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "订单不存在" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["paid", "fulfilled"].includes(order.status)) {
      return new Response(JSON.stringify({ error: "订单未支付" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin config
    const { data: config } = await supabase.from("admin_config").select("*").limit(1).single();
    if (!config) {
      return new Response(JSON.stringify({ error: "系统配置未初始化" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine inbound_id and protocol
    let salesInboundId = (config as any).sales_inbound_id ?? 1;
    let salesProtocol = (config as any).sales_protocol ?? "mixed";

    // Try to find the correct inbound_id from inbound_plans mapping
    // 1. Find which plan was purchased by matching plan_name
    const { data: matchedPlans } = await supabase
      .from("plans")
      .select("id")
      .eq("title", order.plan_name);
    
    let foundViaInboundPlans = false;
    let targetRegionInboundId: string | null = null;
    let stockPoolIds: string[] = [];
    
    if (matchedPlans && matchedPlans.length > 0) {
      const planIds = matchedPlans.map((p: any) => p.id);
      
      // 2. Look up inbound_plans for this plan
      const { data: inboundPlanRows } = await supabase
        .from("inbound_plans")
        .select("region_inbound_id")
        .in("plan_id", planIds);
      
      if (inboundPlanRows && inboundPlanRows.length > 0) {
        const candidateIds = inboundPlanRows.map((ip: any) => ip.region_inbound_id);
        
        // 3. Fetch all candidate region_inbounds, sorted by sort_order
        const { data: candidateInbounds } = await supabase
          .from("region_inbounds")
          .select("id, inbound_id, region_id, protocol, current_clients, max_clients, sort_order")
          .in("id", candidateIds)
          .order("sort_order", { ascending: true });
        
        if (candidateInbounds && candidateInbounds.length > 0) {
          // Restrict to region if provided
          let pool = regionId
            ? candidateInbounds.filter((ri: any) => ri.region_id === regionId)
            : candidateInbounds;
          if (pool.length === 0) pool = candidateInbounds;
          stockPoolIds = pool.map((ri: any) => ri.id);
          
          // Pick first inbound with available stock (max_clients=0 means unlimited)
          const available = pool.find((ri: any) =>
            !ri.max_clients || ri.max_clients <= 0 || (ri.current_clients || 0) < ri.max_clients
          );
          
          if (!available) {
            // All inbounds for this plan are full — block purchase
            return new Response(JSON.stringify({ error: "该套餐已售罄，请联系客服补货" }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          
          targetRegionInboundId = available.id;
          salesInboundId = available.inbound_id;
          foundViaInboundPlans = true;
          if (available.protocol) salesProtocol = available.protocol;
        }
      }
    }
    
    // Fallback: use region's legacy inbound_id if no inbound_plans mapping found
    if (!foundViaInboundPlans && regionId) {
      const { data: regionData } = await supabase
        .from("regions")
        .select("inbound_id, protocol")
        .eq("id", regionId)
        .single();
      if (regionData) {
        salesInboundId = regionData.inbound_id;
        salesProtocol = regionData.protocol;
      }
    }

    // Login to 3x-ui
    const cookie = await login3xui(config.panel_url, config.panel_user, config.panel_pass);
    if (!cookie) {
      return new Response(JSON.stringify({ error: "无法连接到面板" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = config.panel_url.replace(/\/+$/, "");

    // Get current inbound to understand its structure
    const inboundRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/get/${salesInboundId}`, {
      headers: { Cookie: cookie, Accept: "application/json" },
    });
    const inboundData = await safeJson(inboundRes);
    if (!inboundData?.success || !inboundData?.obj) {
      return new Response(JSON.stringify({ error: `入站 #${salesInboundId} 不存在` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inbound = inboundData.obj;
    const protocol = inbound.protocol; // actual protocol of the inbound

    // Calculate expiry using duration_days from order (falls back to months * 30 for legacy orders)
    const durationDays = order.duration_days || (order.months * 30);
    const expiryTime = Date.now() + durationDays * 24 * 60 * 60 * 1000;

    // Remark/email for the new client - include expiry date
    const categoryLabel = "自助";
    const expiryDate = new Date(expiryTime);
    const expiryLabel = `${expiryDate.getMonth() + 1}月${expiryDate.getDate()}日到期`;
    const remark = `${categoryLabel}${expiryLabel}_${order.trade_no || order.id.substring(0, 8)}`;

    let credentials: Record<string, string> = {};
    let clientSettings: any;

    if (protocol === "socks" || protocol === "mixed") {
      // SOCKS5 / mixed: generate username + password
      const username = randomStr(8, "abcdefghijklmnopqrstuvwxyz0123456789");
      const password = randomStr(10, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
      credentials = { protocol: "socks", username, password };

      // For SOCKS5, add to accounts array
      const settings = JSON.parse(inbound.settings || "{}");
      const accounts = Array.isArray(settings.accounts) ? settings.accounts : [];
      accounts.push({ user: username, pass: password });
      settings.accounts = accounts;

      // Update inbound with new account
      const formData = new URLSearchParams();
      formData.append("up", String(inbound.up));
      formData.append("down", String(inbound.down));
      formData.append("total", String(inbound.total));
      formData.append("remark", inbound.remark || "");
      formData.append("enable", String(inbound.enable));
      formData.append("expiryTime", String(inbound.expiryTime || 0));
      formData.append("listen", inbound.listen || "");
      formData.append("port", String(inbound.port));
      formData.append("protocol", protocol);
      formData.append("settings", JSON.stringify(settings));
      formData.append("streamSettings", inbound.streamSettings || "");
      formData.append("sniffing", inbound.sniffing || "");
      formData.append("allocate", inbound.allocate || "");

      const updateRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/update/${salesInboundId}`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      const updateBody = await safeJson(updateRes);
      console.log("SOCKS5 add account result:", updateBody);

      if (!updateBody?.success) {
        return new Response(JSON.stringify({ error: "添加用户到面板失败" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // VMESS / VLESS / Trojan: generate UUID/password and use addClient API
      const clientId = randomUUID();
      credentials = { protocol, uuid: clientId };

      // Trojan uses "password" field, VLESS/VMESS use "id" field
      const clientEntry: any = {
        email: remark,
        limitIp: 0,
        totalGB: 0,
        expiryTime: expiryTime,
        enable: true,
        tgId: "",
        subId: "",
      };

      if (protocol === "trojan") {
        clientEntry.password = clientId;
      } else {
        clientEntry.id = clientId;
        clientEntry.alterId = 0;
      }

      clientSettings = {
        clients: [clientEntry],
      };

      const addClientBody = {
        id: salesInboundId,
        settings: JSON.stringify(clientSettings),
      };

      const addRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/addClient`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(addClientBody),
      });
      const addBody = await safeJson(addRes);
      console.log("addClient result:", addBody);

      if (!addBody?.success) {
        return new Response(JSON.stringify({ error: "添加客户端到面板失败: " + (addBody?.msg || "") }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update order status to fulfilled and save client UUID + panel info
    const clientUuid = credentials.uuid || credentials.username || "";
    await supabase
      .from("orders")
      .update({
        status: "fulfilled",
        fulfilled_at: new Date().toISOString(),
        uuid: clientUuid || undefined,
        inbound_id: salesInboundId,
        inbound_remark: inbound.remark || "",
        client_remark: remark,
      })
      .eq("id", orderId);

    // Send email notification for new purchase
    if (config.resend_api_key && config.notify_email) {
      await sendAdminEmail(
        config,
        `🎉 新用户开通成功 - ${order.plan_name}`,
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#10b981;">🎉 新用户开通成功</h2>
              <table style="width:100%;border-collapse:collapse;margin-top:16px;">
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">订单号</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${order.trade_no || order.id}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">邮箱/手机</td><td style="padding:8px;border-bottom:1px solid #eee;">${order.email || "未填写"}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">套餐</td><td style="padding:8px;border-bottom:1px solid #eee;">${order.plan_name}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">金额</td><td style="padding:8px;border-bottom:1px solid #eee;">¥${order.amount}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">时长</td><td style="padding:8px;border-bottom:1px solid #eee;">${order.months} 个月</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">支付方式</td><td style="padding:8px;border-bottom:1px solid #eee;">${order.payment_method}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">协议</td><td style="padding:8px;border-bottom:1px solid #eee;">${credentials.protocol}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">客户端标识</td><td style="padding:8px;border-bottom:1px solid #eee;">${clientUuid}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">备注</td><td style="padding:8px;border-bottom:1px solid #eee;">${remark}</td></tr>
                <tr><td style="padding:8px;color:#666;">时间</td><td style="padding:8px;">${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</td></tr>
              </table>
              <p style="color:#999;font-size:12px;margin-top:16px;">此邮件由系统自动发送</p>
            </div>`
      );
    }

    // Increment current_clients on the region_inbound and check stock
    if (foundViaInboundPlans && targetRegionInboundId) {
      const { data: riStockData } = await supabase
        .from("region_inbounds")
        .select("current_clients, max_clients, region_id")
        .eq("id", targetRegionInboundId)
        .single();
      if (riStockData) {
        const newCount = (riStockData.current_clients || 0) + 1;
        await supabase.from("region_inbounds").update({ current_clients: newCount }).eq("id", targetRegionInboundId);

        // Also update legacy regions.current_clients for backward compat
        if (regionId) {
          const { data: regionData } = await supabase.from("regions").select("current_clients").eq("id", regionId).single();
          if (regionData) {
            await supabase.from("regions").update({ current_clients: (regionData.current_clients || 0) + 1 }).eq("id", regionId);
          }
        }

        await notifyStockIfNeeded(supabase, config, riStockData.region_id, stockPoolIds.length > 0 ? stockPoolIds : [targetRegionInboundId]);
      }
    } else if (regionId) {
      // Fallback: increment on regions table
      const { data: regionData } = await supabase.from("regions").select("current_clients, max_clients, name").eq("id", regionId).single();
      if (regionData) {
        const newCount = (regionData.current_clients || 0) + 1;
        await supabase.from("regions").update({ current_clients: newCount }).eq("id", regionId);
        await notifyStockIfNeeded(supabase, config, regionId);
      }
    }

    // Parse stream settings for link generation
    let streamSettings: any = {};
    try { streamSettings = JSON.parse(inbound.streamSettings || "{}"); } catch {}

    // Build connection info for client-side link generation
    const connectionInfo: Record<string, any> = {
      address: config.panel_url.replace(/^https?:\/\//, "").replace(/:\d+.*$/, ""),
      port: inbound.port,
      streamSettings,
      remark: inbound.remark || "",
      regionName: "",
    };

    // Get region name if available
    if (regionId) {
      const { data: regionData } = await supabase.from("regions").select("name").eq("id", regionId).single();
      if (regionData) connectionInfo.regionName = regionData.name;
    }

    return new Response(
      JSON.stringify({
        success: true,
        credentials,
        remark,
        expiryTime,
        connectionInfo,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("create-client error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
