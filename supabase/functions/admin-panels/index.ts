import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdminToken } from "../_shared/admin-security.ts";
import { applyPanelMirror, previewPanelMirror, syncPanelClients } from "./sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, token, panel } = body;

    const isCron = action === "mirror-cron" && req.headers.get("x-cron-secret") === Deno.env.get("PANEL_SYNC_CRON_SECRET");

    const configId = isCron ? "cron" : await verifyAdminToken(token);
    if (!configId || (action === "mirror-cron" && !isCron)) {
      return new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "mirror-schedule-get") {
      const { data, error } = await supabase.from("panel_mirror_settings").select("*").eq("id", true).single();
      if (error) throw error;
      return new Response(JSON.stringify({ settings: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "mirror-schedule-save") {
      const { source, target, enabled, allowDelete } = body;
      if (typeof source !== "string" || typeof target !== "string" || source === target || typeof enabled !== "boolean") {
        return new Response(JSON.stringify({ error: "自动同步设置无效" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { count } = await supabase.from("panels").select("id", { count: "exact", head: true }).eq("enabled", true).in("id", [source, target]);
      if (count !== 2) return new Response(JSON.stringify({ error: "请选择两个已启用的不同面板" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabase.from("panel_mirror_settings").upsert({
        id: true, enabled, source_panel_id: source, target_panel_id: target, allow_delete: allowDelete === true,
        updated_at: new Date().toISOString(), last_status: enabled ? "等待定时同步" : "自动同步已关闭",
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "mirror-cron") {
      const { data: settings } = await supabase.from("panel_mirror_settings").select("*").eq("id", true).eq("enabled", true).maybeSingle();
      if (!settings?.source_panel_id || !settings?.target_panel_id) return new Response(JSON.stringify({ skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: rows } = await supabase.from("panels").select("id,panel_url,panel_user,panel_pass").eq("enabled", true).in("id", [settings.source_panel_id, settings.target_panel_id]);
      const main = rows?.find(p => p.id === settings.source_panel_id), replica = rows?.find(p => p.id === settings.target_panel_id);
      let result: Record<string, unknown>;
      try {
        if (!main || !replica) throw new Error("自动同步面板已停用或不存在");
        const preview = await previewPanelMirror(main, replica);
        result = await applyPanelMirror(main, replica, preview.revision, settings.allow_delete === true);
        await supabase.from("panel_mirror_settings").update({ last_run_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_status: "自动同步成功", last_result: result }).eq("id", true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "自动同步失败";
        result = { error: message };
        await supabase.from("panel_mirror_settings").update({ last_run_at: new Date().toISOString(), last_status: message, last_result: result }).eq("id", true);
      }
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (["sync-preview", "sync-apply", "mirror-preview", "mirror-apply"].includes(action)) {
      const { source, target, sourceInbound, targetInbound } = body;
      const headers = { ...corsHeaders, "Content-Type": "application/json" };
      if (typeof source !== "string" || typeof target !== "string" || source === target ||
          (!action.startsWith("mirror-") && ![sourceInbound, targetInbound].every(id => Number.isSafeInteger(id) && id > 0))) {
        return new Response(JSON.stringify({ error: "请选择不同面板并填写有效入站 ID" }), { status: 400, headers });
      }
      const { data, error } = await supabase.from("panels")
        .select("id,panel_url,panel_user,panel_pass").eq("enabled", true).in("id", [source, target]);
      const main = data?.find(p => p.id === source);
      const replica = data?.find(p => p.id === target);
      if (error || !main || !replica) {
        return new Response(JSON.stringify({ error: "无法读取所选的已启用面板" }), { status: 400, headers });
      }
      try {
        const result = action === "mirror-preview" ? await previewPanelMirror(main, replica)
          : action === "mirror-apply" ? await applyPanelMirror(main, replica, body.revision, body.allowDelete === true)
          : await syncPanelClients(main, replica, sourceInbound, targetInbound, action === "sync-preview", body.revision, body.addMissing === true);
        return new Response(JSON.stringify(result), { headers });
      } catch (error) {
        const message = error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
          ? error.message : "面板连接或响应异常，请检查连接后重试";
        return new Response(JSON.stringify({ error: message }), { status: 502, headers });
      }
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("panels")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ panels: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const insertData = {
        name: panel?.name || "新面板",
        panel_url: panel?.panel_url || "",
        panel_user: panel?.panel_user || "admin",
        panel_pass: panel?.panel_pass || "",
        is_primary: false,
        enabled: panel?.enabled ?? true,
        sort_order: panel?.sort_order ?? 0,
      };
      // Ensure first panel auto-becomes primary
      const { count } = await supabase.from("panels").select("id", { count: "exact", head: true });
      if (!count || count === 0) insertData.is_primary = true;

      const { data, error } = await supabase.from("panels").insert(insertData).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ panel: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      if (!panel?.id) {
        return new Response(JSON.stringify({ error: "缺少 id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const updateData: Record<string, unknown> = {};
      if (panel.name !== undefined) updateData.name = panel.name;
      if (panel.panel_url !== undefined) updateData.panel_url = panel.panel_url;
      if (panel.panel_user !== undefined) updateData.panel_user = panel.panel_user;
      if (panel.panel_pass !== undefined) updateData.panel_pass = panel.panel_pass;
      if (panel.enabled !== undefined) updateData.enabled = panel.enabled;
      if (panel.sort_order !== undefined) updateData.sort_order = panel.sort_order;

      const { error } = await supabase.from("panels").update(updateData).eq("id", panel.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set-primary") {
      if (!panel?.id) {
        return new Response(JSON.stringify({ error: "缺少 id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Clear current primary first to satisfy unique partial index
      await supabase.from("panels").update({ is_primary: false }).eq("is_primary", true);
      const { error } = await supabase.from("panels").update({ is_primary: true, enabled: true }).eq("id", panel.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      if (!panel?.id) {
        return new Response(JSON.stringify({ error: "缺少 id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Refuse to delete the only primary panel if it's the only enabled one
      const { data: target } = await supabase.from("panels").select("is_primary").eq("id", panel.id).single();
      const { error } = await supabase.from("panels").delete().eq("id", panel.id);
      if (error) throw error;
      // If we deleted the primary, promote any remaining panel
      if (target?.is_primary) {
        const { data: next } = await supabase
          .from("panels")
          .select("id")
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (next?.id) {
          await supabase.from("panels").update({ is_primary: true }).eq("id", next.id);
        }
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
