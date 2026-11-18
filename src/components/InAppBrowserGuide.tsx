import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Copy, ExternalLink, MoreHorizontal } from "lucide-react";

type InAppBrowser = "wechat" | "qq" | null;

function detectInAppBrowser(): InAppBrowser {
  if (typeof navigator === "undefined") return null;
  const userAgent = navigator.userAgent || "";
  if (/MicroMessenger/i.test(userAgent)) return "wechat";
  if (/(?:^|\s)QQ\/[\d.]+/i.test(userAgent)) return "qq";
  return null;
}

export default function InAppBrowserGuide() {
  const [browser, setBrowser] = useState<InAppBrowser>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("in_app_browser_guide_dismissed") === "1") return;
    setBrowser(detectInAppBrowser());
  }, []);

  if (!browser) return null;

  const appName = browser === "wechat" ? "微信" : "QQ";
  const copyUrl = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const dismiss = () => {
    sessionStorage.setItem("in_app_browser_guide_dismissed", "1");
    setBrowser(null);
  };

  return <div className="fixed inset-0 z-[99999] bg-slate-950/95 text-white backdrop-blur-sm overflow-y-auto">
    <div className="absolute right-4 top-3 flex items-start gap-2 text-sky-300 animate-pulse">
      <span className="mt-9 text-sm font-bold whitespace-nowrap">点击右上角</span>
      <ArrowUpRight className="w-12 h-12" strokeWidth={2.5} />
    </div>

    <div className="min-h-full flex items-center justify-center px-5 py-20">
      <div className="w-full max-w-md rounded-3xl border border-sky-400/30 bg-slate-900 p-6 shadow-2xl shadow-sky-950/50">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300">
          <ExternalLink className="h-8 w-8" />
        </div>
        <h2 className="text-center text-2xl font-black">请在外部浏览器打开</h2>
        <p className="mt-3 text-center text-sm leading-6 text-slate-300">当前正在使用{appName}内置浏览器。为保证登录、支付、复制订阅和下载功能正常，请使用系统浏览器访问。</p>

        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500 font-black">1</span>
            <span className="text-sm">点击右上角 <MoreHorizontal className="mx-1 inline h-5 w-5" /> 菜单</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500 font-black">2</span>
            <span className="text-sm">选择“在浏览器打开”或“用默认浏览器打开”</span>
          </div>
        </div>

        <button type="button" onClick={copyUrl} className="mt-5 flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-3.5 font-bold text-white transition hover:bg-sky-400">
          {copied ? <><CheckCircle2 className="mr-2 h-5 w-5" />网址已复制</> : <><Copy className="mr-2 h-5 w-5" />复制当前网址</>}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">复制后可粘贴到 Chrome、Edge、Safari 等浏览器地址栏</p>

        <button type="button" onClick={dismiss} className="mt-5 w-full py-2 text-sm text-slate-400 underline underline-offset-4 hover:text-white">仍要在{appName}内继续访问</button>
      </div>
    </div>
  </div>;
}
