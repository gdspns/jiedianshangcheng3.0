import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// Find client by UUID
async function findClient(panelUrl: string, cookie: string, uuid: string) {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const res = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/list`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  const data = await res.json();
  if (!data?.success || !data?.obj) return null;
  for (const inbound of data.obj) {
    try {
      const settings = JSON.parse(inbound.settings || "{}");
      for (const client of settings.clients || []) {
        if (client.id === uuid || client.password === uuid) {
          return { inboundId: inbound.id, email: client.email, expiryTime: client.expiryTime || 0 };
        }
      }
    } catch {}
  }
  return null;
}

// Extend client expiry
async function extendExpiry(panelUrl: string, cookie: string, inboundId: number, email: string, currentExpiry: number, durationDays: number): Promise<boolean> {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const now = Date.now();
  const baseTime = (currentExpiry > 0 && currentExpiry > now) ? currentExpiry : now;
  const newExpiry = baseTime + durationDays * 24 * 60 * 60 * 1000;

  // Reset traffic
  await fetchUnsafe(`${baseUrl}/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(email)}`, {
    method: "POST", headers: { Cookie: cookie },
  });

  // Get inbound detail
  const inboundRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/get/${inboundId}`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  const inboundData = await inboundRes.json();
  if (!inboundData?.success || !inboundData?.obj) return false;

  const inbound = inboundData.obj;
  const settings = JSON.parse(inbound.settings || "{}");
  let found = false;
  for (const c of settings.clients || []) {
    if (c.email === email) { c.expiryTime = newExpiry; found = true; break; }
  }
  if (!found) return false;

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

      // Use order_type field to determine if this is a new purchase or renewal
      const isBuyNewOrder = order.order_type === "buy_new";

      // Extend expiry via 3x-ui (only for renewal orders)
      let clientRemark = "";
      let fulfilled = false;
      if (!isBuyNewOrder) {
        const cookie = await login3xui(config.panel_url, config.panel_user, config.panel_pass);
        if (cookie) {
          const client = await findClient(config.panel_url, cookie, order.uuid);
          if (client) {
            clientRemark = client.email || "";
            const durationDays = order.duration_days || (order.months * 30);
            const success = await extendExpiry(config.panel_url, cookie, client.inboundId, client.email, client.expiryTime, durationDays);
            if (success) {
              await supabase.from("orders").update({
                status: "fulfilled",
                fulfilled_at: new Date().toISOString(),
                ...(clientRemark && !order.email ? { email: clientRemark } : {}),
              }).eq("id", order.id);
              fulfilled = true;
            }
          }
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
