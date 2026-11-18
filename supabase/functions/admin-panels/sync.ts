type Panel = { id: string; panel_url: string; panel_user: string; panel_pass: string };
type Client = { id: string; email?: string; enable: boolean; expiryTime: number; totalGB: number; flow?: string; security?: string; limitIp?: number };

async function openPanel(panel: Panel) {
  const url = new URL(panel.panel_url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("面板地址无效");
  }
  const base = url.href.replace(/\/+$/, "");
  const request = (path: string, init?: RequestInit) =>
    fetch(base + path, { ...init, redirect: "error", signal: AbortSignal.timeout(20000) });
  const login = await request("/login", {
    method: "POST",
    body: new URLSearchParams({ username: panel.panel_user, password: panel.panel_pass }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!login.ok || !cookie || (await login.json()).success !== true) throw new Error("面板认证失败");
  return { request, cookie };
}

async function readInbound(panel: Panel, id: number) {
  const { request, cookie } = await openPanel(panel);
  const response = await request("/panel/api/inbounds/get/" + id, { headers: { Cookie: cookie } });
  const result = await response.json();
  if (!response.ok || result.success !== true || Number(result.obj?.id) !== id) throw new Error("无法读取指定入站");
  const clients = JSON.parse(result.obj.settings).clients;
  if (!["vless", "vmess"].includes(result.obj.protocol) || !Array.isArray(clients)) {
    throw new Error("同步支持 VLESS 和 VMess 客户端");
  }
  const byId = new Map<string, Client>();
  const emails = new Set<string>();
  for (const client of clients) {
    if (typeof client?.email === "string") emails.add(client.email.trim().toLowerCase());
    if (typeof client?.id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(client.id)) continue;
    const key = client.id.toLowerCase();
    if (byId.has(key)) throw new Error("入站中存在重复 UUID");
    byId.set(key, client);
  }
  return { protocol: result.obj.protocol, byId, emails, request, cookie };
}

async function panelSnapshot(panel: Panel) {
  const { request, cookie } = await openPanel(panel);
  const headers = { Cookie: cookie };
  const read = async (path: string, method = "GET") => {
    const response = await request(path, { method, headers });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw new Error("无法读取整面板配置");
    return typeof data.obj === "string" ? JSON.parse(data.obj) : data.obj;
  };
  const [inbounds, xray] = await Promise.all([
    read("/panel/api/inbounds/list"),
    read("/panel/xray/", "POST"),
  ]);
  const template = typeof xray?.xraySetting === "string" ? JSON.parse(xray.xraySetting) : xray?.xraySetting;
  if (!Array.isArray(inbounds) || !Array.isArray(template?.outbounds) || !Array.isArray(template?.routing?.rules)) {
    throw new Error("面板配置格式不兼容，无法生成完整预览");
  }
  return { inbounds, template, outboundTestUrl: xray?.outboundTestUrl || "https://www.google.com/generate_204", request, cookie };
}

type Inbound = { id: number; protocol: string; port: number; listen?: string; enable: boolean; expiryTime: number; total: number; remark: string; settings: string; streamSettings: string; sniffing: string; trafficReset?: string; lastTrafficResetTime?: number };

function inboundIndex(rows: Inbound[]) {
  const result = new Map<string, Inbound>();
  for (const row of rows) {
    const key = `${row.protocol}:${row.port}`;
    if (!Number.isSafeInteger(row.id) || !Number.isSafeInteger(row.port) || result.has(key)) {
      throw new Error("存在无效或重复的协议与端口组合，需要核对入站对应关系");
    }
    result.set(key, row);
  }
  return result;
}

function normalized(value: string | object | undefined) {
  if (!value) return "";
  try { return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value); } catch { return String(value); }
}

function comparable(row: Inbound) {
  return JSON.stringify([row.listen || "", row.enable, row.expiryTime, row.total, row.remark || "",
    normalized(row.settings), normalized(row.streamSettings), normalized(row.sniffing), row.trafficReset || "never"]);
}

function inboundForm(row: Inbound) {
  return new URLSearchParams({
    up: "0", down: "0", total: String(row.total || 0), remark: row.remark || "", enable: String(row.enable),
    expiryTime: String(row.expiryTime || 0), trafficReset: row.trafficReset || "never",
    lastTrafficResetTime: String(row.lastTrafficResetTime || 0), listen: row.listen || "", port: String(row.port),
    protocol: row.protocol, settings: row.settings || "{}", streamSettings: row.streamSettings || "{}", sniffing: row.sniffing || "{}",
  });
}

async function revisionFor(main: Awaited<ReturnType<typeof panelSnapshot>>, replica: Awaited<ReturnType<typeof panelSnapshot>>) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({
    source: main.inbounds, sourceXray: main.template, target: replica.inbounds, targetXray: replica.template,
  })));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function previewPanelMirror(source: Panel, target: Panel) {
  if (new URL(source.panel_url).href.replace(/\/+$/, "") === new URL(target.panel_url).href.replace(/\/+$/, "")) {
    throw new Error("主副面板地址必须不同");
  }
  const [main, replica] = await Promise.all([panelSnapshot(source), panelSnapshot(target)]);
  const incoming = inboundIndex(main.inbounds);
  const current = inboundIndex(replica.inbounds);
  const keys = [...incoming.keys()];
  return {
    sourceCount: incoming.size,
    targetCount: current.size,
    create: keys.filter(key => !current.has(key)),
    update: keys.filter(key => current.has(key) && comparable(incoming.get(key)!) !== comparable(current.get(key)!)),
    remove: [...current.keys()].filter(key => !incoming.has(key)),
    outboundsDiffer: JSON.stringify(main.template.outbounds) !== JSON.stringify(replica.template.outbounds),
    routingDiffers: JSON.stringify(main.template.routing) !== JSON.stringify(replica.template.routing),
    revision: await revisionFor(main, replica),
  };
}

export async function applyPanelMirror(source: Panel, target: Panel, expectedRevision: string, allowDelete: boolean) {
  const [main, replica] = await Promise.all([panelSnapshot(source), panelSnapshot(target)]);
  if (new URL(source.panel_url).href.replace(/\/+$/, "") === new URL(target.panel_url).href.replace(/\/+$/, "")) throw new Error("主副面板地址必须不同");
  const revision = await revisionFor(main, replica);
  if (!expectedRevision || revision !== expectedRevision) throw new Error("面板配置已变化，请重新预览后再同步");
  const incoming = inboundIndex(main.inbounds);
  const current = inboundIndex(replica.inbounds);
  const creates = [...incoming].filter(([key]) => !current.has(key));
  const updates = [...incoming].filter(([key, row]) => current.has(key) && comparable(row) !== comparable(current.get(key)!));
  const removals = [...current].filter(([key]) => !incoming.has(key));
  if (removals.length && !allowDelete) throw new Error("副面板存在主面板没有的入站，必须明确允许删除后才能同步");
  if (incoming.size === 0 && current.size > 0) throw new Error("主面板入站为空，已阻止清空副面板");
  const post = async (path: string, body?: BodyInit) => {
    const response = await replica.request(path, { method: "POST", headers: { Cookie: replica.cookie }, body });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw new Error(typeof data.msg === "string" ? `副面板写入失败：${data.msg}` : "副面板写入失败");
  };
  let created = 0, updated = 0, removed = 0;
  for (const [, row] of updates) { await post(`/panel/api/inbounds/update/${current.get(`${row.protocol}:${row.port}`)!.id}`, inboundForm(row)); updated++; }
  for (const [, row] of creates) { await post("/panel/api/inbounds/add", inboundForm(row)); created++; }
  const xrayDiffers = normalized(main.template) !== normalized(replica.template) || main.outboundTestUrl !== replica.outboundTestUrl;
  if (xrayDiffers) await post("/panel/xray/update", new URLSearchParams({ xraySetting: JSON.stringify(main.template), outboundTestUrl: main.outboundTestUrl }));
  // Destructive work is deliberately last, after every additive/configuration write succeeded.
  for (const [, row] of removals) { await post(`/panel/api/inbounds/del/${row.id}`); removed++; }
  return { success: true, created, updated, removed, xrayUpdated: xrayDiffers };
}

export async function syncPanelClients(source: Panel, target: Panel, sourceId: number, targetId: number, preview: boolean, expectedRevision?: string, addMissing = false) {
  if (new URL(source.panel_url).href.replace(/\/+$/, "") === new URL(target.panel_url).href.replace(/\/+$/, "")) {
    throw new Error("主副面板地址必须不同");
  }
  const [main, replica] = await Promise.all([readInbound(source, sourceId), readInbound(target, targetId)]);
  if (main.protocol !== replica.protocol) throw new Error("两端入站协议必须一致");
  const changes: { kind: "add" | "update"; client: Client }[] = [];
  let matched = 0;
  let conflicts = 0;
  for (const [id, client] of main.byId) {
    const existing = replica.byId.get(id);
    if (existing) matched++;
    if (!existing && !addMissing) continue;
    const { enable, expiryTime, totalGB } = client;
    if (typeof enable !== "boolean" || !Number.isSafeInteger(expiryTime) || !Number.isSafeInteger(totalGB) || totalGB < 0) {
      throw new Error("主面板返回的客户端配置无效");
    }
    if (!existing) {
      const email = client.email?.trim();
      if (!email || replica.emails.has(email.toLowerCase())) {
        conflicts++;
        continue;
      }
      replica.emails.add(email.toLowerCase());
      changes.push({ kind: "add", client: {
        id: client.id, email, enable, expiryTime, totalGB,
        limitIp: Number.isSafeInteger(client.limitIp) ? client.limitIp : 0,
        ...(main.protocol === "vless" ? { flow: client.flow || "" } : { security: client.security || "auto" }),
      } });
    } else if (enable !== existing.enable || expiryTime !== existing.expiryTime || totalGB !== existing.totalGB) {
      changes.push({ kind: "update", client: { ...existing, enable, expiryTime, totalGB } });
    }
  }
  const revisionBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    JSON.stringify([source.id, target.id, sourceId, targetId, addMissing, changes]),
  ));
  const revision = Array.from(new Uint8Array(revisionBytes), byte => byte.toString(16).padStart(2, "0")).join("");
  if (!preview && expectedRevision !== revision) throw new Error("面板配置已变化，请重新预览");
  let updated = 0;
  let added = 0;
  let failed = 0;
  const batchSize = 5;
  if (!preview) {
    for (const { kind, client } of changes.slice(0, batchSize)) {
      try {
        const endpoint = kind === "add" ? "addClient" : "updateClient/" + encodeURIComponent(client.id);
        const response = await replica.request("/panel/api/inbounds/" + endpoint, {
          method: "POST",
          headers: { Cookie: replica.cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ id: targetId, settings: JSON.stringify({ clients: [client] }) }),
        });
        if (!response.ok || (await response.json()).success !== true) throw new Error();
        if (kind === "add") added++;
        else updated++;
      } catch {
        failed++;
        break;
      }
    }
  }
  const additions = changes.filter(change => change.kind === "add").length;
  return { matched, pending: changes.length, additions, conflicts, unmatched: main.byId.size - matched, added, updated, failed, batchSize, revision };
}
