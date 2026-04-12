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
    const body = await req.json();
    const { action, token, plan, region } = body;

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

    // ====== PLANS ======
    if (action === "list") {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("sort_order", { ascending: true });

      const { data: planRegions } = await supabase
        .from("plan_regions")
        .select("*");

      if (error) throw error;
      return new Response(JSON.stringify({ plans: data, planRegions: planRegions || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const { data, error } = await supabase
        .from("plans")
        .insert({
          title: plan.title || "新套餐",
          category: plan.category || "exclusive",
          duration_months: plan.duration_months || 1,
          duration_days: plan.duration_days || 30,
          price: plan.price || 0,
          description: plan.description || "",
          sort_order: plan.sort_order || 99,
          featured: plan.featured || false,
          enabled: plan.enabled !== false,
          region_id: plan.region_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, plan: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const updateData: any = {
        title: plan.title,
        category: plan.category,
        duration_months: plan.duration_months,
        duration_days: plan.duration_days,
        price: plan.price,
        description: plan.description,
        sort_order: plan.sort_order,
        featured: plan.featured,
        enabled: plan.enabled,
      };
      if (plan.region_id !== undefined) {
        updateData.region_id = plan.region_id || null;
      }
      const { error } = await supabase
        .from("plans")
        .update(updateData)
        .eq("id", plan.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { error } = await supabase
        .from("plans")
        .delete()
        .eq("id", plan.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== REGIONS ======
    if (action === "list-regions") {
      const { data, error } = await supabase
        .from("regions")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ regions: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-region") {
      const { data, error } = await supabase
        .from("regions")
        .insert({
          name: region.name || "新地区",
          inbound_id: region.inbound_id ?? 1,
          protocol: region.protocol || "mixed",
          sort_order: region.sort_order ?? 0,
          enabled: region.enabled !== false,
          max_clients: region.max_clients ?? 0,
          current_clients: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, region: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-region") {
      const updateData: any = {
        name: region.name,
        inbound_id: region.inbound_id,
        protocol: region.protocol,
        sort_order: region.sort_order,
        enabled: region.enabled,
      };
      if (region.max_clients !== undefined) updateData.max_clients = region.max_clients;
      if (region.current_clients !== undefined) updateData.current_clients = region.current_clients;
      const { error } = await supabase
        .from("regions")
        .update(updateData)
        .eq("id", region.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-region") {
      const { error } = await supabase
        .from("regions")
        .delete()
        .eq("id", region.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== PLAN_REGIONS (junction) ======
    if (action === "assign-plan-region") {
      const { planId, regionId } = body;
      const { error } = await supabase
        .from("plan_regions")
        .upsert({ plan_id: planId, region_id: regionId }, { onConflict: "plan_id,region_id" });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unassign-plan-region") {
      const { planId, regionId } = body;
      const { error } = await supabase
        .from("plan_regions")
        .delete()
        .eq("plan_id", planId)
        .eq("region_id", regionId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== TUTORIALS ======
    if (action === "list-tutorials") {
      const { data, error } = await supabase
        .from("tutorials")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ tutorials: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-tutorial") {
      const { tutorial } = body;
      const { data, error } = await supabase
        .from("tutorials")
        .insert(tutorial)
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, tutorial: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-tutorial") {
      const { tutorial } = body;
      const { id, ...updates } = tutorial;
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase
        .from("tutorials")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-tutorial") {
      const { tutorial } = body;
      const { error } = await supabase
        .from("tutorials")
        .delete()
        .eq("id", tutorial.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== ARTICLES ======
    if (action === "list-articles") {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ articles: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-article") {
      const { article } = body;
      const { data, error } = await supabase
        .from("articles")
        .insert(article)
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, article: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-article") {
      const { article } = body;
      const { id, ...updates } = article;
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase
        .from("articles")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-article") {
      const { article } = body;
      const { error } = await supabase
        .from("articles")
        .delete()
        .eq("id", article.id);
      if (error) throw error;
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
