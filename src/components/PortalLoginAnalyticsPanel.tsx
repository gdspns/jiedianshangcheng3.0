import { useEffect, useState } from "react";
import { KeyRound, RefreshCw, Search, Trash2 } from "lucide-react";
import { adminCleanupPortalLoginEvents, adminDeletePortalLoginEvent, adminGetPortalLoginEvents } from "@/lib/api";
import { toast } from "sonner";

interface LoginEvent {
  id: string;
  user_identifier: string;
  client_remark: string | null;
  inbound_id: number | null;
  inbound_remark: string | null;
  login_method: string;
  ip_address: string | null;
  browser: string | null;
  operating_system: string | null;
  device_type: string | null;
  logged_in_at: string;
}

const dateTime = (value: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
}).format(new Date(value));

export default function PortalLoginAnalyticsPanel({ token }: { token: string }) {
  const [records, setRecords] = useState<LoginEvent[]>([]);
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
      const result = await adminGetPortalLoginEvents(token, { page: targetPage, pageSize: 25, days, search: search || undefined });
      setRecords(result.records || []);
      setTotal(result.total || 0);
      setPage(targetPage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录记录加载失败");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(1); }, [days]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(page); }, 15000);
    return () => window.clearInterval(timer);
  }, [page, days, search]);

  const pages = Math.max(1, Math.ceil(total / 25));
  return <div className="space-y-5">
    <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div><h2 className="text-xl font-bold flex items-center"><KeyRound className="w-5 h-5 mr-2 text-emerald-500" />解析登录用户</h2><p className="text-sm text-muted-foreground mt-1">记录用户使用订阅链接或 UUID 成功解析登录的时间；数据每 15 秒自动刷新。</p></div>
        <div className="flex flex-wrap gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border border-input bg-background rounded-lg px-3 py-2 text-sm"><option value={1}>最近 24 小时</option><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option><option value={90}>最近 90 天</option><option value={365}>最近一年</option></select>
          <button onClick={() => void load()} disabled={loading} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 flex items-center"><RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />刷新</button>
          <select value={cleanupRange} onChange={(e) => setCleanupRange(e.target.value)} disabled={cleaning} className="border border-destructive/30 bg-background text-destructive rounded-lg px-3 py-2 text-sm disabled:opacity-50"><option value="7">清理 7 天以前</option><option value="30">清理 30 天以前</option><option value="90">清理 90 天以前</option><option value="all">清空全部记录</option></select>
          <button disabled={cleaning} onClick={async () => { const clearAll = cleanupRange === "all"; const label = clearAll ? "全部解析登录记录" : `${cleanupRange} 天以前的解析登录记录`; if (!confirm(`确定删除${label}吗？此操作不能恢复。`)) return; setCleaning(true); try { const result = await adminCleanupPortalLoginEvents(token, clearAll ? 90 : Number(cleanupRange), clearAll); toast.success(`已清理 ${result.deleted || 0} 条记录`); await load(1); } catch (error) { toast.error(error instanceof Error ? error.message : "清理失败"); } finally { setCleaning(false); } }} className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-bold flex items-center disabled:opacity-50"><Trash2 className="w-4 h-4 mr-1" />{cleaning ? "清理中…" : "执行清理"}</button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-muted/40 p-4 inline-block min-w-40"><div className="text-2xl font-black">{total}</div><div className="text-xs text-muted-foreground mt-1">所选时段登录次数</div></div>
    </div>

    <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
      <form onSubmit={(e) => { e.preventDefault(); void load(1); }} className="flex gap-2 mb-4"><div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索用户备注、UUID、入站或 IP" className="w-full border border-input bg-background rounded-lg pl-9 pr-3 py-2 text-sm" /></div><button className="px-4 py-2 rounded-lg bg-secondary font-bold text-sm">查询</button></form>
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-3">用户</th><th className="p-3">UUID / 标识符</th><th className="p-3">入站</th><th className="p-3">登录方式</th><th className="p-3">登录 IP</th><th className="p-3">设备</th><th className="p-3">登录时间</th><th className="p-3 text-center">操作</th></tr></thead><tbody>
        {records.map((record) => <tr key={record.id} className="border-b border-border/60 hover:bg-muted/30 align-top"><td className="p-3 font-bold">{record.client_remark || "未设置备注"}</td><td className="p-3 font-mono text-xs break-all max-w-[240px]">{record.user_identifier}</td><td className="p-3"><div>{record.inbound_remark || "未命名入站"}</div><div className="text-xs text-muted-foreground mt-1">ID：{record.inbound_id ?? "-"}</div></td><td className="p-3">{record.login_method === "subscription" ? "订阅链接" : "UUID"}</td><td className="p-3 font-mono">{record.ip_address || "未知"}</td><td className="p-3"><div>{record.device_type || "未知"}</div><div className="text-xs text-muted-foreground mt-1">{[record.operating_system, record.browser].filter(Boolean).join(" · ")}</div></td><td className="p-3 whitespace-nowrap">{dateTime(record.logged_in_at)}</td><td className="p-3 text-center"><button disabled={deletingId === record.id} onClick={async () => { if (!confirm(`确定删除用户 ${record.client_remark || record.user_identifier} 的这条登录记录吗？`)) return; setDeletingId(record.id); try { await adminDeletePortalLoginEvent(token, record.id); toast.success("解析登录记录已删除"); await load(records.length === 1 && page > 1 ? page - 1 : page); } catch (error) { toast.error(error instanceof Error ? error.message : "删除失败"); } finally { setDeletingId(null); } }} className="inline-flex items-center px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 font-bold text-xs"><Trash2 className="w-4 h-4 mr-1" />{deletingId === record.id ? "删除中" : "删除"}</button></td></tr>)}
        {!loading && records.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-12">暂无解析登录记录</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between mt-4 text-sm"><span className="text-muted-foreground">共 {total} 条，第 {page}/{pages} 页</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => void load(page - 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">上一页</button><button disabled={page >= pages || loading} onClick={() => void load(page + 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">下一页</button></div></div>
    </div>
  </div>;
}
