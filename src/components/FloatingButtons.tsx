import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FabConfig {
  tawk_id: string;
  qq_qrcode_url: string;
  telegram_link: string;
}

const DEFAULTS: FabConfig = {
  tawk_id: "69c7635168a74a1c3a60f80a/1jkpdntv2",
  qq_qrcode_url: "https://free.picui.cn/free/2026/01/15/6968e65e9a443.png",
  telegram_link: "https://t.me/zhenghongcheng",
};

export default function FloatingButtons() {
  const [cfg, setCfg] = useState<FabConfig>(DEFAULTS);

  useEffect(() => {
    (supabase as any)
      .from("admin_config")
      .select("tawk_id, qq_qrcode_url, telegram_link")
      .limit(1)
      .single()
      .then(({ data }: any) => {
        if (data) {
          setCfg({
            tawk_id: data.tawk_id || DEFAULTS.tawk_id,
            qq_qrcode_url: data.qq_qrcode_url || DEFAULTS.qq_qrcode_url,
            telegram_link: data.telegram_link || DEFAULTS.telegram_link,
          });
        }
      });
  }, []);

  useEffect(() => {
    if (!cfg.tawk_id) return;
    if (!(window as any)._tawkLoaded) {
      (window as any).Tawk_API = (window as any).Tawk_API || {};
      (window as any).Tawk_LoadStart = new Date();
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://embed.tawk.to/${cfg.tawk_id}`;
      s.charset = "UTF-8";
      s.setAttribute("crossorigin", "*");
      document.body.appendChild(s);
      (window as any)._tawkLoaded = true;
    }
  }, [cfg.tawk_id]);

  return (
    <>
      <style>{`
        .g-fab-container { position: fixed; top: 50%; transform: translateY(-50%); right: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 999; }
        .g-fab { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; text-decoration: none; color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s cubic-bezier(0.25,0.8,0.25,1); position: relative; border: none; cursor: pointer; }
        .g-fab svg { width: 28px; height: 28px; fill: currentColor; }
        .g-fab.qq { background-color: #12b7f5; }
        .g-fab.tg { background-color: #24A1DE; }
        .g-fab.chat { background-color: #2b7a3b; }
        .g-fab:hover { transform: scale(1.1); }
        .g-fab-tooltip { position: absolute; right: 70px; top: 50%; background-color: rgba(0,0,0,0.8); color: white; padding: 6px 12px; border-radius: 6px; font-size: 14px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.3s, transform 0.3s; transform: translate(10px, -50%); }
        .g-fab:hover .g-fab-tooltip { opacity: 1; transform: translate(0, -50%); }
        .g-qr-popup { position: absolute; right: 70px; top: 50%; background-color: white; padding: 10px; border-radius: 10px; box-shadow: 0 5px 20px rgba(0,0,0,0.15); opacity: 0; pointer-events: none; transition: all 0.3s cubic-bezier(0.25,0.8,0.25,1); transform: translate(15px, -50%) scale(0.9); transform-origin: right center; display: flex; flex-direction: column; align-items: center; }
        .g-qr-popup img { width: 120px; height: 120px; display: block; border-radius: 4px; border: 1px solid #f0f0f0; }
        .g-qr-popup .qr-text { margin-top: 8px; font-size: 13px; color: #2c3e50; font-weight: bold; white-space: nowrap; }
        .g-fab.qq:hover .g-qr-popup { opacity: 1; transform: translate(0, -50%) scale(1); }
        @media (max-width: 992px) { .g-fab-container { right: 15px; } }
      `}</style>
      <div className="g-fab-container">
        {cfg.tawk_id && (
          <button
            className="g-fab chat"
            onClick={() => {
              const api = (window as any).Tawk_API;
              if (api && typeof api.maximize === "function") api.maximize();
            }}
          >
            <span className="g-fab-tooltip">在线咨询</span>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3c5.5 0 10 3.58 10 8s-4.5 8-10 8c-1.24 0-2.43-.2-3.53-.55C6.15 19.88 3.5 20.5 3.5 20.5s.8-2.3.96-3.41C3.18 15.69 2 13.96 2 11c0-4.42 4.5-8 10-8z" />
            </svg>
          </button>
        )}
        {cfg.qq_qrcode_url && (
          <a href="javascript:void(0);" className="g-fab qq">
            <div className="g-qr-popup">
              <img src={cfg.qq_qrcode_url} alt="QQ客服二维码" />
              <span className="qr-text">扫码添加QQ客服</span>
            </div>
            <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
              <path d="M824.8 613.2c-16-51.4-34.4-94.6-62.7-165.3C766.5 262.2 689.3 112 511.5 112 331.7 112 256.2 265.2 261 447.9c-28.4 70.8-46.7 113.7-62.7 165.3-34 109.5-23 154.8-14.6 155.8 18 2.2 70.1-82.4 70.1-82.4 0 49 25.2 112.9 79.8 159-26.4 8.1-85.7 29.9-71.6 53.8 11.4 19.3 196.2 12.3 249.5 6.3 53.3 6 238.1 13 249.5-6.3 14.1-23.8-45.3-45.7-71.6-53.8 54.6-46.2 79.8-110.1 79.8-159 0 0 52.1 84.6 70.1 82.4 8.5-1.1 19.5-46.4-14.5-155.8z" />
            </svg>
          </a>
        )}
        {cfg.telegram_link && (
          <a href={cfg.telegram_link} className="g-fab tg" target="_blank" rel="noopener noreferrer">
            <span className="g-fab-tooltip">点击Telegram联系</span>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.11.03-1.84 1.18-5.2 3.45-.49.34-.94.5-1.35.49-.45-.01-1.32-.26-1.96-.47-.79-.26-1.42-.39-1.36-.83.03-.22.34-.45.93-.69 3.63-1.58 6.06-2.63 7.28-3.13 3.47-1.43 4.19-1.68 4.66-1.69.1 0 .34.02.49.13.12.1.16.23.18.33.01.07.02.16.02.21z" />
            </svg>
          </a>
        )}
      </div>
    </>
  );
}
