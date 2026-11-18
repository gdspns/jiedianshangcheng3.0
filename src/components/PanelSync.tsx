import { useEffect, useState } from "react";
import { adminApplyPanelMirror, adminGetPanelMirrorSchedule, adminPreviewPanelMirror, adminSavePanelMirrorSchedule } from "@/lib/api";

type Panel = { id: string; name: string; enabled: boolean };
export default function PanelSync({ token, panels }: { token: string; panels: Panel[] }) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mirror, setMirror] = useState<{ sourceCount: number; targetCount: number; create: string[]; update: string[]; remove: string[]; outboundsDiffer: boolean; routingDiffers: boolean; revision: string }>();
  const [allowDelete, setAllowDelete] = useState(false);
  const [mirrorDone, setMirrorDone] = useState<{ created: number; updated: number; removed: number; xrayUpdated: boolean }>();
  const [autoSync, setAutoSync] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState("");
  const [lastRun, setLastRun] = useState("");
  const available = panels.filter(panel => panel.enabled);
  const selected = source !== target && available.some(panel => panel.id === source) &&
    available.some(panel => panel.id === target);

  useEffect(() => {
    void adminGetPanelMirrorSchedule(token).then(({ settings }) => {
      if (!settings) return;
      setAutoSync(settings.enabled === true);
      setSource(settings.source_panel_id || "");
      setTarget(settings.target_panel_id || "");
      setAllowDelete(settings.allow_delete === true);
      setScheduleStatus(settings.last_status || "");
      setLastRun(settings.last_run_at || "");
    }).catch(() => {});
  }, [token]);

  async function previewMirror() {
    setBusy(true);
    setError("");
    setMirror(undefined);
    try {
      setMirror(await adminPreviewPanelMirror(token, source, target));
    } catch (error) {
      setError(error instanceof Error ? error.message : "整面板预览失败");
    } finally {
      setBusy(false);
    }
  }

  async function applyMirror() {
    if (!mirror || busy || (mirror.remove.length > 0 && !allowDelete)) return;
    if (!window.confirm(`确定用主面板完整覆盖副面板吗？将新增 ${mirror.create.length}、更新 ${mirror.update.length}、删除 ${mirror.remove.length} 条入站，并同步出站和路由规则。`)) return;
    setBusy(true); setError(""); setMirrorDone(undefined);
    try {
      setMirrorDone(await adminApplyPanelMirror(token, source, target, mirror.revision, allowDelete));
      setMirror(undefined);
    } catch (error) { setError(error instanceof Error ? error.message : "整面板同步失败"); }
    finally { setBusy(false); }
  }

  async function saveSchedule(enabled: boolean) {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      await adminSavePanelMirrorSchedule(token, { enabled, source, target, allowDelete });
      setAutoSync(enabled);
      setScheduleStatus(enabled ? "等待定时同步" : "自动同步已关闭");
    } catch (error) { setError(error instanceof Error ? error.message : "自动同步设置保存失败"); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 space-y-4">
      <h2 className="text-xl font-bold">3x-ui 主副面板同步</h2>
      <p className="text-sm text-muted-foreground">主面板 ↓ 副面板。无需填写入站 ID，可完整同步全部入站、客户端、出站和路由规则；副面板登录地址与账号不会改变。</p>
      <fieldset disabled={busy} onChange={() => { setMirror(undefined); setMirrorDone(undefined); setAllowDelete(false); setError(""); }} className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "来源主面板", panel: source, setPanel: setSource },
          { label: "目标副面板", panel: target, setPanel: setTarget },
        ].map(({ label, panel, setPanel }) => (
          <div key={label} className="rounded-xl border p-4 space-y-3">
            <label className="block text-sm font-semibold">{label}
              <select value={panel} onChange={event => setPanel(event.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2">
                <option value="">请选择已启用面板</option>
                {available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
        ))}
      </fieldset>
      <div className="rounded-xl border p-4 space-y-2">
        <label className="flex items-center gap-3 font-semibold">
          <input type="checkbox" checked={autoSync} disabled={!selected || busy} onChange={event => void saveSchedule(event.target.checked)} />
          每 5 分钟自动同步主面板到副面板
        </label>
        <p className="text-xs text-muted-foreground">开启后无需停留在后台页面。自动同步会新增、更新客户端与入站，并同步出站和路由；删除仍受“允许删除”设置控制。</p>
        {scheduleStatus && <p className="text-sm">状态：{scheduleStatus}{lastRun ? `（最近运行 ${new Date(lastRun).toLocaleString()}）` : ""}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!selected || busy} onClick={() => void previewMirror()} className="rounded-lg border px-4 py-2 disabled:opacity-50">预览整面板差异</button>
        <button type="button" disabled={!mirror || busy || (mirror.remove.length > 0 && !allowDelete)} onClick={() => void applyMirror()} className="rounded-lg bg-admin-primary px-4 py-2 text-admin-primary-foreground disabled:opacity-50">执行整面板同步</button>
      </div>
      <div aria-live="polite" className="text-sm">
        {busy && "正在处理…"}
        {error && <p className="text-destructive">{error}</p>}
        {mirror && (
          <div className="space-y-1">
            <p>主面板 {mirror.sourceCount} 条入站，副面板 {mirror.targetCount} 条入站。</p>
            <p>主面板独有 {mirror.create.length} 条，配置有差异 {mirror.update.length} 条，副面板独有 {mirror.remove.length} 条。</p>
            {mirror.remove.length > 0 && <p>副面板独有的协议和端口 {mirror.remove.join("、")}</p>}
            {mirror.remove.length > 0 && <label className="flex items-center gap-2 text-destructive"><input type="checkbox" checked={allowDelete} onChange={event => setAllowDelete(event.target.checked)} />允许首次同步删除上述副面板独有入站</label>}
            <p>出站{mirror.outboundsDiffer ? "有差异" : "一致"}，路由规则{mirror.routingDiffers ? "有差异" : "一致"}。</p>
          </div>
        )}
        {mirrorDone && <p className="text-emerald-600">整面板同步完成：新增 {mirrorDone.created}、更新 {mirrorDone.updated}、删除 {mirrorDone.removed} 条入站，出站与路由{mirrorDone.xrayUpdated ? "已更新" : "原本一致"}。</p>}
      </div>
    </section>
  );
}
