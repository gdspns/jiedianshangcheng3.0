import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminCorsHeaders, verifyAdminToken } from "../_shared/admin-security.ts";

const clean = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validSessionId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function clientIp(req: Request) {
  const direct = req.headers.get("x-visitor-ip") || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = direct || forwarded || "";
  return /^[0-9a-f:.]+$/i.test(value) ? value : null;
}

function validIp(value: unknown) {
  const ip = clean(value, 64);
  return ip && /^[0-9a-f:.]+$/i.test(ip) ? ip : null;
}

function parseAgent(agent: string) {
  const browser = /Edg\//.test(agent) ? "Edge" : /OPR\//.test(agent) ? "Opera" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "其他";
  const operatingSystem = /Windows/i.test(agent) ? "Windows" : /Android/i.test(agent) ? "Android" : /iPhone|iPad|iPod/i.test(agent) ? "iOS" : /Mac OS/i.test(agent) ? "macOS" : /Linux/i.test(agent) ? "Linux" : "其他";
  const deviceType = /iPad|Tablet/i.test(agent) ? "平板" : /Mobile|Android|iPhone|iPod/i.test(agent) ? "手机" : "电脑";
  return { browser, operatingSystem, deviceType };
}

Deno.serve(async (req) => {
  const corsHeaders = adminCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (body.action === "track") {
      if (!validSessionId(body.sessionId)) return json({ error: "Invalid session" }, 400);
      const path = clean(body.path, 300) || "/";
      if (path.startsWith("/3075554556")) return json({ success: true, ignored: true });

      const now = new Date();
      const { data: existing } = await supabase.from("visitor_sessions")
        .select("id,first_seen_at,last_path,page_views")
        .eq("session_id", body.sessionId).maybeSingle();
      const agent = clean(req.headers.get("user-agent"), 1000);
      const parsed = parseAgent(agent);
      const reportedIp = validIp(body.visitorIp);
      const reportedCountry = clean(body.visitorCountry, 8);

      if (existing) {
        const first = new Date(existing.first_seen_at).getTime();
        const duration = Math.max(0, Math.min(86400, Math.floor((now.getTime() - first) / 1000)));
        const changedPage = existing.last_path !== path;
        const { error } = await supabase.from("visitor_sessions").update({
          last_seen_at: now.toISOString(),
          duration_seconds: duration,
          last_path: path,
          page_views: Number(existing.page_views || 1) + (changedPage ? 1 : 0),
          ...(reportedIp ? { ip_address: reportedIp } : {}),
          ...(reportedCountry ? { country: reportedCountry } : {}),
          updated_at: now.toISOString(),
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("visitor_sessions").insert({
          session_id: body.sessionId,
          ip_address: reportedIp || clientIp(req),
          entry_path: path,
          last_path: path,
          referrer: clean(body.referrer, 1000) || null,
          user_agent: agent || null,
          browser: parsed.browser,
          operating_system: parsed.operatingSystem,
          device_type: parsed.deviceType,
          country: reportedCountry || clean(req.headers.get("cf-ipcountry"), 80) || null,
          region: clean(req.headers.get("cf-region"), 120) || null,
          city: clean(req.headers.get("cf-ipcity"), 120) || null,
        });
        if (error) throw error;
      }
      return json({ success: true });
    }

    const configId = await verifyAdminToken(body.token);
    if (!configId) return json({ error: "管理员登录已失效" }, 401);

    if (body.action === "list") {
      const page = Math.max(1, Number(body.page) || 1);
      const pageSize = Math.min(100, Math.max(10, Number(body.pageSize) || 25));
      const days = Math.min(365, Math.max(1, Number(body.days) || 30));
      const from = new Date(Date.now() - days * 86400000).toISOString();
      const start = (page - 1) * pageSize;
      const search = clean(body.search, 100);

      let query = supabase.from("visitor_sessions").select("*", { count: "exact" }).gte("first_seen_at", from);
      if (search) {
        const safeSearch = search.replace(/[%_,()]/g, "");
        const isIp = /^[0-9a-f:.]+$/i.test(search);
        query = isIp
          ? query.or(`ip_address.eq.${search},entry_path.ilike.%${safeSearch}%`)
          : query.ilike("entry_path", `%${safeSearch}%`);
      }
      const { data, count, error } = await query.order("first_seen_at", { ascending: false }).range(start, start + pageSize - 1);
      if (error) throw error;

      const { data: statsRows, error: statsError } = await supabase.from("visitor_sessions")
        .select("ip_address,duration_seconds,page_views,first_seen_at").gte("first_seen_at", from).limit(10000);
      if (statsError) throw statsError;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const rows = statsRows || [];
      const stats = {
        visits: rows.length,
        uniqueVisitors: new Set(rows.map((row) => row.ip_address).filter(Boolean)).size,
        todayVisits: rows.filter((row) => new Date(row.first_seen_at) >= today).length,
        pageViews: rows.reduce((sum, row) => sum + Number(row.page_views || 0), 0),
        averageDuration: rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.duration_seconds || 0), 0) / rows.length) : 0,
      };
      return json({ records: data || [], total: count || 0, page, pageSize, days, stats });
    }

    if (body.action === "cleanup") {
      const retentionDays = Math.min(365, Math.max(7, Number(body.retentionDays) || 90));
      const before = new Date(Date.now() - retentionDays * 86400000).toISOString();
      const { error, count } = await supabase.from("visitor_sessions").delete({ count: "exact" }).lt("last_seen_at", before);
      if (error) throw error;
      return json({ success: true, deleted: count || 0 });
    }

    if (body.action === "delete") {
      const recordId = clean(body.recordId, 64);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId)) {
        return json({ error: "访问记录编号无效" }, 400);
      }
      const { error, count } = await supabase.from("visitor_sessions").delete({ count: "exact" }).eq("id", recordId);
      if (error) throw error;
      if (!count) return json({ error: "访问记录不存在或已删除" }, 404);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Visitor analytics error:", error);
    return json({ error: error instanceof Error ? error.message : "访问统计服务异常" }, 500);
  }
});
