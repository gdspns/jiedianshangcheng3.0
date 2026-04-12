import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import ThemeToggle from "@/components/ThemeToggle";
import { BookOpen } from "lucide-react";
import {
  User,
  CreditCard,
  Activity,
  Clock,
  LogOut,
  ShieldCheck,
  ChevronRight,
  CheckCircle2,
  Smartphone,
  Bitcoin,
  QrCode,
  Upload,
  ShoppingCart,
  Copy,
  Search,
} from "lucide-react";
import {
  getPublicConfig,
  lookupClient,
  createOrder,
  checkOrderStatus,
  verifyCryptoPayment,
  getPlans,
  getOrders,
  getExchangeRates,
  createClientOnPanel,
  getRegions,
  lookupOrdersByEmail,
  getPlanRegions,
  getTutorials,
} from "@/lib/api";

interface PublicConfig {
  price_month: number;
  price_quarter: number;
  price_year: number;
  price_exclusive_month: number;
  price_exclusive_quarter: number;
  price_exclusive_year: number;
  price_shared_month: number;
  price_shared_quarter: number;
  price_shared_year: number;
  hupi_wechat: boolean;
  hupi_alipay: boolean;
  crypto_usdt: boolean;
  crypto_trx: boolean;
  crypto_address: string | null;
}

interface ClientData {
  expiryDate: number;
  trafficUsed: number;
  trafficTotal: number;
  email?: string;
}

interface PlanItem {
  id: string;
  title: string;
  category: string;
  duration_months: number;
  duration_days: number;
  price: number;
  description: string;
  sort_order: number;
  featured: boolean;
  enabled: boolean;
  region_id?: string | null;
}

interface RegionItem {
  id: string;
  name: string;
  inbound_id: number;
  protocol: string;
  sort_order: number;
  enabled: boolean;
  max_clients: number;
  current_clients: number;
}

function wrapResponsiveIframe(iframeHtml: string): string {
  return `<div style="position:relative;width:100%;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;">${iframeHtml.replace(/style="[^"]*"/, 'style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"')}</div>`;
}

function parseVideoEmbed(raw: string): string {
  if (!raw || !raw.trim()) return "";
  const s = raw.trim();
  const iframeAllow = 'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"';
  // Already an iframe
  if (s.startsWith("<iframe")) {
    let html = s;
    if (!html.includes(' allow="')) {
      html = html.replace("<iframe", `<iframe ${iframeAllow}`);
    }
    return wrapResponsiveIframe(html);
  }
  // YouTube
  const ytMatch = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch)
    return wrapResponsiveIframe(`<iframe src="https://www.youtube.com/embed/${ytMatch[1]}?playsinline=1" frameborder="0" ${iframeAllow} allowfullscreen style="border:0;"></iframe>`);
  // Bilibili
  const biliMatch = s.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
  if (biliMatch)
    return wrapResponsiveIframe(`<iframe src="//player.bilibili.com/player.html?bvid=${biliMatch[1]}&high_quality=1&danmaku=0" frameborder="0" ${iframeAllow} allowfullscreen sandbox="allow-top-navigation allow-same-origin allow-forms allow-scripts allow-popups" scrolling="no" style="border:0;"></iframe>`);
  // Direct video link
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(s))
    return `<video src="${s}" controls playsinline webkit-playsinline preload="metadata" style="width:100%;border-radius:12px;"></video>`;
  // Fallback: treat as iframe src
  if (s.startsWith("http"))
    return wrapResponsiveIframe(`<iframe src="${s}" frameborder="0" ${iframeAllow} allowfullscreen style="border:0;"></iframe>`);
  return "";
}

function fixMobileVideo(html: string): string {
  if (!html) return "";
  const iframeAllow = 'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"';

  let result = html
    // Add allow attribute to iframes missing it
    .replace(/<iframe(?=[^>]*>)((?:(?!allow=")[^>])*)>/gi, (match) => {
      if (/\ballow="/.test(match)) return match;
      return match.replace("<iframe", `<iframe ${iframeAllow}`);
    })
    // Add playsinline to video elements
    .replace(/<video(?![^>]*playsinline)/g, '<video playsinline webkit-playsinline')
    .replace(/<video(?![^>]*preload)/g, '<video preload="metadata"');

  // Wrap ALL iframes in responsive containers for mobile compatibility
  // Detect aspect ratio from width/height attributes or aspect-ratio style
  result = result.replace(/<iframe([^>]*)><\/iframe>/gi, (match, attrs) => {
    // Already wrapped in a responsive container? Skip
    // Check if parent is already a responsive wrapper (we can't check parent here, but avoid double-wrap by checking if style already has position:absolute)
    if (/position:\s*absolute/.test(attrs)) return match;

    // Try to detect aspect ratio from width/height attributes
    const widthMatch = attrs.match(/width=["']?(\d+)/);
    const heightMatch = attrs.match(/height=["']?(\d+)/);
    // Try aspect-ratio style
    const arMatch = attrs.match(/aspect-ratio:\s*([\d.]+)\s*\/\s*([\d.]+)/);

    let paddingBottom = "56.25%"; // default 16:9
    if (widthMatch && heightMatch) {
      const w = parseInt(widthMatch[1]);
      const h = parseInt(heightMatch[1]);
      if (w > 0 && h > 0) {
        paddingBottom = ((h / w) * 100).toFixed(2) + "%";
      }
    } else if (arMatch) {
      const w = parseFloat(arMatch[1]);
      const h = parseFloat(arMatch[2]);
      if (w > 0 && h > 0) {
        paddingBottom = ((h / w) * 100).toFixed(2) + "%";
      }
    }

    // Cap padding-bottom for very tall videos (portrait) to avoid excessive height
    const pb = parseFloat(paddingBottom);
    const maxPb = 200; // max 1:2 ratio
    if (pb > maxPb) paddingBottom = maxPb + "%";

    // Clean iframe: remove width/height attributes and old style, set absolute positioning
    let cleanAttrs = attrs
      .replace(/width=["']?\d+["']?/gi, '')
      .replace(/height=["']?\d+["']?/gi, '')
      .replace(/style="[^"]*"/gi, '');

    return `<div style="position:relative;width:100%;padding-bottom:${paddingBottom};height:0;overflow:hidden;border-radius:8px;margin:8px 0;"><iframe${cleanAttrs} style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe></div>`;
  });

  return result;
}

export default function ClientPortal() {
  const [logged, setLogged] = useState(false);
  const [uuid, setUuid] = useState("");
  const [loginInput, setLoginInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [payStatus, setPayStatus] = useState<string | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [clientData, setClientData] = useState<ClientData>({
    expiryDate: Date.now() + 5 * 86400000,
    trafficUsed: 0,
    trafficTotal: 100,
  });
  const [dynamicPlans, setDynamicPlans] = useState<PlanItem[]>([]);
  const [dynamicRegions, setDynamicRegions] = useState<RegionItem[]>([]);
  const [selectedBuyRegion, setSelectedBuyRegion] = useState<string | null>(null);
  const [dynamicPlanRegions, setDynamicPlanRegions] = useState<{ plan_id: string; region_id: string }[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [checkoutData, setCheckoutData] = useState<{ months: number; durationDays: number; price: number; planName: string; type: string; regionId?: string | null } | null>(null);
  const [newClientCredentials, setNewClientCredentials] = useState<Record<string, string> | null>(null);
  const [newClientConnectionInfo, setNewClientConnectionInfo] = useState<Record<string, any> | null>(null);
  const [newClientRemark, setNewClientRemark] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [cryptoPrice, setCryptoPrice] = useState(0);
  const [exchangeRates, setExchangeRates] = useState<{ usdtCny: number; trxCny: number } | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [qrStatus, setQrStatus] = useState("");
  const [orderId, setOrderId] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [payUrl, setPayUrl] = useState("");
  const [orderCreating, setOrderCreating] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [videoEmbed, setVideoEmbed] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupOrders, setLookupOrders] = useState<any[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [autoCheckCount, setAutoCheckCount] = useState(0);
  const [tutorials, setTutorials] = useState<{ id: string; title: string; content: string; sort_order: number }[]>([]);
  const [expandedTutorialId, setExpandedTutorialId] = useState<string | null>(null);

  const copyWithFeedback = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };
  const [lookupError, setLookupError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPublicConfig()
      .then(setConfig)
      .catch(() => {});
    getPlans()
      .then(setDynamicPlans)
      .catch(() => {});
    getRegions()
      .then(setDynamicRegions)
      .catch(() => {});
    getPlanRegions()
      .then(setDynamicPlanRegions)
      .catch(() => {});
    getTutorials()
      .then(setTutorials)
      .catch(() => {});
    // Fetch video embed
    import("@/integrations/supabase/client").then(({ supabase }) => {
      (supabase as any)
        .from("admin_config")
        .select("video_embed")
        .limit(1)
        .single()
        .then(({ data }: any) => {
          if (data?.video_embed) setVideoEmbed(data.video_embed);
        });
    });
    // Load jsQR
    if (!(window as any).jsQR) {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, []);

  const extractIdentifier = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    // Try each line (user may paste multi-line content)
    const lines = trimmed
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (uuidRegex.test(line)) return line;
      try {
        if (line.startsWith("vless://") || line.startsWith("trojan://")) {
          const extracted = line.split("://")[1].split("@")[0];
          if (uuidRegex.test(extracted)) return extracted;
        } else if (line.startsWith("vmess://")) {
          const decoded = atob(line.substring(8));
          const json = JSON.parse(decoded);
          if (json?.id && uuidRegex.test(json.id)) return json.id;
        }
      } catch {}
    }
    // For SOCKS5: use the first non-empty line as identifier
    const firstLine = lines[0];
    if (firstLine && firstLine.length <= 256) return firstLine;
    return null;
  };

  const processImageFile = (file: File) => {
    setQrStatus("正在解析中...");
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const jsQR = (window as any).jsQR;
        if (jsQR) {
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            setLoginInput(code.data);
            setQrStatus("✅ 解析成功");
          } else {
            setQrStatus("❌ 未识别到二维码");
          }
        } else {
          setQrStatus("⏳ 识别组件加载中，请重试");
        }
        setTimeout(() => setQrStatus(""), 2500);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) processImageFile(file);
        break;
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const extracted = extractIdentifier(loginInput);
    if (!extracted) {
      setError("请输入 UUID、链接或 SOCKS5 用户名/密码。");
      return;
    }
    setUuid(extracted);
    setLoading(true);
    setError("");
    try {
      const res = await lookupClient(extracted);
      if (res?.success) {
        setClientData({
          expiryDate: res.expiryDate ?? 0,
          trafficUsed: res.trafficUsed ?? 0,
          trafficTotal: res.trafficTotal ?? 100,
          email: res.email || "",
        });
        setLogged(true);
      } else {
        setError(res?.error || "未找到该 UUID 对应的ID");
      }
    } catch {
      setError("查询失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const getDaysLeft = () => {
    if (clientData.expiryDate === 0) return -1; // unlimited
    return Math.max(0, Math.ceil((clientData.expiryDate - Date.now()) / 86400000));
  };

  const cleanupPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  useEffect(() => () => cleanupPolling(), []);

  const initiateCheckout = (months: number, price: number, planName: string, type = "renew", regionId?: string | null, durationDays?: number) => {
    cleanupPolling();
    setCheckoutData({ months, durationDays: durationDays || months * 30, price, planName, type, regionId });
    setSelectedMethod("");
    setPayStatus(null);
    setOrderId("");
    setQrCodeUrl("");
    setPayUrl("");
    setCountdown(0);
    setAutoCheckCount(0);
    setNewClientCredentials(null);
    setNewClientConnectionInfo(null);
    setTab("checkout");
  };

  const handleSelectCrypto = async (method: string) => {
    setSelectedMethod(method);
    if (!checkoutData) return;
    if (checkoutData.type === "buy_new" && !checkoutEmail.trim()) {
      alert("购买开通必须填写邮箱/手机号，方便后续查单找回");
      return;
    }

    // Compute crypto price
    let computedPrice = 0;
    let rates = exchangeRates;
    if (!rates) {
      setRatesLoading(true);
      try {
        const fetched = await getExchangeRates();
        if (fetched?.usdtCny > 0 && fetched?.trxCny > 0) {
          rates = { usdtCny: fetched.usdtCny, trxCny: fetched.trxCny };
          setExchangeRates(rates);
        }
      } catch {}
      setRatesLoading(false);
    }

    const rate = rates ? (method === "usdt" ? rates.usdtCny : rates.trxCny) : 0;
    const rand = (Math.floor(Math.random() * 10) + 10) / 10000;
    if (rate > 0) {
      computedPrice = Number((checkoutData.price / rate + rand).toFixed(4));
    } else {
      computedPrice = Number((checkoutData.price + rand).toFixed(4));
    }
    setCryptoPrice(computedPrice);

    // Auto-create order immediately
    setOrderCreating(true);
    setPayStatus("creating");
    try {
      const res = await createOrder({
        uuid,
        planName: checkoutData.planName,
        months: checkoutData.months,
        durationDays: checkoutData.durationDays,
        amount: checkoutData.price,
        paymentMethod: method,
        cryptoAmount: computedPrice,
        cryptoCurrency: method.toUpperCase(),
        ...(checkoutEmail.trim() ? { email: checkoutEmail.trim() } : {}),
      });
      if (res?.orderId) {
        setOrderId(res.orderId);
        setPayStatus("waiting");
        startPolling(res.orderId, true);
      } else {
        setPayStatus("error");
        setError(res?.error || "创建订单失败");
      }
    } catch (err: any) {
      setPayStatus("error");
      setError(err?.message || "创建订单失败");
    } finally {
      setOrderCreating(false);
    }
  };

  const startPolling = (oid: string, isCrypto: boolean) => {
    setCountdown(1200); // 20 minutes
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          cleanupPolling();
          setPayStatus(null);
          setCheckoutData(null);
          setOrderId("");
          setSelectedMethod("");
          setCryptoPrice(0);
          setQrCodeUrl("");
          setPayUrl("");
          setAutoCheckCount(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    pollRef.current = setInterval(async () => {
      setAutoCheckCount((prev) => prev + 1);
      try {
        const handlePaymentSuccess = async (oid: string) => {
          cleanupPolling();
          // If this is a "buy_new" order, auto-create client on panel
          if (checkoutData?.type === "buy_new") {
            setPayStatus("creating_client");
            try {
              const createRes = await createClientOnPanel(oid, checkoutData?.regionId);
              if (createRes?.success) {
                setNewClientCredentials(createRes.credentials || null);
                setNewClientConnectionInfo(createRes.connectionInfo || null);
                setNewClientRemark(createRes.remark || "");
                setPayStatus("buy_success");
                setTab("buy_new");
              } else {
                setPayStatus("buy_success");
                setTab("buy_new");
              }
            } catch {
              setPayStatus("buy_success");
              setTab("buy_new");
            }
          } else {
            setPayStatus("success");
            if (checkoutData) {
              const baseExpiry = clientData.expiryDate === 0 ? Date.now() : clientData.expiryDate;
              const newExpiry = new Date(baseExpiry);
              newExpiry.setDate(newExpiry.getDate() + checkoutData.durationDays);
              setClientData({ ...clientData, trafficUsed: 0, expiryDate: newExpiry.getTime() });
            }
          }
        };

        if (isCrypto) {
          const res = await verifyCryptoPayment(oid);
          if (res?.success && (res.status === "fulfilled" || res.status === "paid_unfulfilled" || res.status === "paid")) {
            await handlePaymentSuccess(oid);
          }
        } else {
          const res = await checkOrderStatus(oid);
          if (res?.status === "fulfilled") {
            await handlePaymentSuccess(oid);
          } else if (res?.status === "paid" && checkoutData?.type === "buy_new") {
            // For buy_new orders, "paid" means payment confirmed, trigger client creation
            await handlePaymentSuccess(oid);
          } else if (res?.status === "paid_unfulfilled") {
            cleanupPolling();
            setPayStatus("paid_unfulfilled");
          }
        }
      } catch {}
    }, 5000);
  };

  const confirmPayment = async () => {
    if (!checkoutData || !selectedMethod) return;
    if (checkoutData.type === "buy_new" && !checkoutEmail.trim()) {
      alert("购买开通必须填写邮箱/手机号，方便后续查单找回");
      return;
    }
    setOrderCreating(true);
    setPayStatus("creating");
    try {
      const isCrypto = ["usdt", "trx"].includes(selectedMethod);
      const res = await createOrder({
        uuid,
        planName: checkoutData.planName,
        months: checkoutData.months,
        durationDays: checkoutData.durationDays,
        amount: checkoutData.price,
        paymentMethod: selectedMethod,
        orderType: checkoutData.type === "buy_new" ? "buy_new" : "renew",
        ...(isCrypto ? { cryptoAmount: cryptoPrice, cryptoCurrency: selectedMethod.toUpperCase() } : {}),
        ...(checkoutEmail.trim() ? { email: checkoutEmail.trim() } : {}),
      });

      if (res?.orderId) {
        setOrderId(res.orderId);
        if (!isCrypto && res.qrCode) {
          setQrCodeUrl(res.qrCode);
        }
        if (!isCrypto && res.payUrl) {
          setPayUrl(res.payUrl);
        }
        setPayStatus("waiting");
        startPolling(res.orderId, isCrypto);
      } else {
        setPayStatus("error");
        setError(res?.error || "创建订单失败");
      }
    } catch (err: any) {
      setPayStatus("error");
      setError(err?.message || "创建订单失败");
    } finally {
      setOrderCreating(false);
    }
  };

  const handleCryptoVerify = async () => {
    if (!orderId) return;
    setPayStatus("verifying");
    try {
      const res = await verifyCryptoPayment(orderId);
      if (res?.success && (res.status === "fulfilled" || res.status === "paid_unfulfilled")) {
        cleanupPolling();
        setPayStatus("success");
        if (checkoutData) {
          const baseExpiry = clientData.expiryDate === 0 ? Date.now() : clientData.expiryDate;
          const newExpiry = new Date(baseExpiry);
          newExpiry.setDate(newExpiry.getDate() + checkoutData.durationDays);
          setClientData({ ...clientData, trafficUsed: 0, expiryDate: newExpiry.getTime() });
        }
      } else {
        setPayStatus("waiting");
        setError(res?.message || "暂未检测到转账，请稍后再试");
        setTimeout(() => setError(""), 3000);
      }
    } catch {
      setPayStatus("waiting");
      setError("验证失败，请稍后重试");
      setTimeout(() => setError(""), 3000);
    }
  };

  const handleLookupOrders = async () => {
    if (!lookupEmail.trim()) return;
    setLookupLoading(true);
    setLookupError("");
    setLookupOrders([]);
    try {
      const results = await lookupOrdersByEmail(lookupEmail.trim());
      if (results && results.length > 0) {
        setLookupOrders(results);
      } else {
        setLookupError("未找到相关订单，请确认输入是否正确");
      }
    } catch {
      setLookupError("查询失败，请稍后重试");
    } finally {
      setLookupLoading(false);
    }
  };

  const formatCountdown = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // Login screen
  const videoHtml = useMemo(() => parseVideoEmbed(videoEmbed), [videoEmbed]);

  if (!logged) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted p-4 relative">
        <Link
          to="/"
          className="absolute top-4 left-4 text-2xl font-extrabold text-foreground hover:text-client-primary transition-colors"
        >
          首页
        </Link>
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div
          className={`flex items-stretch gap-6 w-full ${videoHtml ? "max-w-4xl flex-col md:flex-row" : "max-w-md flex-col"}`}
        >
          {/* Login card */}
          <div className={`bg-card rounded-2xl shadow-xl overflow-hidden ${videoHtml ? "md:w-1/2 w-full" : "w-full"}`}>
            <div className="bg-client-primary p-8 text-center">
              <User className="w-16 h-16 text-client-primary-foreground mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-client-primary-foreground mb-2">充值续费自助服务中心</h1>
              <p className="text-client-primary-foreground/80 text-sm">支持直接粘贴链接 或 扫码识别</p>
            </div>
            <div className="p-8">
              <form onSubmit={handleLogin}>
                <div className="relative mb-6">
                  <textarea
                    value={loginInput}
                    onChange={(e) => setLoginInput(e.target.value)}
                    onPaste={handlePaste}
                    placeholder={
                      "例如: 550e8400-e29b-41d4...\n或者粘贴完整的 vmess:// / vless:// 链接\n支持 SOCKS5 用户名或密码\n🌟 支持直接在此处 Ctrl+V 粘贴二维码截图"
                    }
                    className="w-full px-4 py-3 rounded-lg border border-input focus:ring-2 focus:ring-client-primary focus:border-transparent outline-none min-h-[120px] resize-none pb-12 bg-background text-foreground"
                    required
                  />
                  <div className="absolute bottom-3 right-3 flex items-center space-x-3">
                    {qrStatus && (
                      <span className="text-xs font-bold text-client-primary animate-pulse">{qrStatus}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-secondary text-secondary-foreground px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center shadow-sm border border-border hover:opacity-90"
                    >
                      <Upload className="w-4 h-4 mr-1.5" />
                      扫码/传图
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) processImageFile(f);
                        e.target.value = "";
                      }}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                </div>
                {error && <p className="text-destructive text-sm mb-4">{error}</p>}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-client-primary hover:opacity-90 text-client-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg"
                  >
                    {loading ? "智能解析并登录..." : "解析登录"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLogged(true);
                      setTab("buy_new");
                      setUuid("游客_未登录");
                    }}
                    className="flex-1 bg-accent text-accent-foreground hover:opacity-90 font-bold py-3 rounded-lg transition-colors shadow-lg flex justify-center items-center gap-2"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    购买开通
                  </button>
                </div>
              </form>
            </div>
          </div>
          {/* Video panel */}
          {videoHtml && (
            <div className="md:w-1/2 w-full flex items-center">
              <div className="w-full bg-card rounded-2xl shadow-xl overflow-hidden p-6">
                <h2 className="text-lg font-bold text-foreground mb-4 text-center">📺 使用教程</h2>
                <div dangerouslySetInnerHTML={{ __html: videoHtml }} className="rounded-xl overflow-hidden" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main portal
  return (
    <div className="bg-muted min-h-screen text-foreground">
      <nav className="bg-card shadow-sm px-6 py-4 flex justify-between items-center border-b border-border">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-2xl font-extrabold text-foreground hover:text-client-primary transition-colors">
            首页
          </Link>
          <span className="text-border">|</span>
          <div className="flex items-center text-client-primary font-bold text-xl">
            <Activity className="mr-2" /> 自助服务中心
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLogged(false)}
            className="text-muted-foreground hover:text-foreground flex items-center text-sm font-medium"
          >
            <LogOut className="w-4 h-4 mr-1" /> 退出
          </button>
          <ThemeToggle />
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-1 space-y-3">
          <button
            onClick={() => setTab("dashboard")}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all font-bold ${tab === "dashboard" ? "bg-client-primary text-client-primary-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-secondary border border-border"}`}
          >
            <Clock className="w-5 h-5 mr-3" /> 我的状态
          </button>
          <button
            onClick={() => {
              setTab("renew");
              setPayStatus(null);
            }}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all font-bold ${tab === "renew" ? "bg-client-primary text-client-primary-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-secondary border border-border"}`}
          >
            <CreditCard className="w-5 h-5 mr-3" /> 在线续费
          </button>
          <button
            onClick={() => {
              setTab("buy_new");
              setPayStatus(null);
              setNewClientCredentials(null);
              setNewClientConnectionInfo(null);
            }}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all font-bold ${tab === "buy_new" ? "bg-client-primary text-client-primary-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-secondary border border-border"}`}
          >
            <ShoppingCart className="w-5 h-5 mr-3" /> 购买开通
          </button>
          <button
            onClick={() => setTab("lookup")}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all font-bold ${tab === "lookup" ? "bg-client-primary text-client-primary-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-secondary border border-border"}`}
          >
            <Search className="w-5 h-5 mr-3" /> 查单找回
          </button>
          <button
            onClick={() => {
              setTab("orders");
              if (uuid && orders.length === 0) {
                setOrdersLoading(true);
                getOrders(uuid)
                  .then(setOrders)
                  .catch(() => {})
                  .finally(() => setOrdersLoading(false));
              }
            }}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all font-bold ${tab === "orders" ? "bg-client-primary text-client-primary-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-secondary border border-border"}`}
          >
            <Activity className="w-5 h-5 mr-3" /> 订单记录
          </button>
          <button
            onClick={() => setTab("tutorials")}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all font-bold ${tab === "tutorials" ? "bg-client-primary text-client-primary-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-secondary border border-border"}`}
          >
            <BookOpen className="w-5 h-5 mr-3" /> 使用教程
          </button>
        </div>

        <div className="md:col-span-3 bg-card rounded-2xl shadow-sm border border-border p-8">
          {tab === "dashboard" && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold border-b border-border pb-4 mb-6">当前运行状态</h2>
              {uuid === "游客_未登录" ? (
                <div className="bg-muted border border-border p-8 rounded-2xl text-center">
                  <ShoppingCart className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">您当前处于游客状态</h3>
                  <p className="text-muted-foreground">
                    请点击左侧「购买开通」来开通您的专属服务，或退出后输入凭证登录。
                  </p>
                </div>
              ) : (
              <>
              <div className="bg-client-primary/10 border border-client-primary/20 text-client-primary px-4 py-3 rounded-xl mb-6 space-y-2 shadow-sm">
                <div className="flex items-center">
                  <ShieldCheck className="w-5 h-5 mr-2" />
                  <span className="font-medium text-sm">当前登录节点 UUID: </span>
                  <span className="ml-2 font-mono text-xs bg-background px-2 py-1 rounded border border-border truncate">
                    {uuid}
                  </span>
                </div>
                {clientData.email && (
                  <div className="flex items-center pl-7">
                    <User className="w-4 h-4 mr-2 opacity-70" />
                    <span className="font-medium text-sm">备注名称: </span>
                    <span className="ml-2 text-sm font-mono bg-background px-2 py-1 rounded border border-border">
                      {clientData.email}
                    </span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-client-primary/5 p-6 rounded-2xl border border-client-primary/20">
                  <div className="text-client-primary font-bold mb-2">剩余时间</div>
                  {getDaysLeft() < 0 ? (
                    <div className="flex items-end">
                      <span className="text-3xl font-extrabold text-foreground">无限期</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-end">
                        <span className="text-5xl font-extrabold text-foreground">{getDaysLeft()}</span>
                        <span className="text-client-primary font-bold mb-1 ml-2">天</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-3 font-medium">
                        到期日: {new Date(clientData.expiryDate).toLocaleDateString()}
                      </p>
                    </>
                  )}
                </div>
                <div className="bg-success/5 p-6 rounded-2xl border border-success/20">
                  <div className="text-success font-bold mb-2">本月流量使用情况</div>
                  <div className="flex items-end mb-3">
                    <span className="text-5xl font-extrabold text-foreground">{clientData.trafficUsed.toFixed(1)}</span>
                    <span className="text-success font-bold mb-1 ml-2">/ {clientData.trafficTotal} GB</span>
                  </div>
                  <div className="w-full bg-success/20 rounded-full h-2.5">
                    <div
                      className="bg-success h-2.5 rounded-full"
                      style={{ width: `${(clientData.trafficUsed / clientData.trafficTotal) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              </>
              )}
            </div>
          )}

          {tab === "renew" && config && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold border-b border-border pb-4 mb-6">购买与续费</h2>
              {uuid === "游客_未登录" ? (
                <div className="bg-muted border border-border p-8 rounded-2xl text-center">
                  <p className="text-muted-foreground">
                    请先退出并在首页输入凭证登录后，方可进行续费操作。如果您没有节点，请点击「购买开通」。
                  </p>
                </div>
              ) : payStatus === "success" ? (
                <div className="bg-success/10 border border-success/20 p-8 rounded-2xl text-center">
                  <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">续费成功！</h3>
                  <p className="text-muted-foreground mb-6">您的数据已实时同步至后台，流量已重置。</p>
                  <button
                    onClick={() => setTab("dashboard")}
                    className="bg-success text-success-foreground font-bold px-8 py-3 rounded-xl hover:opacity-90 transition-colors shadow-lg"
                  >
                    查看最新状态
                  </button>
                </div>
              ) : (
                <div className="space-y-10">
                  {(() => {
                    const email = clientData?.email || "";
                    const isExclusive = email.includes("独享");
                    const isShared = email.includes("共享");
                    const exclusiveDisabled = isShared;
                    const sharedDisabled = isExclusive;
                    return null;
                  })()}
                  {/* 独享分组 */}
                  {dynamicPlans.filter((p) => p.category === "renew_exclusive").length > 0 && (
                    <div
                      className={`${(clientData?.email || "").includes("共享") ? "opacity-50 grayscale pointer-events-none" : ""}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🔒</span>
                        <h3 className="text-xl font-bold text-foreground">独享套餐</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        带宽独享，不与他人共用线路，速度更快更稳定，适合高需求用户
                        {(clientData?.email || "").includes("共享") && (
                          <span className="block text-destructive font-bold mt-1">
                            ⚠️ 您是共享用户，无法购买独享套餐
                          </span>
                        )}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {dynamicPlans
                          .filter((p) => p.category === "renew_exclusive")
                          .map((plan) => (
                            <div
                              key={plan.id}
                              className={`rounded-2xl p-6 relative transition-colors ${plan.featured ? "border-2 border-client-primary shadow-xl transform md:-translate-y-2 bg-card" : "border border-border hover:border-client-primary bg-card"}`}
                            >
                              {plan.featured && (
                                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-client-primary text-client-primary-foreground text-xs font-bold px-4 py-1 rounded-full shadow-sm">
                                  推荐
                                </div>
                              )}
                              <h3 className={`text-lg font-bold mb-2 ${plan.featured ? "" : "text-muted-foreground"}`}>
                                {plan.title}
                              </h3>
                              <div className="text-4xl font-extrabold text-client-primary mb-3">
                                ¥{plan.price}
                                <span className="text-base font-normal text-muted-foreground">
                                  /{plan.duration_days}天
                                </span>
                              </div>
                              <ul className="text-sm text-muted-foreground space-y-2 mb-6">
                                <li className="flex items-center">
                                  <ChevronRight className="w-4 h-4 text-client-primary mr-1 shrink-0" />{" "}
                                  {plan.description || "独享带宽，速度有保障"}
                                </li>
                                <li className="flex items-center">
                                  <ChevronRight className="w-4 h-4 text-client-primary mr-1 shrink-0" /> 增加{" "}
                                  {plan.duration_days} 天有效期
                                </li>
                                <li className="flex items-center">
                                  <ChevronRight className="w-4 h-4 text-client-primary mr-1 shrink-0" /> 立即重置流量
                                </li>
                              </ul>
                              <button
                                onClick={() => initiateCheckout(plan.duration_months, plan.price, plan.title, "renew", null, plan.duration_days)}
                                className={`w-full font-bold py-3 rounded-xl transition-colors ${plan.featured ? "bg-client-primary text-client-primary-foreground hover:opacity-90 shadow-md" : "bg-client-primary/10 text-client-primary hover:bg-client-primary hover:text-client-primary-foreground"}`}
                              >
                                立即购买
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* 共享分组 */}
                  {dynamicPlans.filter((p) => p.category === "renew_shared").length > 0 && (
                    <div
                      className={`${(clientData?.email || "").includes("独享") ? "opacity-50 grayscale pointer-events-none" : ""}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">👥</span>
                        <h3 className="text-xl font-bold text-foreground">共享套餐</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        多人共用线路，价格更实惠，适合日常轻度使用
                        {(clientData?.email || "").includes("独享") && (
                          <span className="block text-destructive font-bold mt-1">
                            ⚠️ 您是独享用户，无法购买共享套餐
                          </span>
                        )}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {dynamicPlans
                          .filter((p) => p.category === "renew_shared")
                          .map((plan) => (
                            <div
                              key={plan.id}
                              className={`rounded-2xl p-6 relative transition-colors ${plan.featured ? "border-2 border-success shadow-xl transform md:-translate-y-2 bg-card" : "border border-border hover:border-success bg-card"}`}
                            >
                              {plan.featured && (
                                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-success text-success-foreground text-xs font-bold px-4 py-1 rounded-full shadow-sm">
                                  性价比
                                </div>
                              )}
                              <h3 className={`text-lg font-bold mb-2 ${plan.featured ? "" : "text-muted-foreground"}`}>
                                {plan.title}
                              </h3>
                              <div className="text-4xl font-extrabold text-success mb-3">
                                ¥{plan.price}
                                <span className="text-base font-normal text-muted-foreground">
                                  /{plan.duration_days}天
                                </span>
                              </div>
                              <ul className="text-sm text-muted-foreground space-y-2 mb-6">
                                <li className="flex items-center">
                                  <ChevronRight className="w-4 h-4 text-success mr-1 shrink-0" />{" "}
                                  {plan.description || "多人共享，价格实惠"}
                                </li>
                                <li className="flex items-center">
                                  <ChevronRight className="w-4 h-4 text-success mr-1 shrink-0" /> 增加{" "}
                                  {plan.duration_days} 天有效期
                                </li>
                                <li className="flex items-center">
                                  <ChevronRight className="w-4 h-4 text-success mr-1 shrink-0" /> 立即重置流量
                                </li>
                              </ul>
                              <button
                                onClick={() => initiateCheckout(plan.duration_months, plan.price, plan.title, "renew", null, plan.duration_days)}
                                className={`w-full font-bold py-3 rounded-xl transition-colors ${plan.featured ? "bg-success text-success-foreground hover:opacity-90 shadow-md" : "bg-success/10 text-success hover:bg-success hover:text-success-foreground"}`}
                              >
                                立即购买
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {dynamicPlans.length === 0 && (
                    <div className="text-center text-muted-foreground py-12">暂无可用套餐</div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "buy_new" && config && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold border-b border-border pb-4 mb-6 flex items-center">
                <ShoppingCart className="mr-2" /> 购买开通
              </h2>

              {payStatus === "buy_success" && newClientCredentials ? (
                (() => {
                  // Build full protocol link if possible
                  const proto = newClientCredentials.protocol;
                  const conn = newClientConnectionInfo;
                  let fullLink = "";
                  if (proto === "vless" && newClientCredentials.uuid && conn) {
                    const ss = conn.streamSettings || {};
                    const network = ss.network || "tcp";
                    const security = ss.security || "none";
                    const params = new URLSearchParams();
                    params.set("type", network);
                    params.set("encryption", "none");
                    if (security && security !== "none") {
                      params.set("security", security);
                      if (security === "reality" && ss.realitySettings) {
                        const rs = ss.realitySettings;
                        const rsSettings = rs.settings || {};
                        const pbk = rsSettings.publicKey || rs.publicKey || "";
                        const fp = rsSettings.fingerprint || rs.fingerprint || "";
                        const sni = rsSettings.serverName || (rs.serverNames?.[0]) || "";
                        const sid = (rs.shortIds?.[0]) || rs.shortId || "";
                        const spx = rsSettings.spiderX || rs.spiderX || "";
                        if (pbk) params.set("pbk", pbk);
                        if (fp) params.set("fp", fp);
                        if (sni) params.set("sni", sni);
                        if (sid) params.set("sid", sid);
                        if (spx) params.set("spx", spx);
                      } else {
                        const tlsSettings = ss.tlsSettings || {};
                        if (tlsSettings.fingerprint) params.set("fp", tlsSettings.fingerprint);
                        if (tlsSettings.alpn?.length) params.set("alpn", tlsSettings.alpn.join(","));
                        if (tlsSettings.serverName) params.set("sni", tlsSettings.serverName);
                      }
                    }
                    if (network === "ws" && ss.wsSettings) {
                      if (ss.wsSettings.path) params.set("path", ss.wsSettings.path);
                      if (ss.wsSettings.headers?.Host) params.set("host", ss.wsSettings.headers.Host);
                    }
                    if (network === "grpc" && ss.grpcSettings) {
                      if (ss.grpcSettings.serviceName) params.set("serviceName", ss.grpcSettings.serviceName);
                    }
                    const inboundRemark = conn.remark ? `${conn.remark}-` : "";
                    const fragment = inboundRemark + (newClientRemark || (conn.regionName ? `${conn.regionName}-${checkoutData?.planName || ""}` : (checkoutData?.planName || "node")));
                    fullLink = `vless://${newClientCredentials.uuid}@${conn.address}:${conn.port}?${params.toString()}#${encodeURIComponent(fragment)}`;
                  } else if (proto === "vmess" && newClientCredentials.uuid && conn) {
                    const ss = conn.streamSettings || {};
                    const vmessObj = {
                      v: "2", ps: (conn.remark ? `${conn.remark}-` : "") + (newClientRemark || (conn.regionName ? `${conn.regionName}-${checkoutData?.planName || ""}` : (checkoutData?.planName || "node"))),
                      add: conn.address, port: String(conn.port), id: newClientCredentials.uuid,
                      aid: "0", scy: "auto", net: ss.network || "tcp", type: "none",
                      host: "", path: "", tls: ss.security || "",
                    };
                    if (ss.network === "ws" && ss.wsSettings) {
                      vmessObj.path = ss.wsSettings.path || "";
                      vmessObj.host = ss.wsSettings.headers?.Host || "";
                    }
                    const vmessJson = JSON.stringify(vmessObj);
                    const vmessB64 = btoa(unescape(encodeURIComponent(vmessJson)));
                    fullLink = `vmess://${vmessB64}`;
                  } else if (proto === "trojan" && newClientCredentials.uuid && conn) {
                    const ss = conn.streamSettings || {};
                    const params = new URLSearchParams();
                    params.set("type", ss.network || "tcp");
                    const security = ss.security || "none";
                    if (security && security !== "none") {
                      params.set("security", security);
                      if (security === "reality" && ss.realitySettings) {
                        const rs = ss.realitySettings;
                        const rsSettings = rs.settings || {};
                        const pbk = rsSettings.publicKey || rs.publicKey || "";
                        const fp = rsSettings.fingerprint || rs.fingerprint || "";
                        const sni = rsSettings.serverName || (rs.serverNames?.[0]) || "";
                        const sid = (rs.shortIds?.[0]) || rs.shortId || "";
                        const spx = rsSettings.spiderX || rs.spiderX || "";
                        if (pbk) params.set("pbk", pbk);
                        if (fp) params.set("fp", fp);
                        if (sni) params.set("sni", sni);
                        if (sid) params.set("sid", sid);
                        if (spx) params.set("spx", spx);
                      } else {
                        const tlsSettings = ss.tlsSettings || {};
                        if (tlsSettings.fingerprint) params.set("fp", tlsSettings.fingerprint);
                        if (tlsSettings.alpn?.length) params.set("alpn", tlsSettings.alpn.join(","));
                        if (tlsSettings.serverName) params.set("sni", tlsSettings.serverName);
                      }
                    }
                    if (ss.network === "ws" && ss.wsSettings) {
                      if (ss.wsSettings.path) params.set("path", ss.wsSettings.path);
                      if (ss.wsSettings.headers?.Host) params.set("host", ss.wsSettings.headers.Host);
                    }
                    if (ss.network === "grpc" && ss.grpcSettings) {
                      if (ss.grpcSettings.serviceName) params.set("serviceName", ss.grpcSettings.serviceName);
                    }
                    const inboundRemark2 = conn.remark ? `${conn.remark}-` : "";
                    const fragment = inboundRemark2 + (newClientRemark || (conn.regionName ? `${conn.regionName}-${checkoutData?.planName || ""}` : (checkoutData?.planName || "node")));
                    fullLink = `trojan://${newClientCredentials.uuid}@${conn.address}:${conn.port}?${params.toString()}#${encodeURIComponent(fragment)}`;
                  }

                  return (
                    <div className="bg-client-primary/10 border border-client-primary/20 p-8 rounded-2xl text-center mb-6">
                      <CheckCircle2 className="w-16 h-16 text-client-primary mx-auto mb-4" />
                      <h3 className="text-2xl font-bold mb-2">开通成功！</h3>
                      <p className="text-muted-foreground mb-6">系统已自动为您生成专属节点配置，请妥善保存以下信息：</p>

                      <div className="bg-card p-4 sm:p-6 rounded-xl border border-border shadow-sm text-left max-w-lg mx-auto relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-client-primary"></div>
                        <div className="mb-4 flex items-center justify-between">
                          <span className="text-sm font-bold text-muted-foreground">协议类型</span>
                          <span className="bg-client-primary/10 text-client-primary text-xs px-2 py-1 rounded font-bold">{newClientCredentials.protocol?.toUpperCase()}</span>
                        </div>

                        {newClientCredentials.username ? (
                          <>
                            {newClientConnectionInfo && (
                              <>
                                <div className="mb-4">
                                  <label className="block text-xs text-muted-foreground mb-1 font-bold">🌐 服务器地址</label>
                                  <div className="flex items-center gap-2">
                                    <code className="block flex-1 bg-muted p-2 rounded border border-border text-client-primary font-mono text-sm">{newClientConnectionInfo.address}</code>
                                    <button onClick={() => copyWithFeedback(newClientConnectionInfo.address, "address")} className="text-client-primary hover:opacity-70 shrink-0">
                                      {copiedKey === "address" ? <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs text-green-500 ml-1">已复制</span></> : <Copy className="w-4 h-4" />}
                                    </button>
                                  </div>
                                </div>
                                <div className="mb-4">
                                  <label className="block text-xs text-muted-foreground mb-1 font-bold">🔌 端口</label>
                                  <div className="flex items-center gap-2">
                                    <code className="block flex-1 bg-muted p-2 rounded border border-border text-client-primary font-mono text-lg">{newClientConnectionInfo.port}</code>
                                    <button onClick={() => copyWithFeedback(String(newClientConnectionInfo.port), "port")} className="text-client-primary hover:opacity-70 shrink-0">
                                      {copiedKey === "port" ? <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs text-green-500 ml-1">已复制</span></> : <Copy className="w-4 h-4" />}
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                            <div className="mb-4">
                              <label className="block text-xs text-muted-foreground mb-1 font-bold">👤 用户名</label>
                              <div className="flex items-center gap-2">
                                <code className="block flex-1 bg-muted p-2 rounded border border-border text-client-primary font-mono text-lg">{newClientCredentials.username}</code>
                                <button onClick={() => copyWithFeedback(newClientCredentials.username, "username")} className="text-client-primary hover:opacity-70 shrink-0">
                                  {copiedKey === "username" ? <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs text-green-500 ml-1">已复制</span></> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                            <div className="mb-4">
                              <label className="block text-xs text-muted-foreground mb-1 font-bold">🔑 密码</label>
                              <div className="flex items-center gap-2">
                                <code className="block flex-1 bg-muted p-2 rounded border border-border text-client-primary font-mono text-lg">{newClientCredentials.password}</code>
                                <button onClick={() => copyWithFeedback(newClientCredentials.password, "password")} className="text-client-primary hover:opacity-70 shrink-0">
                                  {copiedKey === "password" ? <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs text-green-500 ml-1">已复制</span></> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                            <div className="mb-2 pt-3 border-t border-border">
                              <label className="block text-xs text-muted-foreground mb-1 font-bold">📋 一键复制全部</label>
                              <button
                                onClick={() => copyWithFeedback(
                                  `地址: ${newClientConnectionInfo?.address || ""}\n端口: ${newClientConnectionInfo?.port || ""}\n用户名: ${newClientCredentials.username}\n密码: ${newClientCredentials.password}`,
                                  "all_socks"
                                )}
                                className="w-full flex items-center justify-center gap-2 bg-client-primary/10 hover:bg-client-primary/20 text-client-primary font-bold py-2.5 px-4 rounded-lg transition-all"
                              >
                                {copiedKey === "all_socks" ? <><CheckCircle2 className="w-5 h-5 text-green-500" /><span className="text-green-500">已复制全部信息！</span></> : <><Copy className="w-5 h-5" /><span>复制全部连接信息</span></>}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="mb-4">
                            <label className="block text-xs text-muted-foreground mb-1 font-bold">UUID</label>
                            <div className="flex items-center gap-2">
                              <code className="block flex-1 bg-muted p-2 rounded border border-border text-client-primary font-mono text-sm break-all">{newClientCredentials.uuid}</code>
                              <button onClick={() => copyWithFeedback(newClientCredentials.uuid, "uuid")} className="text-client-primary hover:opacity-70 shrink-0">
                                {copiedKey === "uuid" ? <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs text-green-500 ml-1">已复制</span></> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        )}

                        {fullLink && (
                          <>
                            <div className="mb-4 mt-4 pt-4 border-t border-border">
                              <label className="block text-xs text-muted-foreground mb-1 font-bold">📋 完整节点链接</label>
                              <div className="flex items-start gap-2">
                                <code className="block flex-1 bg-muted p-2 rounded border border-border text-client-primary font-mono text-xs break-all max-h-24 overflow-y-auto">{fullLink}</code>
                                <button onClick={() => copyWithFeedback(fullLink, "link")} className="text-client-primary hover:opacity-70 mt-1 shrink-0">
                                  {copiedKey === "link" ? <><CheckCircle2 className="w-5 h-5 text-green-500" /><span className="text-xs text-green-500 ml-1">已复制</span></> : <Copy className="w-5 h-5" />}
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col items-center mt-4 pt-4 border-t border-border">
                              <label className="block text-xs text-muted-foreground mb-3 font-bold">📱 扫码导入</label>
                              <div className="bg-white p-3 rounded-xl shadow-sm">
                                <QRCodeSVG value={fullLink} size={180} />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="bg-warning/10 border border-warning/20 p-3 rounded-lg text-sm text-warning font-bold mt-4">
                        ⚠️ 请截图或复制保存以上凭证，关闭后将无法再次查看！
                      </div>
                    </div>
                  );
                })()
              ) : (
                <>
                  {dynamicRegions.length > 0 ? (
                    <div>
                      {/* Region tabs */}
                      <div className="flex flex-wrap gap-2 mb-6">
                        {dynamicRegions.map(region => {
                          const regionPlanIds = dynamicPlanRegions.filter(pr => pr.region_id === region.id).map(pr => pr.plan_id);
                          const hasPlans = dynamicPlans.some(p => regionPlanIds.includes(p.id) && (p.category === "new_exclusive" || p.category === "new_shared"));
                          if (!hasPlans) return null;
                          const isActive = (selectedBuyRegion || dynamicRegions[0]?.id) === region.id;
                          const isSoldOut = region.max_clients > 0 && region.current_clients >= region.max_clients;
                          return (
                            <button key={region.id} onClick={() => setSelectedBuyRegion(region.id)}
                              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? "bg-client-primary text-client-primary-foreground shadow-md" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-border"}`}>
                              📍 {region.name}
                              {isSoldOut && <span className="ml-1.5 text-xs opacity-75">(无货)</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Selected region plans */}
                      {(() => {
                        const activeRegionId = selectedBuyRegion || dynamicRegions[0]?.id;
                        const region = dynamicRegions.find(r => r.id === activeRegionId);
                        if (!region) return null;
                        const regionPlanIds = dynamicPlanRegions.filter(pr => pr.region_id === region.id).map(pr => pr.plan_id);
                        const regionExclusive = dynamicPlans.filter(p => regionPlanIds.includes(p.id) && p.category === "new_exclusive");
                        const regionShared = dynamicPlans.filter(p => regionPlanIds.includes(p.id) && p.category === "new_shared");
                        const isSoldOut = region.max_clients > 0 && region.current_clients >= region.max_clients;

                        return (
                          <div>
                            {regionExclusive.length > 0 && (
                              <div className="mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-lg">🔒</span>
                                  <h4 className="text-lg font-bold text-foreground">独享套餐</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  {regionExclusive.map((plan) => (
                                    <div key={plan.id}
                                      className={`rounded-2xl p-6 relative transition-colors ${isSoldOut ? "opacity-50 grayscale" : ""} ${plan.featured ? "border-2 border-client-primary shadow-xl transform md:-translate-y-2 bg-card" : "border border-border hover:border-client-primary bg-card"}`}>
                                      {isSoldOut && (
                                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-destructive text-destructive-foreground text-xs font-bold px-4 py-1 rounded-full shadow-sm z-10">暂无库存</div>
                                      )}
                                      {plan.featured && !isSoldOut && (
                                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-client-primary text-client-primary-foreground text-xs font-bold px-4 py-1 rounded-full shadow-sm">站长推荐</div>
                                      )}
                                      <h3 className={`text-lg font-bold mb-2 ${plan.featured ? "mt-2" : "text-muted-foreground"}`}>{plan.title}</h3>
                                      <div className="text-4xl font-extrabold text-client-primary mb-3">
                                        ¥{plan.price}<span className="text-base font-normal text-muted-foreground">/{plan.duration_days}天</span>
                                      </div>
                                      <ul className="text-sm text-muted-foreground space-y-2 mb-6">
                                        <li className="flex items-center"><ChevronRight className="w-4 h-4 text-client-primary mr-1 shrink-0" /> {plan.description || "全新开通，即开即用"}</li>
                                        <li className="flex items-center"><ChevronRight className="w-4 h-4 text-client-primary mr-1 shrink-0" /> 有效期 {plan.duration_days} 天</li>
                                      </ul>
                                      <button
                                        onClick={() => !isSoldOut && initiateCheckout(plan.duration_months, plan.price, plan.title, "buy_new", activeRegionId, plan.duration_days)}
                                        disabled={isSoldOut}
                                        className={`w-full font-bold py-3 rounded-xl transition-colors ${isSoldOut ? "bg-muted text-muted-foreground cursor-not-allowed" : plan.featured ? "bg-client-primary text-client-primary-foreground hover:opacity-90 shadow-md" : "bg-client-primary/10 text-client-primary hover:bg-client-primary hover:text-client-primary-foreground"}`}>
                                        {isSoldOut ? "暂无库存，等待客服添加" : "购买开通"}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {regionShared.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-lg">👥</span>
                                  <h4 className="text-lg font-bold text-foreground">共享套餐</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  {regionShared.map((plan) => (
                                    <div key={plan.id}
                                      className={`rounded-2xl p-6 relative transition-colors ${isSoldOut ? "opacity-50 grayscale" : ""} ${plan.featured ? "border-2 border-success shadow-xl transform md:-translate-y-2 bg-card" : "border border-border hover:border-success bg-card"}`}>
                                      {isSoldOut && (
                                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-destructive text-destructive-foreground text-xs font-bold px-4 py-1 rounded-full shadow-sm z-10">暂无库存</div>
                                      )}
                                      {plan.featured && !isSoldOut && (
                                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-success text-success-foreground text-xs font-bold px-4 py-1 rounded-full shadow-sm">性价比</div>
                                      )}
                                      <h3 className={`text-lg font-bold mb-2 ${plan.featured ? "mt-2" : "text-muted-foreground"}`}>{plan.title}</h3>
                                      <div className="text-4xl font-extrabold text-success mb-3">
                                        ¥{plan.price}<span className="text-base font-normal text-muted-foreground">/{plan.duration_days}天</span>
                                      </div>
                                      <ul className="text-sm text-muted-foreground space-y-2 mb-6">
                                        <li className="flex items-center"><ChevronRight className="w-4 h-4 text-success mr-1 shrink-0" /> {plan.description || "共享线路，价格实惠"}</li>
                                        <li className="flex items-center"><ChevronRight className="w-4 h-4 text-success mr-1 shrink-0" /> 有效期 {plan.duration_days} 天</li>
                                      </ul>
                                      <button
                                        onClick={() => !isSoldOut && initiateCheckout(plan.duration_months, plan.price, plan.title, "buy_new", activeRegionId, plan.duration_days)}
                                        disabled={isSoldOut}
                                        className={`w-full font-bold py-3 rounded-xl transition-colors ${isSoldOut ? "bg-muted text-muted-foreground cursor-not-allowed" : plan.featured ? "bg-success text-success-foreground hover:opacity-90 shadow-md" : "bg-success/10 text-success hover:bg-success hover:text-success-foreground"}`}>
                                        {isSoldOut ? "暂无库存，等待客服添加" : "购买开通"}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    /* Fallback: show plans without region grouping */
                    dynamicPlans.filter(p => p.category === "new_exclusive" || p.category === "new_shared").length > 0 ? (
                      <div className="text-center text-muted-foreground py-12">套餐尚未关联地区，请联系站长配置</div>
                    ) : null
                  )}

                  {dynamicPlans.filter((p) => p.category === "new_exclusive" || p.category === "new_shared").length === 0 && (
                    <div className="text-center text-muted-foreground py-12">暂无可用的开通套餐，请联系站长添加</div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "checkout" && checkoutData && config && (
            <div className="animate-fade-in max-w-2xl mx-auto">
              <div className="flex items-center mb-6">
                <button
                  onClick={() => {
                    cleanupPolling();
                    setTab(checkoutData.type === "buy_new" ? "buy_new" : "renew");
                    setPayStatus(null);
                  }}
                  className="text-muted-foreground hover:text-foreground mr-4 font-medium flex items-center"
                >
                  &larr; 返回
                </button>
                <h2 className="text-2xl font-bold">收银台</h2>
                {countdown > 0 && (
                  <span className="ml-auto text-sm font-mono text-muted-foreground">
                    ⏱ {formatCountdown(countdown)}
                  </span>
                )}
              </div>

              {/* Status banners */}
              {payStatus === "creating_client" && (
                <div className="bg-client-primary/10 border border-client-primary/20 p-6 rounded-2xl text-center mb-6">
                  <div className="animate-spin w-10 h-10 border-4 border-client-primary border-t-transparent rounded-full mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">正在自动开通节点...</h3>
                  <p className="text-muted-foreground text-sm">支付已成功，系统正在为您创建新节点</p>
                </div>
              )}
              {payStatus === "buy_success" && (
                <div className="bg-success/10 border border-success/20 p-8 rounded-2xl text-center mb-6">
                  <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">🎉 新节点开通成功！</h3>
                  <p className="text-muted-foreground mb-6">请妥善保存以下连接凭证</p>
                  {newClientCredentials && (
                    <div className="bg-muted border border-border rounded-xl p-6 text-left space-y-3 mb-6">
                      {newClientCredentials.protocol && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">协议</span>
                          <span className="font-mono font-bold text-foreground">{newClientCredentials.protocol.toUpperCase()}</span>
                        </div>
                      )}
                      {newClientCredentials.uuid && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-muted-foreground">UUID</span>
                            <button
                              onClick={() => copyWithFeedback(newClientCredentials.uuid, "uuid2")}
                              className="text-client-primary hover:opacity-70 flex items-center text-xs font-bold"
                            >
                              {copiedKey === "uuid2" ? <><CheckCircle2 className="w-3 h-3 mr-1 text-success" /> 已复制</> : <><Copy className="w-3 h-3 mr-1" /> 复制</>}
                            </button>
                          </div>
                          <div className="font-mono text-sm bg-background p-2 rounded border border-border break-all">{newClientCredentials.uuid}</div>
                        </div>
                      )}
                      {newClientCredentials.username && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-muted-foreground">用户名</span>
                            <button
                              onClick={() => copyWithFeedback(newClientCredentials.username, "username2")}
                              className="text-client-primary hover:opacity-70 flex items-center text-xs font-bold"
                            >
                              {copiedKey === "username2" ? <><CheckCircle2 className="w-3 h-3 mr-1 text-success" /> 已复制</> : <><Copy className="w-3 h-3 mr-1" /> 复制</>}
                            </button>
                          </div>
                          <div className="font-mono text-sm bg-background p-2 rounded border border-border">{newClientCredentials.username}</div>
                        </div>
                      )}
                      {newClientCredentials.password && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-muted-foreground">密码</span>
                            <button
                              onClick={() => copyWithFeedback(newClientCredentials.password, "password2")}
                              className="text-client-primary hover:opacity-70 flex items-center text-xs font-bold"
                            >
                              {copiedKey === "password2" ? <><CheckCircle2 className="w-3 h-3 mr-1 text-success" /> 已复制</> : <><Copy className="w-3 h-3 mr-1" /> 复制</>}
                            </button>
                          </div>
                          <div className="font-mono text-sm bg-background p-2 rounded border border-border">{newClientCredentials.password}</div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="bg-warning/10 border border-warning/20 p-3 rounded-lg text-sm text-warning font-bold mb-4">
                    ⚠️ 请截图或复制保存以上凭证，关闭后将无法再次查看！
                  </div>
                </div>
              )}
              {payStatus === "success" && (
                <div className="bg-success/10 border border-success/20 p-6 rounded-2xl text-center mb-6">
                  <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
                  <h3 className="text-xl font-bold mb-2">支付成功！续期已完成</h3>
                  <button
                    onClick={() => {
                      setTab("dashboard");
                      setPayStatus(null);
                    }}
                    className="bg-success text-success-foreground font-bold px-6 py-2 rounded-xl mt-2"
                  >
                    查看最新状态
                  </button>
                </div>
              )}
              {payStatus === "paid_unfulfilled" && (
                <div className="bg-warning/10 border border-warning/20 p-6 rounded-2xl text-center mb-6">
                  <h3 className="text-lg font-bold mb-2">⚠️ 支付已确认，但续期操作失败</h3>
                  <p className="text-muted-foreground text-sm">请联系站长处理，订单号：{orderId}</p>
                </div>
              )}
              {payStatus === "expired" && (
                <div className="bg-destructive/10 border border-destructive/20 p-6 rounded-2xl text-center mb-6">
                  <h3 className="text-lg font-bold mb-2">⏰ 订单已超时</h3>
                  <p className="text-muted-foreground text-sm mb-3">请返回重新下单</p>
                  <button
                    onClick={() => {
                      setTab("renew");
                      setPayStatus(null);
                    }}
                    className="bg-client-primary text-client-primary-foreground font-bold px-6 py-2 rounded-xl"
                  >
                    重新选择套餐
                  </button>
                </div>
              )}
              {payStatus === "error" && (
                <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl text-center mb-6">
                  <p className="text-destructive font-bold">{error || "创建订单失败，请重试"}</p>
                </div>
              )}

              {!["success", "buy_success", "creating_client", "expired", "paid_unfulfilled"].includes(payStatus || "") && (
                <>
                  <div className="bg-muted border border-border rounded-2xl p-6 mb-6">
                    <h3 className="text-muted-foreground font-bold mb-1">订单信息</h3>
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-bold">{checkoutData.planName}</span>
                      <div className="text-right">
                        {["usdt", "trx"].includes(selectedMethod) && cryptoPrice > 0 ? (
                          <>
                            <span className="text-2xl font-extrabold text-client-primary">
                              {cryptoPrice} {selectedMethod.toUpperCase()}
                            </span>
                            <span className="block text-xs text-muted-foreground">≈ ¥{checkoutData.price}</span>
                          </>
                        ) : (
                          <span className="text-2xl font-extrabold text-client-primary">¥{checkoutData.price}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Before order created: select method */}
                  {!payStatus || payStatus === "error" ? (
                    <>
                      <h3 className="font-bold mb-4">请选择支付方式</h3>

                      {/* Email input for order lookup */}
                      <div className="mb-6">
                        <label className="block text-sm font-bold text-muted-foreground mb-2">
                          📧 邮箱/手机号{checkoutData?.type === "buy_new" ? "（必填，用于查单找回）" : "（选填，用于查单找回）"}
                          {checkoutData?.type === "buy_new" && <span className="text-destructive ml-1">*</span>}
                        </label>
                        <input
                          type="text"
                          value={checkoutEmail}
                          onChange={(e) => setCheckoutEmail(e.target.value)}
                          placeholder="填写后可通过「查单找回」功能找回订单和节点链接"
                          className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-client-primary focus:border-transparent outline-none bg-background text-foreground text-sm ${checkoutData?.type === "buy_new" && !checkoutEmail.trim() ? "border-destructive" : "border-input"}`}
                          required={checkoutData?.type === "buy_new"}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        {config.hupi_wechat && (
                          <button
                            onClick={() => setSelectedMethod("wechat")}
                            className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${selectedMethod === "wechat" ? "border-success bg-success/10 text-success" : "border-border hover:border-success/50"}`}
                          >
                            <Smartphone className="w-8 h-8 mb-2 text-success" />
                            <span className="font-bold">微信支付</span>
                          </button>
                        )}
                        {config.hupi_alipay && (
                          <button
                            onClick={() => setSelectedMethod("alipay")}
                            className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${selectedMethod === "alipay" ? "border-accent bg-accent/10 text-accent" : "border-border hover:border-accent/50"}`}
                          >
                            <Smartphone className="w-8 h-8 mb-2 text-accent" />
                            <span className="font-bold">支付宝</span>
                          </button>
                        )}
                        {config.crypto_usdt && (
                          <button
                            onClick={() => handleSelectCrypto("usdt")}
                            className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${selectedMethod === "usdt" ? "border-success bg-success/10 text-success" : "border-border hover:border-success/50"}`}
                          >
                            <Bitcoin className="w-8 h-8 mb-2 text-success" />
                            <span className="font-bold">USDT (TRC20)</span>
                          </button>
                        )}
                        {config.crypto_trx && (
                          <button
                            onClick={() => handleSelectCrypto("trx")}
                            className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${selectedMethod === "trx" ? "border-destructive bg-destructive/10 text-destructive" : "border-border hover:border-destructive/50"}`}
                          >
                            <Bitcoin className="w-8 h-8 mb-2 text-destructive" />
                            <span className="font-bold">TRX (波场)</span>
                          </button>
                        )}
                      </div>

                      {selectedMethod && !["usdt", "trx"].includes(selectedMethod) && (
                        <button
                          onClick={confirmPayment}
                          disabled={orderCreating}
                          className="w-full bg-client-primary text-client-primary-foreground font-bold py-3 rounded-xl hover:opacity-90 transition-colors shadow-md"
                        >
                          {orderCreating ? "正在创建订单..." : "确认支付方式"}
                        </button>
                      )}

                      {ratesLoading && (
                        <div className="text-center text-muted-foreground py-4 animate-pulse">正在获取实时汇率并创建订单...</div>
                      )}
                    </>
                  ) : (
                    /* After order created: show payment details */
                    <div className="bg-card border-2 border-border rounded-2xl p-8 text-center animate-fade-in shadow-sm">
                      {payStatus === "creating" && (
                        <div className="py-8">
                          <div className="animate-spin w-10 h-10 border-4 border-client-primary border-t-transparent rounded-full mx-auto mb-4" />
                          <p className="text-muted-foreground font-bold">正在创建订单...</p>
                        </div>
                      )}

                      {payStatus === "waiting" && ["usdt", "trx"].includes(selectedMethod) && (
                        <div>
                          {/* Step indicators */}
                          <div className="flex items-center justify-center gap-2 mb-6">
                            <div className="flex items-center gap-1.5">
                              <div className="w-7 h-7 rounded-full bg-success text-success-foreground flex items-center justify-center text-xs font-bold">✓</div>
                              <span className="text-xs font-bold text-success">下单</span>
                            </div>
                            <div className="w-8 h-0.5 bg-warning/50" />
                            <div className="flex items-center gap-1.5">
                              <div className="w-7 h-7 rounded-full bg-warning text-warning-foreground flex items-center justify-center text-xs font-bold animate-pulse">2</div>
                              <span className="text-xs font-bold text-warning">转账</span>
                            </div>
                            <div className="w-8 h-0.5 bg-muted" />
                            <div className="flex items-center gap-1.5">
                              <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">3</div>
                              <span className="text-xs font-bold text-muted-foreground">完成</span>
                            </div>
                          </div>

                          {/* Prominent countdown */}
                          {countdown > 0 && (
                            <div className={`rounded-xl p-3 mb-4 text-center border ${countdown < 120 ? "bg-destructive/10 border-destructive/30" : countdown < 300 ? "bg-warning/10 border-warning/30" : "bg-muted border-border"}`}>
                              <div className="flex items-center justify-center gap-2">
                                <Clock className={`w-4 h-4 ${countdown < 120 ? "text-destructive animate-pulse" : countdown < 300 ? "text-warning" : "text-muted-foreground"}`} />
                                <span className={`text-lg font-mono font-extrabold ${countdown < 120 ? "text-destructive" : countdown < 300 ? "text-warning" : "text-foreground"}`}>
                                  {formatCountdown(countdown)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {countdown < 120 ? "即将过期！" : countdown < 300 ? "请尽快完成转账" : "剩余支付时间"}
                                </span>
                              </div>
                              {/* Progress bar */}
                              <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                                <div
                                  className={`h-1.5 rounded-full transition-all duration-1000 ${countdown < 120 ? "bg-destructive" : countdown < 300 ? "bg-warning" : "bg-client-primary"}`}
                                  style={{ width: `${(countdown / 1200) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="bg-success/10 text-success p-3 rounded-lg mb-4 text-sm font-bold border border-success/20">
                            ✅ 订单已创建，请严格按照下方金额转账
                          </div>
                          {exchangeRates && (
                            <p className="text-xs text-muted-foreground mb-2">
                              实时汇率 (币安)：1 {selectedMethod.toUpperCase()} ≈ ¥
                              {(selectedMethod === "usdt" ? exchangeRates.usdtCny : exchangeRates.trxCny).toFixed(4)}
                            </p>
                          )}
                          <p className="text-muted-foreground mb-2">应付总额 ({selectedMethod.toUpperCase()})</p>
                          <div className="flex items-center justify-center gap-3 mb-4">
                            <span className="text-4xl font-extrabold text-client-primary">{cryptoPrice}</span>
                            <button
                              onClick={() => copyWithFeedback(String(cryptoPrice), "crypto-amount")}
                              className="p-2 rounded-lg bg-client-primary/10 hover:bg-client-primary/20 transition-colors"
                              title="复制金额"
                            >
                              {copiedKey === "crypto-amount" ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-client-primary" />}
                            </button>
                          </div>

                          {/* Crypto address with copy and QR */}
                          <div className="mb-4">
                            <p className="text-xs text-muted-foreground mb-1.5 font-bold">收款地址 (TRC20)</p>
                            <div className="flex items-center gap-2 bg-muted p-3 rounded-lg border border-border">
                              <span className="flex-1 font-mono text-sm text-muted-foreground break-all">{config.crypto_address}</span>
                              <button
                                onClick={() => copyWithFeedback(config.crypto_address || "", "crypto-addr")}
                                className="shrink-0 p-2 rounded-lg bg-client-primary/10 hover:bg-client-primary/20 transition-colors"
                                title="复制地址"
                              >
                                {copiedKey === "crypto-addr" ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-client-primary" />}
                              </button>
                            </div>
                          </div>

                          {/* QR code for address */}
                          {config.crypto_address && (
                            <div className="flex flex-col items-center mb-6">
                              <div className="bg-white p-4 rounded-2xl shadow-md border-2 border-client-primary/20">
                                <QRCodeSVG value={config.crypto_address} size={200} level="H" includeMargin />
                              </div>
                              <p className="text-xs text-center text-muted-foreground mt-2 font-medium">📱 扫码复制收款地址</p>
                            </div>
                          )}

                          {error && <p className="text-warning text-sm mb-3">{error}</p>}

                          {/* Auto-check indicator */}
                          <div className="flex items-center justify-center gap-2 mb-4">
                            <div className="relative flex items-center justify-center">
                              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-success opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              自动检测中... 已检查 <span className="font-bold text-foreground">{autoCheckCount}</span> 次
                            </span>
                          </div>

                          <button
                            onClick={handleCryptoVerify}
                            className="w-full bg-client-primary text-client-primary-foreground font-bold py-3 rounded-xl hover:opacity-90 transition-colors shadow-md mb-3"
                          >
                            我已转账，立即验证
                          </button>
                          <p className="text-xs text-muted-foreground">
                            💡 系统每 5 秒自动检测链上转账 · 也可手动点击验证 · 请勿关闭页面
                          </p>
                        </div>
                      )}

                      {payStatus === "waiting" && !["usdt", "trx"].includes(selectedMethod) && (
                        <div>
                          <div className="bg-success/10 text-success p-3 rounded-lg mb-4 text-sm font-bold border border-success/20">
                            ✅ 订单已创建，请扫码支付
                          </div>
                          {qrCodeUrl ? (
                            <img
                              src={qrCodeUrl}
                              alt="支付二维码"
                              className="w-48 h-48 mx-auto mb-4 rounded-xl border border-border"
                            />
                          ) : (
                            <div className="w-48 h-48 bg-muted border border-border mx-auto rounded-xl flex items-center justify-center mb-4">
                              <QrCode className="w-12 h-12 text-muted-foreground" />
                            </div>
                          )}
                          {selectedMethod === "alipay" && payUrl && (
                            <div className="mb-4">
                              <a
                                href={payUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 bg-[hsl(var(--client-primary))] text-[hsl(var(--client-primary-foreground))] font-bold px-6 py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
                              >
                                📱 手机浏览器点此跳转支付宝支付
                              </a>
                            </div>
                          )}
                          <p className="text-muted-foreground font-bold mb-2">
                            请使用 {selectedMethod === "wechat" ? "微信" : "支付宝"} 扫码付款 ¥{checkoutData.price}
                          </p>
                          <p className="text-xs text-muted-foreground">支付完成后系统将自动确认，请勿关闭此页面</p>
                        </div>
                      )}

                      {payStatus === "verifying" && (
                        <div className="py-4">
                          <div className="animate-spin w-8 h-8 border-4 border-client-primary border-t-transparent rounded-full mx-auto mb-3" />
                          <p className="text-muted-foreground font-bold">正在验证链上转账...</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "orders" && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold border-b border-border pb-4 mb-6">订单记录</h2>
              {ordersLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-4 border-client-primary border-t-transparent rounded-full" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">暂无订单记录</div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} className="border border-border rounded-xl p-4 bg-muted/30">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className="font-bold text-foreground">{order.plan_name}</span>
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded-full ${
                            order.status === "paid" || order.status === "fulfilled"
                              ? "bg-success/20 text-success"
                              : order.status === "expired"
                                ? "bg-destructive/20 text-destructive"
                                : "bg-warning/20 text-warning"
                          }`}
                        >
                          {order.status === "fulfilled"
                            ? "已完成"
                            : order.status === "paid"
                              ? "已支付"
                              : order.status === "expired"
                                ? "已过期"
                                : "待支付"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                        <div>
                          <span className="block text-xs">金额</span>
                          <span className="font-mono font-bold text-foreground">
                            {order.crypto_amount
                              ? `${order.crypto_amount} ${order.crypto_currency || ""}`
                              : `¥${order.amount}`}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs">支付方式</span>
                          <span className="font-bold text-foreground">
                            {order.payment_method === "wechat"
                              ? "微信"
                              : order.payment_method === "alipay"
                                ? "支付宝"
                                : order.payment_method?.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs">时长</span>
                          <span className="font-bold text-foreground">{order.months}个月</span>
                        </div>
                        <div>
                          <span className="block text-xs">下单时间</span>
                          <span className="font-bold text-foreground">
                            {new Date(order.created_at).toLocaleDateString("zh-CN")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "lookup" && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold border-b border-border pb-4 mb-6 flex items-center">
                <Search className="mr-2" /> 查单找回
              </h2>
              <p className="text-muted-foreground mb-6 text-sm">输入您购买时填写的邮箱或手机号，即可查询已完成的订单并找回节点链接。</p>

              <div className="flex gap-3 mb-6">
                <input
                  type="text"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="请输入邮箱或手机号"
                  className="flex-1 px-4 py-3 rounded-xl border border-input focus:ring-2 focus:ring-client-primary focus:border-transparent outline-none bg-background text-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && lookupEmail.trim()) {
                      handleLookupOrders();
                    }
                  }}
                />
                <button
                  onClick={handleLookupOrders}
                  disabled={lookupLoading || !lookupEmail.trim()}
                  className="bg-client-primary text-client-primary-foreground font-bold px-6 py-3 rounded-xl hover:opacity-90 transition-colors disabled:opacity-50"
                >
                  {lookupLoading ? "查询中..." : "查询"}
                </button>
              </div>

              {lookupError && (
                <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl text-center mb-4">
                  <p className="text-destructive font-bold text-sm">{lookupError}</p>
                </div>
              )}

              {lookupOrders.length > 0 && (
                <div className="space-y-4">
                  {lookupOrders.map((order) => (
                    <div key={order.id} className="border border-border rounded-2xl overflow-hidden bg-muted/30">
                      <div className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <span className="font-bold text-foreground text-lg">{order.plan_name}</span>
                          <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-muted font-medium">
                            {order.order_type === "buy_new" ? "购买开通" : "在线续费"}
                          </span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${order.status === "fulfilled" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
                            {order.status === "fulfilled" ? "已完成" : "已支付"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground mb-3">
                          <div>
                            <span className="block text-xs">金额</span>
                            <span className="font-mono font-bold text-foreground">
                              {order.crypto_amount ? `${order.crypto_amount} ${order.crypto_currency || ""}` : `¥${order.amount}`}
                            </span>
                          </div>
                          <div>
                            <span className="block text-xs">订单号</span>
                            <span className="font-mono font-bold text-foreground text-xs">{order.trade_no || order.id.substring(0, 12)}</span>
                          </div>
                          <div>
                            <span className="block text-xs">时长</span>
                            <span className="font-bold text-foreground">{order.duration_days || order.months * 30}天</span>
                          </div>
                          <div>
                            <span className="block text-xs">下单时间</span>
                            <span className="font-bold text-foreground">{new Date(order.created_at).toLocaleDateString("zh-CN")}</span>
                          </div>
                        </div>

                        {order.status === "fulfilled" && order.uuid && order.uuid !== "游客_未登录" && (() => {
                          const isUuidFormat = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(order.uuid);
                          const isSocks5 = !isUuidFormat;
                          return (
                          <div className="bg-client-primary/10 border border-client-primary/20 p-4 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-client-primary">
                                🔑 {isSocks5 ? "节点凭证 (SOCKS5 用户名)" : "节点凭证 (UUID)"}
                              </span>
                              <div className="flex items-center gap-2">
                                {!isSocks5 && (
                                  <button onClick={() => copyWithFeedback(order.uuid, `order-${order.id}`)} className="text-client-primary hover:opacity-70 flex items-center text-xs font-bold">
                                    {copiedKey === `order-${order.id}` ? <><CheckCircle2 className="w-3 h-3 mr-1 text-success" /> 已复制</> : <><Copy className="w-3 h-3 mr-1" /> 复制</>}
                                  </button>
                                )}
                                <button
                                  onClick={async () => {
                                    setLoginInput(order.uuid);
                                    setUuid(order.uuid);
                                    setError("");
                                    try {
                                      const res = await lookupClient(order.uuid);
                                      if (res?.success) {
                                        setClientData({
                                          expiryDate: res.expiryDate || Date.now() + 30 * 86400000,
                                          trafficUsed: res.trafficUsed ?? 0,
                                          trafficTotal: res.trafficTotal ?? 0,
                                          email: res.email || "",
                                        });
                                        setLogged(true);

                                        if (res.credentials && res.connectionInfo) {
                                          setNewClientCredentials(res.credentials || null);
                                          setNewClientConnectionInfo(res.connectionInfo || null);
                                          setNewClientRemark(res.remark || res.email || "");
                                          setPayStatus("buy_success");
                                          setTab("buy_new");
                                        } else {
                                          setTab("dashboard");
                                        }
                                      } else {
                                        alert("查询失败：" + (res?.error || "未找到"));
                                      }
                                    } catch {
                                      alert("查询失败，请稍后重试");
                                    }
                                  }}
                                  className="bg-client-primary text-client-primary-foreground px-3 py-1 rounded-lg text-xs font-bold hover:opacity-90 transition-colors flex items-center gap-1"
                                >
                                  <ChevronRight className="w-3 h-3" /> {isSocks5 ? "查看完整凭证" : "查看链接"}
                                </button>
                              </div>
                            </div>
                            <code className="block bg-background p-2 rounded border border-border text-sm font-mono break-all">{order.uuid}</code>
                            {isSocks5 && (
                              <p className="text-xs text-muted-foreground mt-2">💡 点击「查看完整凭证」获取地址、端口、用户名和密码</p>
                            )}
                          </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!lookupLoading && lookupOrders.length === 0 && lookupEmail.trim() && !lookupError && (
                <div className="text-center text-muted-foreground py-12 border border-dashed border-border rounded-xl">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-bold mb-1">输入邮箱/手机号后点击查询</p>
                  <p className="text-sm">查找您之前购买时使用的邮箱或手机号</p>
                </div>
              )}
            </div>
          )}

          {tab === "tutorials" && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold border-b border-border pb-4 mb-6 flex items-center">
                <BookOpen className="mr-2" /> 使用教程
              </h2>
              {tutorials.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">暂无教程内容</div>
              ) : (
                <div className="space-y-3">
                  {tutorials.map((t) => (
                    <div key={t.id} className="border border-border rounded-xl overflow-hidden bg-muted/30">
                      <button
                        onClick={() => setExpandedTutorialId(expandedTutorialId === t.id ? null : t.id)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/50 transition-colors"
                      >
                        <span className="font-bold text-foreground">{t.title}</span>
                        <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${expandedTutorialId === t.id ? "rotate-90" : ""}`} />
                      </button>
                      {expandedTutorialId === t.id && (
                        <div className="px-5 pb-5 border-t border-border">
                          <div
                            className="prose prose-sm max-w-none text-foreground mt-3"
                            dangerouslySetInnerHTML={{ __html: fixMobileVideo(t.content) }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
