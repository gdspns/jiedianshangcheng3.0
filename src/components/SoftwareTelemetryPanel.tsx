import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Link2, RefreshCw, Trash2, Users } from "lucide-react";
import { adminDeleteSoftwareSubscriptionLog, adminGetSoftwareTelemetry } from "@/lib/api";

type OnlineUser = {
  id: string;
  user_identifier: string;
  user_remark: string;
  app_version: string;
  ip_address: string;
  current_node: string;
  online: boolean;
  first_seen: string;
  last_seen: string;
};

type SubscriptionLog = {
  id: string;
  subscription_url: string;
  subscription_label: string;
  user_identifier: string;
  ip_address: string;
  first_seen: string;
};

const localTime = (value: string) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";

export default function SoftwareTelemetryPanel({ token }: { token: string }) {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [logs, setLogs] = useState<SubscriptionLog[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false, includeLogs = true) => {
    if (!quiet) setLoading(true);
    try {
      const data = await adminGetSoftwareTelemetry(token, includeLogs);
      setUsers(data.users || []);
      if (Array.isArray(data.subscriptionLogs)) setLogs(data.subscriptionLogs);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取软件使用记录失败");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true, false), 5_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const onlineCount = useMemo(() => users.filter((user) => user.online).length, [users]);
  const usersPerPage = 10;
  const userPages = Math.max(1, Math.ceil(users.length / usersPerPage));
  const visibleUsers = useMemo(() => users.slice((userPage - 1) * usersPerPage, userPage * usersPerPage), [users, userPage]);
  useEffect(() => setUserPage((page) => Math.min(page, userPages)), [userPages]);
  const removeLog = async (id: string) => {
    if (!window.confirm("确定删除这条第三方订阅记录吗？")) return;
    await adminDeleteSoftwareSubscriptionLog(token, id);
    setLogs((current) => current.filter((item) => item.id !== id));
  };

  return (
    <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="p-6 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2"><Activity className="w-5 h-5" />软件使用情况</h3>
          <p className="text-sm text-muted-foreground mt-1">在线状态每 5 秒自动刷新；超过 90 秒没有心跳会显示离线。</p>
        </div>
        <button type="button" onClick={() => load()} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />刷新数据
        </button>
      </div>

      {error && <div className="mx-6 mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6">
        <div className="rounded-xl border border-border p-4"><div className="text-sm text-muted-foreground">当前在线</div><div className="text-2xl font-bold mt-1 text-green-500">{onlineCount}</div></div>
        <div className="rounded-xl border border-border p-4"><div className="text-sm text-muted-foreground">登录过的软件用户</div><div className="text-2xl font-bold mt-1">{users.length}</div></div>
        <div className="rounded-xl border border-border p-4"><div className="text-sm text-muted-foreground">不重复订阅链接</div><div className="text-2xl font-bold mt-1">{logs.length}</div></div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 px-6 pb-6">
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 font-semibold flex items-center gap-2"><Users className="w-4 h-4" />软件用户在线状态</div>
          <div className="max-h-[430px] overflow-auto divide-y divide-border">
            {!users.length && <div className="p-6 text-center text-muted-foreground">还没有软件用户记录</div>}
            {visibleUsers.map((user) => (
              <div key={user.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="font-medium truncate">{user.user_remark || "未设置备注"}</div><div className="text-xs text-muted-foreground break-all">{user.user_identifier}</div></div>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-xs ${user.online ? "text-green-500" : "text-muted-foreground"}`}><span className={`w-2 h-2 rounded-full ${user.online ? "bg-green-500" : "bg-muted-foreground/50"}`} />{user.online ? "在线" : "离线"}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>IP：{user.ip_address || "-"}</span><span>版本：{user.app_version || "-"}</span>
                  <span className="col-span-2 truncate" title={user.current_node}>当前节点：{user.current_node || "未连接"}</span>
                  <span className="col-span-2">最后活跃：{localTime(user.last_seen)}</span>
                </div>
              </div>
            ))}
          </div>
          {users.length > usersPerPage && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">每页 10 条，共 {users.length} 条</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setUserPage((page) => Math.max(1, page - 1))} disabled={userPage === 1} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40">上一页</button>
                <span>{userPage} / {userPages}</span>
                <button type="button" onClick={() => setUserPage((page) => Math.min(userPages, page + 1))} disabled={userPage === userPages} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40">下一页</button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 font-semibold flex items-center gap-2"><Link2 className="w-4 h-4" />第三方订阅日志</div>
          <div className="max-h-[430px] overflow-auto divide-y divide-border">
            {!logs.length && <div className="p-6 text-center text-muted-foreground">还没有第三方订阅记录</div>}
            {logs.map((item) => (
              <div key={item.id} className="p-4 flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-medium">{item.subscription_label || "未命名订阅"}</div>
                  <div className="text-xs text-primary break-all" title={item.subscription_url}>{item.subscription_url}</div>
                  <div className="text-xs text-muted-foreground break-all">用户：{item.user_identifier || "未登录"} · IP：{item.ip_address || "-"}</div>
                  <div className="text-xs text-muted-foreground">首次记录：{localTime(item.first_seen)}</div>
                </div>
                <button type="button" onClick={() => removeLog(item.id)} className="shrink-0 p-2 rounded-lg text-destructive hover:bg-destructive/10" title="删除记录"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
