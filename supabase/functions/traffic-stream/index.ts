// SSE edge function: streams real-time used-traffic updates for a client UUID.
// The server polls the 3x-ui panel and pushes an event whenever the value changes
// (and a heartbeat every 20s), so the browser receives near real-time updates
// without doing its own polling.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GB = 1073741824;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function fetchUnsafe(url: string, init?: RequestInit): Promise<Response> {
  const attempts: string[] = url.startsWith("https://")
    ? [url, url.replace(/^https:\/\//, "http://")]
    : [url];
  let lastErr: unknown;
  for (const u of attempts) {
    try {
      return await fetch(u, init);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function login3xui(panelUrl: string, username: string, password: string): Promise<string | null> {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  try {
    const res = await fetchUnsafe(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) return null;
    const m = setCookie.match(/([^=]+=[^;]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function getInbounds(panelUrl: string, cookie: string) {
  const baseUrl = panelUrl.replace(/\/+$/, "");
  const res = await fetchUnsafe(`${baseUrl}/panel/api/inbounds/list`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  return await res.json();
}

function findClient(inboundsData: any, identifier: string) {
  if (!inboundsData?.success || !inboundsData?.obj) return null;
  for (const inbound of inboundsData.obj) {
    try {
      const settings = JSON.parse(inbound.settings || "{}");
      const entries = [
        ...(Array.isArray(settings.clients) ? settings.clients : []),
        ...(Array.isArray(settings.accounts) ? settings.accounts : []),
      ];
      for (const entry of entries) {
        const keys = [entry?.id, entry?.email, entry?.user, entry?.username, entry?.pass, entry?.password]
          .filter((v): v is string => typeof v === "string" && v.length > 0);
        if (!keys.includes(identifier)) continue;
        const stats = inbound.clientStats?.find((s: any) =>
          typeof s?.email === "string" && keys.includes(s.email)
        );
        return {
          up: stats?.up || 0,
          down: stats?.down || 0,
          total: entry.totalGB || stats?.total || 0,
          enable: stats?.enable ?? entry.enable ?? true,
        };
      }
    } catch {}
  }
  return null;
}

async function snapshot(supabase: any, uuid: string) {
  const { data: panels } = await supabase
    .from("panels")
    .select("*")
    .eq("enabled", true)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  if (!panels?.length) return null;
  for (const p of panels) {
    const cookie = await login3xui(p.panel_url, p.panel_user, p.panel_pass);
    if (!cookie) continue;
    const inbounds = await getInbounds(p.panel_url, cookie);
    const found = findClient(inbounds, uuid);
    if (found) {
      const trafficUsed = Math.round(((found.up + found.down) / GB) * 100) / 100;
      const trafficTotal = found.total > 0 ? Math.round((found.total / GB) * 100) / 100 : 999;
      return { trafficUsed, trafficTotal, enable: found.enable };
    }
  }
  return null;
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const url = new URL(req.url);
  const uuid = url.searchParams.get("uuid") || "";
  const intervalMs = Math.max(2000, Math.min(15000, Number(url.searchParams.get("interval") || 3000)));

  if (!uuid) {
    return new Response(JSON.stringify({ error: "missing uuid" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const encoder = new TextEncoder();
  let cancelled = false;
  let timer: number | undefined;
  let heartbeat: number | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // Initial hello
      send("hello", { ok: true, intervalMs });

      let last = "";
      const tick = async () => {
        if (cancelled) return;
        try {
          const snap = await snapshot(supabase, uuid);
          if (cancelled) return;
          if (snap) {
            const key = `${snap.trafficUsed}|${snap.trafficTotal}|${snap.enable}`;
            if (key !== last) {
              last = key;
              send("traffic", snap);
            }
          }
        } catch (err) {
          send("error", { message: String(err).slice(0, 200) });
        }
      };

      await tick();
      timer = setInterval(tick, intervalMs) as unknown as number;
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {}
      }, 20000) as unknown as number;
    },
    cancel() {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
