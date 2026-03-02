# E2E 测试覆盖分析

本文档系统梳理 Zhe 的所有核心用户流程，标注其 E2E 覆盖状态，识别关键缺口。

> 返回 [README](../README.md) | 参考 [测试策略](05-testing.md)

## 测试基础设施

项目采用双层 E2E 测试体系：

| 层级 | 框架 | 目录 | 数据库 | 认证 | 定位 |
|------|------|------|--------|------|------|
| **Vitest E2E** | Vitest | `tests/e2e/` | 内存模拟 D1 | Mock `auth()` | API 数据完整性、Server Action 流程 |
| **Playwright E2E** | Playwright | `tests/playwright/` | 真实 Cloudflare D1 | 真实 Credentials 登录 | 浏览器 UI 交互、页面渲染 |

当前统计：**276 个 E2E 测试用例**（Vitest 197 + Playwright 79）。

---

## 一、已覆盖的流程

### 1.1 公共 API 端点

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| `GET /api/health` — 健康检查 | `e2e/api.test.ts` | 1 | Vitest E2E |
| `GET /api/lookup` — Slug 查询（命中/缺失/过期） | `e2e/api.test.ts` | 4 | Vitest E2E |
| `POST /api/record-click` — 点击记录（完整/最小元数据） | `e2e/api.test.ts` | 4 | Vitest E2E |
| `POST /api/record-click` — Worker Secret 鉴权 | `e2e/api.test.ts` `e2e/api-extra.test.ts` | 4 | Vitest E2E |
| 完整重定向流程（查询 → 记录 → 计数验证） | `e2e/api.test.ts` | 2 | Vitest E2E |
| API 异常路径（D1 连接失败 → 500） | `e2e/api-extra.test.ts` | 3 | Vitest E2E |

### 1.2 认证与访问控制

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 未登录访问 `/dashboard` 重定向到着陆页 | `playwright/auth-guard.spec.ts` | 3 | Playwright |
| 已登录用户访问 `/dashboard` 正常加载 | `playwright/auth-guard.spec.ts` | 1 | Playwright |
| 已登录用户访问 `/` 重定向到 Dashboard | `playwright/auth-guard.spec.ts` | 1 | Playwright |
| 未认证用户调用 Server Action 被拒 | `e2e/edit-link.test.ts` `e2e/upload.test.ts` | 9 | Vitest E2E |

### 1.3 链接 CRUD

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 创建链接（简单模式） | `playwright/link-crud.spec.ts` | 1 | Playwright |
| 创建链接（自定义 Slug） | `playwright/link-crud.spec.ts` | 1 | Playwright |
| 复制短链接到剪贴板 | `playwright/link-crud.spec.ts` | 1 | Playwright |
| 列表/网格视图切换 | `playwright/link-crud.spec.ts` | 1 | Playwright |
| 编辑链接（添加备注） | `playwright/link-crud.spec.ts` | 1 | Playwright |
| 删除链接（确认对话框） | `playwright/link-crud.spec.ts` | 1 | Playwright |
| 刷新链接列表 | `playwright/link-crud.spec.ts` | 1 | Playwright |

### 1.4 链接编辑（Server Action 级）

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 更新 URL | `e2e/edit-link.test.ts` | 1（生命周期内） | Vitest E2E |
| 更新/清除备注 | `e2e/edit-link.test.ts` | 3 | Vitest E2E |
| Slug 编辑（自定义/冲突/非法字符/保留路径/大小写/跨用户唯一性） | `e2e/edit-link.test.ts` | 8 | Vitest E2E |
| 同时更新 Slug 和 URL | `e2e/edit-link.test.ts` | 1 | Vitest E2E |
| 编辑验证（无效 URL/不存在的链接） | `e2e/edit-link.test.ts` | 4 | Vitest E2E |

### 1.5 标签系统（Server Action 级）

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 标签 CRUD（创建/列表/更新/删除） | `e2e/edit-link.test.ts` | 1 | Vitest E2E |
| 标签-链接关联（绑定/解绑/多对多） | `e2e/edit-link.test.ts` | 3 | Vitest E2E |
| 级联删除（删标签清关联/删链接清关联） | `e2e/edit-link.test.ts` | 2 | Vitest E2E |
| 标签验证（空名/超长/非法颜色/自动颜色） | `e2e/edit-link.test.ts` | 6 | Vitest E2E |
| 多用户隔离（标签/关联互不可见） | `e2e/edit-link.test.ts` | 2 | Vitest E2E |

### 1.6 文件上传（Server Action 级）

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 上传生命周期（预签名 → 记录 → 列表 → 删除） | `e2e/upload.test.ts` | 1 | Vitest E2E |
| 多用户隔离 | `e2e/upload.test.ts` | 1 | Vitest E2E |
| 验证（超限/零字节） | `e2e/upload.test.ts` | 3 | Vitest E2E |
| 排序（最新优先） | `e2e/upload.test.ts` | 1 | Vitest E2E |

### 1.7 导航与 UI 框架

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 侧边栏品牌/导航区域/用户信息 | `playwright/navigation.spec.ts` | 3 | Playwright |
| 导航到所有页面（概览/数据管理/Webhook/上传/Backy/Xray/Inbox） | `playwright/navigation.spec.ts` | 8 | Playwright |
| 侧边栏折叠/展开 | `playwright/navigation.spec.ts` | 1 | Playwright |
| `Cmd+K` 打开搜索对话框 | `playwright/navigation.spec.ts` | 1 | Playwright |

### 1.8 着陆页

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 品牌渲染与登录按钮 | `playwright/landing.spec.ts` | 1 | Playwright |
| GitHub 链接与主题切换按钮 | `playwright/landing.spec.ts` | 1 | Playwright |
| `/login` 重定向到 `/` | `playwright/landing.spec.ts` | 1 | Playwright |

### 1.9 短链接重定向

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 短链接 307 重定向（创建链接 → 访问 → 验证跳转） | `playwright/redirect.spec.ts` | 3 | Playwright |

### 1.10 Webhook API

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| HEAD 连接测试 / GET 状态与文档 / POST 创建链接 | `e2e/webhook.test.ts` | 17 | Vitest E2E |
| 幂等性、限流（429）、自定义 Slug、文件夹分配 | `e2e/webhook.test.ts` | （含上述 17） | Vitest E2E |

### 1.11 文件夹系统

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 文件夹 CRUD（创建/列表/更新/删除） | `e2e/folders.test.ts` | 7 | Vitest E2E |
| 名称/图标验证（空名/超长/非法图标/边界） | `e2e/folders.test.ts` | 9 | Vitest E2E |
| 链接分类（分配文件夹/移动/删除级联） | `e2e/folders.test.ts` | 5 | Vitest E2E |
| 多用户隔离（跨用户不可见/不可改/不可删） | `e2e/folders.test.ts` | 4 | Vitest E2E |
| 边界情况（空更新/同时更新名称和图标） | `e2e/folders.test.ts` | 4 | Vitest E2E |

### 1.12 数据导入/导出 + 预览样式

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 未认证访问拒绝（导出/导入/预览样式读写） | `e2e/settings.test.ts` | 4 | Vitest E2E |
| 导出 → 导入 round-trip（数据一致性验证） | `e2e/settings.test.ts` | 2 | Vitest E2E |
| 导出空数据 | `e2e/settings.test.ts` | 1 | Vitest E2E |
| 导入验证（非数组/空数组/缺字段/无效 URL） | `e2e/settings.test.ts` | 5 | Vitest E2E |
| 导入重复 Slug 跳过 + 部分成功 | `e2e/settings.test.ts` | 2 | Vitest E2E |
| 多用户隔离（导出/导入互不影响） | `e2e/settings.test.ts` | 2 | Vitest E2E |
| 预览样式生命周期（默认值/切换/持久化/归一化/用户隔离） | `e2e/settings.test.ts` | 5 | Vitest E2E |
| 导入字段默认值 + 自定义值保留 | `e2e/settings.test.ts` | 2 | Vitest E2E |
| 批量导入（20 条） | `e2e/settings.test.ts` | 1 | Vitest E2E |

### 1.13 标签 UI 交互

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 创建标签（通过 TagPicker 输入新名称） | `playwright/tags.spec.ts` | 1 | Playwright |
| 分配标签给链接（编辑模式选择已有标签） | `playwright/tags.spec.ts` | 1 | Playwright |
| 标签在链接卡片上可见 | `playwright/tags.spec.ts` | 1 | Playwright |
| 移除标签（编辑模式点击已选标签） | `playwright/tags.spec.ts` | 1 | Playwright |
| 按标签筛选链接列表 | `playwright/tags.spec.ts` | 2 | Playwright |
| 清除标签筛选 | `playwright/tags.spec.ts` | 1 | Playwright |
| 多标签分配 | `playwright/tags.spec.ts` | 1 | Playwright |
| 清理（删除测试数据） | `playwright/tags.spec.ts` | 1 | Playwright |

### 1.14 Overview 页面数据渲染

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 页面区块标题渲染（链接/KV/上传） | `playwright/overview.spec.ts` | 1 | Playwright |
| 链接统计卡片（非零数值） | `playwright/overview.spec.ts` | 1 | Playwright |
| 热门链接排行（按点击量排序） | `playwright/overview.spec.ts` | 1 | Playwright |
| 上传统计卡片 | `playwright/overview.spec.ts` | 1 | Playwright |
| 图表渲染（非空状态） | `playwright/overview.spec.ts` | 1 | Playwright |
| KV 缓存区块可见 | `playwright/overview.spec.ts` | 1 | Playwright |
| 侧边栏导航到 Overview | `playwright/overview.spec.ts` | 1 | Playwright |
| 数据清理 | `playwright/overview.spec.ts` | 1 | Playwright |

### 1.15 浏览器端文件上传 UI

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 上传页面渲染（空状态/文件计数） | `playwright/uploads.spec.ts` | 1 | Playwright |
| 文件选择上传（R2 presigned URL 拦截） | `playwright/uploads.spec.ts` | 1 | Playwright |
| 上传文件排序（最新优先） | `playwright/uploads.spec.ts` | 1 | Playwright |
| 复制上传文件链接 | `playwright/uploads.spec.ts` | 1 | Playwright |
| 外部链接打开 | `playwright/uploads.spec.ts` | 1 | Playwright |
| 删除文件（确认对话框） | `playwright/uploads.spec.ts` | 1 | Playwright |
| 删除文件（取消对话框） | `playwright/uploads.spec.ts` | 1 | Playwright |
| PNG 自动转换开关（显示/隐藏） | `playwright/uploads.spec.ts` | 2 | Playwright |
| PNG 自动转换开关（localStorage 持久化） | `playwright/uploads.spec.ts` | 1 | Playwright |

### 1.16 Webhook 管理 UI

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 初始状态渲染（未生成 Token） | `playwright/webhook.spec.ts` | 1 | Playwright |
| 生成 Webhook Token | `playwright/webhook.spec.ts` | 1 | Playwright |
| Token/URL 显示与复制 | `playwright/webhook.spec.ts` | 2 | Playwright |
| 限流提示与使用文档 | `playwright/webhook.spec.ts` | 2 | Playwright |
| 重新生成 Token | `playwright/webhook.spec.ts` | 1 | Playwright |
| 吊销 Token | `playwright/webhook.spec.ts` | 1 | Playwright |
| 吊销后重新生成 | `playwright/webhook.spec.ts` | 1 | Playwright |
| 清理（删除测试数据） | `playwright/webhook.spec.ts` | 1 | Playwright |

### 1.17 404 页面与链接过期

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 不存在的 Slug 返回 404 页面 | `playwright/not-found.spec.ts` | 1 | Playwright |
| 404 页面「返回首页」链接 | `playwright/not-found.spec.ts` | 1 | Playwright |
| API lookup 不存在的 Slug 返回 404 | `playwright/not-found.spec.ts` | 1 | Playwright |
| 过期链接返回 404 页面 | `playwright/not-found.spec.ts` | 1 | Playwright |
| API lookup 过期链接返回 expired: true | `playwright/not-found.spec.ts` | 1 | Playwright |
| 未过期链接仍正常重定向 | `playwright/not-found.spec.ts` | 1 | Playwright |
| expiresAt 为 null 永不过期 | `playwright/not-found.spec.ts` | 1 | Playwright |
| 清理（删除测试数据） | `playwright/not-found.spec.ts` | 2 | Playwright |

### 1.18 Backy 备份集成

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 未认证访问拒绝（全部 8 个 action） | `e2e/backy.test.ts` | 8 | Vitest E2E |
| 配置生命周期（保存/读取/清除 webhook URL + API key） | `e2e/backy.test.ts` | 3 | Vitest E2E |
| 推送备份（成功/网络失败/空数据） | `e2e/backy.test.ts` | 3 | Vitest E2E |
| 拉取恢复（成功/网络失败/空备份） | `e2e/backy.test.ts` | 3 | Vitest E2E |
| Pull webhook 生命周期（生成/读取/吊销 pull key） | `e2e/backy.test.ts` | 4 | Vitest E2E |
| Pull API 鉴权（有效 key/无效 key/缺失 key） | `e2e/backy.test.ts` | 3 | Vitest E2E |
| 验证（无效 URL/URL 超长/API key 超长） | `e2e/backy.test.ts` | 3 | Vitest E2E |
| 多用户隔离（配置/pull key 互不可见） | `e2e/backy.test.ts` | 3 | Vitest E2E |

### 1.19 Xray Twitter 集成

| 流程 | 测试文件 | 用例数 | 覆盖层级 |
|------|---------|--------|---------|
| 未认证访问拒绝（全部 6 个 action） | `e2e/xray.test.ts` | 6 | Vitest E2E |
| 配置生命周期（保存/读取/清除 API URL + token） | `e2e/xray.test.ts` | 3 | Vitest E2E |
| 推文查找（缓存未命中 → API 调用 → 缓存写入） | `e2e/xray.test.ts` | 3 | Vitest E2E |
| 推文缓存（缓存命中跳过 API/强制刷新/过期淘汰） | `e2e/xray.test.ts` | 4 | Vitest E2E |
| 书签导入（成功/网络失败/未配置） | `e2e/xray.test.ts` | 3 | Vitest E2E |
| 截图保存（成功/失败/未配置） | `e2e/xray.test.ts` | 3 | Vitest E2E |
| 验证（无效 URL/URL 超长/token 超长/无效推文 ID） | `e2e/xray.test.ts` | 5 | Vitest E2E |
| 多用户隔离（配置互不可见） | `e2e/xray.test.ts` | 2 | Vitest E2E |
| 推文缓存跨用户共享 | `e2e/xray.test.ts` | 1 | Vitest E2E |
| 集成流程（配置 → 查找 → 书签 → 截图） | `e2e/xray.test.ts` | 7 | Vitest E2E |

---

## 二、尚未覆盖的流程

### 2.1 功能页面交互

| 流程 | 涉及页面 | 现有测试 |
|------|---------|---------|
| **单链接分析视图** | 链接卡片展开 | `getAnalyticsStats` 存在但 UI 级验证缺失 |

### 2.2 系统集成

| 流程 | 涉及代码 | 现有测试 |
|------|---------|---------|
| **KV 同步** (`POST /api/cron/sync-kv`) | `app/api/cron/sync-kv/route.ts` | 有单元测试，无 E2E 完整流程 |
| **Worker 状态查询** | `app/api/worker-status/route.ts` | 仅单元测试 |
| **链接元数据自动抓取** | `actions/enrichment.ts` | 仅单元测试 |
| **截图捕获** | `actions/links.ts` (`fetchAndSaveScreenshot`) | 无任何 E2E 覆盖 |

### 2.3 UI 与体验

| 流程 | 备注 |
|------|------|
| **主题切换效果** | 仅检测按钮存在，未验证实际切换 |
| **Preview 样式设置** | `getPreviewStyle` / `updatePreviewStyle` 已有 E2E 覆盖 |
| **主题切换效果** | 仅检测按钮存在，未验证实际切换 |
| **Storage 诊断页** | 仅导航测试，未验证 D1/R2 统计展示 |
| **移动端布局** | 无 viewport 测试 |
| **网络异常状态** | 无 Playwright 测试 server error / 网络中断场景 |

---

## 三、核心流程缺口

以下是按业务影响排序的最关键缺口，建议优先补充：

### P0 — 产品核心功能 ✅ 已全部覆盖

| # | 流程 | 测试文件 | 状态 |
|---|------|---------|------|
| 1 | **短链接 307 重定向** | `playwright/redirect.spec.ts` (3 tests) | ✅ 已覆盖 |
| 2 | **Webhook 创建链接** | `e2e/webhook.test.ts` (17 tests) | ✅ 已覆盖 |
| 3 | **文件夹系统** | `e2e/folders.test.ts` (29 tests) | ✅ 已覆盖 |

### P1 — 重要用户流程 ✅ 已全部覆盖

| # | 流程 | 测试文件 | 状态 |
|---|------|---------|------|
| 4 | **搜索功能完整流程** | `playwright/search.spec.ts` (9 tests) | ✅ 已覆盖 |
| 5 | **数据导入/导出** | `e2e/settings.test.ts` (24 tests) | ✅ 已覆盖 |
| 6 | **标签 UI 交互** | `playwright/tags.spec.ts` (9 tests) | ✅ 已覆盖 |
| 7 | **Overview 数据渲染** | `playwright/overview.spec.ts` (8 tests) | ✅ 已覆盖 |

### P2 — 辅助功能 ✅ 已全部覆盖

| # | 缺口 | 建议补充方案 | 状态 |
|---|------|-------------|------|
| 8 | 浏览器端文件上传 UI | `playwright/uploads.spec.ts` (10 tests) | ✅ 已覆盖 |
| 9 | Webhook 管理 UI | `playwright/webhook.spec.ts` (10 tests) | ✅ 已覆盖 |
| 10 | 链接过期处理 | `playwright/not-found.spec.ts` (9 tests) | ✅ 已覆盖 |
| 11 | 404 页面渲染 | `playwright/not-found.spec.ts` (含上述 9 tests) | ✅ 已覆盖 |
| 12 | Backy 备份集成 | `e2e/backy.test.ts` (30 tests) | ✅ 已覆盖 |
| 13 | Xray Twitter 集成 | `e2e/xray.test.ts` (37 tests) | ✅ 已覆盖 |

---

## 覆盖率矩阵（按功能模块）

| 功能模块 | 单元测试 | Vitest E2E | Playwright E2E | 综合评价 |
|----------|:--------:|:----------:|:--------------:|---------|
| 健康检查 API | ✅ | ✅ | — | 充分 |
| Slug 查询 API | ✅ | ✅ | — | 充分 |
| 点击记录 API | ✅ | ✅ | — | 充分 |
| 认证守卫 | ✅ | ✅ | ✅ | 充分 |
| 链接 CRUD | ✅ | ✅ | ✅ | 充分 |
| Slug 编辑 | ✅ | ✅ | — | 充分 |
| 标签系统 | ✅ | ✅ | ✅ | 充分 |
| 文件上传 | ✅ | ✅ | ✅ | 充分 |
| 文件夹系统 | ✅ | ✅ | — | 充分 |
| 短链接重定向 | ✅ | ⚠️ 部分 | ✅ | 充分 |
| Webhook API | ✅ | ✅ | — | 充分 |
| 数据导入/导出 | ✅ | ✅ | — | 充分 |
| 搜索功能 | ✅ | — | ✅ | 充分 |
| Overview 统计 | ✅ | — | ✅ | 充分 |
| Backy 备份 | ✅ | ✅ | — | 充分 |
| Xray 集成 | ✅ | ✅ | — | 充分 |
| Webhook 管理 UI | ✅ | — | ✅ | 充分 |
| 侧边栏导航 | — | — | ✅ | 充分 |
| 着陆页 | — | — | ✅ | 充分 |
| 404 页面 | ✅ | — | ✅ | 充分 |
| 主题切换 | — | — | ⚠️ 仅存在 | 缺失 |

> **图例**：✅ 充分覆盖 | ⚠️ 部分覆盖 | ❌ 未覆盖 | — 不适用

---

## 相关文档

- [测试策略](05-testing.md)
- [架构概览](01-architecture.md)
- [功能清单](03-features.md)
