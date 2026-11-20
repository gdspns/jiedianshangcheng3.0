import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdminToken } from "../_shared/admin-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, token, config } = await req.json();

    const configId = await verifyAdminToken(token);
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
        officialWechatEnabled: data.official_wechat_enabled ?? false,
        officialWechatAppId: data.official_wechat_app_id || "",
        officialWechatMchId: data.official_wechat_mch_id || "",
        officialWechatSerialNo: data.official_wechat_serial_no || "",
        officialWechatPrivateKey: data.official_wechat_private_key || "",
        officialWechatApiV3Key: data.official_wechat_api_v3_key || "",
        officialWechatPlatformPublicKey: data.official_wechat_platform_public_key || "",
        officialAlipayEnabled: data.official_alipay_enabled ?? false,
        officialAlipayAppId: data.official_alipay_app_id || "",
        officialAlipayPrivateKey: data.official_alipay_private_key || "",
        officialAlipayPublicKey: data.official_alipay_public_key || "",
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
        topupMinGb: data.topup_min_gb ?? 0,
        topupPrice: Number(data.topup_price ?? 0),
        topupLargeMinGb: data.topup_large_min_gb ?? 0,
        topupLargePrice: Number(data.topup_large_price ?? 0),
        topupPackages: Array.isArray(data.topup_packages) ? data.topup_packages : [],
        topupBlacklist: data.topup_blacklist || "",
        subscriptionDomain: data.subscription_domain || "dy.ip520.top",
        softwareNoticeEnabled: data.software_notice_enabled ?? false,
        softwareNotice: data.software_notice || "",
        softwareApiDomain: data.software_api_domain || "www.ip520.top",
      };

      return new Response(JSON.stringify({ config: frontendConfig }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save") {
      if (config.officialWechatEnabled === true) {
        const requiredWechat = [config.officialWechatAppId, config.officialWechatMchId, config.officialWechatSerialNo, config.officialWechatPrivateKey, config.officialWechatApiV3Key, config.officialWechatPlatformPublicKey];
        if (requiredWechat.some((value) => !String(value || "").trim()) || new TextEncoder().encode(String(config.officialWechatApiV3Key || "").trim()).length !== 32) {
          return new Response(JSON.stringify({ error: "开启微信官方支付前，请填写完整配置并确认 API v3 密钥为32字节" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      if (config.officialAlipayEnabled === true) {
        const requiredAlipay = [config.officialAlipayAppId, config.officialAlipayPrivateKey, config.officialAlipayPublicKey];
        if (requiredAlipay.some((value) => !String(value || "").trim())) {
          return new Response(JSON.stringify({ error: "开启支付宝官方支付前，请填写完整的 AppID、应用私钥和支付宝公钥" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      const subscriptionDomain = String(config.subscriptionDomain || "dy.ip520.top")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/[\/?#].*$/, "")
        .replace(/:\d+$/, "");
      if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(subscriptionDomain)) {
        return new Response(JSON.stringify({ error: "订阅域名格式不正确，请只填写域名，例如 dy.ip520.top" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const softwareApiDomain = String(config.softwareApiDomain || "www.ip520.top")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/[\/?#].*$/, "")
        .replace(/:\d+$/, "");
      if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(softwareApiDomain)) {
        return new Response(JSON.stringify({ error: "软件接口域名格式不正确，请只填写域名，例如 www.ip520.top" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: existingConfig } = await supabase
        .from("admin_config")
        .select("subscription_domain,subscription_domain_history")
        .eq("id", configId)
        .maybeSingle();
      const subscriptionDomainHistory = Array.from(new Set([
        ...((existingConfig?.subscription_domain_history || []) as string[]),
        String(existingConfig?.subscription_domain || "").trim().toLowerCase(),
        subscriptionDomain,
      ].filter(Boolean)));
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
        official_wechat_enabled: config.officialWechatEnabled === true,
        official_wechat_app_id: String(config.officialWechatAppId || "").trim(),
        official_wechat_mch_id: String(config.officialWechatMchId || "").trim(),
        official_wechat_serial_no: String(config.officialWechatSerialNo || "").trim(),
        official_wechat_private_key: String(config.officialWechatPrivateKey || "").trim(),
        official_wechat_api_v3_key: String(config.officialWechatApiV3Key || "").trim(),
        official_wechat_platform_public_key: String(config.officialWechatPlatformPublicKey || "").trim(),
        official_alipay_enabled: config.officialAlipayEnabled === true,
        official_alipay_app_id: String(config.officialAlipayAppId || "").trim(),
        official_alipay_private_key: String(config.officialAlipayPrivateKey || "").trim(),
        official_alipay_public_key: String(config.officialAlipayPublicKey || "").trim(),
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
        topup_min_gb: Math.max(0, Math.floor(Number(config.topupMinGb) || 0)),
        topup_price: Math.max(0, Number(config.topupPrice) || 0),
        topup_large_min_gb: Math.max(0, Math.floor(Number(config.topupLargeMinGb) || 0)),
        topup_large_price: Math.max(0, Number(config.topupLargePrice) || 0),
        topup_packages: Array.isArray(config.topupPackages) ? config.topupPackages.map((item: any, index: number) => ({
          id: String(item?.id || `package-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64),
          title: String(item?.title || "流量包").trim().slice(0, 50),
          minGb: Math.max(1, Math.floor(Number(item?.minGb) || 0)),
          price: Math.max(0.01, Number(Number(item?.price || 0).toFixed(2))),
          priceLabel: String(item?.priceLabel || "").trim().slice(0, 100),
          style: item?.style === "orange" ? "orange" : "primary",
        })).filter((item: any) => item.id && item.minGb > 0 && item.price > 0) : [],
        topup_blacklist: typeof config.topupBlacklist === "string" ? config.topupBlacklist : "",
        subscription_domain: subscriptionDomain,
        subscription_domain_history: subscriptionDomainHistory,
        software_notice_enabled: config.softwareNoticeEnabled === true,
        software_notice: String(config.softwareNotice || "").trim().slice(0, 300),
        software_api_domain: softwareApiDomain,
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
