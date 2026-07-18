import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

async function getUuidRemarkMap(panelUrl: string, panelUser: string, panelPass: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const baseUrl = panelUrl.replace(/\/+$/, "");
    const loginRes = await fetchUnsafe(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(panelUser)}&password=${encodeURIComponent(panelPass)}`,
    });
    const setCookie = loginRes.headers.get("set-cookie");
    const cookieMatch = setCookie?.match(/([^=]+=[^;]+)/);
    const cookie = cookieMatch ? cookieMatch[1] : null;
    if (!cookie) return map;

    const inboundsRes = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/list`, {
      method: "GET",
      headers: { Cookie: cookie, Accept: "application/json" },
    });
    const inboundsData = await inboundsRes.json();
    if (!inboundsData?.success || !inboundsData?.obj) return map;

    for (const inbound of inboundsData.obj) {
      try {
        const settings = JSON.parse(inbound.settings || "{}");
        const entries = [
          ...(Array.isArray(settings.clients) ? settings.clients : []),
          ...(Array.isArray(settings.accounts) ? settings.accounts : []),
        ];

        for (const entry of entries) {
          // For SOCKS5 (accounts with user/pass), use inbound.remark as the remark
          const remark = entry.email || inbound.remark || entry.user || entry.username || "";
          const candidateKeys = [entry.id, entry.email, entry.user, entry.username, entry.pass, entry.password]
            .filter((value): value is string => typeof value === "string" && value.length > 0);
          for (const key of candidateKeys) {
            map[key] = remark;
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error("Failed to fetch remark map:", err);
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, token, page, pageSize, search, statusFilter, orderId, orderIds, startDate, endDate } = await req.json();

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

    if (action === "list") {
      const currentPage = page || 1;
      const size = pageSize || 20;
      const from = (currentPage - 1) * size;
      const to = from + size - 1;

      let query = supabase
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(`uuid.ilike.%${search}%,plan_name.ilike.%${search}%,email.ilike.%${search}%,inbound_remark.ilike.%${search}%,client_remark.ilike.%${search}%`);
      }

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      query = query.range(from, to);

      const [ordersResult, panelsResult] = await Promise.all([
        query,
        supabase.from("panels").select("panel_url, panel_user, panel_pass").eq("enabled", true),
      ]);

      if (ordersResult.error) throw ordersResult.error;

      let remarkMap: Record<string, string> = {};
      const panelList = panelsResult.data || [];
      // Fallback to admin_config if panels table is empty
      if (panelList.length === 0) {
        const { data: cfg } = await supabase.from("admin_config").select("panel_url, panel_user, panel_pass").limit(1).single();
        if (cfg) panelList.push(cfg);
      }
      for (const p of panelList) {
        const m = await getUuidRemarkMap(p.panel_url, p.panel_user, p.panel_pass);
        Object.assign(remarkMap, m);
      }

      const enrichedOrders = (ordersResult.data || []).map((order: any) => ({
        ...order,
        remark: remarkMap[order.uuid] || order.client_remark || order.email || "",
      }));

      return new Response(JSON.stringify({ orders: enrichedOrders, total: ordersResult.count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "stats") {
      const paidStatuses = ["paid", "fulfilled"];
      const start = startDate ? new Date(startDate).getTime() : Number.NEGATIVE_INFINITY;
      const end = endDate ? new Date(endDate).getTime() : Number.POSITIVE_INFINITY;
      let totalAmount = 0;
      let totalCount = 0;
      const pageSize = 1000;

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("orders")
          .select("id, amount, status, created_at, paid_at, fulfilled_at")
          .in("status", paidStatuses)
          .range(from, from + pageSize - 1);

        if (error) throw error;

        for (const order of data || []) {
          const revenueTime = new Date(order.paid_at || order.fulfilled_at || order.created_at).getTime();
          if (!Number.isFinite(revenueTime) || revenueTime < start || revenueTime > end) continue;
          totalAmount += Number(order.amount || 0);
          totalCount += 1;
        }

        if (!data || data.length < pageSize) break;
      }

      return new Response(JSON.stringify({
        success: true,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalCount,
        startDate: startDate || null,
        endDate: endDate || null,
        statuses: paidStatuses,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      if (!orderId) {
        return new Response(JSON.stringify({ error: "缺少 orderId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "batch-delete") {
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return new Response(JSON.stringify({ error: "缺少 orderIds" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("orders").delete().in("id", orderIds);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, deleted: orderIds.length }), {
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
