import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BACKUP_KIND = "jiedianshangcheng-admin-settings";
const BACKUP_VERSION = 1;
const SETTINGS_TABLES = [
  "panels",
  "regions",
  "plans",
  "plan_regions",
  "region_inbounds",
  "inbound_plans",
  "tutorials",
  "articles",
  "traffic_default_rules",
  "panel_test_config",
] as const;

const REPLACE_TABLES = [
  "panel_test_config",
  "inbound_plans",
  "plan_regions",
  "region_inbounds",
  "traffic_default_rules",
  "articles",
  "tutorials",
] as const;

const INSERT_ORDER = [
  "panels",
  "regions",
  "plans",
  "plan_regions",
  "region_inbounds",
  "inbound_plans",
  "tutorials",
  "articles",
  "traffic_default_rules",
  "panel_test_config",
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function verifyToken(token: string): string | null {
  try {
    const decoded = atob(token);
    const [id] = decoded.split(":");
    return id || null;
  } catch {
    return null;
  }
}

type AdminClient = ReturnType<typeof createClient>;

async function buildBackup(supabase: AdminClient, configId: string) {
  const { data: config, error: configError } = await supabase
    .from("admin_config")
    .select("*")
    .eq("id", configId)
    .single();
  if (configError || !config) throw new Error("管理员配置不存在");

  const { id: _id, admin_password_hash: _password, created_at: _created, updated_at: _updated, ...safeConfig } = config;
  const data: Record<string, unknown> = { admin_config: safeConfig };
  for (const table of SETTINGS_TABLES) {
    const { data: rows, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`读取 ${table} 失败：${error.message}`);
    data[table] = rows || [];
  }

  return {
    meta: {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      includes: ["admin_config", ...SETTINGS_TABLES],
    },
    data,
  };
}

async function deleteRowsMissingFromBackup(supabase: AdminClient, table: string, backupRows: Array<{ id: string }>) {
  const keepIds = new Set(backupRows.map((row) => row.id));
  const { data: currentRows, error: readError } = await supabase.from(table).select("id");
  if (readError) throw new Error(`读取 ${table} 失败：${readError.message}`);
  const staleIds = (currentRows || []).map((row) => row.id).filter((id) => !keepIds.has(id));
  if (staleIds.length === 0) return;
  const { error } = await supabase.from(table).delete().in("id", staleIds);
  if (error) throw new Error(`清理 ${table} 失败：${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, token, backup } = await req.json();
    const configId = verifyToken(String(token || ""));
    if (!configId) return json({ error: "未授权" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: admin } = await supabase.from("admin_config").select("id").eq("id", configId).maybeSingle();
    if (!admin) return json({ error: "登录状态无效，请重新登录" }, 401);

    if (action === "backup") {
      return json({ backup: await buildBackup(supabase, configId) });
    }

    if (action === "restore") {
      if (backup?.meta?.kind !== BACKUP_KIND || backup?.meta?.version !== BACKUP_VERSION || !backup?.data) {
        return json({ error: "备份文件格式或版本不受支持" }, 400);
      }
      for (const table of SETTINGS_TABLES) {
        if (!Array.isArray(backup.data[table])) return json({ error: `备份缺少 ${table} 数据` }, 400);
      }
      if (!backup.data.admin_config || typeof backup.data.admin_config !== "object" || Array.isArray(backup.data.admin_config)) {
        return json({ error: "备份缺少系统配置" }, 400);
      }

      for (const table of REPLACE_TABLES) {
        const { error } = await supabase.from(table).delete().not("id", "is", null);
        if (error) throw new Error(`清理 ${table} 失败：${error.message}`);
      }

      // Keep matching panel rows in place so their connection history is retained.
      await supabase.from("panels").update({ is_primary: false }).eq("is_primary", true);
      for (const table of ["panels", "regions", "plans"] as const) {
        const rows = backup.data[table];
        if (rows.length > 0) {
          const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
          if (error) throw new Error(`恢复 ${table} 失败：${error.message}`);
        }
      }
      await deleteRowsMissingFromBackup(supabase, "plans", backup.data.plans);
      await deleteRowsMissingFromBackup(supabase, "regions", backup.data.regions);
      await deleteRowsMissingFromBackup(supabase, "panels", backup.data.panels);

      for (const table of INSERT_ORDER.filter((name) => !["panels", "regions", "plans"].includes(name))) {
        const rows = backup.data[table];
        if (rows.length === 0) continue;
        const { error } = await supabase.from(table).insert(rows);
        if (error) throw new Error(`恢复 ${table} 失败：${error.message}`);
      }

      const config = { ...backup.data.admin_config };
      delete config.id;
      delete config.admin_password_hash;
      delete config.created_at;
      delete config.updated_at;
      const { error: configError } = await supabase.from("admin_config").update(config).eq("id", configId);
      if (configError) throw new Error(`恢复系统配置失败：${configError.message}`);

      return json({ success: true, restoredAt: new Date().toISOString() });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("admin-backup error", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
