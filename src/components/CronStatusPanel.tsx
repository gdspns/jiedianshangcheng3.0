import { useEffect, useState } from "react";
import { enforceDisabledQuota, getCronStatus } from "@/lib/api";
import { RefreshCw, Clock, History as HistoryIcon, ShieldAlert } from "lucide-react";

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
  "enforce-disabled-quota-every-5min": "强制同步超额关闭（每 5 分钟）",
  "auto-backfill-client-records-daily": "同步 3x 面板客户端（每天）",
};

function fmt(d: string | Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("zh-CN", { hour12: false });
  } catch { return String(d); }
}

// Expand a cron field (supports *, */n, a-b, lists, single values) to allowed values
function expandField(field: string, min: number, max: number): number[] | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepStr] = part.split("/");
    const step = stepStr ? Number(stepStr) : 1;
    if (!step || Number.isNaN(step)) return null;
    let start = min, end = max;
    if (range !== "*") {
      if (range.includes("-")) {
        const [a, b] = range.split("-").map(Number);
        if (Number.isNaN(a) || Number.isNaN(b)) return null;
        start = a; end = b;
      } else {
        const v = Number(range);
        if (Number.isNaN(v)) return null;
        start = v;
        end = stepStr ? max : v;
      }
    }
    for (let v = start; v <= end; v += step) out.add(v);
  }
  const arr = [...out].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
  return arr.length ? arr : null;
}

// Compute next trigger from a cron schedule (pg_cron schedules run in UTC)
function nextRun(schedule: string): Date | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [mF, hF, domF, monF, dowF] = parts;
  const mins = expandField(mF, 0, 59);
  const hours = expandField(hF, 0, 23);
  const doms = expandField(domF, 1, 31);
  const mons = expandField(monF, 1, 12);
  const dows = expandField(dowF === "7" ? "0" : dowF, 0, 6);
  if (!mins || !hours || !doms || !mons || !dows) return null;

  const d = new Date();
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  // search up to ~366 days ahead in minute steps (bounded loop)
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const domOk = doms.includes(d.getUTCDate());
    const dowOk = dows.includes(d.getUTCDay());
    const dayOk = domF === "*" || dowF === "*" ? domOk && dowOk : domOk || dowOk;
    if (
      mins.includes(d.getUTCMinutes()) &&
      hours.includes(d.getUTCHours()) &&
      mons.includes(d.getUTCMonth() + 1) &&
      dayOk
    ) return new Date(d);
    d.setUTCMinutes(d.getUTCMinutes() + 1);
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
  const [enforceQuotaHistory, setEnforceQuotaHistory] = useState<HistoryItem[]>([]);
  const [backfillHistory, setBackfillHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [enforcing, setEnforcing] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [showEnforceQuota, setShowEnforceQuota] = useState(false);
  const [showBackfill, setShowBackfill] = useState(false);
  const [error, setError] = useState("");
  const [enforceResult, setEnforceResult] = useState("");
  const [tick, setTick] = useState(0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res: any = await getCronStatus();
      setJobs(res?.jobs || []);
      setHistory(res?.history || []);
      setEnforceQuotaHistory(res?.enforceQuotaHistory || []);
      setBackfillHistory(res?.backfillHistory || []);
    } catch (e: any) {
      setError(e?.message || "加载失败");
    }
    setLoading(false);
  }

  async function runEnforceQuota() {
    if (enforcing) return;
    setEnforcing(true);
    setError("");
    setEnforceResult("");
    try {
      const res: any = await enforceDisabledQuota();
      setEnforceResult(`已检查 ${res?.checked ?? 0} 个客户端，同步保存 ${res?.enforced ?? 0} 个，失败 ${res?.failed ?? 0} 个`);
      await load();
    } catch (e: any) {
      setError(e?.message || "强制同步失败");
    }
    setEnforcing(false);
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
      {enforceResult && <div className="text-xs text-emerald-600 mb-2">{enforceResult}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {jobs.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground">暂无定时任务</div>
        )}
        {jobs.filter((j) => j.name !== "auto-fulfill-every-minute").map((j) => {
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
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <div className="text-sm font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                强制同步超额关闭
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                扫描所有 3x 面板，发现已用流量 ≥ 总流量的客户端后保存 inbound，让 Xray 立即应用关闭状态。
              </div>
            </div>
            <button
              onClick={runEnforceQuota}
              disabled={enforcing}
              className="px-3 py-2 rounded-lg bg-amber-500/15 text-amber-700 text-xs font-bold hover:bg-amber-500/25 disabled:opacity-60 flex items-center gap-1 justify-center">
              <RefreshCw className={`w-3 h-3 ${enforcing ? "animate-spin" : ""}`} />
              {enforcing ? "同步中..." : "立即同步关闭"}
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowEnforceQuota((v) => !v)}
          className="text-xs flex items-center gap-1 text-admin-primary hover:underline mb-3">
          <HistoryIcon className="w-3 h-3" />
          {showEnforceQuota ? "隐藏超额关闭历史" : "查看超额关闭历史（最近 20 次）"}
        </button>
        {showEnforceQuota && (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 pr-3">#</th>
                  <th className="text-left py-1.5 pr-3">执行时间</th>
                  <th className="text-left py-1.5 pr-3">触发</th>
                  <th className="text-left py-1.5 pr-3">检查</th>
                  <th className="text-left py-1.5 pr-3">同步保存</th>
                  <th className="text-left py-1.5 pr-3">跳过</th>
                  <th className="text-left py-1.5 pr-3">失败</th>
                  <th className="text-left py-1.5">状态</th>
                </tr>
              </thead>
              <tbody>
                {enforceQuotaHistory.length === 0 && (
                  <tr><td colSpan={8} className="py-3 text-muted-foreground text-center">暂无执行记录</td></tr>
                )}
                {enforceQuotaHistory.map((h, i) => (
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
                      <span className={`font-bold ${(h.reset ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {h.reset ?? 0}
                      </span>
                    </td>
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
