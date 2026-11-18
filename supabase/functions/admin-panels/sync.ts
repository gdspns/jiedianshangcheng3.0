type Panel = { id: string; panel_url: string; panel_user: string; panel_pass: string };
type Client = { id: string; email?: string; enable: boolean; expiryTime: number; totalGB: number; flow?: string; security?: string; limitIp?: number };

async function readInbound(panel: Panel, id: number) {
  const url = new URL(panel.panel_url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("面板地址无效");
  }
  const base = url.href.replace(/\/+$/, "");
  const request = (path: string, init?: RequestInit) =>
    fetch(base + path, { ...init, redirect: "error", signal: AbortSignal.timeout(8000) });
  const login = await request("/login", {
    method: "POST",
    body: new URLSearchParams({ username: panel.panel_user, password: panel.panel_pass }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!login.ok || !cookie || (await login.json()).success !== true) throw new Error("面板认证失败");
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
