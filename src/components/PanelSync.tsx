import { useState } from "react";
import { adminSyncPanels } from "@/lib/api";

type Panel = { id: string; name: string; enabled: boolean };
type Result = { matched: number; pending: number; unmatched: number; updated: number; failed: number; batchSize: number; revision: string };

export default function PanelSync({ token, panels }: { token: string; panels: Panel[] }) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [result, setResult] = useState<Result>();
  const [previewed, setPreviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = panels.filter(panel => panel.enabled);
  const valid = source !== target && available.some(panel => panel.id === source) &&
    available.some(panel => panel.id === target) && [sourceId, targetId].every(id => /^[1-9]\d*$/.test(id));

  async function run(apply: boolean) {
    if (!valid || busy) return;
    if (apply && (!previewed || !window.confirm("确定将主面板配置写入副面板的匹配客户端吗？"))) return;
    setBusy(true);
    setError("");
    setPreviewed(false);
    setResult(undefined);
    try {
      setResult(await adminSyncPanels(token, {
        source, target, sourceInbound: Number(sourceId), targetInbound: Number(targetId), revision: apply ? result?.revision : undefined,
      }, apply));
      setPreviewed(!apply);
    } catch (error) {
      setError(error instanceof Error ? error.message : "同步请求失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 space-y-4">
      <h2 className="text-xl font-bold">3x-ui 主副面板同步</h2>
      <p className="text-sm text-muted-foreground">主面板 ↓ 副面板。按相同 UUID 匹配，手动同步启用状态、到期时间和流量上限。</p>
      <fieldset disabled={busy} onChange={() => { setPreviewed(false); setResult(undefined); setError(""); }} className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "来源主面板", panel: source, setPanel: setSource, inbound: sourceId, setInbound: setSourceId },
          { label: "目标副面板", panel: target, setPanel: setTarget, inbound: targetId, setInbound: setTargetId },
        ].map(({ label, panel, setPanel, inbound, setInbound }) => (
          <div key={label} className="rounded-xl border p-4 space-y-3">
            <label className="block text-sm font-semibold">{label}
              <select value={panel} onChange={event => setPanel(event.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2">
                <option value="">请选择已启用面板</option>
                {available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">入站 ID
              <input inputMode="numeric" value={inbound} onChange={event => setInbound(event.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2" />
            </label>
          </div>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!valid || busy} onClick={() => void run(false)} className="rounded-lg border px-4 py-2 disabled:opacity-50">预览同步</button>
        <button type="button" disabled={!valid || busy || !previewed || !result?.pending} onClick={() => void run(true)} className="rounded-lg bg-admin-primary px-4 py-2 text-admin-primary-foreground disabled:opacity-50">执行同步</button>
      </div>
      <div aria-live="polite" className="text-sm">
        {busy && "正在处理…"}
        {error && <p className="text-destructive">{error}</p>}
        {result && (
          <p>匹配 {result.matched} 个，主面板独有 {result.unmatched} 个，本轮差异 {result.pending} 个，已更新 {result.updated} 个。
            {result.failed > 0 && "写入异常，已停止本批。请重新预览确认副面板状态。"}
            {result.pending > result.updated && " 每次最多更新 " + result.batchSize + " 个，继续前请重新预览。"}
          </p>
        )}
      </div>
    </section>
  );
}
