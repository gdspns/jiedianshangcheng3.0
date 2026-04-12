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

export default function LandingPage() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [landingImages, setLandingImages] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [faqs, setFaqs] = useState<{ q: string; a: string }[]>([]);

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

    // Load articles for FAQ section
    (supabase as any)
      .from("articles")
      .select("title, content")
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
      .then(({ data }: any) => {
        if (data && data.length > 0) {
          setFaqs(data.map((a: any) => ({ q: a.title, a: a.content })));
        } else {
          // Fallback hardcoded FAQs if no articles exist yet
          setFaqs(defaultFaqs);
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
        .lp-seo-section { padding: 60px 5%; background-color: var(--lp-bg); max-width: 1000px; margin: 0 auto; }
        .lp-seo-title { text-align: center; font-size: 1.8rem; margin-bottom: 30px; color: var(--lp-text-dark); }
        .lp-faq-item { background: white; border-radius: 10px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow: hidden; border: 1px solid #e2e8f0; }
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
        .lp-footer { text-align: center; padding: 40px 20px; background-color: #1a202c; color: #a0aec0; }
        .dark .lp-footer { background-color: #010409; color: #8b949e; }
        @media (max-width: 992px) {
          .lp-features-grid { grid-template-columns: repeat(2, 1fr); }
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
        </section>

        {/* Footer */}
        <footer className="lp-footer">
          <p>© 2024-2026 静态住址服务提供商. 版权所有.</p>
          <p style={{ marginTop: "10px", fontSize: "0.85rem", color: "#718096" }}>合规经营，符合国家网络安全规范 | 专业解决 AI 降智、防跨境电商限流</p>
        </footer>

      </div>
    </>
  );
}
