# 面板连接检测功能使用指南

## 功能概述

这个新功能为您的 3x-UI 面板提供了自动连接检测能力，当服务器关机或连接失败时，系统会自动发送邮件通知。

### 核心功能

1. **手动连接测试** - 立即测试面板连接
2. **自动定时检测** - 按配置的时间间隔自动检测面板连接
3. **连接历史记录** - 查看最近 20 次连接测试记录（成功/失败）
4. **邮件通知** - 连接失败时自动发送邮件通知
5. **配置管理** - 为每个面板单独配置测试间隔、通知邮箱等

## 使用步骤

### 1. 部署更新

```bash
# 如果使用 Supabase CLI
supabase db push

# 这会自动执行所有新的迁移文件，创建必要的数据库表和函数
```

### 2. 在后台管理中配置

1. 登录后台管理系统 → 选择 **系统设置** 标签页
2. 滚动到 **面板连接检测** 部分（在"定时任务实时状态"下方）
3. 选择要监控的面板
4. 点击 **自动检测配置** 展开配置选项

### 3. 配置检测参数

- **启用自动检测** - 勾选此选项启用自动定时检测
- **检测间隔（分钟）** - 设置检测频率，范围 5-1440 分钟（建议 30 分钟）
- **连接失败时发送邮件通知** - 勾选此选项启用邮件通知
- **通知邮箱** - 输入接收失败通知的邮箱地址

### 4. 立即测试

- 点击 **立即测试** 按钮可以立即测试面板连接
- 测试结果会立即显示，并记录到历史中

### 5. 查看连接历史

- 点击 **查看连接历史** 可以查看最近 20 次连接测试记录
- 每条记录显示：
  - 测试时间
  - 触发方式（手动测试/自动定时/自动检测）
  - 响应时间（成功时）
  - 错误信息（失败时）
  - 状态（✅ 成功 / ❌ 失败）

## 定时任务配置

### 方式一：自动定时检测（推荐）

通过 Supabase 的 `panel_test_config` 表配置各面板的检测间隔。系统会根据配置自动执行检测。

**注意**: 需要在 Supabase 数据库中手动配置 pg_cron 定时任务来定期调用 `auto-test-panels` 函数。

### 方式二：手动执行

在 Supabase 控制面板的 SQL 编辑器中执行以下命令（每 5 分钟执行一次）：

```sql
-- 获取 YOUR_PROJECT_URL 从 Supabase 项目设置
-- 获取 YOUR_ANON_KEY 从 Supabase 项目 API 密钥部分

SELECT cron.schedule(
  'auto-test-panels-every-5min',
  '*/5 * * * *',  -- 每 5 分钟执行一次，可根据需要调整
  $$
    SELECT http_post(
      'https://YOUR_PROJECT.supabase.co/functions/v1/auto-test-panels',
      '{}',
      'application/json',
      ARRAY[
        http_header('Authorization', 'Bearer YOUR_ANON_KEY'),
        http_header('Content-Type', 'application/json')
      ]
    )
  $$
);
```

## 邮件通知配置

### 前提条件

1. 在后台管理系统中配置了 **Resend API Key**（在支付网关设置中）
2. 配置了 **默认通知邮箱**
3. 在面板连接检测配置中启用了 **邮件通知**

### 测试邮件发送

1. 选择一个面板
2. 在配置中填入有效的邮箱地址
3. 关闭该面板的 3x-UI 服务或修改错误的登录信息
4. 点击 **立即测试**
5. 测试失败后，您应该会在几秒内收到邮件通知

## 数据库表结构

### panel_connection_tests 表

存储所有连接测试记录：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 记录 ID |
| panel_id | uuid | 面板 ID |
| test_time | timestamptz | 测试时间 |
| success | boolean | 是否成功 |
| response_time_ms | integer | 响应时间（毫秒） |
| error_message | text | 错误信息 |
| test_trigger | text | 触发方式（manual/auto/cron） |
| details | jsonb | 详细信息（如面板名称） |
| created_at | timestamptz | 创建时间 |

### panel_test_config 表

存储每个面板的连接检测配置：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 配置 ID |
| panel_id | uuid | 面板 ID（唯一） |
| enabled | boolean | 是否启用自动检测 |
| test_interval_minutes | integer | 检测间隔（分钟） |
| notify_on_failure | boolean | 失败时是否发送邮件 |
| notify_email | text | 通知邮箱地址 |
| last_test_time | timestamptz | 上次测试时间 |
| consecutive_failures | integer | 连续失败次数 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

## API 端点

### 手动测试连接

```
POST /functions/v1/panel-test
{
  "action": "test-manual",
  "token": "admin_token",
  "panel_id": "uuid"
}
```

### 获取检测历史

```
POST /functions/v1/panel-test
{
  "action": "get-history",
  "panel_id": "uuid"
}
```

### 获取检测配置

```
POST /functions/v1/panel-test
{
  "action": "get-config",
  "token": "admin_token",
  "panel_id": "uuid"
}
```

### 更新检测配置

```
POST /functions/v1/panel-test
{
  "action": "update-config",
  "token": "admin_token",
  "panel_id": "uuid",
  "enabled": true,
  "test_interval_minutes": 30,
  "notify_on_failure": true,
  "notify_email": "admin@example.com"
}
```

## 故障排除

### 问题：邮件未发送

**可能原因：**
1. 未配置 Resend API Key
2. 通知邮箱为空
3. 面板配置中未启用邮件通知
4. Resend 服务故障

**解决方案：**
1. 检查后台管理 → 系统设置 → 支付网关设置中的 Resend API Key
2. 检查面板连接检测配置中的通知邮箱是否填写
3. 确保勾选了"连接失败时发送邮件通知"选项
4. 查看浏览器控制台是否有错误信息

### 问题：自动检测不工作

**可能原因：**
1. 未配置 pg_cron 定时任务
2. `auto-test-panels` 函数未部署
3. 面板配置中未启用自动检测

**解决方案：**
1. 检查是否已在 Supabase 数据库中创建 pg_cron 任务
2. 确保 `auto-test-panels` 函数已部署（在 Supabase Functions 中可见）
3. 检查面板连接检测配置中是否启用了自动检测

### 问题：连接历史显示为空

**可能原因：**
1. 尚未执行任何测试
2. 选错了面板

**解决方案：**
1. 点击"立即测试"按钮执行一次测试
2. 确认选择的面板是否正确

## 最佳实践

1. **检测间隔建议** - 对于生产环境，建议设置 30-60 分钟
2. **通知邮箱** - 使用有效的、经常查看的邮箱地址
3. **定期审查** - 定期查看连接历史，了解面板稳定性
4. **备用通知** - 可以配置多个面板，互相作为备用监控
5. **API Key 安全** - 不要在代码中暴露 Resend API Key

## 支持

如有问题，请查看日志文件或联系系统管理员。
