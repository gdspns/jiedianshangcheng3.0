import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function configuredImages(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {}
  return [raw];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const requested = new URL(req.url).searchParams.get("url") || "";
    let target: URL;
    try { target = new URL(requested); } catch { return new Response("Invalid image URL", { status: 400, headers: corsHeaders }); }
    if (target.protocol !== "https:" || target.username || target.password) {
      return new Response("Invalid image URL", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: config } = await supabase.from("admin_config").select("landing_image").limit(1).maybeSingle();
    if (!configuredImages(config?.landing_image).includes(target.href)) {
      return new Response("Image is not configured", { status: 403, headers: corsHeaders });
    }

    const upstream = await fetch(target.href, {
      headers: { "User-Agent": "ip520-image-proxy/1.0", Referer: "https://www.ip520.top/", Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" },
      redirect: "follow",
    });
    if (!upstream.ok) return new Response("Image upstream unavailable", { status: 502, headers: corsHeaders });
    const contentType = upstream.headers.get("content-type") || "";
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (!contentType.toLowerCase().startsWith("image/") || contentLength > 10 * 1024 * 1024) {
      return new Response("Invalid image response", { status: 502, headers: corsHeaders });
    }

    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Public image proxy error:", error);
    return new Response("Image proxy error", { status: 500, headers: corsHeaders });
  }
});
