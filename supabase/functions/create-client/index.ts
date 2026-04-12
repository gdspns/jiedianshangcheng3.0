import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Determine inbound_id and protocol: check if order's plan has a region
    let salesInboundId = (config as any).sales_inbound_id ?? 1;
    let salesProtocol = (config as any).sales_protocol ?? "mixed";

    // Try to find the plan and its region
    if (regionId) {
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

    // Remark/email for the new client - include 独享/共享 label
    const planName = (order.plan_name || "").toLowerCase();
    const categoryLabel = "自助";
    const remark = `${categoryLabel}_${order.trade_no || order.id.substring(0, 8)}`;

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
      formData.append("expiryTime", String(expiryTime));
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
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.resend_api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "通知 <onboarding@resend.dev>",
            to: [config.notify_email],
            subject: `🎉 新用户开通成功 - ${order.plan_name}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
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
            </div>`,
          }),
        });
        console.log("New purchase notification email sent");
      } catch (emailErr) {
        console.error("Failed to send new purchase notification:", emailErr);
      }
    }

    // Increment current_clients on the region and check stock
    if (regionId) {
      const { data: regionData } = await supabase.from("regions").select("current_clients, max_clients, name").eq("id", regionId).single();
      if (regionData) {
        const newCount = (regionData.current_clients || 0) + 1;
        await supabase.from("regions").update({ current_clients: newCount }).eq("id", regionId);

        // Send stock-out notification email if max_clients reached
        if (regionData.max_clients > 0 && newCount >= regionData.max_clients && config.notify_stock_out && config.resend_api_key && config.notify_email) {
          try {
            const emailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.resend_api_key}`,
              },
              body: JSON.stringify({
                from: `系统通知 <onboarding@resend.dev>`,
                to: [config.notify_email],
                subject: `⚠️ 地区「${regionData.name}」库存已用完`,
                html: `<h2>库存耗尽通知</h2>
                  <p>地区 <strong>${regionData.name}</strong> 的客户端名额已全部用完。</p>
                  <p>已用: <strong>${newCount}/${regionData.max_clients}</strong></p>
                  <p>请及时补充库存或调整最大客户端数量。</p>
                  <hr><p style="color:#999;font-size:12px;">此邮件由系统自动发送</p>`,
              }),
            });
            try { console.log("Stock-out notification email sent:", await emailRes.text()); } catch { console.log("Stock-out notification email sent"); }
          } catch (emailErr) {
            console.error("Failed to send stock-out notification:", emailErr);
          }
        }
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
