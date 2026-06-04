import { useEffect, useState } from "react";
import { getCronStatus } from "@/lib/api";
import { RefreshCw, Clock, History as HistoryIcon } from "lucide-react";

type Job = {
  name: string;
  schedule: string;
  active: boolean;
  running: boolean;
  lastRun: string | null;
  lastEnd: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
};

type HistoryItem = {
  startTime: string;
  endTime: string | null;
  status: string;
  message: string;
  checked?: number;
  reset?: number;
  skipped?: number;
  failed?: number;
  source?: string;
};

const NICE_NAME: Record<string, string> = {
  "auto-reset-traffic-hourly": "自动重置流量（每小时整点）",
  "auto-backfill-client-records-daily": "同步 3x 面板客户端（每天）",
  "auto-fulfill-every-minute": "订单自动发货（每分钟）",
};

function fmt(d: string | Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("zh-CN", { hour12: false });
  } catch { return String(d); }
}

// Compute next trigger from a simple cron schedule
function nextRun(schedule: string): Date | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h] = parts;
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  if (m === "*" && h === "*") {
    // every minute
    next.setMinutes(now.getMinutes() + 1);
    return next;
  }
  if (m === "0" && h === "*") {
    // hourly at minute 0
    next.setMinutes(0);
    next.setHours(now.getHours() + 1);
    return next;
  }
  if (/^\d+$/.test(m) && /^\d+$/.test(h)) {
    // daily at HH:MM (UTC in pg_cron)
    const target = new Date();
    target.setUTCHours(Number(h), Number(m), 0, 0);
    if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
    return target;
  }
  return null;
}

function countdown(d: Date | null): string {
  if (!d) return "—";
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return "即将执行";
  const s = Math.floor(diff / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}小时 ${m}分钟后`;
  if (m > 0) return `${m}分钟 ${sec}秒后`;
  return `${sec}秒后`;
}

export default function CronStatusPanel() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [backfillHistory, setBackfillHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [showBackfill, setShowBackfill] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res: any = await getCronStatus();
      setJobs(res?.jobs || []);
      setHistory(res?.history || []);
      setBackfillHistory(res?.backfillHistory || []);
    } catch (e: any) {
      setError(e?.message || "加载失败");
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    const refresh = setInterval(() => load(), 30000);
    return () => { clearInterval(id); clearInterval(refresh); };
  }, []);

  return (
    <div className="bg-muted/40 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Clock className="w-4 h-4" /> 定时任务实时状态
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-admin-primary hover:underline flex items-center gap-1 disabled:opacity-60">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {error && <div className="text-xs text-destructive mb-2">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {jobs.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground">暂无定时任务</div>
        )}
        {jobs.map((j) => {
          const next = nextRun(j.schedule);
          const isOk = j.lastStatus === "succeeded";
          return (
            <div key={j.name} className="bg-card border border-border rounded-lg p-3 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="font-bold text-sm">{NICE_NAME[j.name] || j.name}</div>
                <div className="flex items-center gap-2">
                  {j.running ? (
                    <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 font-bold">⏳ 执行中</span>
                  ) : j.active ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 font-bold">● 运行中</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-destructive/15 text-destructive font-bold">○ 已停用</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-y-1 text-muted-foreground">
                <div>调度规则：<code className="text-foreground">{j.schedule}</code></div>
                <div>
                  下次触发：<span className="text-foreground">{fmt(next)}</span>
                  <span className="ml-1 text-admin-primary">({countdown(next)})</span>
                  <span className="hidden">{tick}</span>
                </div>
                <div>上次执行：<span className="text-foreground">{fmt(j.lastRun)}</span></div>
                <div>
                  上次结果：
                  {j.lastStatus ? (
                    <span className={isOk ? "text-emerald-600 font-bold" : "text-destructive font-bold"}>
                      {isOk ? "✅ 成功" : `❌ ${j.lastStatus}`}
                    </span>
                  ) : <span className="text-foreground">尚无记录</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={() => setShowHist((v) => !v)}
          className="text-xs flex items-center gap-1 text-admin-primary hover:underline">
          <HistoryIcon className="w-3 h-3" />
          {showHist ? "隐藏执行历史" : "查看执行历史（最近 20 次「立即执行检查」）"}
        </button>
        {showHist && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 pr-3">#</th>
                  <th className="text-left py-1.5 pr-3">执行时间</th>
                  <th className="text-left py-1.5 pr-3">触发</th>
                  <th className="text-left py-1.5 pr-3">检查</th>
                  <th className="text-left py-1.5 pr-3">重置</th>
                  <th className="text-left py-1.5 pr-3">跳过</th>
                  <th className="text-left py-1.5 pr-3">失败</th>
                  <th className="text-left py-1.5">状态</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr><td colSpan={8} className="py-3 text-muted-foreground text-center">暂无执行记录</td></tr>
                )}
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-3">{fmt(h.startTime)}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${h.source === "cron" ? "bg-blue-500/15 text-blue-600" : "bg-muted text-foreground"}`}>
                        {h.source === "cron" ? "自动" : "手动"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">{h.checked ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`font-bold ${(h.reset ?? 0) > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {h.reset ?? 0}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{h.skipped ?? 0}</td>
                    <td className="py-1.5 pr-3">
                      <span className={(h.failed ?? 0) > 0 ? "text-destructive font-bold" : "text-muted-foreground"}>{h.failed ?? 0}</span>
                    </td>
                    <td className="py-1.5">
                      {h.status === "succeeded" ? (
                        <span className="text-emerald-600 font-bold">✅</span>
                      ) : (
                        <span className="text-destructive font-bold">❌</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border">
          <button
            onClick={() => setShowBackfill((v) => !v)}
            className="text-xs flex items-center gap-1 text-admin-primary hover:underline">
            <HistoryIcon className="w-3 h-3" />
            {showBackfill ? "隐藏同步历史" : "查看同步历史（最近 20 次「同步历史客户记录」）"}
          </button>
          {showBackfill && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5 pr-3">#</th>
                    <th className="text-left py-1.5 pr-3">同步时间</th>
                    <th className="text-left py-1.5 pr-3">触发</th>
                    <th className="text-left py-1.5 pr-3">新增客户端</th>
                    <th className="text-left py-1.5 pr-3">总客户端</th>
                    <th className="text-left py-1.5 pr-3">已存在</th>
                    <th className="text-left py-1.5 pr-3">失败</th>
                    <th className="text-left py-1.5">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {backfillHistory.length === 0 && (
                    <tr><td colSpan={8} className="py-3 text-muted-foreground text-center">暂无同步记录</td></tr>
                  )}
                  {backfillHistory.map((h, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 pr-3">{fmt(h.startTime)}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${h.source === "cron" ? "bg-blue-500/15 text-blue-600" : "bg-muted text-foreground"}`}>
                          {h.source === "cron" ? "自动" : "手动"}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className={`font-bold ${(h.reset ?? 0) > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                          +{h.reset ?? 0}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 font-bold text-foreground">{h.checked ?? 0}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{h.skipped ?? 0}</td>
                      <td className="py-1.5 pr-3">
                        <span className={(h.failed ?? 0) > 0 ? "text-destructive font-bold" : "text-muted-foreground"}>{h.failed ?? 0}</span>
                      </td>
                      <td className="py-1.5">
                        {(h.failed ?? 0) === 0 ? (
                          <span className="text-emerald-600 font-bold">✅</span>
                        ) : (
                          <span className="text-destructive font-bold">⚠️</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
