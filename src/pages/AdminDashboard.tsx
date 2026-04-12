import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Server, QrCode, Bitcoin, CheckCircle2, Plus, Trash2, Package, ClipboardList, Search, ChevronLeft, ChevronRight, ShoppingCart, CreditCard, MapPin, ChevronDown, BookOpen, FileText } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getAdminConfig, saveAdminConfig, testPanelConnection, adminGetPlans, adminCreatePlan, adminUpdatePlan, adminDeletePlan, adminGetOrders, adminDeleteOrder, adminBatchDeleteOrders, adminGetRegions, adminCreateRegion, adminUpdateRegion, adminDeleteRegion, adminAssignPlanRegion, adminUnassignPlanRegion, adminChangePassword, adminGetTutorials, adminCreateTutorial, adminUpdateTutorial, adminDeleteTutorial, adminGetArticles, adminCreateArticle, adminUpdateArticle, adminDeleteArticle } from "@/lib/api";
import TutorialContentEditor from "@/components/TutorialContentEditor";

interface Tutorial {
  id: string;
  title: string;
  content: string;
  sort_order: number;
  enabled: boolean;
}

interface Article {
  id: string;
  title: string;
  content: string;
  sort_order: number;
  enabled: boolean;
}

interface AdminConfigData {
  panelUrl: string;
  panelUser: string;
  panelPass: string;
  priceMonth: number;
  priceQuarter: number;
  priceYear: number;
  priceExclusiveMonth: number;
  priceExclusiveQuarter: number;
  priceExclusiveYear: number;
  priceSharedMonth: number;
  priceSharedQuarter: number;
  priceSharedYear: number;
  hupiWechatAppId: string;
  hupiWechatAppSecret: string;
  hupiAlipayAppId: string;
  hupiAlipayAppSecret: string;
  hupiWechat: boolean;
  hupiAlipay: boolean;
  cryptoAddress: string;
  cryptoKey: string;
  cryptoUsdt: boolean;
  cryptoTrx: boolean;
  tawkId: string;
  qqQrcodeUrl: string;
  telegramLink: string;
  videoEmbed: string;
  landingImage: string;
  resendApiKey: string;
  notifyEmail: string;
  salesInboundId: number;
  salesProtocol: string;
  notifyStockOut: boolean;
}

interface Plan {
  id: string;
  title: string;
  category: string;
  duration_months: number;
  duration_days: number;
  price: number;
  description: string;
  sort_order: number;
  featured: boolean;
  enabled: boolean;
  region_id?: string | null;
}

interface Region {
  id: string;
  name: string;
  inbound_id: number;
  protocol: string;
  sort_order: number;
  enabled: boolean;
  max_clients: number;
  current_clients: number;
}

interface Order {
  id: string;
  uuid: string;
  plan_name: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  email: string | null;
  crypto_amount: number | null;
  crypto_currency: string | null;
  tx_hash: string | null;
  months: number;
  duration_days?: number;
  order_type?: string;
  remark?: string;
  inbound_remark?: string;
  client_remark?: string;
}

const defaultConfig: AdminConfigData = {
  panelUrl: "http://127.0.0.1:2053",
  panelUser: "admin",
  panelPass: "",
  priceMonth: 15,
  priceQuarter: 40,
  priceYear: 150,
  priceExclusiveMonth: 25,
  priceExclusiveQuarter: 65,
  priceExclusiveYear: 240,
  priceSharedMonth: 15,
  priceSharedQuarter: 40,
  priceSharedYear: 150,
  hupiWechatAppId: "",
  hupiWechatAppSecret: "",
  hupiAlipayAppId: "",
  hupiAlipayAppSecret: "",
  hupiWechat: true,
  hupiAlipay: true,
  cryptoAddress: "",
  cryptoKey: "",
  cryptoUsdt: true,
  cryptoTrx: true,
  tawkId: "",
  qqQrcodeUrl: "",
  telegramLink: "",
  videoEmbed: "",
  landingImage: "",
  resendApiKey: "",
  notifyEmail: "",
  salesInboundId: 1,
  salesProtocol: "mixed",
  notifyStockOut: false,
};

export default function AdminDashboard() {
  const [config, setConfig] = useState<AdminConfigData>(defaultConfig);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [planRegions, setPlanRegions] = useState<{ plan_id: string; region_id: string }[]>([]);
  const [saveStatus, setSaveStatus] = useState("");
  const [btnStatus, setBtnStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersStatus, setOrdersStatus] = useState("all");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [assignRegionId, setAssignRegionId] = useState<string | null>(null);
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(new Set());
  const [expandedRegionIds, setExpandedRegionIds] = useState<Set<string>>(new Set());
  const [regionSearch, setRegionSearch] = useState("");
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const navigate = useNavigate();
  const token = sessionStorage.getItem("admin_token") || "";

  useEffect(() => {
    if (!token) {
      navigate("/admin");
      return;
    }
    loadConfig();
    loadPlans();
    loadRegions();
    loadTutorials();
    loadArticles();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await getAdminConfig(token);
      if (res?.config) setConfig(res.config);
    } catch {
      navigate("/admin");
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      const res = await adminGetPlans(token);
      if (res?.plans) setPlans(res.plans);
      if (res?.planRegions) setPlanRegions(res.planRegions);
    } catch {}
  };

  const loadRegions = async () => {
    try {
      const res = await adminGetRegions(token);
      if (res?.regions) {
        setRegions(res.regions);
        return res.regions as Region[];
      }
    } catch {}
    return null;
  };

  const loadTutorials = async () => {
    try {
      const res = await adminGetTutorials(token);
      if (res?.tutorials) setTutorials(res.tutorials);
    } catch {}
  };

  const loadArticles = async () => {
    try {
      const res = await adminGetArticles(token);
      if (res?.articles) setArticles(res.articles);
    } catch {}
  };

  const loadOrders = async (page = 1, search = ordersSearch, status = ordersStatus) => {
    setOrdersLoading(true);
    try {
      const res = await adminGetOrders(token, { page, pageSize: 20, search: search || undefined, statusFilter: status });
      if (res?.orders) setOrders(res.orders);
      if (res?.total != null) setOrdersTotal(res.total);
    } catch {}
    setOrdersLoading(false);
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm("确定删除该订单？")) return;
    try {
      await adminDeleteOrder(token, orderId);
      setOrders(orders.filter(o => o.id !== orderId));
      setOrdersTotal(prev => prev - 1);
      setSelectedOrders(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    } catch {}
  };

  const handleBatchDelete = async () => {
    if (selectedOrders.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedOrders.size} 条订单？`)) return;
    setBtnStatus(prev => ({ ...prev, batchDel: "删除中..." }));
    try {
      await adminBatchDeleteOrders(token, Array.from(selectedOrders));
      setOrders(orders.filter(o => !selectedOrders.has(o.id)));
      setOrdersTotal(prev => prev - selectedOrders.size);
      setSelectedOrders(new Set());
      setBtnStatus(prev => ({ ...prev, batchDel: "✅ 已删除" }));
    } catch {
      setBtnStatus(prev => ({ ...prev, batchDel: "❌ 失败" }));
    }
    setTimeout(() => setBtnStatus(prev => ({ ...prev, batchDel: "" })), 2000);
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrders(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map(o => o.id)));
    }
  };

  const setBtnLoading = (key: string, text: string) => {
    setBtnStatus(prev => ({ ...prev, [key]: text }));
  };
  const clearBtn = (key: string, delay = 2000) => {
    setTimeout(() => setBtnStatus(prev => ({ ...prev, [key]: "" })), delay);
  };

  const handleSave = async (btnKey: string) => {
    setBtnLoading(btnKey, "保存中...");
    try {
      await saveAdminConfig(token, config);
      setBtnLoading(btnKey, "✅ 已保存");
    } catch {
      setBtnLoading(btnKey, "❌ 失败");
    }
    clearBtn(btnKey);
  };

  const handleTest = async () => {
    setBtnLoading("test", "连接中...");
    try {
      const res = await testPanelConnection(token, config.panelUrl, config.panelUser, config.panelPass);
      setBtnLoading("test", res?.success ? "✅ 连接成功" : "❌ 连接失败");
    } catch {
      setBtnLoading("test", "❌ 失败");
    }
    clearBtn("test", 3000);
  };

  const handleAddPlan = async (category: string) => {
    const key = `addPlan-${category}`;
    setBtnLoading(key, "添加中...");
    try {
      const maxSort = plans.length > 0 ? Math.max(...plans.map(p => p.sort_order)) : 0;
      await adminCreatePlan(token, {
        title: "新套餐",
        category,
        duration_months: 1,
        duration_days: 30,
        price: 10,
        description: "套餐描述",
        sort_order: maxSort + 1,
        featured: false,
        enabled: true,
      });
      await loadPlans();
      setBtnLoading(key, "✅ 已添加");
    } catch {
      setBtnLoading(key, "❌ 失败");
    }
    clearBtn(key);
  };

  const handleUpdatePlan = async (plan: Plan) => {
    const key = `save-${plan.id}`;
    setBtnLoading(key, "保存中...");
    try {
      await adminUpdatePlan(token, plan);
      setBtnLoading(key, "✅ 已保存");
    } catch {
      setBtnLoading(key, "❌ 失败");
    }
    clearBtn(key);
  };

  const handleDeletePlan = async (id: string) => {
    if (!confirm("确定删除该套餐？")) return;
    const key = `del-${id}`;
    setBtnLoading(key, "删除中...");
    try {
      await adminDeletePlan(token, id);
      setPlans(plans.filter(p => p.id !== id));
    } catch {
      setBtnLoading(key, "❌ 失败");
      clearBtn(key);
    }
  };

  const updatePlanField = (id: string, field: keyof Plan, value: any) => {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  // Region CRUD
  const handleAddRegion = async () => {
    const key = "addRegion";
    setBtnLoading(key, "添加中...");
    try {
      const maxSort = regions.length > 0 ? Math.max(...regions.map(r => r.sort_order)) : 0;
      await adminCreateRegion(token, {
        name: "新地区",
        inbound_id: 1,
        protocol: "mixed",
        sort_order: maxSort + 1,
        enabled: true,
      });
      const prevIds = new Set(regions.map(r => r.id));
      const newRegions = await loadRegions();
      if (newRegions) {
        const newRegion = newRegions.find(r => !prevIds.has(r.id));
        if (newRegion) {
          setExpandedRegionIds(prev => new Set([...prev, newRegion.id]));
        }
      }
      setBtnLoading(key, "✅ 已添加");
    } catch {
      setBtnLoading(key, "❌ 失败");
    }
    clearBtn(key);
  };

  const handleUpdateRegion = async (region: Region) => {
    const key = `saveRegion-${region.id}`;
    setBtnLoading(key, "保存中...");
    try {
      await adminUpdateRegion(token, region);
      setBtnLoading(key, "✅ 已保存");
    } catch {
      setBtnLoading(key, "❌ 失败");
    }
    clearBtn(key);
  };

  const handleDeleteRegion = async (id: string) => {
    if (!confirm("确定删除该地区？关联的套餐将变为无地区状态。")) return;
    const key = `delRegion-${id}`;
    setBtnLoading(key, "删除中...");
    try {
      await adminDeleteRegion(token, id);
      setRegions(regions.filter(r => r.id !== id));
      setExpandedRegionIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    } catch {
      setBtnLoading(key, "❌ 失败");
      clearBtn(key);
    }
  };

  const updateRegionField = (id: string, field: keyof Region, value: any) => {
    setRegions(regions.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleAddPlanForRegion = async (regionId: string, category: string) => {
    const key = `addPlan-${regionId}-${category}`;
    setBtnLoading(key, "添加中...");
    try {
      const maxSort = plans.length > 0 ? Math.max(...plans.map(p => p.sort_order)) : 0;
      const res = await adminCreatePlan(token, {
        title: "新套餐",
        category,
        duration_months: 1,
        duration_days: 30,
        price: 10,
        description: "套餐描述",
        sort_order: maxSort + 1,
        featured: false,
        enabled: true,
        region_id: regionId,
      });
      // Also assign to plan_regions junction table
      if (res?.plan?.id) {
        await adminAssignPlanRegion(token, res.plan.id, regionId);
      }
      await loadPlans();
      setBtnLoading(key, "✅ 已添加");
    } catch {
      setBtnLoading(key, "❌ 失败");
    }
    clearBtn(key);
  };

  const logout = () => {
    sessionStorage.removeItem("admin_token");
    navigate("/admin");
  };

  const categoryLabels: Record<string, string> = {
    new_exclusive: "🔒 购买开通·独享",
    new_shared: "👥 购买开通·共享",
    renew_exclusive: "🔒 续费·独享",
    renew_shared: "👥 续费·共享",
  };

  const togglePlanExpand = (id: string) => {
    setExpandedPlanIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const renderPlanRow = (plan: Plan, contextRegionId?: string) => {
    const assignedRegionNames = planRegions
      .filter(pr => pr.plan_id === plan.id)
      .map(pr => regions.find(r => r.id === pr.region_id)?.name)
      .filter(Boolean);

    const isCollapsible = !!contextRegionId;
    const isExpanded = expandedPlanIds.has(plan.id);

    // Collapsed compact card for region context
    if (isCollapsible && !isExpanded) {
      return (
        <div key={plan.id} className="bg-muted border border-border rounded-lg p-2.5 cursor-pointer hover:border-accent transition-colors"
          onClick={() => togglePlanExpand(plan.id)}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[15px] px-2 py-0.5 rounded font-bold shrink-0 ${plan.category === "new_exclusive" ? "bg-accent/10 text-accent" : "bg-success/10 text-success"}`}>
                {plan.category === "new_exclusive" ? "独享" : "共享"}
              </span>
              <span className="text-sm font-bold truncate">{plan.title}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[15px] text-muted-foreground">{plan.duration_days}天</span>
              <span className="text-sm font-bold text-accent">¥{plan.price}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      );
    }

    return (
    <div key={plan.id} className="bg-muted border border-border rounded-lg p-3">
      {isCollapsible && (
        <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => togglePlanExpand(plan.id)}>
          <span className="text-sm font-bold">{plan.title}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground rotate-180" />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
        <div className="md:col-span-3">
          <label className="block text-[15px] text-muted-foreground">标题</label>
          <input type="text" value={plan.title}
            onChange={e => updatePlanField(plan.id, "title", e.target.value)}
            className="w-full border border-input p-1.5 rounded text-sm bg-background focus:ring-1 focus:ring-client-primary outline-none" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[15px] text-muted-foreground">分类</label>
          <select value={plan.category}
            onChange={e => updatePlanField(plan.id, "category", e.target.value)}
            className="w-full border border-input p-1.5 rounded text-sm bg-background focus:ring-1 focus:ring-client-primary outline-none">
            <option value="new_exclusive">🔒 购买·独享</option>
            <option value="new_shared">👥 购买·共享</option>
            <option value="renew_exclusive">🔒 续费·独享</option>
            <option value="renew_shared">👥 续费·共享</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-[15px] text-muted-foreground">天数</label>
          <input type="number" value={plan.duration_days}
            onChange={e => {
              const days = Number(e.target.value);
              updatePlanField(plan.id, "duration_days", days);
              updatePlanField(plan.id, "duration_months", Math.round(days / 30) || 1);
            }}
            className="w-full border border-input p-1.5 rounded text-sm bg-background focus:ring-1 focus:ring-client-primary outline-none" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[15px] text-muted-foreground">价格¥</label>
          <input type="number" value={plan.price}
            onChange={e => updatePlanField(plan.id, "price", Number(e.target.value))}
            className="w-full border border-input p-1.5 rounded text-sm bg-background focus:ring-1 focus:ring-client-primary outline-none" />
        </div>
        <div className="md:col-span-3">
          <label className="block text-[15px] text-muted-foreground">描述</label>
          <input type="text" value={plan.description}
            onChange={e => updatePlanField(plan.id, "description", e.target.value)}
            className="w-full border border-input p-1.5 rounded text-sm bg-background focus:ring-1 focus:ring-client-primary outline-none" />
        </div>
      </div>
      {/* Action buttons on a separate row */}
      <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border">
        <label className="flex items-center gap-1 cursor-pointer text-[15px] mr-1">
          <input type="checkbox" checked={plan.enabled}
            onChange={e => updatePlanField(plan.id, "enabled", e.target.checked)}
            className="w-4 h-4 rounded" />
          启用
        </label>
        <label className="flex items-center gap-1 cursor-pointer text-[15px] mr-1">
          <input type="checkbox" checked={plan.featured}
            onChange={e => updatePlanField(plan.id, "featured", e.target.checked)}
            className="w-4 h-4 rounded" />
          推荐
        </label>
        <button onClick={() => handleUpdatePlan(plan)} disabled={!!btnStatus[`save-${plan.id}`]}
          className="bg-success text-success-foreground px-3 py-1.5 rounded text-[15px] font-bold hover:opacity-90 transition-colors disabled:opacity-70 min-w-[56px]">
          {btnStatus[`save-${plan.id}`] || "保存"}
        </button>
        {contextRegionId && (
          <button
            onClick={async () => {
              const key = `unlink-${plan.id}-${contextRegionId}`;
              setBtnLoading(key, "移除中...");
              try {
                await adminUnassignPlanRegion(token, plan.id, contextRegionId);
                await loadPlans();
                setBtnLoading(key, "✅");
              } catch { setBtnLoading(key, "❌"); }
              clearBtn(key);
            }}
            disabled={!!btnStatus[`unlink-${plan.id}-${contextRegionId}`]}
            className="bg-warning/10 text-warning px-3 py-1.5 rounded text-[15px] font-bold hover:bg-warning/20 transition-colors disabled:opacity-70"
            title="从此地区移除">
            {btnStatus[`unlink-${plan.id}-${contextRegionId}`] || "取消指定"}
          </button>
        )}
        <button onClick={() => handleDeletePlan(plan.id)}
          className="bg-destructive/10 text-destructive px-3 py-1.5 rounded text-[15px] font-bold hover:bg-destructive/20 transition-colors">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
      {assignedRegionNames.length > 0 && !contextRegionId && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-[15px] text-muted-foreground">所属地区:</span>
          {assignedRegionNames.map((name, i) => (
            <span key={i} className="text-[15px] bg-client-primary/10 text-client-primary px-2 py-0.5 rounded font-bold">{name}</span>
          ))}
        </div>
      )}
    </div>
  );
  };

  const renderPlanGroup = (groupTitle: string, groupKey: string, categories: string[], subLabels: Record<string, string>) => {
    const groupPlans = plans.filter(p => categories.includes(p.category));
    const isNew = groupKey === "new";
    const accentClass = isNew ? "text-indigo-600" : "text-client-primary";
    const btnClass = isNew
      ? "bg-indigo-500 text-white hover:bg-indigo-600"
      : "bg-client-primary text-client-primary-foreground hover:opacity-90";

    return (
      <div className="border border-border rounded-2xl overflow-hidden">
        <div className="bg-muted/50 px-5 py-4 flex items-center justify-between border-b border-border">
          <h3 className={`text-lg font-bold flex items-center ${accentClass}`}>
            {isNew ? <ShoppingCart className="w-5 h-5 mr-2" /> : <CreditCard className="w-5 h-5 mr-2" />}
            {groupTitle}
            <span className="ml-2 text-xs font-normal text-muted-foreground">({groupPlans.length} 个商品)</span>
          </h3>
          <div className="flex gap-2">
            {categories.map(cat => (
              <button key={cat} onClick={() => handleAddPlan(cat)} disabled={!!btnStatus[`addPlan-${cat}`]}
                className={`${btnClass} px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center shadow-sm disabled:opacity-70`}>
                <Plus className="w-3 h-3 mr-1" /> {btnStatus[`addPlan-${cat}`] || `添加${subLabels[cat]}`}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 space-y-3">
          {categories.map(cat => {
            const catPlans = plans.filter(p => p.category === cat);
            if (catPlans.length === 0) return null;
            return (
              <div key={cat}>
                <div className="text-xs font-bold text-muted-foreground mb-2 pl-1">{subLabels[cat]}</div>
                <div className="space-y-2">
                  {catPlans.map(plan => renderPlanRow(plan))}
                </div>
              </div>
            );
          })}
          {groupPlans.length === 0 && (
            <div className="text-center text-muted-foreground py-6 text-sm">暂无商品，点击上方按钮添加</div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-muted text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="bg-muted min-h-screen p-6 text-foreground">
      <div className="max-w-full mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex justify-between items-center bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center space-x-3">
            <Settings className="w-8 h-8 text-admin-primary" />
            <h1 className="text-2xl font-bold">系统控制台</h1>
          </div>
          <button onClick={logout} className="px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg font-medium transition-colors">
            退出登录
          </button>
        </div>

        {/* Tab Menu */}
        <Tabs defaultValue="panel" className="w-full">
          <TabsList className="w-full grid grid-cols-7 h-12 bg-card border border-border rounded-2xl p-1">
            <TabsTrigger value="panel" className="rounded-xl data-[state=active]:bg-admin-primary data-[state=active]:text-admin-primary-foreground font-bold text-xs sm:text-sm">
              <Server className="w-4 h-4 mr-1 sm:mr-2" /> 面板对接
            </TabsTrigger>
            <TabsTrigger value="payment" className="rounded-xl data-[state=active]:bg-warning data-[state=active]:text-warning-foreground font-bold text-xs sm:text-sm">
              <QrCode className="w-4 h-4 mr-1 sm:mr-2" /> 支付网关
            </TabsTrigger>
            <TabsTrigger value="sales" className="rounded-xl data-[state=active]:bg-indigo-500 data-[state=active]:text-white font-bold text-xs sm:text-sm">
              <ShoppingCart className="w-4 h-4 mr-1 sm:mr-2" /> 新开通售卖
            </TabsTrigger>
            <TabsTrigger value="products" className="rounded-xl data-[state=active]:bg-client-primary data-[state=active]:text-client-primary-foreground font-bold text-xs sm:text-sm">
              <Package className="w-4 h-4 mr-1 sm:mr-2" /> 商品管理
            </TabsTrigger>
            <TabsTrigger value="orders" className="rounded-xl data-[state=active]:bg-accent data-[state=active]:text-accent-foreground font-bold text-xs sm:text-sm" onClick={() => { if (orders.length === 0) loadOrders(); }}>
              <ClipboardList className="w-4 h-4 mr-1 sm:mr-2" /> 订单管理
            </TabsTrigger>
            <TabsTrigger value="tutorials" className="rounded-xl data-[state=active]:bg-client-primary data-[state=active]:text-client-primary-foreground font-bold text-xs sm:text-sm">
              <BookOpen className="w-4 h-4 mr-1 sm:mr-2" /> 使用教程
            </TabsTrigger>
            <TabsTrigger value="articles" className="rounded-xl data-[state=active]:bg-amber-500 data-[state=active]:text-white font-bold text-xs sm:text-sm">
              <FileText className="w-4 h-4 mr-1 sm:mr-2" /> 文章管理
            </TabsTrigger>
          </TabsList>

          {/* 面板对接配置 */}
          <TabsContent value="panel">
            {/* 第一行：面板对接 + 悬浮按钮 并排 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <h2 className="text-xl font-bold mb-6 flex items-center text-admin-primary border-b border-border pb-3">
                  <Server className="w-5 h-5 mr-2" /> 3x-ui 面板对接配置
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">面板 URL 地址 (需带端口)</label>
                    <input type="text" value={config.panelUrl} onChange={e => setConfig({ ...config, panelUrl: e.target.value })}
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">后台账号</label>
                    <input type="text" value={config.panelUser} onChange={e => setConfig({ ...config, panelUser: e.target.value })}
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">后台密码</label>
                    <input type="password" value={config.panelPass} onChange={e => setConfig({ ...config, panelPass: e.target.value })}
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background" />
                  </div>
                  <div className="flex space-x-3 pt-4">
                    <button onClick={handleTest} disabled={!!btnStatus["test"]}
                      className="flex-1 bg-secondary text-secondary-foreground py-2.5 rounded-lg font-bold hover:opacity-90 transition-colors border border-border disabled:opacity-70">
                      {btnStatus["test"] || "测试连接"}
                    </button>
                    <button onClick={() => handleSave("panel")} disabled={!!btnStatus["panel"]}
                      className="flex-1 bg-admin-primary text-admin-primary-foreground py-2.5 rounded-lg font-bold hover:opacity-90 transition-colors shadow-md disabled:opacity-70">
                      {btnStatus["panel"] || "保存配置"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <h2 className="text-xl font-bold mb-6 flex items-center text-admin-primary border-b border-border pb-3">
                  <Settings className="w-5 h-5 mr-2" /> 悬浮联系按钮配置
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">在线咨询 Tawk.to Widget ID</label>
                    <input type="text" value={config.tawkId} onChange={e => setConfig({ ...config, tawkId: e.target.value })}
                      placeholder="例如: 69c7635168a74a1c3a60f80a/1jkpdntv2"
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background" />
                    <p className="text-xs text-muted-foreground mt-1">格式: 站点ID/Widget ID，从 Tawk.to 后台获取</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">QQ 客服二维码图片链接</label>
                    <input type="text" value={config.qqQrcodeUrl} onChange={e => setConfig({ ...config, qqQrcodeUrl: e.target.value })}
                      placeholder="https://example.com/qq-qrcode.png"
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Telegram 链接</label>
                    <input type="text" value={config.telegramLink} onChange={e => setConfig({ ...config, telegramLink: e.target.value })}
                      placeholder="https://t.me/your_username"
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background" />
                  </div>
                  <div className="pt-4">
                    <button onClick={() => handleSave("fab")} disabled={!!btnStatus["fab"]}
                      className="w-full bg-admin-primary text-admin-primary-foreground py-2.5 rounded-lg font-bold hover:opacity-90 transition-colors shadow-md disabled:opacity-70">
                      {btnStatus["fab"] || "保存悬浮按钮配置"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 第二行：视频窗口 + 邮件通知 并排 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <h2 className="text-xl font-bold mb-6 flex items-center text-admin-primary border-b border-border pb-3">
                  <Settings className="w-5 h-5 mr-2" /> 视频窗口配置
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">视频链接或嵌入代码</label>
                    <textarea
                      value={config.videoEmbed}
                      onChange={e => setConfig({ ...config, videoEmbed: e.target.value })}
                      placeholder={"支持以下格式：\n1. 直接视频链接: https://example.com/video.mp4\n2. YouTube: https://www.youtube.com/watch?v=xxx\n3. Bilibili: https://www.bilibili.com/video/BVxxx\n4. iframe 嵌入代码: <iframe src=...></iframe>"}
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background min-h-[120px] resize-y"
                    />
                    <p className="text-xs text-muted-foreground mt-1">支持 YouTube、Bilibili、抖音、MP4 直链、iframe 嵌入代码等</p>
                  </div>
                  <div className="pt-4">
                    <button onClick={() => handleSave("video")} disabled={!!btnStatus["video"]}
                      className="w-full bg-admin-primary text-admin-primary-foreground py-2.5 rounded-lg font-bold hover:opacity-90 transition-colors shadow-md disabled:opacity-70">
                      {btnStatus["video"] || "保存视频配置"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <h2 className="text-xl font-bold mb-6 flex items-center text-admin-primary border-b border-border pb-3">
                  <Settings className="w-5 h-5 mr-2" /> 支付成功邮件通知 (Resend)
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">Resend API Key</label>
                    <input type="password" value={config.resendApiKey} onChange={e => setConfig({ ...config, resendApiKey: e.target.value })}
                      placeholder="re_xxxxxxxxx"
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background" />
                    <p className="text-xs text-muted-foreground mt-1">从 resend.com → API Keys 获取</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">通知接收邮箱</label>
                    <input type="email" value={config.notifyEmail} onChange={e => setConfig({ ...config, notifyEmail: e.target.value })}
                      placeholder="admin@example.com"
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background" />
                    <p className="text-xs text-muted-foreground mt-1">支付成功后邮件将发送到此邮箱</p>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={config.notifyStockOut}
                        onChange={e => setConfig({ ...config, notifyStockOut: e.target.checked })}
                        className="w-4 h-4 rounded" />
                      <span className="text-sm font-semibold">地区库存耗尽时邮件通知</span>
                    </label>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">当某个地区的最大客户端名额用完时，自动发邮件到上方邮箱</p>
                  </div>
                  <div className="pt-4">
                    <button onClick={() => handleSave("resend")} disabled={!!btnStatus["resend"]}
                      className="w-full bg-admin-primary text-admin-primary-foreground py-2.5 rounded-lg font-bold hover:opacity-90 transition-colors shadow-md disabled:opacity-70">
                      {btnStatus["resend"] || "保存邮件通知配置"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 着陆页图片 + 修改密码 并排 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {/* 着陆页图片配置 */}
              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <h2 className="text-lg font-bold mb-4 flex items-center text-admin-primary border-b border-border pb-3">
                  <Settings className="w-5 h-5 mr-2" /> 着陆页顶部图片
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">图片链接（支持多张，首页将轮播展示）</label>
                    <p className="text-xs text-muted-foreground mb-2">着陆页顶部展示的宣传图片，多张图片将自动轮播</p>
                    {(() => {
                      let images: string[] = [];
                      try {
                        const parsed = JSON.parse(config.landingImage);
                        if (Array.isArray(parsed)) images = parsed;
                        else if (config.landingImage) images = [config.landingImage];
                      } catch {
                        if (config.landingImage) images = [config.landingImage];
                      }
                      const updateImages = (newImages: string[]) => {
                        setConfig({ ...config, landingImage: newImages.length > 0 ? JSON.stringify(newImages) : "" });
                      };
                      return (
                        <div className="space-y-3">
                          {images.map((img, idx) => (
                            <div key={idx} className="flex gap-2 items-start">
                              <div className="flex-1 space-y-1">
                                <div className="flex gap-2">
                                  <input type="text" value={img} onChange={e => {
                                    const newImages = [...images];
                                    newImages[idx] = e.target.value;
                                    updateImages(newImages);
                                  }}
                                    placeholder="https://example.com/hero-image.png"
                                    className="flex-1 border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-admin-primary outline-none bg-background text-sm" />
                                  <button onClick={() => { const newImages = images.filter((_, i) => i !== idx); updateImages(newImages); }}
                                    className="px-3 py-2.5 bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 transition-colors text-sm font-medium shrink-0">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                                {img && (
                                  <img src={img} alt={`着陆页图片${idx + 1}`} className="max-h-24 rounded border border-border" />
                                )}
                              </div>
                            </div>
                          ))}
                          <button onClick={() => updateImages([...images, ""])}
                            className="flex items-center gap-1 text-sm text-admin-primary hover:underline font-medium">
                            <Plus className="w-4 h-4" /> 添加图片
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="pt-4">
                    <button onClick={() => handleSave("landing")} disabled={!!btnStatus["landing"]}
                      className="w-full bg-admin-primary text-admin-primary-foreground py-2.5 rounded-lg font-bold hover:opacity-90 transition-colors shadow-md disabled:opacity-70">
                      {btnStatus["landing"] || "保存着陆页图片"}
                    </button>
                  </div>
                </div>
              </div>

              {/* 修改管理员密码 */}
              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <h2 className="text-lg font-bold mb-4 flex items-center text-destructive border-b border-border pb-3">
                  <Settings className="w-5 h-5 mr-2" /> 修改管理员密码
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">当前密码</label>
                    <input type="password" id="old-password"
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-destructive outline-none bg-background" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">新密码</label>
                    <input type="password" id="new-password"
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-destructive outline-none bg-background" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">确认新密码</label>
                    <input type="password" id="confirm-password"
                      className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-destructive outline-none bg-background" />
                  </div>
                  <div className="pt-4">
                    <button
                      disabled={!!btnStatus["changePwd"]}
                      onClick={async () => {
                        const oldPwd = (document.getElementById("old-password") as HTMLInputElement)?.value;
                        const newPwd = (document.getElementById("new-password") as HTMLInputElement)?.value;
                        const confirmPwd = (document.getElementById("confirm-password") as HTMLInputElement)?.value;
                        if (!oldPwd || !newPwd) {
                          setBtnStatus(prev => ({ ...prev, changePwd: "❌ 请填写完整" }));
                          setTimeout(() => setBtnStatus(prev => ({ ...prev, changePwd: "" })), 2000);
                          return;
                        }
                        if (newPwd !== confirmPwd) {
                          setBtnStatus(prev => ({ ...prev, changePwd: "❌ 两次密码不一致" }));
                          setTimeout(() => setBtnStatus(prev => ({ ...prev, changePwd: "" })), 2000);
                          return;
                        }
                        if (newPwd.length < 4) {
                          setBtnStatus(prev => ({ ...prev, changePwd: "❌ 密码不能少于4位" }));
                          setTimeout(() => setBtnStatus(prev => ({ ...prev, changePwd: "" })), 2000);
                          return;
                        }
                        setBtnStatus(prev => ({ ...prev, changePwd: "修改中..." }));
                        try {
                          const res = await adminChangePassword(token, oldPwd, newPwd);
                          if (res?.success) {
                            setBtnStatus(prev => ({ ...prev, changePwd: "✅ 密码已修改" }));
                            (document.getElementById("old-password") as HTMLInputElement).value = "";
                            (document.getElementById("new-password") as HTMLInputElement).value = "";
                            (document.getElementById("confirm-password") as HTMLInputElement).value = "";
                          } else {
                            setBtnStatus(prev => ({ ...prev, changePwd: `❌ ${res?.error || "修改失败"}` }));
                          }
                        } catch (e: any) {
                          setBtnStatus(prev => ({ ...prev, changePwd: `❌ ${e?.message || "修改失败"}` }));
                        }
                        setTimeout(() => setBtnStatus(prev => ({ ...prev, changePwd: "" })), 3000);
                      }}
                      className="w-full bg-destructive text-destructive-foreground py-2.5 rounded-lg font-bold hover:opacity-90 transition-colors shadow-md disabled:opacity-70">
                      {btnStatus["changePwd"] || "修改密码"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 支付网关 */}
          <TabsContent value="payment">
            <div className="space-y-6">
              {/* 虎皮椒支付 */}
              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <h2 className="text-xl font-bold mb-6 flex items-center text-warning border-b border-border pb-3">
                  <QrCode className="w-5 h-5 mr-2" /> 虎皮椒支付设置
                </h2>
                <div className="space-y-4">
                  <div className="bg-muted p-4 rounded-xl border border-border">
                    <label className="flex items-center space-x-2 cursor-pointer mb-3">
                      <input type="checkbox" checked={config.hupiWechat} onChange={e => setConfig({ ...config, hupiWechat: e.target.checked })} className="w-5 h-5 rounded" />
                      <span className="font-bold">开启微信支付</span>
                    </label>
                    {config.hupiWechat && (
                      <div className="space-y-3 pl-7 border-l-2 border-success/30 ml-2 animate-fade-in">
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1">微信端 AppID</label>
                          <input type="text" value={config.hupiWechatAppId} onChange={e => setConfig({ ...config, hupiWechatAppId: e.target.value })}
                            placeholder="输入虎皮椒微信 AppID" className="w-full border border-input p-2 rounded-lg focus:ring-2 focus:ring-success outline-none text-sm bg-background" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1">微信端 AppSecret</label>
                          <input type="password" value={config.hupiWechatAppSecret} onChange={e => setConfig({ ...config, hupiWechatAppSecret: e.target.value })}
                            placeholder="输入虎皮椒微信 AppSecret" className="w-full border border-input p-2 rounded-lg focus:ring-2 focus:ring-success outline-none text-sm bg-background" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="bg-muted p-4 rounded-xl border border-border">
                    <label className="flex items-center space-x-2 cursor-pointer mb-3">
                      <input type="checkbox" checked={config.hupiAlipay} onChange={e => setConfig({ ...config, hupiAlipay: e.target.checked })} className="w-5 h-5 rounded" />
                      <span className="font-bold">开启支付宝</span>
                    </label>
                    {config.hupiAlipay && (
                      <div className="space-y-3 pl-7 border-l-2 border-accent/30 ml-2 animate-fade-in">
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1">支付宝端 AppID</label>
                          <input type="text" value={config.hupiAlipayAppId} onChange={e => setConfig({ ...config, hupiAlipayAppId: e.target.value })}
                            placeholder="输入虎皮椒支付宝 AppID" className="w-full border border-input p-2 rounded-lg focus:ring-2 focus:ring-accent outline-none text-sm bg-background" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1">支付宝端 AppSecret</label>
                          <input type="password" value={config.hupiAlipayAppSecret} onChange={e => setConfig({ ...config, hupiAlipayAppSecret: e.target.value })}
                            placeholder="输入虎皮椒支付宝 AppSecret" className="w-full border border-input p-2 rounded-lg focus:ring-2 focus:ring-accent outline-none text-sm bg-background" />
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleSave("payment")} disabled={!!btnStatus["payment"]}
                    className="w-full bg-warning text-warning-foreground py-3 rounded-lg font-bold hover:opacity-90 transition-colors shadow-md flex justify-center items-center disabled:opacity-70">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> {btnStatus["payment"] || "保存支付配置"}
                  </button>
                </div>
              </div>

              {/* 虚拟货币 */}
              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <h2 className="text-xl font-bold mb-6 flex items-center text-accent border-b border-border pb-3">
                  <Bitcoin className="w-5 h-5 mr-2" /> 虚拟货币设置 (TronGrid)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">收款钱包地址 (TRC20)</label>
                    <input type="text" value={config.cryptoAddress} onChange={e => setConfig({ ...config, cryptoAddress: e.target.value })}
                      placeholder="例如: Txxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-accent outline-none bg-background" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">TronGrid API Key</label>
                    <input type="password" value={config.cryptoKey} onChange={e => setConfig({ ...config, cryptoKey: e.target.value })}
                      placeholder="输入 TronGrid API Key" className="w-full border border-input p-2.5 rounded-lg focus:ring-2 focus:ring-accent outline-none bg-background" />
                  </div>
                  <div className="flex space-x-6 pt-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input type="checkbox" checked={config.cryptoUsdt} onChange={e => setConfig({ ...config, cryptoUsdt: e.target.checked })} className="w-5 h-5 rounded" />
                      <span className="font-bold">支持 USDT</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input type="checkbox" checked={config.cryptoTrx} onChange={e => setConfig({ ...config, cryptoTrx: e.target.checked })} className="w-5 h-5 rounded" />
                      <span className="font-bold">支持 TRX</span>
                    </label>
                  </div>
                  <div className="bg-accent/10 text-accent text-xs p-3 rounded-lg border border-accent/20">
                    <span className="font-bold">💡 防撞单机制已启用：</span>
                    客户使用虚拟货币付款时，系统会自动在原价基础上加上 <b>0.001 - 0.0019</b> 的随机尾数以唯一标识订单。
                  </div>
                </div>
                <button onClick={() => handleSave("crypto")} disabled={!!btnStatus["crypto"]}
                  className="w-full bg-accent text-accent-foreground py-3 rounded-lg font-bold hover:opacity-90 transition-colors shadow-md flex justify-center items-center mt-4 disabled:opacity-70">
                  <CheckCircle2 className="w-5 h-5 mr-2" /> {btnStatus["crypto"] || "保存加密货币配置"}
                </button>
              </div>
            </div>
          </TabsContent>

          {/* 商品管理 */}
          <TabsContent value="products">
            <div className="bg-card p-6 rounded-2xl shadow-sm border border-border space-y-8">
              <div className="border-b border-border pb-3">
                <h2 className="text-xl font-bold flex items-center text-client-primary">
                  <Package className="w-5 h-5 mr-2" /> 商品管理
                </h2>
                <p className="text-xs text-muted-foreground mt-2">💡 修改后请点击每行右侧的"保存"按钮。商品按分组管理，支持独享/共享子分类。</p>
              </div>

              {/* 购买开通分组 */}
              {renderPlanGroup("购买开通", "new", ["new_exclusive", "new_shared"], {
                "new_exclusive": "🔒 独享",
                "new_shared": "👥 共享",
              })}

              {/* 续费分组 */}
              {renderPlanGroup("续费商品", "renew", ["renew_exclusive", "renew_shared"], {
                "renew_exclusive": "🔒 独享",
                "renew_shared": "👥 共享",
              })}
            </div>
          </TabsContent>

          {/* 新开通售卖设置 */}
          <TabsContent value="sales">
            <div className="bg-card p-6 rounded-2xl shadow-sm border border-border space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-xl font-bold flex items-center text-accent">
                  <MapPin className="w-5 h-5 mr-2" /> 地区管理 & 新开通售卖
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" value={regionSearch} onChange={e => setRegionSearch(e.target.value)}
                      placeholder="搜索地区..."
                      className="border border-input pl-8 pr-3 py-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-accent outline-none w-40" />
                  </div>
                  <button onClick={handleAddRegion} disabled={!!btnStatus["addRegion"]}
                    className="bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center shadow-sm disabled:opacity-70 hover:opacity-90">
                    <Plus className="w-4 h-4 mr-1" /> {btnStatus["addRegion"] || "添加地区"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 每个地区拥有独立的入站ID和协议配置。添加地区后，可在下方为该地区添加独享/共享套餐。用户购买开通时将按地区分组展示。
              </p>

              {regions.length === 0 ? (
                <div className="text-center text-muted-foreground py-12 border border-dashed border-border rounded-xl">
                  <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-bold mb-1">暂无地区</p>
                  <p className="text-sm">点击上方"添加地区"按钮创建第一个售卖地区</p>
                </div>
              ) : (
                <>
                  {/* Region tabs */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {regions.filter(r => !regionSearch || r.name.toLowerCase().includes(regionSearch.toLowerCase())).map(region => (
                      <button
                        key={region.id}
                        onClick={() => setExpandedRegionIds(prev => {
                          const s = new Set<string>();
                          if (!prev.has(region.id)) s.add(region.id);
                          return s;
                        })}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5 ${
                          expandedRegionIds.has(region.id)
                            ? "bg-accent text-accent-foreground shadow-sm"
                            : "bg-muted text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                        }`}
                      >
                        📍 {region.name}
                      </button>
                    ))}
                  </div>

                  {/* Selected region content */}
                  {regions.filter(r => expandedRegionIds.has(r.id)).map(region => {
                    const regionPlanIds = planRegions.filter(pr => pr.region_id === region.id).map(pr => pr.plan_id);
                    const regionPlans = plans.filter(p => regionPlanIds.includes(p.id) && (p.category === "new_exclusive" || p.category === "new_shared"));
                    return (
                      <div key={region.id} className="border border-border rounded-2xl overflow-hidden">
                        {/* Region edit fields */}
                        <div className="bg-accent/5 px-5 py-4 border-b border-border">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                            <div className="md:col-span-3">
                              <label className="block text-xs text-muted-foreground mb-1">地区名称</label>
                              <input type="text" value={region.name}
                                onChange={e => updateRegionField(region.id, "name", e.target.value)}
                                className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-accent outline-none font-bold" />
                            </div>
                            <div className="md:col-span-1">
                              <label className="block text-xs text-muted-foreground mb-1">入站 ID</label>
                              <input type="number" value={region.inbound_id}
                                onChange={e => updateRegionField(region.id, "inbound_id", Number(e.target.value))}
                                className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-accent outline-none" />
                            </div>
                            <div className="md:col-span-1">
                              <label className="block text-xs text-muted-foreground mb-1">最大客户端</label>
                              <input type="number" value={region.max_clients}
                                onChange={e => updateRegionField(region.id, "max_clients", Number(e.target.value))}
                                placeholder="0=不限"
                                className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-accent outline-none" />
                              {region.max_clients > 0 && (
                                <p className="text-xs mt-1 text-muted-foreground flex items-center gap-1">
                                  已用: {region.current_clients}/{region.max_clients}
                                  {region.current_clients > 0 && (
                                    <button
                                      onClick={() => { updateRegionField(region.id, "current_clients", 0); }}
                                      className="text-[10px] px-1 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                                    >归0</button>
                                  )}
                                </p>
                              )}
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs text-muted-foreground mb-1">协议类型</label>
                              <select value={region.protocol}
                                onChange={e => updateRegionField(region.id, "protocol", e.target.value)}
                                className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-accent outline-none">
                                <option value="socks">Socks5 (用户名+密码)</option>
                                <option value="vless">Vless (UUID)</option>
                                <option value="vmess">Vmess (UUID)</option>
                                <option value="trojan">Trojan (UUID)</option>
                              </select>
                            </div>
                            <div className="md:col-span-1">
                              <label className="block text-xs text-muted-foreground mb-1">排序</label>
                              <input type="number" value={region.sort_order}
                                onChange={e => updateRegionField(region.id, "sort_order", Number(e.target.value))}
                                className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-accent outline-none" />
                            </div>
                            <div className="md:col-span-1 flex items-end">
                              <label className="flex items-center gap-1 cursor-pointer text-xs">
                                <input type="checkbox" checked={region.enabled}
                                  onChange={e => updateRegionField(region.id, "enabled", e.target.checked)}
                                  className="w-4 h-4 rounded" />
                                启用
                              </label>
                            </div>
                            <div className="md:col-span-3 flex items-end gap-2">
                              <button onClick={() => handleUpdateRegion(region)} disabled={!!btnStatus[`saveRegion-${region.id}`]}
                                className="bg-success text-success-foreground px-3 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-colors disabled:opacity-70 min-w-[60px]">
                                {btnStatus[`saveRegion-${region.id}`] || "保存"}
                              </button>
                              <button onClick={() => handleDeleteRegion(region.id)}
                                className="bg-destructive/10 text-destructive px-3 py-2 rounded-lg text-xs font-bold hover:bg-destructive/20 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Plans under this region */}
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <span className="text-base font-bold text-muted-foreground">该地区下的套餐 ({regionPlans.length})</span>
                            <div className="flex gap-2 flex-wrap">
                              <button onClick={() => handleAddPlanForRegion(region.id, "new_exclusive")} disabled={!!btnStatus[`addPlan-${region.id}-new_exclusive`]}
                                className="bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center shadow-sm disabled:opacity-70 hover:opacity-90">
                                <Plus className="w-4 h-4 mr-1" /> {btnStatus[`addPlan-${region.id}-new_exclusive`] || "新建独享"}
                              </button>
                              <button onClick={() => handleAddPlanForRegion(region.id, "new_shared")} disabled={!!btnStatus[`addPlan-${region.id}-new_shared`]}
                                className="bg-success text-success-foreground px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center shadow-sm disabled:opacity-70 hover:opacity-90">
                                <Plus className="w-4 h-4 mr-1" /> {btnStatus[`addPlan-${region.id}-new_shared`] || "新建共享"}
                              </button>
                              <button onClick={() => setAssignRegionId(assignRegionId === region.id ? null : region.id)}
                                className="bg-accent/10 text-accent px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center hover:bg-accent/20 border border-accent/20">
                                <Package className="w-4 h-4 mr-1" /> 指定已有套餐
                              </button>
                            </div>
                          </div>

                          {/* Assign existing plan picker */}
                          {assignRegionId === region.id && (() => {
                            const alreadyAssignedIds = regionPlanIds;
                            const unassigned = plans.filter(p =>
                              (p.category === "new_exclusive" || p.category === "new_shared") &&
                              !alreadyAssignedIds.includes(p.id)
                            );
                            return (
                              <div className="mb-4 bg-accent/5 border border-accent/20 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-bold text-accent">📦 选择商品管理中的套餐指定到此地区（支持共用）</span>
                                  <button onClick={() => setAssignRegionId(null)} className="text-muted-foreground hover:text-foreground text-xs">✕ 关闭</button>
                                </div>
                                {unassigned.length === 0 ? (
                                  <p className="text-xs text-muted-foreground text-center py-3">没有可指定的购买开通套餐</p>
                                ) : (
                                  <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {unassigned.map(p => {
                                      const assignedToRegions = planRegions.filter(pr => pr.plan_id === p.id).map(pr => regions.find(r => r.id === pr.region_id)?.name).filter(Boolean);
                                      return (
                                        <div key={p.id} className="flex items-center justify-between bg-card p-3 rounded-lg border border-border">
                                          <div className="flex items-center gap-3 flex-wrap">
                                            <span className={`text-xs px-2 py-0.5 rounded font-bold ${p.category === "new_exclusive" ? "bg-accent/10 text-accent" : "bg-success/10 text-success"}`}>
                                              {p.category === "new_exclusive" ? "独享" : "共享"}
                                            </span>
                                            <span className="text-sm font-bold">{p.title}</span>
                                            <span className="text-xs text-muted-foreground">¥{p.price} / {p.duration_days}天</span>
                                            {assignedToRegions.length > 0 && <span className="text-xs text-accent">已在: {assignedToRegions.join(", ")}</span>}
                                          </div>
                                          <button
                                            onClick={async () => {
                                              const key = `assign-${p.id}-${region.id}`;
                                              setBtnLoading(key, "指定中...");
                                              try {
                                                await adminAssignPlanRegion(token, p.id, region.id);
                                                await loadPlans();
                                                setBtnLoading(key, "✅");
                                              } catch { setBtnLoading(key, "❌"); }
                                              clearBtn(key);
                                            }}
                                            disabled={!!btnStatus[`assign-${p.id}-${region.id}`]}
                                            className="bg-accent text-accent-foreground px-3 py-1 rounded-lg text-xs font-bold hover:opacity-90 transition-colors disabled:opacity-70 min-w-[60px]">
                                            {btnStatus[`assign-${p.id}-${region.id}`] || "指定"}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {regionPlans.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4 text-base border border-dashed border-border rounded-xl">暂无套餐，点击上方按钮添加或指定</div>
                          ) : (
                            <div className="space-y-3">
                              {["new_exclusive", "new_shared"].map(cat => {
                                const catPlans = regionPlans.filter(p => p.category === cat);
                                if (catPlans.length === 0) return null;
                                return (
                                  <div key={cat}>
                                    <div className="text-sm font-bold text-muted-foreground mb-2 pl-1">
                                      {cat === "new_exclusive" ? "🔒 独享" : "👥 共享"}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {catPlans.map(plan => renderPlanRow(plan, region.id))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </TabsContent>

          {/* 订单管理 */}
          <TabsContent value="orders">
            <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
              <h2 className="text-xl font-bold mb-6 flex items-center text-accent border-b border-border pb-3">
                <ClipboardList className="w-5 h-5 mr-2" /> 订单管理
              </h2>

              {/* Search & Filter */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="搜索 UUID / 套餐名 / 邮箱..."
                    value={ordersSearch}
                    onChange={e => setOrdersSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { setOrdersPage(1); loadOrders(1, ordersSearch, ordersStatus); } }}
                    className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-accent outline-none text-sm"
                  />
                </div>
                <select
                  value={ordersStatus}
                  onChange={e => { setOrdersStatus(e.target.value); setOrdersPage(1); loadOrders(1, ordersSearch, e.target.value); }}
                  className="border border-input px-3 py-2 rounded-lg bg-background text-sm focus:ring-2 focus:ring-accent outline-none min-w-[120px]"
                >
                  <option value="all">全部状态</option>
                  <option value="pending">待支付</option>
                  <option value="paid">已支付</option>
                  <option value="fulfilled">已完成</option>
                  <option value="expired">已过期</option>
                </select>
                <button
                  onClick={() => { setOrdersPage(1); loadOrders(1, ordersSearch, ordersStatus); }}
                  className="bg-accent text-accent-foreground px-4 py-2 rounded-lg font-bold hover:opacity-90 transition-colors text-sm"
                >
                  搜索
                </button>
                {selectedOrders.size > 0 && (
                  <button
                    onClick={handleBatchDelete}
                    disabled={!!btnStatus["batchDel"]}
                    className="bg-destructive text-destructive-foreground px-4 py-2 rounded-lg font-bold hover:opacity-90 transition-colors text-sm disabled:opacity-70 flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" /> {btnStatus["batchDel"] || `删除 (${selectedOrders.size})`}
                  </button>
                )}
              </div>

              {ordersLoading ? (
                <div className="text-center text-muted-foreground py-12">加载中...</div>
              ) : orders.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">暂无订单记录</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-3 px-2 w-8">
                            <input type="checkbox" checked={orders.length > 0 && selectedOrders.size === orders.length}
                              onChange={toggleSelectAll} className="w-4 h-4 rounded cursor-pointer" />
                          </th>
                          <th className="py-3 px-2 font-semibold">UUID</th>
                          <th className="py-3 px-2 font-semibold">套餐</th>
                          <th className="py-3 px-2 font-semibold">金额</th>
                          <th className="py-3 px-2 font-semibold">支付方式</th>
                          <th className="py-3 px-2 font-semibold">状态</th>
                          <th className="py-3 px-2 font-semibold">时间</th>
                          <th className="py-3 px-2 font-semibold">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map(order => (
                          <tr key={order.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${selectedOrders.has(order.id) ? "bg-accent/5" : ""}`}>
                            <td className="py-3 px-2">
                              <input type="checkbox" checked={selectedOrders.has(order.id)}
                                onChange={() => toggleSelectOrder(order.id)} className="w-4 h-4 rounded cursor-pointer" />
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-xs max-w-[120px] truncate" title={order.uuid}>{order.uuid.slice(0, 8)}...</span>
                                <button onClick={() => { navigator.clipboard.writeText(order.uuid); }} title="复制 UUID"
                                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                </button>
                              </div>
                              {order.inbound_remark && <div className="text-xs text-muted-foreground mt-0.5">📡 入站: {order.inbound_remark}</div>}
                              {order.client_remark && <div className="text-xs text-muted-foreground">👤 客户端: {order.client_remark}</div>}
                            </td>
                            <td className="py-3 px-2">
                              <span className="font-medium">{order.plan_name}</span>
                              <span className="text-muted-foreground text-xs ml-1">({order.duration_days || order.months * 30}天 · {order.order_type === "buy_new" ? "购买开通" : "续费"})</span>
                            </td>
                            <td className="py-3 px-2">
                              {order.crypto_amount ? (
                                <span>{order.crypto_amount} {order.crypto_currency}</span>
                              ) : (
                                <span>¥{order.amount}</span>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                order.payment_method === "wechat" ? "bg-success/10 text-success" :
                                order.payment_method === "alipay" ? "bg-primary/10 text-primary" :
                                "bg-accent/10 text-accent"
                              }`}>
                                {order.payment_method === "wechat" ? "微信" :
                                 order.payment_method === "alipay" ? "支付宝" :
                                 order.payment_method === "crypto_usdt" ? "USDT" :
                                 order.payment_method === "crypto_trx" ? "TRX" : order.payment_method}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                order.status === "fulfilled" ? "bg-success/10 text-success" :
                                order.status === "paid" ? "bg-primary/10 text-primary" :
                                order.status === "expired" ? "bg-destructive/10 text-destructive" :
                                "bg-warning/10 text-warning"
                              }`}>
                                {order.status === "fulfilled" ? "✅ 已完成" :
                                 order.status === "paid" ? "💰 已支付" :
                                 order.status === "expired" ? "⏰ 已过期" : "⏳ 待支付"}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(order.created_at).toLocaleString("zh-CN")}
                            </td>
                            <td className="py-3 px-2">
                              <button
                                onClick={() => handleDeleteOrder(order.id)}
                                className="bg-destructive/10 text-destructive px-2 py-1 rounded-lg text-xs font-bold hover:bg-destructive/20 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <span className="text-sm text-muted-foreground">共 {ordersTotal} 条记录</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { const p = ordersPage - 1; setOrdersPage(p); loadOrders(p); }}
                        disabled={ordersPage <= 1}
                        className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-medium px-2">第 {ordersPage} / {Math.max(1, Math.ceil(ordersTotal / 20))} 页</span>
                      <button
                        onClick={() => { const p = ordersPage + 1; setOrdersPage(p); loadOrders(p); }}
                        disabled={ordersPage >= Math.ceil(ordersTotal / 20)}
                        className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
          {/* 使用教程管理 */}
          <TabsContent value="tutorials">
            <div className="bg-card p-6 rounded-2xl shadow-sm border border-border space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-xl font-bold flex items-center text-client-primary">
                  <BookOpen className="w-5 h-5 mr-2" /> 使用教程管理
                </h2>
                <button
                  onClick={async () => {
                    const key = "addTutorial";
                    setBtnLoading(key, "添加中...");
                    try {
                      const maxSort = tutorials.length > 0 ? Math.max(...tutorials.map(t => t.sort_order)) : 0;
                      await adminCreateTutorial(token, {
                        title: "新教程",
                        content: "",
                        sort_order: maxSort + 1,
                        enabled: true,
                      });
                      await loadTutorials();
                      setBtnLoading(key, "✅ 已添加");
                    } catch {
                      setBtnLoading(key, "❌ 失败");
                    }
                    clearBtn(key);
                  }}
                  disabled={!!btnStatus["addTutorial"]}
                  className="bg-client-primary text-client-primary-foreground px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center shadow-sm disabled:opacity-70 hover:opacity-90"
                >
                  <Plus className="w-4 h-4 mr-1" /> {btnStatus["addTutorial"] || "添加教程"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">💡 每个教程支持添加多个内容块（文本段落、图片、视频），用户在自助服务中心点击标题即可展开查看。</p>

              {tutorials.length === 0 ? (
                <div className="text-center text-muted-foreground py-12 border border-dashed border-border rounded-xl">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-bold mb-1">暂无教程</p>
                  <p className="text-sm">点击上方"添加教程"按钮创建第一个教程</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tutorials.map((tutorial) => (
                    <div key={tutorial.id} className="border border-border rounded-xl p-4 bg-muted/30 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        <div className="md:col-span-5">
                          <label className="block text-xs text-muted-foreground mb-1">标题</label>
                          <input
                            type="text"
                            value={tutorial.title}
                            onChange={e => setTutorials(tutorials.map(t => t.id === tutorial.id ? { ...t, title: e.target.value } : t))}
                            className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-client-primary outline-none font-bold"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs text-muted-foreground mb-1">排序</label>
                          <input
                            type="number"
                            value={tutorial.sort_order}
                            onChange={e => setTutorials(tutorials.map(t => t.id === tutorial.id ? { ...t, sort_order: Number(e.target.value) } : t))}
                            className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-client-primary outline-none"
                          />
                        </div>
                        <div className="md:col-span-2 flex items-end">
                          <label className="flex items-center gap-1 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={tutorial.enabled}
                              onChange={e => setTutorials(tutorials.map(t => t.id === tutorial.id ? { ...t, enabled: e.target.checked } : t))}
                              className="w-4 h-4 rounded"
                            />
                            启用
                          </label>
                        </div>
                        <div className="md:col-span-3 flex items-end gap-2">
                          <button
                            onClick={async () => {
                              const key = `saveTut-${tutorial.id}`;
                              setBtnLoading(key, "保存中...");
                              try {
                                await adminUpdateTutorial(token, tutorial);
                                setBtnLoading(key, "✅ 已保存");
                              } catch {
                                setBtnLoading(key, "❌ 失败");
                              }
                              clearBtn(key);
                            }}
                            disabled={!!btnStatus[`saveTut-${tutorial.id}`]}
                            className="bg-success text-success-foreground px-3 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-colors disabled:opacity-70 min-w-[56px]"
                          >
                            {btnStatus[`saveTut-${tutorial.id}`] || "保存"}
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm("确定删除该教程？")) return;
                              try {
                                await adminDeleteTutorial(token, tutorial.id);
                                setTutorials(tutorials.filter(t => t.id !== tutorial.id));
                              } catch {}
                            }}
                            className="bg-destructive/10 text-destructive px-3 py-2 rounded-lg text-xs font-bold hover:bg-destructive/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {/* Block-based content editor */}
                      <TutorialContentEditor
                        content={tutorial.content}
                        onChange={(newContent) => setTutorials(tutorials.map(t => t.id === tutorial.id ? { ...t, content: newContent } : t))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* 文章管理 */}
          <TabsContent value="articles">
            <div className="bg-card p-6 rounded-2xl shadow-sm border border-border space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-xl font-bold flex items-center text-amber-500">
                  <FileText className="w-5 h-5 mr-2" /> 文章管理
                </h2>
                <button
                  onClick={async () => {
                    const key = "addArticle";
                    setBtnLoading(key, "添加中...");
                    try {
                      const maxSort = articles.length > 0 ? Math.max(...articles.map(a => a.sort_order)) : 0;
                      await adminCreateArticle(token, {
                        title: "新文章标题",
                        content: "<p>文章内容</p>",
                        sort_order: maxSort + 1,
                        enabled: true,
                      });
                      await loadArticles();
                      setBtnLoading(key, "✅ 已添加");
                    } catch {
                      setBtnLoading(key, "❌ 失败");
                    }
                    clearBtn(key);
                  }}
                  disabled={!!btnStatus["addArticle"]}
                  className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center shadow-sm disabled:opacity-70 hover:opacity-90"
                >
                  <Plus className="w-4 h-4 mr-1" /> {btnStatus["addArticle"] || "添加文章"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">💡 管理首页"常见疑问"板块的问答文章。标题为问题，内容为纯文本答案（换行会自动显示）。</p>

              {articles.length === 0 ? (
                <div className="text-center text-muted-foreground py-12 border border-dashed border-border rounded-xl">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-bold mb-1">暂无文章</p>
                  <p className="text-sm">点击上方"添加文章"按钮创建第一篇文章</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {articles.map((article) => (
                    <div key={article.id} className="border border-border rounded-xl p-4 bg-muted/30 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        <div className="md:col-span-5">
                          <label className="block text-xs text-muted-foreground mb-1">标题（问题）</label>
                          <input
                            type="text"
                            value={article.title}
                            onChange={e => setArticles(articles.map(a => a.id === article.id ? { ...a, title: e.target.value } : a))}
                            className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-amber-500 outline-none font-bold"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs text-muted-foreground mb-1">排序</label>
                          <input
                            type="number"
                            value={article.sort_order}
                            onChange={e => setArticles(articles.map(a => a.id === article.id ? { ...a, sort_order: Number(e.target.value) } : a))}
                            className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-amber-500 outline-none"
                          />
                        </div>
                        <div className="md:col-span-2 flex items-end">
                          <label className="flex items-center gap-1 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={article.enabled}
                              onChange={e => setArticles(articles.map(a => a.id === article.id ? { ...a, enabled: e.target.checked } : a))}
                              className="w-4 h-4 rounded"
                            />
                            启用
                          </label>
                        </div>
                        <div className="md:col-span-3 flex items-end gap-2">
                          <button
                            onClick={async () => {
                              const key = `saveArt-${article.id}`;
                              setBtnLoading(key, "保存中...");
                              try {
                                await adminUpdateArticle(token, article);
                                setBtnLoading(key, "✅ 已保存");
                              } catch {
                                setBtnLoading(key, "❌ 失败");
                              }
                              clearBtn(key);
                            }}
                            disabled={!!btnStatus[`saveArt-${article.id}`]}
                            className="bg-success text-success-foreground px-3 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-colors disabled:opacity-70 min-w-[56px]"
                          >
                            {btnStatus[`saveArt-${article.id}`] || "保存"}
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm("确定删除该文章？")) return;
                              try {
                                await adminDeleteArticle(token, article.id);
                                setArticles(articles.filter(a => a.id !== article.id));
                              } catch {}
                            }}
                            className="bg-destructive/10 text-destructive px-3 py-2 rounded-lg text-xs font-bold hover:bg-destructive/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">内容（纯文本，换行自动显示）</label>
                        <textarea
                          value={article.content}
                          onChange={e => setArticles(articles.map(a => a.id === article.id ? { ...a, content: e.target.value } : a))}
                          rows={6}
                          className="w-full border border-input p-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-amber-500 outline-none"
                          placeholder="在此输入纯文本内容，换行会自动保留..."
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
