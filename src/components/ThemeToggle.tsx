import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      return saved ? saved === "dark" : true; // default dark
    }
    return true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  // Initialize on mount
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved ? saved === "dark" : true;
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  return (
    <button
      onClick={() => setDark(!dark)}
      className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
      style={{
        background: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)",
        color: dark ? "#fbbf24" : "#6366f1",
        border: "none",
        cursor: "pointer",
        fontSize: "1.3rem",
      }}
      title={dark ? "切换亮色模式" : "切换暗黑模式"}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
