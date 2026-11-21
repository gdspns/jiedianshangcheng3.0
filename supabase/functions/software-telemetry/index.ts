import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requestIp, verifyAdminToken } from "../_shared/admin-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const action = clean(body?.action, 40);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "heartbeat") {
      const identifier = clean(body?.identifier, 200);
      if (!identifier) return json({ error: "缺少用户标识" }, 400);
      const { error } = await supabase.from("software_online_users").upsert({
        user_identifier: identifier,
        user_remark: clean(body?.remark, 200),
        app_version: clean(body?.appVersion, 50),
        ip_address: requestIp(req),
        current_node: clean(body?.currentNode, 300),
        is_online: true,
        last_seen: new Date().toISOString(),
      }, { onConflict: "user_identifier" });
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "offline") {
      const identifier = clean(body?.identifier, 200);
      if (identifier) {
        const { error } = await supabase.from("software_online_users")
          .update({ is_online: false, last_seen: new Date().toISOString() })
          .eq("user_identifier", identifier);
        if (error) throw error;
      }
      return json({ success: true });
    }

    if (action === "record-subscription") {
      const subscriptionUrl = clean(body?.subscriptionUrl, 4000);
      if (!/^https?:\/\//i.test(subscriptionUrl)) return json({ error: "订阅链接格式错误" }, 400);
      const { error } = await supabase.from("software_subscription_logs").upsert({
        subscription_url: subscriptionUrl,
        subscription_label: clean(body?.label, 200),
        user_identifier: clean(body?.identifier, 200),
        ip_address: requestIp(req),
      }, { onConflict: "subscription_url", ignoreDuplicates: true });
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "admin-list") {
      if (!await verifyAdminToken(body?.token)) return json({ error: "未授权" }, 401);
      const includeLogs = body?.includeLogs !== false;
      const { data: users, error: usersError } = await supabase.from("software_online_users").select("*").order("last_seen", { ascending: false }).limit(500);
      if (usersError) throw usersError;
      let logs: any[] | undefined;
      if (includeLogs) {
        const { data, error: logsError } = await supabase.from("software_subscription_logs").select("*").order("first_seen", { ascending: false }).limit(1000);
        if (logsError) throw logsError;
        logs = data || [];
      }
      const cutoff = Date.now() - 90_000;
      return json({
        users: (users || []).map((user: any) => ({
          ...user,
          online: user.is_online === true && new Date(user.last_seen).getTime() >= cutoff,
        })),
        ...(includeLogs ? { subscriptionLogs: logs || [] } : {}),
        generatedAt: new Date().toISOString(),
      });
    }

    if (action === "admin-delete-subscription") {
      if (!await verifyAdminToken(body?.token)) return json({ error: "未授权" }, 401);
      const id = clean(body?.id, 100);
      if (!id) return json({ error: "缺少记录 ID" }, 400);
      const { error } = await supabase.from("software_subscription_logs").delete().eq("id", id);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "未知操作" }, 400);
  } catch (error) {
    console.error("software-telemetry error", error);
    return json({ error: error instanceof Error ? error.message : "操作失败" }, 500);
  }
});
