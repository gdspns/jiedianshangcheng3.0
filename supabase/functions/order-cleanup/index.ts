import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find pending orders older than 20 minutes
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const { data: expiredOrders, error: selectError } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "pending")
      .lt("created_at", twentyMinutesAgo);

    if (selectError) throw selectError;

    if (!expiredOrders || expiredOrders.length === 0) {
      return new Response(JSON.stringify({ cancelled: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = expiredOrders.map((o) => o.id);

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: "expired" })
      .in("id", ids);

    if (updateError) throw updateError;

    console.log(`Auto-cancelled ${ids.length} expired orders`);

    return new Response(JSON.stringify({ cancelled: ids.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Order cleanup error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
