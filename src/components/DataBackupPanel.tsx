import { ChangeEvent, useRef, useState } from "react";
import { DatabaseBackup, Download, Loader2, ShieldAlert, Upload } from "lucide-react";
import { exportAdminSettings, restoreAdminSettings } from "@/lib/api";

const BACKUP_KIND = "jiedianshangcheng-admin-settings";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function downloadJson(data: unknown, prefix = "admin-settings-backup") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function DataBackupPanel({ token }: { token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleBackup() {
    setBusy("backup");
    setError("");
    setMessage("");
    try {
      const result = await exportAdminSettings(token);
      if (!result?.backup) throw new Error(result?.error || "服务器未返回备份数据");
      downloadJson(result.backup);
      setMessage("备份文件已下载，请妥善保管");
    } catch (error: unknown) {
      setError(errorMessage(error, "备份失败"));
    } finally {
      setBusy(null);
    }
  }

  async function handleRestoreFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setMessage("");
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.meta?.kind !== BACKUP_KIND || !backup?.data) {
        throw new Error("这不是有效的后台设置备份文件");
      }
      const createdAt = backup.meta.createdAt
        ? new Date(backup.meta.createdAt).toLocaleString("zh-CN", { hour12: false })
        : "未知时间";
      if (!window.confirm(`确定恢复 ${createdAt} 创建的备份吗？\n\n当前后台设置将被覆盖。恢复前系统会自动下载一份当前设置的安全备份。`)) return;

      setBusy("restore");
      const current = await exportAdminSettings(token);
      if (!current?.backup) throw new Error("无法创建恢复前安全备份，已取消恢复");
      downloadJson(current.backup, "before-restore-admin-settings");

      const result = await restoreAdminSettings(token, backup);
      if (!result?.success) throw new Error(result?.error || "恢复失败");
      setMessage("设置已恢复，页面即将刷新");
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error: unknown) {
      setError(error instanceof SyntaxError ? "备份文件不是有效的 JSON 文件" : errorMessage(error, "恢复失败"));
      setBusy(null);
    }
  }

  return (
    <div className="bg-muted/40 rounded-xl border border-border p-4 mt-4 h-[calc(100%-1rem)]">
      <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
        <DatabaseBackup className="w-4 h-4" /> 数据备份与恢复
      </h3>

      <p className="text-xs text-muted-foreground leading-5 mb-4">
        备份管理员后台的系统配置、面板、套餐、地区、入口绑定、教程公告、流量规则和检测配置。
      </p>

      {error && <div className="text-xs text-destructive mb-3 p-2 bg-destructive/10 rounded">{error}</div>}
      {message && <div className="text-xs text-emerald-600 mb-3 p-2 bg-emerald-500/10 rounded">✅ {message}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleBackup}
          disabled={busy !== null}
          className="text-xs bg-admin-primary hover:bg-admin-primary/90 text-white px-3 py-2.5 rounded font-medium disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy === "backup" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {busy === "backup" ? "正在备份..." : "下载设置备份"}
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-2.5 rounded font-medium disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy === "restore" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {busy === "restore" ? "正在恢复..." : "选择备份并恢复"}
        </button>
        <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleRestoreFile} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <span>备份含面板账号、支付密钥等敏感信息，请勿分享。恢复不会覆盖管理员登录密码，也不包含订单、客户记录和运行日志。</span>
      </div>
    </div>
  );
}
