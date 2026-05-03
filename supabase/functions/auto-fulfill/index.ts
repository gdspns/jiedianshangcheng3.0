// Auto-fulfill: scans pending crypto orders & paid buy_new orders, completes them.
// Triggered by pg_cron every minute so users don't need to stay on the payment page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };

  const result = { verified: 0, fulfilled: 0, errors: [] as string[] };

  try {
    // 1) Verify pending crypto orders created within the last 30 minutes
    const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: pendingCrypto } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "pending")
      .eq("payment_method", "crypto")
      .gte("created_at", sinceIso)
      .limit(50);

    for (const o of pendingCrypto || []) {
      try {
        const r = await fetch(`${baseUrl}/functions/v1/crypto-verify`, {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "verify", orderId: o.id }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.success) result.verified++;
      } catch (e) {
        result.errors.push(`verify ${o.id}: ${String(e)}`);
      }
    }

    // 2) Auto-create clients for paid buy_new orders missing uuid
    const { data: paidBuyNew } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "paid")
      .eq("order_type", "buy_new")
      .or("uuid.is.null,uuid.eq.")
      .limit(50);

    for (const o of paidBuyNew || []) {
      try {
        const r = await fetch(`${baseUrl}/functions/v1/create-client`, {
          method: "POST",
          headers,
          body: JSON.stringify({ orderId: o.id }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.success) result.fulfilled++;
      } catch (e) {
        result.errors.push(`create ${o.id}: ${String(e)}`);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), ...result }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
