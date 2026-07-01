import { useEffect, useState } from "react";
import { testPanelConnectionManual, getPanelConnectionHistory, getPanelTestConfig, updatePanelTestConfig, adminListPanels } from "@/lib/api";
import { RefreshCw, Zap, History as HistoryIcon, Settings } from "lucide-react";

interface Panel {
  id: string;
  name: string;
  panel_url: string;
  panel_user: string;
  panel_pass: string;
  is_primary: boolean;
  enabled: boolean;
}

interface ConnectionTest {
  id: string;
  panel_id: string;
  test_time: string;
  success: boolean;
  response_time_ms: number | null;
  error_message: string | null;
  test_trigger: string;
  details: any;
  created_at: string;
}

interface TestConfig {
  id: string;
  panel_id: string;
  enabled: boolean;
  test_interval_minutes: number;
  notify_on_failure: boolean;
  notify_email: string;
  last_test_time: string | null;
  consecutive_failures: number;
}

function fmt(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("zh-CN", { hour12: false });
  } catch { return String(d); }
}

export default function PanelConnectionTestPanel({ token }: { token: string }) {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedPanelId, setSelectedPanelId] = useState<string>("");
  const [testHistory, setTestHistory] = useState<ConnectionTest[]>([]);
  const [testConfig, setTestConfig] = useState<TestConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function loadPanels() {
    try {
      const res = await adminListPanels(token);
      if (res?.panels) {
        setPanels(res.panels);
        if (res.panels.length > 0 && !selectedPanelId) {
          const primary = res.panels.find((p: Panel) => p.is_primary);
          setSelectedPanelId(primary?.id || res.panels[0].id);
        }
      }
    } catch (e: any) {
      setError(e?.message || "加载面板失败");
    }
  }

  async function loadHistory(panelId: string) {
    if (!panelId) return;
    try {
      const res = await getPanelConnectionHistory(panelId);
      if (res?.history) {
        setTestHistory(res.history);
      }
    } catch (e: any) {
      setError(e?.message || "加载历史失败");
    }
  }

  async function loadConfig(panelId: string) {
    if (!panelId) return;
    try {
      const res = await getPanelTestConfig(token, panelId);
      if (res?.config) {
        setTestConfig(res.config);
      }
    } catch (e: any) {
      setError(e?.message || "加载配置失败");
    }
  }

  async function handleTestConnection() {
    if (!selectedPanelId) {
      setError("请选择一个面板");
      return;
    }
    setTesting(true);
    setError("");
    try {
      const res = await testPanelConnectionManual(token, selectedPanelId);
      if (res?.test?.success) {
        setSuccessMsg(`✅ 连接成功（响应时间: ${res.test.responseTime}ms）`);
        setTimeout(() => setSuccessMsg(""), 3000);
      } else {
        setError(`❌ 连接失败: ${res?.test?.error || "未知错误"}`);
      }
      // Reload history
      await loadHistory(selectedPanelId);
    } catch (e: any) {
      setError(e?.message || "测试失败");
    }
    setTesting(false);
  }

  async function handleConfigChange(field: string, value: any) {
    if (!testConfig) return;
    const newConfig = { ...testConfig, [field]: value };
    setTestConfig(newConfig);

    try {
      await updatePanelTestConfig(token, selectedPanelId, {
        [field]: value,
      });
      setSuccessMsg("✅ 配置已保存");
      setTimeout(() => setSuccessMsg(""), 2000);
    } catch (e: any) {
      setError(e?.message || "保存失败");
      // Revert change
      setTestConfig(testConfig);
    }
  }

  useEffect(() => {
    loadPanels();
  }, []);

  useEffect(() => {
    if (selectedPanelId) {
      loadConfig(selectedPanelId);
      loadHistory(selectedPanelId);
    }
  }, [selectedPanelId]);

  return (
    <div className="bg-muted/40 rounded-xl border border-border p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Zap className="w-4 h-4" /> 面板连接检测
        </h3>
      </div>

      {error && <div className="text-xs text-destructive mb-2 p-2 bg-destructive/10 rounded">{error}</div>}
      {successMsg && <div className="text-xs text-emerald-600 mb-2 p-2 bg-emerald-500/10 rounded">{successMsg}</div>}

      {/* Panel selector and test button */}
      <div className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">选择面板</label>
            <select
              value={selectedPanelId}
              onChange={(e) => setSelectedPanelId(e.target.value)}
              className="w-full text-xs border border-border rounded px-2 py-2 bg-background"
            >
              {panels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.is_primary ? "（主面板）" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="w-full text-xs bg-admin-primary hover:bg-admin-primary/90 text-white px-3 py-2 rounded font-medium disabled:opacity-60 flex items-center justify-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${testing ? "animate-spin" : ""}`} />
              {testing ? "测试中..." : "立即测试"}
            </button>
          </div>
        </div>
      </div>

      {/* Config section */}
      <div className="mb-4 pb-4 border-b border-border">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="text-xs flex items-center gap-1 text-admin-primary hover:underline"
        >
          <Settings className="w-3 h-3" />
          {showConfig ? "隐藏配置" : "自动检测配置"}
        </button>
        {showConfig && testConfig && (
          <div className="mt-3 space-y-3 bg-card rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enable-auto-test"
                checked={testConfig.enabled}
                onChange={(e) => handleConfigChange("enabled", e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="enable-auto-test" className="text-xs font-medium">
                启用自动检测
              </label>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                检测间隔（分钟）
              </label>
              <input
                type="number"
                value={testConfig.test_interval_minutes}
                onChange={(e) => handleConfigChange("test_interval_minutes", Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
                max="1440"
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background"
              />
              <p className="text-[10px] text-muted-foreground mt-1">范围: 1 - 1440 分钟（自定义任意分钟数，例如 1 = 每分钟检测一次）</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notify-on-failure"
                checked={testConfig.notify_on_failure}
                onChange={(e) => handleConfigChange("notify_on_failure", e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="notify-on-failure" className="text-xs font-medium">
                连接失败时发送邮件通知
              </label>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                通知邮箱
              </label>
              <input
                type="email"
                value={testConfig.notify_email || ""}
                onChange={(e) => handleConfigChange("notify_email", e.target.value)}
                placeholder="admin@example.com"
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background"
              />
            </div>

            {testConfig.last_test_time && (
              <div className="text-xs text-muted-foreground">
                <p>上次测试: {fmt(testConfig.last_test_time)}</p>
                {testConfig.consecutive_failures > 0 && (
                  <p className="text-destructive font-medium">连续失败次数: {testConfig.consecutive_failures}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* History section */}
      <div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs flex items-center gap-1 text-admin-primary hover:underline"
        >
          <HistoryIcon className="w-3 h-3" />
          {showHistory ? "隐藏连接历史" : `查看连接历史（最近 ${testHistory.length} 次）`}
        </button>
        {showHistory && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 pr-3">#</th>
                  <th className="text-left py-1.5 pr-3">测试时间</th>
                  <th className="text-left py-1.5 pr-3">触发方式</th>
                  <th className="text-left py-1.5 pr-3">响应时间</th>
                  <th className="text-left py-1.5 pr-3">错误信息</th>
                  <th className="text-left py-1.5">状态</th>
                </tr>
              </thead>
              <tbody>
                {testHistory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-3 text-muted-foreground text-center">
                      暂无连接记录
                    </td>
                  </tr>
                )}
                {testHistory.map((test, i) => (
                  <tr key={test.id} className="border-b border-border/60 hover:bg-muted/50">
                    <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-3">{fmt(test.test_time)}</td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          test.test_trigger === "cron"
                            ? "bg-blue-500/15 text-blue-600"
                            : test.test_trigger === "auto"
                            ? "bg-purple-500/15 text-purple-600"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {test.test_trigger === "cron"
                          ? "自动定时"
                          : test.test_trigger === "auto"
                          ? "自动检测"
                          : "手动测试"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      {test.success && test.response_time_ms ? (
                        <span className="text-emerald-600 font-medium">{test.response_time_ms}ms</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      {test.error_message ? (
                        <span className="text-destructive truncate max-w-xs" title={test.error_message}>
                          {test.error_message}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5">
                      {test.success ? (
                        <span className="text-emerald-600 font-bold">✅ 成功</span>
                      ) : (
                        <span className="text-destructive font-bold">❌ 失败</span>
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
  );
}
