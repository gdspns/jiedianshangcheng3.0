import { supabase } from "@/integrations/supabase/client";

const getProjectId = () => import.meta.env.VITE_SUPABASE_PROJECT_ID;

async function callEdgeFunction(name: string, body?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body ?? {},
  });
  if (error) throw error;
  return data;
}

// Admin APIs
export async function adminLogin(password: string) {
  return callEdgeFunction("admin-auth", { action: "login", password });
}

export async function adminChangePassword(token: string, oldPassword: string, newPassword: string) {
  return callEdgeFunction("admin-auth", { action: "change-password", token, oldPassword, newPassword });
}

export async function getAdminConfig(token: string) {
  return callEdgeFunction("admin-config", { action: "get", token });
}

export async function saveAdminConfig(token: string, config: object) {
  return callEdgeFunction("admin-config", { action: "save", token, config });
}

export async function testPanelConnection(token: string, panelUrl: string, panelUser: string, panelPass: string) {
  return callEdgeFunction("proxy-3xui", { action: "test", token, panelUrl, panelUser, panelPass });
}

// Client APIs
export async function getPublicConfig() {
  const { data, error } = await (supabase as any)
    .from("admin_config")
    .select("price_month, price_quarter, price_year, price_exclusive_month, price_exclusive_quarter, price_exclusive_year, price_shared_month, price_shared_quarter, price_shared_year, hupi_wechat, hupi_alipay, crypto_usdt, crypto_trx, crypto_address, tawk_id, qq_qrcode_url, telegram_link, landing_image")
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

export async function lookupClient(uuid: string) {
  return callEdgeFunction("proxy-3xui", { action: "lookup", uuid });
}

// Payment APIs
export async function createOrder(params: {
  uuid: string;
  planName: string;
  months: number;
  durationDays: number;
  amount: number;
  paymentMethod: string;
  orderType?: string;
  cryptoAmount?: number;
  cryptoCurrency?: string;
  email?: string;
}) {
  return callEdgeFunction("payment-callback", { action: "create-order", ...params });
}

// Look up orders by email
export async function lookupOrdersByEmail(email: string) {
  const { data, error } = await (supabase as any)
    .from("orders")
    .select("*")
    .eq("email", email)
    .in("status", ["fulfilled", "paid"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

export async function checkOrderStatus(orderId: string) {
  return callEdgeFunction("payment-callback", { action: "check-order", orderId });
}

export async function verifyCryptoPayment(orderId: string) {
  return callEdgeFunction("crypto-verify", { action: "verify", orderId });
}

// Exchange rates
export async function getExchangeRates() {
  return callEdgeFunction("exchange-rates", {});
}

// Plans APIs
export async function getPlans() {
  const { data, error } = await (supabase as any)
    .from("plans")
    .select("*")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getPlanRegions() {
  const { data, error } = await (supabase as any)
    .from("plan_regions")
    .select("*");
  if (error) throw error;
  return data || [];
}

export async function adminGetPlans(token: string) {
  return callEdgeFunction("admin-plans", { action: "list", token });
}

export async function adminCreatePlan(token: string, plan: object) {
  return callEdgeFunction("admin-plans", { action: "create", token, plan });
}

export async function adminUpdatePlan(token: string, plan: object) {
  return callEdgeFunction("admin-plans", { action: "update", token, plan });
}

export async function adminDeletePlan(token: string, planId: string) {
  return callEdgeFunction("admin-plans", { action: "delete", token, plan: { id: planId } });
}

// Regions APIs
export async function getRegions() {
  const { data, error } = await (supabase as any)
    .from("regions")
    .select("*")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function adminGetRegions(token: string) {
  return callEdgeFunction("admin-plans", { action: "list-regions", token });
}

export async function adminCreateRegion(token: string, region: object) {
  return callEdgeFunction("admin-plans", { action: "create-region", token, region });
}

export async function adminUpdateRegion(token: string, region: object) {
  return callEdgeFunction("admin-plans", { action: "update-region", token, region });
}

export async function adminDeleteRegion(token: string, regionId: string) {
  return callEdgeFunction("admin-plans", { action: "delete-region", token, region: { id: regionId } });
}

export async function adminAssignPlanRegion(token: string, planId: string, regionId: string) {
  return callEdgeFunction("admin-plans", { action: "assign-plan-region", token, planId, regionId });
}

export async function adminUnassignPlanRegion(token: string, planId: string, regionId: string) {
  return callEdgeFunction("admin-plans", { action: "unassign-plan-region", token, planId, regionId });
}

// Admin orders
export async function adminGetOrders(token: string, params?: { page?: number; pageSize?: number; search?: string; statusFilter?: string }) {
  return callEdgeFunction("admin-orders", { action: "list", token, ...params });
}

export async function adminDeleteOrder(token: string, orderId: string) {
  return callEdgeFunction("admin-orders", { action: "delete", token, orderId });
}

export async function adminBatchDeleteOrders(token: string, orderIds: string[]) {
  return callEdgeFunction("admin-orders", { action: "batch-delete", token, orderIds });
}

// Tutorials APIs
export async function getTutorials() {
  const { data, error } = await (supabase as any)
    .from("tutorials")
    .select("*")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function adminGetTutorials(token: string) {
  return callEdgeFunction("admin-plans", { action: "list-tutorials", token });
}

export async function adminCreateTutorial(token: string, tutorial: object) {
  return callEdgeFunction("admin-plans", { action: "create-tutorial", token, tutorial });
}

export async function adminUpdateTutorial(token: string, tutorial: object) {
  return callEdgeFunction("admin-plans", { action: "update-tutorial", token, tutorial });
}

export async function adminDeleteTutorial(token: string, tutorialId: string) {
  return callEdgeFunction("admin-plans", { action: "delete-tutorial", token, tutorial: { id: tutorialId } });
}

// Article APIs
export async function adminGetArticles(token: string) {
  return callEdgeFunction("admin-plans", { action: "list-articles", token });
}

export async function adminCreateArticle(token: string, article: object) {
  return callEdgeFunction("admin-plans", { action: "create-article", token, article });
}

export async function adminUpdateArticle(token: string, article: object) {
  return callEdgeFunction("admin-plans", { action: "update-article", token, article });
}

export async function adminDeleteArticle(token: string, articleId: string) {
  return callEdgeFunction("admin-plans", { action: "delete-article", token, article: { id: articleId } });
}

// Create client (new purchase)
export async function createClientOnPanel(orderId: string, regionId?: string | null) {
  return callEdgeFunction("create-client", { orderId, regionId: regionId || undefined });
}

// Get orders for a UUID
export async function getOrders(uuid: string) {
  const { data, error } = await (supabase as any)
    .from("orders")
    .select("*")
    .eq("uuid", uuid)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}
