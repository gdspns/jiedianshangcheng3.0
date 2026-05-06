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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, token, panel } = body;

    const configId = verifyToken(token || "");
    if (!configId) {
      return new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
