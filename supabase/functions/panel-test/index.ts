import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

// Helper: fetch with automatic fallback strategies
async function fetchUnsafe(url: string, init?: RequestInit): Promise<Response> {
  const attempts: Array<{ url: string; label: string }> = [];

  if (url.startsWith("https://")) {
    attempts.push({ url, label: "HTTPS" });
    attempts.push({ url: url.replace(/^https:\/\//, "http://"), label: "HTTP fallback" });
  } else {
    attempts.push({ url, label: "HTTP" });
  }

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, init);
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Login to 3x-ui panel
async function login3xui(panelUrl: string, username: string, password: string): Promise<{ cookie: string | null; error?: string }> {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const loginUrl = `${baseUrl}/login`;
  try {
    const res = await fetchUnsafe(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });

    const resBody = await res.text();
    let cookie: string | null = null;
    
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/([^=]+=[^;]+)/);
      cookie = match ? match[1] : null;
    }

    try {
      const json = JSON.parse(resBody);
      if (json.success === false) {
        return { cookie: null, error: json.msg || "登录失败" };
      }
      if (json.success === true && cookie) {
        return { cookie };
      }
    } catch {}

    if (cookie) return { cookie };
    return { cookie: null, error: `面板返回状态码 ${res.status}` };
  } catch (err) {
    return { cookie: null, error: String(err) };
  }
}

// Test panel connection
async function testPanelConnection(
  panelUrl: string,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string; responseTime?: number }> {
  const startTime = Date.now();
  
  try {
    const login = await login3xui(panelUrl, username, password);
    if (login.error) {
      return {
        success: false,
        error: login.error,
        responseTime: Date.now() - startTime,
      };
    }

    if (!login.cookie) {
      return {
        success: false,
        error: "未获取到登录凭证",
        responseTime: Date.now() - startTime,
      };
    }

    // Test API endpoint
    const baseUrl = panelUrl.replace(/\/+$/, "");
    const res = await fetchUnsafe(`${baseUrl}/api/inbounds/list`, {
      method: "GET",
      headers: {
        "Cookie": login.cookie,
        "Content-Type": "application/json",
      },
    });

    const responseTime = Date.now() - startTime;

    if (!res.ok) {
      return {
        success: false,
        error: `API 返回状态码 ${res.status}`,
        responseTime,
      };
    }

    return {
      success: true,
      responseTime,
    };
  } catch (err) {
    return {
      success: false,
      error: String(err),
      responseTime: Date.now() - startTime,
    };
  }
}

// Send email notification
async function sendFailureNotification(
  supabase: any,
  panelName: string,
  panelUrl: string,
  errorMessage: string,
  notifyEmail: string,
  resendApiKey: string
) {
  if (!resendApiKey || !notifyEmail) {
    console.warn("无法发送通知邮件：缺少 API Key 或邮箱");
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "notification@resend.dev",
        to: notifyEmail,
        subject: `🚨 面板连接失败通知: ${panelName}`,
        html: `
          <h2>面板连接失败</h2>
          <p><strong>面板名称:</strong> ${panelName}</p>
          <p><strong>面板地址:</strong> ${panelUrl}</p>
          <p><strong>错误信息:</strong> ${errorMessage}</p>
          <p><strong>时间:</strong> ${new Date().toLocaleString("zh-CN")}</p>
          <p style="color: #666; margin-top: 20px;">请尽快检查服务器状态。</p>
        `,
      }),
    });

    if (!response.ok) {
      console.error("邮件发送失败:", await response.text());
    }
  } catch (err) {
    console.error("邮件发送异常:", String(err));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, token, panel_id, testTrigger = "manual" } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin auth check for manual tests
    if (action === "test-manual" || action === "test-cron") {
      let configId = null;
      if (action === "test-manual") {
        configId = verifyToken(token || "");
        if (!configId) {
          return new Response(JSON.stringify({ error: "未授权" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (!panel_id) {
        return new Response(JSON.stringify({ error: "缺少 panel_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get panel info
      const { data: panel, error: panelError } = await supabase
        .from("panels")
        .select("*")
        .eq("id", panel_id)
        .single();

      if (panelError || !panel) {
        return new Response(JSON.stringify({ error: "面板不存在" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Test connection
      const testResult = await testPanelConnection(
        panel.panel_url,
        panel.panel_user,
        panel.panel_pass
      );

      // Record test result
      const { error: recordError } = await supabase
        .from("panel_connection_tests")
        .insert({
          panel_id,
          success: testResult.success,
          response_time_ms: testResult.responseTime,
          error_message: testResult.error || null,
          test_trigger: action === "test-cron" ? "cron" : "manual",
          details: { panelName: panel.name },
        });

      if (recordError) {
        console.error("记录测试结果失败:", recordError);
      }

      // Get panel test config for notification settings
      const { data: config } = await supabase
        .from("panel_test_config")
        .select("*")
        .eq("panel_id", panel_id)
        .single();

      // Send notification on failure if configured
      if (!testResult.success && config?.notify_on_failure && config?.notify_email) {
        const { data: adminConfig } = await supabase
          .from("admin_config")
          .select("resend_api_key, notify_email")
          .limit(1)
          .single();

        await sendFailureNotification(
          supabase,
          panel.name,
          panel.panel_url,
          testResult.error || "连接失败",
          config.notify_email || adminConfig?.notify_email,
          adminConfig?.resend_api_key
        );

        // Update consecutive failures count
        if (config) {
          await supabase
            .from("panel_test_config")
            .update({
              consecutive_failures: (config.consecutive_failures || 0) + 1,
              last_test_time: new Date().toISOString(),
            })
            .eq("panel_id", panel_id);
        }
      } else if (testResult.success && config) {
        // Reset consecutive failures on success
        await supabase
          .from("panel_test_config")
          .update({
            consecutive_failures: 0,
            last_test_time: new Date().toISOString(),
          })
          .eq("panel_id", panel_id);
      }

      return new Response(JSON.stringify({
        success: true,
        test: testResult,
        recorded: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List test history
    if (action === "get-history") {
      if (!panel_id) {
        return new Response(JSON.stringify({ error: "缺少 panel_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: history, error: historyError } = await supabase
        .from("panel_connection_tests")
        .select("*")
        .eq("panel_id", panel_id)
        .order("test_time", { ascending: false })
        .limit(20);

      if (historyError) throw historyError;

      return new Response(JSON.stringify({
        success: true,
        history: history || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get or create test config
    if (action === "get-config") {
      const configId = verifyToken(token || "");
      if (!configId) {
        return new Response(JSON.stringify({ error: "未授权" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!panel_id) {
        return new Response(JSON.stringify({ error: "缺少 panel_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let { data: config, error: configError } = await supabase
        .from("panel_test_config")
        .select("*")
        .eq("panel_id", panel_id)
        .single();

      // Create default config if not exists
      if (configError && configError.code === "PGRST116") {
        const { data: adminConfig } = await supabase
          .from("admin_config")
          .select("notify_email")
          .limit(1)
          .single();

        const { data: newConfig, error: createError } = await supabase
          .from("panel_test_config")
          .insert({
            panel_id,
            enabled: false,
            test_interval_minutes: 30,
            notify_on_failure: true,
            notify_email: adminConfig?.notify_email,
          })
          .select()
          .single();

        if (createError) throw createError;
        config = newConfig;
      } else if (configError) {
        throw configError;
      }

      return new Response(JSON.stringify({
        success: true,
        config,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update test config
    if (action === "update-config") {
      const configId = verifyToken(token || "");
      if (!configId) {
        return new Response(JSON.stringify({ error: "未授权" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const {
        enabled,
        test_interval_minutes,
        notify_on_failure,
        notify_email,
      } = body;

      if (!panel_id) {
        return new Response(JSON.stringify({ error: "缺少 panel_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updateData: Record<string, unknown> = {};
      if (enabled !== undefined) updateData.enabled = enabled;
      if (test_interval_minutes !== undefined) updateData.test_interval_minutes = test_interval_minutes;
      if (notify_on_failure !== undefined) updateData.notify_on_failure = notify_on_failure;
      if (notify_email !== undefined) updateData.notify_email = notify_email;

      const { error: updateError } = await supabase
        .from("panel_test_config")
        .update(updateData)
        .eq("panel_id", panel_id);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "未知操作" }), {
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
