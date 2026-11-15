import { useEffect, useState } from "react";
import { BarChart3, Clock3, Eye, Globe2, MonitorSmartphone, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { adminCleanupVisitorAnalytics, adminDeleteVisitorAnalytics, adminGetVisitorAnalytics } from "@/lib/api";
import { toast } from "sonner";

interface VisitRecord {
  id: string;
  ip_address: string | null;
  first_seen_at: string;
  last_seen_at: string;
  duration_seconds: number;
  entry_path: string;
  last_path: string;
  page_views: number;
  referrer: string | null;
  browser: string | null;
  operating_system: string | null;
  device_type: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

const formatDuration = (seconds: number) => {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return `${value}秒`;
  if (value < 3600) return `${Math.floor(value / 60)}分${value % 60}秒`;
  return `${Math.floor(value / 3600)}时${Math.floor((value % 3600) / 60)}分`;
};

const dateTime = (value: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
}).format(new Date(value));

const pageName = (rawPath: string) => {
  const path = (rawPath || "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (path === "/") return "网站落地页";
  if (path === "/portal") return "用户解析登录 / 用户中心";
  if (path === "/3075554556") return "管理员登录";
  if (path === "/3075554556/dashboard") return "管理员后台";
  if (path === "/analytics-deploy-test" || path === "/live-analytics-verification") return "访问统计部署测试";
  return `其他页面（${path}）`;
};

const referrerName = (referrer: string | null) => {
  if (!referrer) return "直接访问";
  try {
    const url = new URL(referrer);
    if (url.hostname === "ip520.top" || url.hostname === "www.ip520.top") return `站内跳转 · ${pageName(url.pathname)}`;
    if (/baidu/i.test(url.hostname)) return "百度搜索";
    if (/google/i.test(url.hostname)) return "Google 搜索";
    if (/bing/i.test(url.hostname)) return "必应搜索";
    return `外部来源 · ${url.hostname}`;
  } catch { return "外部来源"; }
};

export default function VisitorAnalyticsPanel({ token }: { token: string }) {
  const [records, setRecords] = useState<VisitRecord[]>([]);
  const [stats, setStats] = useState({ visits: 0, uniqueVisitors: 0, todayVisits: 0, pageViews: 0, averageDuration: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cleanupRange, setCleanupRange] = useState("90");
  const [cleaning, setCleaning] = useState(false);

  const load = async (targetPage = page) => {
    setLoading(true);
    try {
      const result = await adminGetVisitorAnalytics(token, { page: targetPage, pageSize: 25, days, search: search || undefined });
      setRecords(result.records || []);
      setStats(result.stats || stats);
      setTotal(result.total || 0);
      setPage(targetPage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "访问统计加载失败");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(1); }, [days]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(page); }, 15000);
    return () => window.clearInterval(timer);
  }, [page, days, search]);
  const pages = Math.max(1, Math.ceil(total / 25));
  const cards = [
    ["访问会话", stats.visits, Globe2], ["独立访客 IP", stats.uniqueVisitors, Users], ["今日访问", stats.todayVisits, BarChart3],
    ["页面浏览量", stats.pageViews, Eye], ["平均停留", formatDuration(stats.averageDuration), Clock3],
  ] as const;

  return <div className="space-y-5">
    <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div><h2 className="text-xl font-bold flex items-center"><BarChart3 className="w-5 h-5 mr-2 text-indigo-500" />访问统计</h2><p className="text-sm text-muted-foreground mt-1">数据与停留时间每 15 秒自动刷新；管理员后台访问不会计入统计。</p></div>
        <div className="flex flex-wrap gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border border-input bg-background rounded-lg px-3 py-2 text-sm"><option value={1}>最近 24 小时</option><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option><option value={90}>最近 90 天</option><option value={365}>最近一年</option></select>
          <button onClick={() => void load()} disabled={loading} className="px-3 py-2 rounded-lg bg-indigo-500 text-white text-sm font-bold disabled:opacity-50 flex items-center"><RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />刷新</button>
          <select value={cleanupRange} onChange={(e) => setCleanupRange(e.target.value)} disabled={cleaning} className="border border-destructive/30 bg-background text-destructive rounded-lg px-3 py-2 text-sm disabled:opacity-50"><option value="7">清理 7 天以前</option><option value="30">清理 30 天以前</option><option value="90">清理 90 天以前</option><option value="all">清空全部记录</option></select>
          <button disabled={cleaning} onClick={async () => { const clearAll = cleanupRange === "all"; const label = clearAll ? "全部访问记录" : `${cleanupRange} 天以前的访问记录`; if (!confirm(`确定删除${label}吗？此操作不能恢复。`)) return; setCleaning(true); try { const r = await adminCleanupVisitorAnalytics(token, clearAll ? 90 : Number(cleanupRange), clearAll); toast.success(`已清理 ${r.deleted || 0} 条记录`); await load(1); } catch (e) { toast.error(e instanceof Error ? e.message : "清理失败"); } finally { setCleaning(false); } }} className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-bold flex items-center disabled:opacity-50"><Trash2 className="w-4 h-4 mr-1" />{cleaning ? "清理中…" : "执行清理"}</button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{cards.map(([label, value, Icon]) => <div key={label} className="rounded-xl border border-border bg-muted/40 p-4"><Icon className="w-5 h-5 text-indigo-500 mb-2" /><div className="text-2xl font-black">{value}</div><div className="text-xs text-muted-foreground mt-1">{label}</div></div>)}</div>
    </div>

    <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
      <form onSubmit={(e) => { e.preventDefault(); void load(1); }} className="flex gap-2 mb-4"><div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索 IP 或访问页面" className="w-full border border-input bg-background rounded-lg pl-9 pr-3 py-2 text-sm" /></div><button className="px-4 py-2 rounded-lg bg-secondary font-bold text-sm">查询</button></form>
      <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-3">访客 IP / 地区</th><th className="p-3">访问时间</th><th className="p-3">停留时间</th><th className="p-3">访问页面</th><th className="p-3">来源</th><th className="p-3">设备</th><th className="p-3 text-center">操作</th></tr></thead><tbody>{records.map((r) => <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30 align-top"><td className="p-3"><div className="font-mono font-bold">{r.ip_address || "未知"}</div><div className="text-xs text-muted-foreground mt-1">{[r.country, r.region, r.city].filter(Boolean).join(" · ") || "地区未知"}</div></td><td className="p-3"><div>{dateTime(r.first_seen_at)}</div><div className="text-xs text-muted-foreground mt-1">最后活跃：{dateTime(r.last_seen_at)}</div></td><td className="p-3 font-bold">{formatDuration(r.duration_seconds)}<div className="text-xs text-muted-foreground font-normal mt-1">{r.page_views} 次页面浏览</div></td><td className="p-3"><div className="font-bold">{pageName(r.entry_path)}</div>{r.last_path !== r.entry_path && <div className="text-xs text-muted-foreground mt-1">最后访问：{pageName(r.last_path)}</div>}</td><td className="p-3 max-w-[220px] text-xs">{referrerName(r.referrer)}</td><td className="p-3"><div className="flex items-center"><MonitorSmartphone className="w-4 h-4 mr-1" />{r.device_type || "未知"}</div><div className="text-xs text-muted-foreground mt-1">{[r.operating_system, r.browser].filter(Boolean).join(" · ")}</div></td><td className="p-3 text-center"><button disabled={deletingId === r.id} onClick={async () => { if (!confirm(`确定删除访客 ${r.ip_address || "未知 IP"} 的这条访问记录吗？`)) return; setDeletingId(r.id); try { await adminDeleteVisitorAnalytics(token, r.id); toast.success("访问记录已删除"); const nextPage = records.length === 1 && page > 1 ? page - 1 : page; await load(nextPage); } catch (e) { toast.error(e instanceof Error ? e.message : "删除失败"); } finally { setDeletingId(null); } }} className="inline-flex items-center px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 font-bold text-xs"><Trash2 className="w-4 h-4 mr-1" />{deletingId === r.id ? "删除中" : "删除"}</button></td></tr>)}{!loading && records.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-12">暂无访问记录</td></tr>}</tbody></table></div>
      <div className="flex items-center justify-between mt-4 text-sm"><span className="text-muted-foreground">共 {total} 条，第 {page}/{pages} 页</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => void load(page - 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">上一页</button><button disabled={page >= pages || loading} onClick={() => void load(page + 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">下一页</button></div></div>
    </div>
  </div>;
}
