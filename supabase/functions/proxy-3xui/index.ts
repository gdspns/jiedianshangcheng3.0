import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper: fetch with automatic fallback strategies for problematic servers
async function fetchUnsafe(url: string, init?: RequestInit): Promise<Response> {
  const attempts: Array<{ url: string; label: string }> = [];

  // If HTTPS, try HTTPS first, then HTTP fallback
  if (url.startsWith("https://")) {
    attempts.push({ url, label: "HTTPS" });
    attempts.push({ url: url.replace(/^https:\/\//, "http://"), label: "HTTP fallback" });
  } else {
    attempts.push({ url, label: "HTTP" });
  }

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      console.log(`fetchUnsafe: trying ${attempt.label} → ${attempt.url}`);
      const res = await fetch(attempt.url, init);
      return res;
    } catch (err) {
      const errStr = String(err);
      console.warn(`fetchUnsafe ${attempt.label} failed:`, errStr.substring(0, 300));
      lastErr = err;
      // Continue to next attempt
    }
  }
  throw lastErr;
}
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

// Helper: Login to 3x-ui panel and get session cookie
async function login3xui(panelUrl: string, username: string, password: string): Promise<{ cookie: string | null; error?: string }> {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const loginUrl = `${baseUrl}/login`;
  console.log("Attempting 3x-ui login at:", loginUrl);
  try {
    const res = await fetchUnsafe(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });

    console.log("3x-ui login response status:", res.status);
    const resBody = await res.text();
    console.log("3x-ui login response body:", resBody.substring(0, 500));

    // Extract Set-Cookie header
    const setCookie = res.headers.get("set-cookie");
    console.log("3x-ui set-cookie:", setCookie);

    let cookie: string | null = null;
    if (setCookie) {
      const match = setCookie.match(/([^=]+=[^;]+)/);
      cookie = match ? match[1] : null;
    }

    // Parse response body
    try {
      const json = JSON.parse(resBody);
      if (json.success === false) {
        return { cookie: null, error: json.msg || "登录失败：账号或密码错误" };
      }
      if (json.success === true && cookie) {
        return { cookie };
      }
      // If success but no cookie, try to find it in response headers
      if (json.success === true) {
        return { cookie: null, error: "登录成功但未获取到 Session Cookie" };
      }
    } catch {
      // Not JSON response
    }

    if (cookie) return { cookie };
    return { cookie: null, error: `面板返回状态码 ${res.status}，未获取到登录凭证` };
  } catch (err) {
    console.error("3x-ui login failed:", err);
    return { cookie: null, error: `无法连接到面板: ${String(err).substring(0, 200)}` };
  }
}

// Helper: Get all inbounds from 3x-ui
async function getInbounds(panelUrl: string, cookie: string) {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const res = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/list`, {
    method: "GET",
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  return await res.json();
}

// Find client by UUID / SOCKS5 identifier in all inbounds
function findClientByIdentifier(inboundsData: any, identifier: string) {
  if (!inboundsData?.success || !inboundsData?.obj) return null;

  for (const inbound of inboundsData.obj) {
    try {
      const settings = JSON.parse(inbound.settings || "{}");
      const streamSettings = (() => {
        try {
          return JSON.parse(inbound.streamSettings || "{}");
        } catch {
          return {};
        }
      })();

      const entries = [
        ...(Array.isArray(settings.clients) ? settings.clients : []),
        ...(Array.isArray(settings.accounts) ? settings.accounts : []),
      ];

      console.log(`Inbound #${inbound.id} protocol=${inbound.protocol} entries=${entries.length} keys=${JSON.stringify(entries.map((e:any) => ({id:e.id,email:e.email,user:e.user,username:e.username,pass:e.pass,password:e.password})))}`);

      for (const entry of entries) {
        const candidateKeys = [
          entry?.id,
          entry?.email,
          entry?.user,
          entry?.username,
          entry?.pass,
          entry?.password,
        ].filter((value): value is string => typeof value === "string" && value.length > 0);

        if (!candidateKeys.includes(identifier)) continue;

        const clientStats = inbound.clientStats?.find((s: any) => {
          const statsKey = typeof s?.email === "string" ? s.email : "";
          return statsKey.length > 0 && candidateKeys.includes(statsKey);
        });

        let remark = "";
        if (clientStats?.email && clientStats.email !== identifier) {
          remark = clientStats.email;
        } else if (entry.email && entry.email !== identifier) {
          remark = entry.email;
        } else if (inbound.remark) {
          remark = inbound.remark;
        } else {
          remark = clientStats?.email || entry.email || "";
        }

        return {
          found: true,
          email: remark,
          expiryTime: entry.expiryTime || clientStats?.expiryTime || 0,
          up: clientStats?.up || 0,
          down: clientStats?.down || 0,
          total: entry.totalGB ? entry.totalGB * 1073741824 : clientStats?.total || 0,
          inboundId: inbound.id,
          enable: clientStats?.enable ?? entry.enable ?? true,
          protocol: inbound.protocol || "",
          inboundPort: Number(inbound.port || 0),
          inboundRemark: inbound.remark || "",
          streamSettings,
          clientId: entry?.id || entry?.password || "",
          username: entry?.user || entry?.username || "",
          password: entry?.pass || entry?.password || "",
        };
      }
    } catch {}
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, token, uuid } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "test") {
      // Verify admin token
      const configId = verifyToken(token);
      if (!configId) {
        return new Response(JSON.stringify({ error: "未授权" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use panel params from request body (form values), not DB
      const testUrl = body.panelUrl || "";
      const testUser = body.panelUser || "";
      const testPass = body.panelPass || "";

      if (!testUrl) {
        return new Response(JSON.stringify({ success: false, error: "请输入面板 URL" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await login3xui(testUrl, testUser, testPass);
      if (result.cookie) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        return new Response(JSON.stringify({ success: false, error: result.error || "无法连接到面板" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "lookup") {
      if (!uuid || typeof uuid !== "string") {
        return new Response(JSON.stringify({ error: "请提供有效的 UUID" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get config from DB for lookup
      const { data: configData, error: configError } = await supabase.from("admin_config").select("*").limit(1).single();
      if (configError || !configData) {
        return new Response(JSON.stringify({ error: "系统配置未初始化" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { panel_url, panel_user, panel_pass } = configData;

      // Login to 3x-ui
      const loginResult = await login3xui(panel_url, panel_user, panel_pass);
      if (!loginResult.cookie) {
        return new Response(JSON.stringify({ success: false, error: loginResult.error || "无法连接到 3x-ui 面板" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cookie = loginResult.cookie;

      // Get inbounds and search for UUID
      const inboundsData = await getInbounds(panel_url, cookie);
      const client = findClientByIdentifier(inboundsData, uuid);

      if (!client) {
        return new Response(JSON.stringify({ success: false, error: "未找到该标识符对应的节点用户" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Calculate traffic in GB
      const trafficUsedGB = (client.up + client.down) / 1073741824;
      const trafficTotalGB = client.total > 0 ? client.total / 1073741824 : 999;

      const connectionInfo = {
        address: panel_url.replace(/^https?:\/\//, "").replace(/:\d+.*$/, ""),
        port: client.inboundPort,
        streamSettings: client.streamSettings || {},
        remark: client.inboundRemark || "",
        regionName: "",
      };

      const isSocksLike = client.protocol === "socks" || client.protocol === "mixed";
      let credentials: Record<string, string>;
      if (isSocksLike) {
        credentials = { protocol: "socks", username: client.username, password: client.password };
      } else if (client.protocol === "trojan") {
        // Trojan uses password as the credential (which is the UUID)
        credentials = { protocol: "trojan", uuid: client.password || client.clientId };
      } else {
        credentials = { protocol: client.protocol, uuid: client.clientId };
      }

      // Combine inbound remark with client remark for display
      const displayRemark = client.inboundRemark
        ? (client.email ? `${client.inboundRemark}-${client.email}` : client.inboundRemark)
        : client.email;

      return new Response(JSON.stringify({
        success: true,
        email: displayRemark,
        remark: client.email,
        expiryDate: client.expiryTime,
        trafficUsed: Math.round(trafficUsedGB * 100) / 100,
        trafficTotal: Math.round(trafficTotalGB * 100) / 100,
        enable: client.enable,
        credentials,
        connectionInfo,
      }), {
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
