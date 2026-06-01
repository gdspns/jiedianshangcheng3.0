## 目标

在客户端门户"本月流量使用情况"下方新增"购买流量包"功能，并在管理后台新增"流量充值"商品分组，用于设置 10GB 的单价。

## 一、数据库变更

### `plans` 表
- 新增分类（不改 schema，只用 `category` 字符串）：`topup_traffic`
- 字段语义复用：
  - `price` = 每 10GB 的价格（人民币）
  - `duration_months` / `duration_days` / `featured` / `region_id` 不使用，可保持默认
- 仅允许后台创建 1 条记录（前端只取第一条启用的 `topup_traffic` 套餐作为单价依据）

### `orders` 表
- 复用现有表，新增 `order_type = "topup_traffic"`
- 复用字段：
  - `months` = 购买的 10GB 倍数（例：购买 50GB → `months=5`）
  - `duration_days = 0`
  - `plan_name` = `"流量充值 50GB"` 之类描述
  - `amount` = 后端计算后的金额
- 不需要新增列。

> 不需要 schema migration —— `plans.category` 已是 text，`orders.order_type` 已是 text，直接复用。

## 二、后端 Edge Function

### 1. `payment-callback` (`create-order` action)
新增分支：当 `orderType === "topup_traffic"` 时：
- 校验 `gb`（来自 body）：必须为正整数，且 `gb % 10 === 0`，`gb >= 10`
- 后端从 `plans` 表读取启用中的 `topup_traffic` 套餐单价 `unitPrice`（每 10GB）
- 后端重新计算金额：`amount = unitPrice * (gb / 10)`，忽略前端传入的 amount
- 写入 order：`order_type="topup_traffic"`, `months = gb/10`, `duration_days = 0`, `plan_name = "流量充值 {gb}GB"`

### 2. `payment-callback` 微信/支付宝回调 & `crypto-verify` 加密回调
在 paid 后判断 `order.order_type === "topup_traffic"`：
- 跳过续费 `extendExpiry` 分支
- 调用新函数 `addClientTraffic(panelUrl, cookie, inboundId, email, addBytes, isSocks5)`：
  - 通过遍历启用 panels 找到 client
  - 读取当前 inbound `settings.clients[*]` 找到目标 client（或 SOCKS5 inbound）
  - `addBytes = gb * 1073741824`（`gb = order.months * 10`）
  - **标准协议**：将该 client 的 `totalGB`（字节）改为 `currentTotal + addBytes`，调用 `/panel/api/inbounds/updateClient/{id}`（或现有 update inbound full settings 路径，保持与现有续费逻辑一致即可）
  - **SOCKS5**：将 inbound `total` 改为 `currentTotal + addBytes`，调用 `/panel/api/inbounds/update/{id}`
  - **绝对不要**：
    - 不调用 `resetClientTraffic`
    - 不修改 `up`/`down`（已用流量）
    - 不修改 `expiryTime`
    - 不修改 client `email`（备注）
- 成功后 `status="fulfilled"`，失败 `status="paid_unfulfilled"`

### 3. 安全防护
- 所有校验（10 倍数、最低 10GB、金额重算）必须在 Edge Function 服务端完成
- 前端 amount 字段会被后端覆盖，前端不能绕过价格
- 增加流量只在支付回调中触发，前端无路径直接调用增加流量接口

## 三、前端

### 1. `ClientPortal.tsx` 仪表盘
在第 1257 行 "本月流量使用情况" 卡片下方新增一个卡片：
```
┌─ 购买流量包 ──────────────┐
│ 单价：¥X / 10GB           │
│ [输入框: 购买流量 GB]      │
│ 必须为 10 的倍数，最小 10  │
│ 应付：¥XX                  │
│ [购买流量] 按钮            │
└──────────────────────────┘
```
- 实时显示：`金额 = unitPrice * (gb / 10)`（前端仅展示）
- 输入校验：`gb >= 10 && gb % 10 === 0`，不满足按钮禁用
- 点击 → `AlertDialog` 确认：「确认购买 {gb}GB 流量包？应付 ¥{amount}」
- 确认后调用 `createOrder({ uuid, planName: "流量充值 {gb}GB", months: gb/10, durationDays: 0, amount, paymentMethod, orderType: "topup_traffic", gb })`
- 复用现有支付弹窗 / 二维码 / 轮询逻辑（与续费完全一致）
- 支付轮询到 `fulfilled` 后，重新调用 `lookupClient(uuid)` 刷新 `trafficTotal`，进度条与 `4.41 / 60 GB` 文案实时更新

### 2. `lib/api.ts`
`createOrder` 增加 `gb?: number` 参数透传给 edge function。

### 3. 公共 config / plans
`getPlans()` 已会返回所有启用 plans；前端 dashboard 用 `plans.find(p => p.category === "topup_traffic" && p.enabled)` 拿到单价。如果不存在则隐藏整个"购买流量包"卡片。

## 四、管理后台

### `AdminDashboard.tsx` 商品管理
- 在 `categoryLabels` 加入：`topup_traffic: "📊 流量充值"`
- 在商品分组渲染处增加"流量充值"分组（与现有 4 个分组并列）
- 该分组下只允许 1 条 plan（UI 上"添加"按钮在已有 1 条时禁用）
- 编辑表单只显示：
  - `title`（如 "10GB 流量包"）
  - `price`（每 10GB 单价，单位元）
  - `enabled` 开关
  - 隐藏：duration、region、featured 等不相关字段
- 不需要走 region / inbound 绑定流程

## 五、不破坏现有功能

- 续费逻辑（`order_type="renew"`）走原 `extendExpiry`，重置流量+延期
- 新购逻辑（`order_type="buy_new"`）走 `create-client`，新建客户端
- 新增的 topup_traffic 是独立第三分支，互不干扰
- 3x-ui 登录解析、流量显示、套餐购买/续费均不动

## 技术细节（开发参考）

- `addClientTraffic` 与 `extendExpiry` 共用 panel 遍历逻辑（已封装在 payment-callback 内），可抽出一个 `findClientAcrossPanels(supabase, uuid)` helper
- 流量字节单位：1GB = 1073741824
- `totalGB` 字段在 3x-ui 中实际存的是字节数（不是 GB），命名是历史遗留
- 客户端 `clientData.trafficTotal` 字段已经过 `normalizeTrafficGB` 处理为 GB 数字，无需额外转换