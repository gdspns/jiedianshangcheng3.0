const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache rates for 10 minutes
let cachedRates: { usdtCny: number; trxCny: number; updatedAt: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

async function fetchBinanceRates(): Promise<{ usdtCny: number; trxCny: number }> {
  // 1. Get USDT/CNY from Binance P2P median price
  let usdtCny = 7.2; // fallback default
  try {
    const p2pRes = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fiat: "CNY",
        page: 1,
        rows: 10,
        tradeType: "BUY",
        asset: "USDT",
        payTypes: [],
      }),
    });
    const p2pData = await p2pRes.json();
    if (p2pData?.data?.length > 0) {
      const prices = p2pData.data.map((ad: any) => parseFloat(ad.adv?.price || "0")).filter((p: number) => p > 0);
      if (prices.length > 0) {
        // Use median price
        prices.sort((a: number, b: number) => a - b);
        usdtCny = prices[Math.floor(prices.length / 2)];
      }
    }
  } catch (e) {
    console.error("P2P fetch failed, trying fallback:", e);
    // Fallback: try Binance convert endpoint
    try {
      const convertRes = await fetch("https://www.binance.com/bapi/asset/v1/public/asset-service/product/currency");
      const convertData = await convertRes.json();
      if (convertData?.data) {
        for (const item of convertData.data) {
          if (item.pair === "USDT_CNY" || item.pair === "USD_CNY") {
            usdtCny = parseFloat(item.rate);
            break;
          }
        }
      }
    } catch {}
  }

  // 2. Get TRX/USDT from Binance spot (try multiple endpoints)
  let trxUsdt = 0;
  try {
    const spotRes = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=TRXUSDT");
    const spotData = await spotRes.json();
    trxUsdt = parseFloat(spotData.price || "0");
  } catch (e) {
    console.error("Binance spot fetch failed:", e);
  }
  // Fallback: try CoinGecko if Binance fails
  if (trxUsdt <= 0) {
    try {
      const cgRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd");
      const cgData = await cgRes.json();
      if (cgData?.tron?.usd) {
        trxUsdt = cgData.tron.usd;
      }
    } catch (e2) {
      console.error("CoinGecko fallback also failed:", e2);
    }
  }
  // Last resort fallback
  if (trxUsdt <= 0) {
    trxUsdt = 0.25; // reasonable fallback ~$0.25
  }

  // TRX/CNY = TRX/USDT * USDT/CNY
  const trxCny = trxUsdt > 0 ? trxUsdt * usdtCny : 0;

  return { usdtCny, trxCny };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = Date.now();
    if (cachedRates && (now - cachedRates.updatedAt) < CACHE_TTL) {
      return new Response(JSON.stringify({
        usdtCny: cachedRates.usdtCny,
        trxCny: cachedRates.trxCny,
        cached: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rates = await fetchBinanceRates();
    cachedRates = { ...rates, updatedAt: now };

    return new Response(JSON.stringify({
      usdtCny: rates.usdtCny,
      trxCny: rates.trxCny,
      cached: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Exchange rate error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
