import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function verifyToken(token: string): string | null {
  try {
    const decoded = atob(token);
    const [id] = decoded.split(":");
    return id || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, token, config } = await req.json();

    const configId = verifyToken(token);
    if (!configId) {
      return new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "get") {
      const { data, error } = await supabase
        .from("admin_config")
        .select("*")
        .eq("id", configId)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "配置不存在" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Map DB fields to frontend format
      const frontendConfig = {
        panelUrl: data.panel_url,
        panelUser: data.panel_user,
        panelPass: data.panel_pass,
        priceMonth: data.price_month,
        priceQuarter: data.price_quarter,
        priceYear: data.price_year,
        hupiWechatAppId: data.hupi_wechat_app_id || "",
        hupiWechatAppSecret: data.hupi_wechat_app_secret || "",
        hupiAlipayAppId: data.hupi_alipay_app_id || "",
        hupiAlipayAppSecret: data.hupi_alipay_app_secret || "",
        hupiWechat: data.hupi_wechat,
        hupiAlipay: data.hupi_alipay,
        cryptoAddress: data.crypto_address || "",
        cryptoKey: data.crypto_key || "",
        cryptoUsdt: data.crypto_usdt,
        cryptoTrx: data.crypto_trx,
        priceExclusiveMonth: data.price_exclusive_month,
        priceExclusiveQuarter: data.price_exclusive_quarter,
        priceExclusiveYear: data.price_exclusive_year,
        priceSharedMonth: data.price_shared_month,
        priceSharedQuarter: data.price_shared_quarter,
        priceSharedYear: data.price_shared_year,
        tawkId: data.tawk_id || "",
        qqQrcodeUrl: data.qq_qrcode_url || "",
        telegramLink: data.telegram_link || "",
        videoEmbed: data.video_embed || "",
        landingImage: data.landing_image || "",
        resendApiKey: data.resend_api_key || "",
        notifyEmail: data.notify_email || "",
        salesInboundId: data.sales_inbound_id ?? 1,
        salesProtocol: data.sales_protocol ?? "mixed",
        notifyStockOut: data.notify_stock_out ?? false,
      };

      return new Response(JSON.stringify({ config: frontendConfig }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save") {
      const updateData = {
        panel_url: config.panelUrl,
        panel_user: config.panelUser,
        panel_pass: config.panelPass,
        price_month: config.priceMonth,
        price_quarter: config.priceQuarter,
        price_year: config.priceYear,
        hupi_wechat_app_id: config.hupiWechatAppId,
        hupi_wechat_app_secret: config.hupiWechatAppSecret,
        hupi_alipay_app_id: config.hupiAlipayAppId,
        hupi_alipay_app_secret: config.hupiAlipayAppSecret,
        hupi_wechat: config.hupiWechat,
        hupi_alipay: config.hupiAlipay,
        crypto_address: config.cryptoAddress,
        crypto_key: config.cryptoKey,
        crypto_usdt: config.cryptoUsdt,
        crypto_trx: config.cryptoTrx,
        price_exclusive_month: config.priceExclusiveMonth,
        price_exclusive_quarter: config.priceExclusiveQuarter,
        price_exclusive_year: config.priceExclusiveYear,
        price_shared_month: config.priceSharedMonth,
        price_shared_quarter: config.priceSharedQuarter,
        price_shared_year: config.priceSharedYear,
        tawk_id: config.tawkId,
        qq_qrcode_url: config.qqQrcodeUrl,
        telegram_link: config.telegramLink,
        video_embed: config.videoEmbed,
        landing_image: config.landingImage,
        resend_api_key: config.resendApiKey,
        notify_email: config.notifyEmail,
        sales_inbound_id: config.salesInboundId,
        sales_protocol: config.salesProtocol,
        notify_stock_out: config.notifyStockOut,
      };

      const { error } = await supabase
        .from("admin_config")
        .update(updateData)
        .eq("id", configId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
