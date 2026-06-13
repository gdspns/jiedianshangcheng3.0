// Auto-fulfill: scans pending crypto orders & paid buy_new orders, completes them.
// Triggered by pg_cron every minute so users don't need to stay on the payment page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };

  const result = { verified: 0, fulfilled: 0, errors: [] as string[] };

  try {
    // 1) Verify pending crypto orders created within the last 30 minutes
    const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: pendingCrypto } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "pending")
      .eq("payment_method", "crypto")
      .gte("created_at", sinceIso)
      .limit(50);

    for (const o of pendingCrypto || []) {
      try {
        const r = await fetch(`${baseUrl}/functions/v1/crypto-verify`, {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "verify", orderId: o.id }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.success) result.verified++;
      } catch (e) {
        result.errors.push(`verify ${o.id}: ${String(e)}`);
      }
    }

    // 2) Auto-create clients for paid buy_new orders missing uuid
    const { data: paidBuyNew } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "paid")
      .eq("order_type", "buy_new")
      .or("uuid.is.null,uuid.eq.")
      .limit(50);

    for (const o of paidBuyNew || []) {
      try {
        const r = await fetch(`${baseUrl}/functions/v1/create-client`, {
          method: "POST",
          headers,
          body: JSON.stringify({ orderId: o.id }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.success) result.fulfilled++;
      } catch (e) {
        result.errors.push(`create ${o.id}: ${String(e)}`);
      }
    }

    // 3) Sweep: send notification emails for fulfilled orders that didn't get one
    //    (e.g. when alipay/wechat callback failed and order was fulfilled via other paths)
    const { data: cfgRow } = await supabase
      .from("admin_config")
      .select("resend_api_key, notify_email")
      .limit(1)
      .single();
    const emailedCount = { sent: 0 };
    if (cfgRow?.resend_api_key && cfgRow?.notify_email) {
      const sweepSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: needEmail } = await supabase
        .from("orders")
        .select("id, trade_no, uuid, email, plan_name, amount, months, payment_method, order_type, fulfilled_at, client_remark, crypto_currency, crypto_amount, tx_hash")
        .eq("status", "fulfilled")
        .eq("email_notified", false)
        .gte("fulfilled_at", sweepSince)
        .limit(50);

      for (const o of needEmail || []) {
        const isTopup = o.order_type === "topup_traffic" || String(o.plan_name || "").includes("流量充值");
        const isBuyNew = o.order_type === "buy_new";
        const isCrypto = o.payment_method === "crypto";
        const titleAction = isBuyNew ? "🎉 新用户开通成功" : (isTopup ? "💰 流量充值成功" : "💰 续费成功");
        const subject = `${titleAction} - ${o.plan_name}`;
        const amountRow = isCrypto
          ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">金额</td><td style="padding:8px;border-bottom:1px solid #eee;">${o.crypto_amount || ""} ${o.crypto_currency || ""}</td></tr>`
          : `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">金额</td><td style="padding:8px;border-bottom:1px solid #eee;">¥${o.amount}</td></tr>`;
        const qtyRow = isTopup
          ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">流量</td><td style="padding:8px;border-bottom:1px solid #eee;">${o.months} GB</td></tr>`
          : `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">时长</td><td style="padding:8px;border-bottom:1px solid #eee;">${o.months} 个月</td></tr>`;
        const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#10b981;">${titleAction}</h2>
          <p style="color:#888;font-size:12px;">（兜底通知：原回调未触发，由后台补发）</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">订单号</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${o.trade_no || o.id}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">UUID</td><td style="padding:8px;border-bottom:1px solid #eee;">${o.uuid || ""}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">邮箱/手机</td><td style="padding:8px;border-bottom:1px solid #eee;">${o.email || "未填写"}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">用户备注</td><td style="padding:8px;border-bottom:1px solid #eee;">${o.client_remark || "—"}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">套餐</td><td style="padding:8px;border-bottom:1px solid #eee;">${o.plan_name}</td></tr>
            ${amountRow}
            ${qtyRow}
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">支付方式</td><td style="padding:8px;border-bottom:1px solid #eee;">${o.payment_method}</td></tr>
            <tr><td style="padding:8px;color:#666;">完成时间</td><td style="padding:8px;">${new Date(o.fulfilled_at || Date.now()).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</td></tr>
          </table>
        </div>`;
        try {
          const emRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cfgRow.resend_api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "通知 <onboarding@resend.dev>",
              to: [cfgRow.notify_email],
              subject,
              html,
            }),
          });
          if (emRes.ok) {
            await supabase.from("orders").update({ email_notified: true }).eq("id", o.id);
            emailedCount.sent++;
          } else {
            result.errors.push(`email ${o.id}: ${emRes.status} ${await emRes.text().catch(() => "")}`);
          }
        } catch (e) {
          result.errors.push(`email ${o.id}: ${String(e)}`);
        }
      }
    }

    return new Response(JSON.stringify({ ...result, emailed: emailedCount.sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), ...result }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
