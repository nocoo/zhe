# Dashboard 性能优化

本文档记录 Dashboard 的 8 阶段性能优化历程，包含问题分析、解决方案和验证结果。

> 返回 [README](../README.md)

## 问题概述

每个 Dashboard 页面在挂载时触发 5-6+ 次冗余 `auth()` 调用（每次均通过 HTTP API 访问 Cloudflare D1），急切加载 6/7 页面不需要的数据，且完全没有 SSR 预取——导致每次导航都出现可见的骨架屏闪烁。

## 阶段总览

| 阶段 | 描述 | 状态 | 节省的 auth 调用 |
|------|------|------|-----------------|
| 1 | 统一 auth 工具函数 + `cache()` 包装 | ✅ 完成 | -1（layout） |
| 2 | 合并 3 个 provider action 为 `getDashboardData()` | ✅ 完成 | -2 |
| 3 | 减少不必要的 Context 订阅 | ✅ 完成 | -3（重渲染） |
| 4 | 在 `page.tsx` 中 SSR 预取数据 | ✅ 完成 | -1（页面级） |
| 5 | Backy 页面：push 成功后内联获取历史 | ✅ 完成 | -1 |
| 6 | Links N+1：批量 `refreshLinkMetadata` | ✅ 完成 | -(N-1) |
| 7 | 添加 Suspense 边界 | ✅ 完成 | 0（UX 改善） |
| 8 | 小修（Storage、Overview） | ✅ 完成 | -1 |

## 详细阶段

### 阶段 1：统一 Auth 工具函数 + `cache()` 包装

**问题**：9+ 个 action 文件中复制粘贴了相同的 `getScopedDB()` / `getAuthContext()` / `requireAuth()` 函数。`auth()` 在 server component render 中未被去重。

**方案**：
- 新建 `lib/auth-context.ts`，提供共享的 `getScopedDB()`、`getAuthContext()`、`requireAuth()`
- 使用 React `cache()` 包装 `auth()`，在 server component render 周期内自动去重
- 所有 action 文件改为从共享模块导入
- 删除各 action 文件中的本地辅助函数

**涉及文件**：
- `lib/auth-context.ts`（新建）
- `actions/links.ts`、`actions/tags.ts`、`actions/folders.ts`、`actions/xray.ts`、`actions/backy.ts`、`actions/webhook.ts`、`actions/settings.ts`、`actions/upload.ts`、`actions/storage.ts`、`actions/overview.ts`

**状态**：✅ 完成（commit `354078e`）

---

### 阶段 2：合并 Provider Actions 为 `getDashboardData()`

**问题**：`DashboardServiceProvider` 挂载时发起 3 个独立的 server action，各自调用 `auth()` = 3 次 D1 session 查询。

**方案**：
- 新建 `getDashboardData()` server action：1 次 auth + `Promise.all([getLinks, getTags, getLinkTags])`
- 更新 `DashboardServiceProvider` 改为调用单一 action
- 添加错误处理（Codex 发现：`Promise.all` 失败时 `loading=true` 会永久挂起）

**涉及文件**：
- `actions/dashboard.ts`（新建）
- `contexts/dashboard-service.tsx`

**状态**：✅ 完成（commit `a2e125d`）

---

### 阶段 3：减少不必要的 Context 订阅

**问题**：组件订阅了完整的 `useDashboardService` context（state + actions），任何部分变化都触发重渲染。Webhook viewmodel 仅为获取 `siteUrl` 拉取了整个 dashboard context。

**方案**：
- Webhook viewmodel：直接使用 `window.location.origin`，完全消除 dashboard context 依赖
- Folders viewmodel：使用细粒度的 `useDashboardState` + `useDashboardActions`，替代单一的 `useDashboardService`
- App sidebar：仅订阅 `useDashboardState`（只读取 `links` 计数，不需要 actions）
- 搜索对话框：仅订阅 `useDashboardState`（只读取状态，不执行操作）
- 更新所有对应的测试 mock

**涉及文件**：
- `viewmodels/useWebhookViewModel.ts`、`viewmodels/useFoldersViewModel.ts`
- `components/app-sidebar.tsx`、`components/search-command-dialog.tsx`
- `tests/unit/webhook-viewmodel.test.ts`、`tests/unit/folder-viewmodel.test.ts`
- `tests/components/app-sidebar.test.tsx`、`tests/components/search-command-dialog.test.tsx`、`tests/components/dashboard-shell.test.tsx`

**状态**：✅ 完成（commit `eca10c3`）

---

### 阶段 4：SSR 预取

**问题**：所有 `page.tsx` server component 都是空壳，数据通过客户端 `useEffect` 获取，造成 loading 闪烁。

**方案**：
- 每个 `page.tsx` 改为 `async`，直接调用 server action 预取数据
- 数据通过 `initialData` prop 传给客户端组件
- ViewModel 接收可选的 `initialData` 参数：提供时 `useState` 直接初始化数据，`loading` 初始为 `false`，`useEffect` 提前返回

**转换的页面（6/6）**：
- Overview：`getOverviewStats()` → `initialData?: OverviewStats`
- Xray：`getXrayConfig()` → `initialData?: XrayInitialData`
- Backy：`getBackyConfig()` + `fetchBackyHistory()` → `initialData?: BackyInitialData`
- Webhook：`getWebhookToken()` → `initialData?: WebhookInitialData`
- Uploads：`getUploads()` → `initialUploads?: Upload[]`
- Storage：`scanStorage()` → `initialData?: StorageScanResult`

**涉及文件**：
- `app/(dashboard)/dashboard/overview/page.tsx`、`xray/page.tsx`、`backy/page.tsx`、`webhook/page.tsx`、`uploads/page.tsx`、`storage/page.tsx`
- `viewmodels/useOverviewViewModel.ts`、`useXrayViewModel.ts`、`useBackyViewModel.ts`、`useWebhookViewModel.ts`、`useUploadViewModel.ts`
- `components/dashboard/overview-page.tsx`、`xray-page.tsx`、`backy-page.tsx`、`webhook-page.tsx`、`upload-list.tsx`、`storage-page.tsx`
- `tests/components/overview-route.test.tsx`、`xray-route.test.tsx`、`backy-route.test.tsx`、`webhook-route.test.tsx`、`uploads-route.test.tsx`
- `tests/unit/overview-viewmodel.test.ts`、`backy-viewmodel.test.ts`、`webhook-viewmodel.test.ts`、`upload-viewmodel.test.ts`

**状态**：✅ 完成（commit `60d187c`）

---

### 阶段 5：Backy 页面优化

**问题**：push 成功后，viewmodel 在 `finally` 块中单独调用 `fetchBackyHistory()`——多一次 auth + DB + 外部 API 往返。push 失败时也刷新历史（浪费）。

**方案**：
- 在 `BackyPushDetail` 类型中添加 `history?: BackyHistoryResponse` 字段
- `pushBackup()` 在 POST 成功后内联 GET 历史（复用相同 config，无额外 auth/DB 调用）
- Viewmodel `handlePush` 从内联响应中获取历史；不再在 push 后调用 `fetchBackyHistory()`
- push 失败时不刷新历史（消除无意义的往返）
- 历史获取失败为非关键错误——push 仍然成功，客户端可手动刷新

**涉及文件**：
- `models/backy.ts`（添加 `history` 字段）
- `actions/backy.ts`（内联历史获取）
- `viewmodels/useBackyViewModel.ts`（使用内联历史，移除 `finally` 块）
- `tests/unit/backy-viewmodel.test.ts`、`tests/unit/backy-actions.test.ts`

**状态**：✅ 完成（commit `41b5bb0`、`a0876b3`）

---

### 阶段 6：Links N+1 批量化

**问题**：每个 LinkCard 的 `useEffect` 独立触发 `refreshLinkMetadata(linkId)`。50 条缺失 = 50 次 server action（50 次 auth + 150 次 D1 查询 + 50 次 HTTP 抓取）。

**方案**：
- 在 `lib/db/scoped.ts` 添加 `ScopedDB.getLinksByIds()`，自动分块（每次 90 个 ID）
- 在 `actions/links.ts` 新建 `batchRefreshLinkMetadata(linkIds[])`：1 次 auth + 批量获取 + 并发限制 5 + 批量刷新
- 移除 `useLinkCardViewModel` 中逐卡片的自动刷新 `useEffect`
- 新建 `useAutoRefreshMetadata(links, onUpdate)` hook：收集需要元数据的链接，调用一次批量 action，通过 ref 追踪已处理 ID 防止重复触发
- 在 `links-list.tsx` 列表级集成批量 hook
- 单条手动刷新（`handleRefreshMetadata`）保持不变

**涉及文件**：
- `lib/db/scoped.ts`（添加 `getLinksByIds`）
- `actions/links.ts`（添加 `batchRefreshLinkMetadata`）
- `viewmodels/useLinksViewModel.ts`（移除逐卡自动获取，添加 `useAutoRefreshMetadata`）
- `components/dashboard/links-list.tsx`（集成批量 hook）
- `tests/unit/actions.test.ts`、`tests/unit/viewmodels.test.ts`

**状态**：✅ 完成（commit `5e594df`）

---

### 阶段 7：Suspense 边界

**问题**：在 async dashboard 页面间导航时，前一页面滞留直到新页面 SSR 数据加载完成，无视觉反馈。

**方案**：
- 新建 `app/(dashboard)/dashboard/loading.tsx` —— 所有 dashboard 子页面的共享骨架屏
- 提供通用卡片网格骨架，匹配内容面板结构
- 各页面组件保留自身的客户端 loading 状态内部骨架
- `DashboardServiceProvider` 持久化在父级 `DashboardShell` 中，不受子级 Suspense 边界影响

**新建文件**：
- `app/(dashboard)/dashboard/loading.tsx`

**状态**：✅ 完成（commit `12e6559`）

---

### 阶段 8：小修

**变更**：
- **8a - 存储清理优化**：`cleanupOrphanFiles()` 成功后，本地删除已清理的 key 并通过 `computeSummary()` 重算摘要。消除一次完整重扫（1 次 auth + 6 次 D1 COUNT 查询 + R2 listObjects）
- **8b - 数据管理批量导入**：已取消。逐条 insert-or-skip 模式对 D1 是正确的（HTTP API 不支持多语句 batch，且每次插入需要单独的 UNIQUE 约束检测）
- **8c - Overview 统计赋值简化**：逐字段拷贝改为 `setStats(result.data)` 直接赋值

**涉及文件**：
- `components/dashboard/storage-page.tsx`（本地状态更新，导入 `computeSummary`）
- `viewmodels/useOverviewViewModel.ts`（直接赋值）

**状态**：✅ 完成（commit `09b5582`）

---

## Auth 调用审计（优化前后对比）

### 优化前

| 页面 | 挂载时 auth() 调用次数 |
|------|----------------------|
| Overview | 6 |
| Links List | 5 + N（元数据） |
| Uploads | 6 |
| Xray | 6 |
| Storage | 6 |
| Data Management | 5 |
| Webhook | 6 |
| Backy | 6 |

### 优化后目标

| 页面 | 挂载时 auth() 调用次数 |
|------|----------------------|
| 所有页面 | 1-2 |
| Links List | 2（+ 1 次批量元数据） |

## AI Agent 审查意见

三个 AI Agent（Codex、Gemini、Claude）审查了此优化方案：

- **Codex**：Sidebar 和搜索对话框依赖全局 links 数据——Sidebar 应使用 `getLinkCounts()`，搜索应延迟加载。Provider 的 `Promise.all` 需要错误处理。
- **Gemini**：D1 批量查询有 ~32K 参数限制——需要分块。Import 场景也会触发 N+1 元数据刷新。
- **Claude**：阶段 2 的 `cache()` 作用域有限——仅在 server render 内去重，跨 server action 不生效。应创建纯服务端读函数，与 server action 分离。

## 相关文档

- [架构概览](01-architecture.md)
- [测试策略](05-testing.md)
