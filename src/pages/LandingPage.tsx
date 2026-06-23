import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import ThemeToggle from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";

function parseLandingImages(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return [raw];
}

const defaultFaqs = [
  { q: "什么是静态住宅IP？为什么它能解决AI降智？", a: `<p><strong>静态住宅IP</strong>是由真实的互联网服务提供商(ISP)分配给家庭用户的固定IP地址。与机房IP相比，它具有极高的真人属性和信誉度。</p><p>当我们用来访问Gemini、Claude等对环境要求极其严格的AI大模型时，静态住宅IP能够有效避免被风控系统判定为"机器人"或"高风险连接"，从而彻底解决因为IP滥用导致的<strong>AI降智</strong>、回答敷衍、无法登录、频繁跳出人机验证码等问题。</p>` },
  { q: "做跨境视频电商（如TikTok），不用住宅IP会怎样？", a: `<p>主流短视频平台对访问者IP的"真人属性"要求极为苛刻。使用普通机房代理IP会导致<strong>隐形限流</strong>和<strong>"0播放"</strong>。</p>` },
  { q: "为什么 ChatGPT Plus 充值总是失败或被封号？", a: `<p>使用被滥用的机房IP会触发 Stripe 风控。使用静态住宅IP可大幅提升支付成功率。</p>` },
];

const seoTopics = [
  { title: "Claude 3.5 Sonnet 网页端无法打开解决办法", answer: "Claude 网页端打不开，常见原因是访问地区、IP 信誉、浏览器环境和 DNS 解析同时触发风控。建议使用稳定的静态住宅 IP，保持账号登录地区、系统时区、浏览器语言和支付地区一致，避免频繁切换节点。" },
  { title: "Claude App Unavailable 地区限制无缝突破", answer: "Claude App 提示 Unavailable 通常说明当前网络出口不在服务支持区域，或者 IP 被识别为机房、代理、共享出口。使用独享住宅网络并固定地区后，能显著降低地区限制、反复验证和登录失败的问题。" },
  { title: "为什么 Claude 封号率极高？独享住宅 IP 养号攻略", answer: "Claude 对账号登录环境、IP 关联和异常请求很敏感。养号阶段应避免多人共用同一出口，优先使用独享静态住宅 IP，并保持设备指纹、Cookie、时区和登录地区长期稳定。" },
  { title: "Claude Code CLI 命令行代理超时 Timeout 排查", answer: "Claude Code CLI 超时多半与终端代理未生效、DNS 走错线路、代理协议不兼容有关。建议检查 HTTP_PROXY、HTTPS_PROXY、ALL_PROXY 环境变量，并使用低延迟住宅网络或专线中转减少连接中断。" },
  { title: "终端执行 Claude 报错 Network Error 深度解析", answer: "Network Error 不一定是账号问题，更多时候是本地终端没有继承代理、TLS 握手失败或出口 IP 被目标平台拒绝。固定原生住宅 IP、关闭冲突代理规则、统一终端和浏览器出口，可以提升命令行访问稳定性。" },
  { title: "ChatGPT Plus 订阅防风控：拒绝机房 IP 连坐", answer: "ChatGPT Plus 订阅失败或付款后异常，常见原因是机房 IP 被多人滥用导致连坐。使用高信誉静态住宅 IP，并让账单地区、登录地区和支付环境一致，可以降低支付风控和账号异常概率。" },
  { title: "如何检测 ChatGPT IP 是否被降智 2026 最新", answer: "如果 ChatGPT 回答明显变短、模型能力异常、频繁验证码或服务不可用，可能和 IP 信誉有关。可以通过固定出口对比响应质量、检查是否触发 Access Denied、观察 Plus 功能是否完整来判断网络环境是否被降权。" },
  { title: "OpenAI API 调用频繁超时？海外原生中转提速实测", answer: "OpenAI API 超时通常来自跨境链路抖动、DNS 污染、出口拥塞或代理节点质量不稳定。使用海外原生住宅出口搭配 BGP 中转专线，可以减少握手失败、请求超时和高并发掉线。" },
  { title: "ChatGPT 客户端 Access Denied 1020 完美解决", answer: "Access Denied 1020 是典型的风控拦截提示，通常与 IP 风险、请求指纹和访问频率有关。更换纯净住宅 IP、清理异常 Cookie、保持浏览器环境一致，通常比反复换免费节点更有效。" },
  { title: "Cursor 代码补全失败？全局代理配置避坑指南", answer: "Cursor 补全失败可能是应用没有走系统代理，也可能是终端、Git、插件分别走了不同出口。建议统一系统代理和终端代理，使用稳定住宅网络，避免代码助手请求在不同 IP 间来回切换。" },
  { title: "Gemini Advanced 提示当前地区不可用解决办法", answer: "Gemini Advanced 对地区、账号和网络环境要求较高，机房代理很容易被识别为异常访问。固定支持地区的住宅 IP，并同步浏览器语言、Google 账号地区和支付环境，可以降低不可用提示。" },
  { title: "Gemini API 请求失败：地区封锁与 IP 隔离应对", answer: "Gemini API 请求失败常见于地区不支持、出口 IP 风险或项目调用环境混乱。建议为生产项目单独配置独享住宅出口，避免多个账号、多个项目共用同一高风险 IP。" },
  { title: "避免 Gemini 降智的顶级原生 IP 选择逻辑", answer: "选择 Gemini 网络环境时，优先看 IP 是否为真实 ISP、是否长期稳定、是否多人共享、是否频繁更换归属地。顶级原生住宅 IP 的核心价值是降低平台对自动化、代理、批量请求的误判。" },
  { title: "GitHub Copilot 连接不稳定、一直转圈的底层原因", answer: "Copilot 一直转圈通常与 IDE 内置请求、系统代理和终端代理不一致有关，也可能是出口链路到 GitHub 服务不稳定。使用固定低延迟住宅出口，并检查 IDE 代理设置，可以减少补全中断。" },
  { title: "MAC / Ubuntu 终端全局代理 Proxy 设置无效的坑", answer: "macOS 和 Ubuntu 的图形应用、终端、后台服务不一定共享同一代理环境。需要分别检查 shell 配置、系统代理、应用启动方式和环境变量，确保 AI CLI 工具真正走到指定住宅出口。" },
  { title: "TikTok 矩阵运营：如何利用大马 / 美国 ISP 伪装环境", answer: "TikTok 矩阵运营最怕账号环境漂移和 IP 归属异常。使用马来西亚、美国等目标市场 ISP 住宅网络，配合固定设备、固定时区、固定语言，可以降低零播放和异常登录风险。" },
  { title: "Facebook 跨境电商账号零播放封号原理解析", answer: "Facebook 账号风控会综合判断 IP、设备、登录行为和广告操作频率。机房 IP、多人共享出口、频繁跨地区登录都容易触发限制，独享住宅 IP 更适合长期账号运营和广告账户养护。" },
  { title: "Instagram Reels 跨境账号限流与住宅网络环境搭建", answer: "Instagram Reels 限流往往不是单一内容问题，账号网络环境也会影响推荐权重。建议用目标国家住宅 IP 登录、发布和互动，保持账号定位清晰，避免短时间跨地区切换。" },
  { title: "YouTube Shorts 海外矩阵发布需要原生住宅 IP 吗", answer: "YouTube Shorts 矩阵发布需要稳定的账号环境和清晰地区信号。原生住宅 IP 能帮助账号保持目标市场属性，减少异常验证、推荐错区和后台登录风险。" },
  { title: "X Twitter 账号频繁验证与登录风控解决方案", answer: "X / Twitter 频繁验证通常与 IP 信誉、设备指纹和登录行为异常有关。固定住宅出口、减少批量操作、保持 Cookie 和浏览器环境稳定，是降低风控的基础。" },
  { title: "Reddit 账号养号发帖需要纯净住宅 IP 的原因", answer: "Reddit 对新号、批量发帖和异常 IP 非常敏感。纯净住宅 IP 能减少代理特征，让账号更接近真实用户环境，适合长期养号、社区互动和跨境内容发布。" },
  { title: "Pinterest 跨境引流账号异常登录风控排查", answer: "Pinterest 异常登录多与账号地区、IP 归属和设备环境不一致有关。使用目标市场住宅网络，并保持登录设备固定，可以提升跨境引流账号的稳定性。" },
  { title: "Shopify 店铺后台登录触发风控的网络环境优化", answer: "Shopify 后台涉及支付、订单和店铺安全，登录环境异常容易触发验证。建议店铺运营团队使用固定住宅 IP 或企业专线出口，避免多人多地随意登录后台。" },
  { title: "Amazon / Etsy / eBay 跨境店铺登录 IP 隔离方案", answer: "跨境店铺平台最怕账号关联，同一 IP 登录多个店铺可能增加关联风险。通过账号独立住宅 IP、浏览器环境隔离和固定登录习惯，可以降低店铺风控与关联概率。" },
  { title: "WhatsApp Business 海外账号注册与长期在线环境", answer: "WhatsApp Business 注册和长期在线需要稳定的号码、设备和网络环境。使用目标地区住宅 IP，避免频繁切换代理和设备，有利于减少封号和二次验证。" },
  { title: "Telegram 批量账号运营如何避免 IP 关联", answer: "Telegram 批量账号如果共用同一出口，很容易形成 IP 关联。建议按账号分组使用独立住宅出口，并控制登录频率、设备指纹和操作节奏。" },
  { title: "Discord 社群运营账号风控与住宅代理选择", answer: "Discord 社群运营涉及多账号、机器人和频道管理时，网络环境稳定性很重要。选择低延迟住宅 IP，避免高风险机房代理，可以减少登录验证和账号锁定。" },
  { title: "Midjourney / Poe / Perplexity 访问受限的网络解决办法", answer: "Midjourney、Poe、Perplexity 等 AI 平台常根据 IP 地区和风险等级限制访问。使用支持地区的静态住宅 IP，并保持浏览器会话稳定，能降低不可用、转圈和验证码问题。" },
  { title: "AI 自动化脚本请求被墙？BGP 中转专线配置实例", answer: "AI 自动化脚本对连接稳定性要求更高，普通代理容易在高并发下超时。BGP 中转专线配合海外住宅出口，可以改善跨境链路质量，让 API、CLI 和浏览器自动化更稳定。" },
  { title: "跨境自媒体 SP 平台账号冷启动网络环境搭建指南", answer: "跨境自媒体 SP 平台冷启动时，应先固定账号地区、设备环境和住宅网络出口。稳定的纯净住宅 IP 能帮助平台识别账号为真实本地用户，减少冷启动限流、登录验证和异常封禁。" },
];

export default function LandingPage() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [landingImages, setLandingImages] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [faqs, setFaqs] = useState<{ q: string; a: string }[]>(defaultFaqs);
  const [activeSeoTopic, setActiveSeoTopic] = useState<(typeof seoTopics)[number] | null>(null);

  useEffect(() => {
    (supabase as any)
      .from("admin_config")
      .select("landing_image")
      .limit(1)
      .single()
      .then(({ data }: any) => {
        if (data?.landing_image) {
          setLandingImages(parseLandingImages(data.landing_image));
        }
      });

    (supabase as any)
      .from("articles")
      .select("title, content, sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
      .then(({ data }: any) => {
        if (data && data.length > 0) {
          const filtered = data.filter((a: any) => a.title?.trim() && !a.title.startsWith("__"));
          if (filtered.length > 0) setFaqs(filtered.map((a: any) => ({ q: a.title, a: a.content })));
        }
      });
  }, []);

  // Auto-rotate carousel
  useEffect(() => {
    if (landingImages.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % landingImages.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [landingImages.length]);

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const closeSeoTopic = () => setActiveSeoTopic(null);

  return (
    <>
      <style>{`
        .landing-page {
          --lp-primary: #34d058;
          --lp-primary-hover: #2ea44f;
          --lp-bg: #f4f7f6;
          --lp-text-dark: #2c3e50;
          --lp-text-gray: #546e7a;
          --lp-card-bg: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
          background-color: var(--lp-bg);
          color: var(--lp-text-dark);
          line-height: 1.6;
          overflow-x: hidden;
        }
        .dark .landing-page {
          --lp-primary: #3fb950;
          --lp-primary-hover: #2ea043;
          --lp-bg: #0d1117;
          --lp-text-dark: #e6edf3;
          --lp-text-gray: #8b949e;
          --lp-card-bg: #161b22;
        }
        .landing-page * { margin: 0; padding: 0; box-sizing: border-box; }
        .lp-header { background-color: var(--lp-card-bg); box-shadow: 0 2px 10px rgba(0,0,0,0.05); padding: 15px 5%; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
        .dark .lp-header { box-shadow: 0 2px 10px rgba(0,0,0,0.3); border-bottom: 1px solid #21262d; }
        .lp-logo { font-size: 1.5rem; font-weight: 800; color: var(--lp-primary); text-decoration: none; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .lp-logo-icon { width: 32px; height: 32px; background-color: var(--lp-primary); color: white; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 18px; }
        .dark .lp-logo-icon { color: #0d1117; }
        .lp-header-center { position: absolute; left: 50%; transform: translateX(-50%); }
        .lp-header-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .lp-nav-link { display: inline-block; padding: 12px 30px; background-color: var(--lp-primary); color: white; text-decoration: none; border-radius: 30px; font-size: 1.3rem; font-weight: 700; box-shadow: 0 4px 12px rgba(43,122,59,0.3); transition: all 0.3s ease; white-space: nowrap; }
        .dark .lp-nav-link { color: #0d1117; box-shadow: 0 4px 20px rgba(63,185,80,0.3); }
        .lp-nav-link:hover { background-color: var(--lp-primary-hover); transform: translateY(-2px); box-shadow: 0 6px 16px rgba(43,122,59,0.4); }
        .lp-hero { display: flex; align-items: center; justify-content: space-between; padding: 80px 5%; max-width: 1400px; margin: 0 auto; gap: 50px; }
        .lp-hero-content { flex: 1; max-width: 600px; }
        .lp-tagline { display: inline-block; background-color: rgba(43,122,59,0.1); color: var(--lp-primary); padding: 6px 16px; border-radius: 20px; font-size: 0.9rem; font-weight: 600; margin-bottom: 20px; }
        .dark .lp-tagline { background-color: rgba(63,185,80,0.15); }
        .lp-hero h1 { font-size: 3rem; line-height: 1.2; margin-bottom: 24px; color: var(--lp-text-dark); }
        .lp-hero h1 span { color: #e53e3e; }
        .dark .lp-hero h1 span { color: #f85149; }
        .lp-hero p { font-size: 1.15rem; color: var(--lp-text-gray); margin-bottom: 15px; }
        .lp-hero-features { list-style: none; margin: 25px 0; padding: 0; }
        .lp-hero-features li { position: relative; padding-left: 30px; margin-bottom: 12px; font-size: 1.05rem; color: var(--lp-text-dark); }
        .lp-hero-features li::before { content: '✓'; position: absolute; left: 0; top: 0; color: var(--lp-primary); font-weight: bold; font-size: 1.2rem; }
        .lp-hero-image { flex: 1; text-align: right; }
        .lp-hero-image img { max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); border: 8px solid white; transform: rotate(2deg); transition: transform 0.3s ease; }
        .dark .lp-hero-image img { border-color: #21262d; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .lp-hero-image img:hover { transform: rotate(0deg) scale(1.02); }
        .lp-supported { text-align: center; padding: 40px 5%; background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
        .dark .lp-supported { background: #161b22; border-color: #21262d; }
        .lp-supported h2 { font-size: 1.1rem; color: #718096; font-weight: 600; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
        .dark .lp-supported h2 { color: #8b949e; }
        .lp-model-tags { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; }
        .lp-model-tag { background: white; padding: 10px 25px; border-radius: 30px; font-weight: bold; color: #4a5568; box-shadow: 0 2px 10px rgba(0,0,0,0.05); font-size: 1.1rem; }
        .dark .lp-model-tag { background: #21262d; color: #c9d1d9; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
        .lp-features-section { background-color: white; padding: 80px 5%; }
        .dark .lp-features-section { background-color: #0d1117; }
        .lp-section-title { text-align: center; font-size: 2.2rem; margin-bottom: 50px; color: var(--lp-text-dark); }
        .lp-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; max-width: 1200px; margin: 0 auto; }
        .lp-feature-card { background: var(--lp-bg); padding: 40px 30px; border-radius: 16px; text-align: center; transition: transform 0.3s ease, box-shadow 0.3s ease; border: 1px solid #e2e8f0; }
        .dark .lp-feature-card { background: #161b22; border-color: #21262d; }
        .lp-feature-card:hover { transform: translateY(-10px); box-shadow: 0 15px 30px rgba(0,0,0,0.08); background: white; border-color: var(--lp-primary); }
        .dark .lp-feature-card:hover { background: #1c2128; box-shadow: 0 15px 30px rgba(0,0,0,0.3); }
        .lp-feature-icon { width: 70px; height: 70px; background-color: rgba(43,122,59,0.1); color: var(--lp-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        .dark .lp-feature-icon { background-color: rgba(63,185,80,0.15); }
        .lp-feature-icon svg { width: 35px; height: 35px; }
        .lp-feature-card h3 { font-size: 1.4rem; margin-bottom: 15px; color: var(--lp-text-dark); }
        .lp-feature-card p { color: var(--lp-text-gray); font-size: 1rem; }
        .lp-seo-section { padding: 60px 5%; background-color: var(--lp-bg); max-width: 1200px; margin: 0 auto; }
        .lp-seo-title { text-align: center; font-size: 1.8rem; margin-bottom: 30px; color: var(--lp-text-dark); }
        .lp-faq-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px; align-items: start; }
        .lp-faq-item { background: white; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow: hidden; border: 1px solid #e2e8f0; }
        .dark .lp-faq-item { background: #161b22; border-color: #21262d; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
        .lp-faq-question { padding: 20px; font-size: 1.1rem; font-weight: 600; color: var(--lp-text-dark); cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.3s; }
        .lp-faq-question:hover { background-color: #f8fafc; }
        .dark .lp-faq-question:hover { background-color: #1c2128; }
        .lp-faq-icon { width: 20px; height: 20px; transition: transform 0.3s ease; fill: var(--lp-text-gray); }
        .lp-faq-item.active .lp-faq-icon { transform: rotate(180deg); fill: var(--lp-primary); }
        .lp-faq-answer { max-height: 0; overflow: hidden; transition: max-height 0.4s ease-out; background-color: white; }
        .dark .lp-faq-answer { background-color: #161b22; }
        .lp-faq-answer-inner { padding: 0 20px 20px; color: var(--lp-text-gray); line-height: 1.7; font-size: 1rem; border-top: 1px dashed #e2e8f0; margin-top: 10px; padding-top: 15px; }
        .dark .lp-faq-answer-inner { border-top-color: #21262d; }
        .lp-faq-answer-inner p { margin-bottom: 10px; }
        .lp-faq-item.active .lp-faq-answer { max-height: 500px; }
        .lp-seo-topics-section { background: #0b1220; padding: 28px 5% 34px; }
        .lp-seo-topics-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 56px; row-gap: 18px; max-width: 1450px; margin: 0 auto; }
        .lp-seo-topic-title { display: flex; align-items: flex-start; gap: 10px; width: 100%; color: #c7d7ee; font-size: 1rem; line-height: 1.45; background: transparent; border: 0; padding: 0; text-align: left; cursor: pointer; font-family: inherit; }
        .lp-seo-topic-title:hover { color: #ffffff; }
        .lp-seo-topic-title svg { width: 15px; height: 15px; margin-top: 3px; flex-shrink: 0; color: #94a3b8; }
        .lp-seo-topic-modal-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(3, 7, 18, 0.72); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .lp-seo-topic-modal { position: relative; width: min(760px, 100%); max-height: min(80vh, 680px); overflow-y: auto; background: #ffffff; color: #1f2937; border-radius: 12px; box-shadow: 0 24px 70px rgba(0,0,0,0.35); padding: 34px 36px 30px; border: 1px solid rgba(148,163,184,0.3); }
        .dark .lp-seo-topic-modal { background: #161b22; color: #e6edf3; border-color: #30363d; }
        .lp-seo-topic-modal h3 { font-size: 1.35rem; line-height: 1.35; margin: 0 36px 16px 0; color: var(--lp-text-dark); }
        .lp-seo-topic-modal p { color: var(--lp-text-gray); font-size: 1rem; line-height: 1.8; }
        .lp-seo-topic-modal-close { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; border-radius: 50%; border: 1px solid #e2e8f0; background: #f8fafc; color: #475569; cursor: pointer; font-size: 22px; line-height: 1; display: flex; align-items: center; justify-content: center; }
        .lp-seo-topic-modal-close:hover { background: #eef2f7; color: #111827; }
        .dark .lp-seo-topic-modal-close { background: #21262d; border-color: #30363d; color: #c9d1d9; }
        .dark .lp-seo-topic-modal-close:hover { background: #30363d; color: #ffffff; }
        .lp-footer { text-align: center; padding: 40px 20px; background-color: #1a202c; color: #a0aec0; }
        .dark .lp-footer { background-color: #010409; color: #8b949e; }
        @media (max-width: 992px) {
          .lp-features-grid { grid-template-columns: repeat(2, 1fr); }
          .lp-seo-topics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; }
          .lp-hero { flex-direction: column-reverse; text-align: center; padding: 40px 5%; }
          .lp-hero-content { max-width: 100%; }
          .lp-hero-features { text-align: left; display: inline-block; }
          .lp-hero h1 { font-size: 2.5rem; }
          .lp-hero-image { margin-bottom: 30px; }
          .lp-hero-image img { transform: rotate(0); }
          .lp-fab-container { right: 15px; }
        }
        @media (max-width: 768px) {
          .lp-features-grid { grid-template-columns: 1fr; }
          .lp-faq-grid { grid-template-columns: 1fr; }
          .lp-seo-topics-grid { grid-template-columns: 1fr; row-gap: 14px; }
          .lp-seo-topic-modal { padding: 28px 22px 24px; }
          .lp-seo-topic-modal h3 { font-size: 1.15rem; }
          .lp-hero h1 { font-size: 2rem; }
          .lp-header { flex-wrap: nowrap; justify-content: space-between; gap: 8px; padding: 10px 3%; }
          .lp-header-center { position: static; transform: none; }
          .lp-logo { font-size: 1.1rem; }
          .lp-logo-icon { width: 28px; height: 28px; font-size: 14px; }
          .lp-nav-link { font-size: 0.9rem; padding: 8px 16px; }
        }
      `}</style>

      <div className="landing-page">
        {/* Header */}
        <header className="lp-header">
          <a href="#" className="lp-logo">
            <div className="lp-logo-icon">IP</div>
            静态住宅服务
          </a>
          <div className="lp-header-center">
            <Link to="/portal" className="lp-nav-link">
              充值与续费
            </Link>
          </div>
          <div className="lp-header-right">
            <ThemeToggle />
          </div>
        </header>

        {/* Hero */}
        <section className="lp-hero">
          <div className="lp-hero-content">
            <span className="lp-tagline">专业解锁 AI 与 跨境出海 满血模式</span>
            <h1>专业解决 AI 降智<br />拒绝限流与 <span>"人工智障"</span>！</h1>
            <p>专门解决 <strong>Gemini、Claude、Cursor</strong> 等 AI 大模型回答降级封号问题，以及 <strong>TikTok、YouTube</strong> 等跨境视频电商 <strong>限流、0播放</strong> 难题。</p>
            <ul className="lp-hero-features">
              <li>完美解锁AI满血模式，解决验证码频繁跳出</li>
              <li>防平台风控，彻底告别跨境电商IP变动风险</li>
              <li>原生真实物理节点，保障账号高权重与推流</li>
            </ul>
          </div>
          <div className="lp-hero-image" style={{ position: "relative", overflow: "hidden" }}>
            {landingImages.length > 0 ? (
              landingImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt="企业级静态住宅IP，专业解决AI降智、Claude封号、跨境短视频限流问题"
                  style={{
                    position: idx === 0 ? "relative" : "absolute",
                    top: 0, left: 0, width: "100%",
                    opacity: currentSlide === idx ? 1 : 0,
                    transition: "opacity 0.8s ease-in-out",
                  }}
                />
              ))
            ) : null}
            {landingImages.length > 1 && (
              <>
                {/* Left arrow */}
                <button
                  onClick={() => setCurrentSlide((prev) => (prev - 1 + landingImages.length) % landingImages.length)}
                  style={{
                    position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)",
                    width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 20, fontWeight: "bold",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 10, transition: "background 0.2s", backdropFilter: "blur(4px)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.7)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.45)")}
                  aria-label="上一张"
                >‹</button>
                {/* Right arrow */}
                <button
                  onClick={() => setCurrentSlide((prev) => (prev + 1) % landingImages.length)}
                  style={{
                    position: "absolute", top: "50%", right: 12, transform: "translateY(-50%)",
                    width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 20, fontWeight: "bold",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 10, transition: "background 0.2s", backdropFilter: "blur(4px)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.7)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.45)")}
                  aria-label="下一张"
                >›</button>
                {/* Dots */}
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
                  {landingImages.map((_, idx) => (
                    <button key={idx} onClick={() => setCurrentSlide(idx)}
                      style={{
                        width: 10, height: 10, borderRadius: "50%", border: "none", cursor: "pointer",
                        background: currentSlide === idx ? "var(--lp-primary)" : "rgba(128,128,128,0.4)",
                        transition: "background 0.3s",
                      }} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Supported Models */}
        <section className="lp-supported">
          <h2>完美支持主流 AI 大模型与跨境内容平台</h2>
          <div className="lp-model-tags">
            <div className="lp-model-tag" style={{ color: "#4285f4" }}>✨ Gemini</div>
            <div className="lp-model-tag" style={{ color: "#d97757" }}>🤖 Claude</div>
            <div className="lp-model-tag" style={{ color: "#111" }}>💻 Cursor</div>
            <div className="lp-model-tag" style={{ color: "#000" }}>🎵 TikTok</div>
            <div className="lp-model-tag" style={{ color: "#FF0000" }}>▶️ YouTube</div>
          </div>
        </section>

        {/* Features */}
        <section className="lp-features-section" id="features">
          <h2 className="lp-section-title">为什么选择我们的企业级网络？</h2>
          <div className="lp-features-grid">
            <div className="lp-feature-card">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </div>
              <h3>静态住址 (固定不变)</h3>
              <p>为您提供绝对固定的原生IP，完美适用于企业系统对接、远程办公环境，彻底解决动态IP带来的风控封号危机。</p>
            </div>
            <div className="lp-feature-card">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <h3>AI 企业级纯净环境</h3>
              <p>从源头保证资源干净、低风控。专为需要高信誉网络环境的合规业务量身打造，告别各类人机验证（CAPTCHA）。</p>
            </div>
            <div className="lp-feature-card">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              </div>
              <h3>跨境视频防限流</h3>
              <p>专为 TikTok、YouTube 等平台打造。规避普通机房IP造成的视频"0播放"、直播卡顿等问题，保障账号高权重正常推流。</p>
            </div>
            <div className="lp-feature-card">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              </div>
              <h3>合法合规经营</h3>
              <p>服务由正规合法备案企业提供，完全符合国家各项网络安全规范。保障您的企业级业务稳定、长效、安心运营。</p>
            </div>
            <div className="lp-feature-card">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              </div>
              <h3>极速响应与高并发</h3>
              <p>采用企业级高速路由专线直连，超低延迟。完美支持多线程并发 API 请求与高清视频矩阵推流，晚高峰依然稳如泰山。</p>
            </div>
            <div className="lp-feature-card">
              <div className="lp-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
              </div>
              <h3>7×24 技术专家支持</h3>
              <p>提供全天候 1v1 专属售后服务。无论是底层环境配置、路由分流，还是突发风控问题，我们的工程师团队随时为您保驾护航。</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-seo-section">
          <h2 className="lp-seo-title">关于静态住宅IP与AI降智、跨境出海的常见疑问</h2>
          <div className="lp-faq-grid">
            {faqs.map((faq, i) => (
              <div key={i} className={`lp-faq-item ${activeFaq === i ? "active" : ""}`}>
                <div className="lp-faq-question" onClick={() => toggleFaq(i)}>
                  {faq.q}
                  <svg className="lp-faq-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" /></svg>
                </div>
                <div className="lp-faq-answer">
                  <div className="lp-faq-answer-inner" dangerouslySetInnerHTML={{ __html: faq.a.includes('<') ? faq.a : faq.a.replace(/\n/g, '<br/>') }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SEO Topics */}
        <section className="lp-seo-topics-section" aria-label="静态住宅IP与跨境AI平台网络问题专题">
          <div className="lp-seo-topics-grid">
            {seoTopics.map((topic, i) => (
              <button key={i} type="button" className="lp-seo-topic-title" onClick={() => setActiveSeoTopic(topic)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M8 13h8" />
                  <path d="M8 17h6" />
                </svg>
                <span>{topic.title}</span>
              </button>
            ))}
          </div>
        </section>

        {activeSeoTopic && (
          <div className="lp-seo-topic-modal-backdrop" onClick={closeSeoTopic}>
            <div className="lp-seo-topic-modal" role="dialog" aria-modal="true" aria-labelledby="seo-topic-title" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="lp-seo-topic-modal-close" onClick={closeSeoTopic} aria-label="关闭">×</button>
              <h3 id="seo-topic-title">{activeSeoTopic.title}</h3>
              <p>{activeSeoTopic.answer}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="lp-footer">
          <p>© 2024-2026 静态住址服务提供商. 版权所有.</p>
          <p style={{ marginTop: "10px", fontSize: "0.85rem", color: "#718096" }}>合规经营，符合国家网络安全规范 | 专业解决 AI 降智、防跨境电商限流</p>
        </footer>

      </div>
    </>
  );
}
