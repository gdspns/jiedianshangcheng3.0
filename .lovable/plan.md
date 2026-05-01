# 修复购买开通的重复开通 / 链接不一致问题

## 问题根因

用户扫码付款后，`create-client` Edge Function 会被多个入口同时触发，但函数本身**没有幂等性保护**：

1. 付款页轮询发现 `status=paid` → 调用 `create-client`（调用 A，正在 3x-ui addClient 中…）
2. 用户没等开通完成就点击了其他页面 → `cleanupPolling()` 清理轮询，但 A 仍在后台执行
3. 用户进入"查单"页 → `handleLookupOrders` 看到订单还是 `paid` → 再次调用 `create-client`（调用 B）
4. A 和 B 都通过了 `status=paid` 检查，**各自生成了不同的 UUID**，分别向 3x-ui 同一个入站 addClient → 面板上同一个订单出现两个客户端
5. 谁后写 `orders.uuid` 谁赢 → 自动刷新页面显示的链接（A 的 UUID）与查单显示的链接（B 的 UUID）不一致

`handleRetryFulfill`（手动"补发节点"按钮）有同样的问题。

## 修复方案

### 1. 后端 `create-client` 加入幂等锁（核心修复）

在函数入口处用一次"原子性占位 update"作为分布式锁：

- 进入函数 → 立即尝试把订单从 `status='paid'` 更新为 `status='processing'`（同时用 `.eq('status','paid')` 作为 CAS 条件）
- 如果 update 影响行数 = 0：
  - 如果订单已经是 `fulfilled`，直接读出已有的 `uuid / inbound_id / client_remark`，重新拼装 `credentials + connectionInfo` 返回给前端（让重复调用拿到**同一份**链接，而不是再开一个）
  - 如果订单是 `processing`（说明已有另一个调用在跑）→ 轮询等待 1-2 秒，再读一次订单；若 `fulfilled` 则返回已有数据，否则返回 `409 处理中，请稍后重试`
- 如果 update 成功（拿到锁）→ 正常走原来的 addClient 流程；流程末尾把 `status` 写为 `fulfilled`
- 任何错误分支（addClient 失败、面板登录失败）→ **必须把 `status` 回滚到 `paid`**，否则订单会卡死在 `processing`

需要新增数据库迁移：把 `orders.status` 允许的取值扩展支持 `'processing'`（当前是 text 字段无 CHECK 约束，无需迁移，仅文档化即可）。

### 2. 后端读取已存在客户端的辅助函数

为了让"重复调用"能返回与首次调用一致的链接，新增 `findClientOnPanel(panelUrl, cookie, inboundId, uuidOrUsername)`：
- 拉 `/panel/api/inbounds/get/{id}`
- 在 settings.clients / settings.accounts 里按 uuid / password / user 找到现有客户端
- 拼装 `credentials + connectionInfo` 返回

订单 `fulfilled` 时直接走这条路径返回，不再 addClient。

### 3. 前端去重保护

`src/pages/ClientPortal.tsx`：

- 新增 `useRef<Set<string>>(new Set())` 记录"正在 create-client 的 orderId"
- `handlePaymentSuccess`、`handleLookupOrders`（其中的 `pendingBuyNew` 批量调用）、`handleRetryFulfill` 都先检查这个 Set，订单 id 已在集合里就 skip；`finally` 里删除
- `handleLookupOrders` 中：把对每个 paid buy_new 订单的并发调用改为**串行**（避免同一邮箱多订单同时触发面板压力，并配合后端锁更稳）

### 4. UI 文案

- 付款成功页若用户已切走，再次回查单时如果订单已自动开通，正常显示链接即可（无需新增提示）
- `paid_unfulfilled` 状态保留现有"补发节点"按钮，但点击后若后端返回 `processing`，提示"系统正在开通中，请 5 秒后刷新"

## 涉及文件

- `supabase/functions/create-client/index.ts`：加入 CAS 锁、`findClientOnPanel`、错误分支回滚 status
- `src/pages/ClientPortal.tsx`：前端 in-flight Set、串行化 lookup 中的批量补单
- `src/lib/api.ts`：无需改动（只透传响应）

## 流程示意

```text
付款页轮询A          查单页调用B
     |                    |
     v                    v
  CAS: paid -> processing  (A 拿到锁)
     |                    |
   addClient              CAS 失败 -> 读订单
     |                    |
  status=fulfilled        若 fulfilled: 用现有 uuid
  返回 credentials A      返回 credentials A (一致!)
```

3x-ui 面板上只会出现一个客户端，A 与 B 拿到完全相同的 UUID/链接。
