# E2E 测试覆盖分析

本文档系统梳理 Zhe 的所有核心用户流程，标注其 E2E 覆盖状态，识别关键缺口。

> 返回 [README](../README.md) | 参考 [测试策略](05-testing.md)

## 测试基础设施

项目采用双层 E2E 测试体系：

| 层级 | 框架 | 目录 | 数据库 | 认证 | 定位 |
|------|------|------|--------|------|------|
| **Vitest E2E** | Vitest | `tests/e2e/` | 内存模拟 D1 | Mock `auth()` | API 数据完整性、Server Action 流程 |
| **Playwright E2E** | Playwright | `tests/playwright/` | 真实 Cloudflare D1 | 真实 Credentials 登录 | 浏览器 UI 交互、页面渲染 |

当前统计：**139 个 E2E 测试用例**（Vitest 106 + Playwright 33）。

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

---

## 二、尚未覆盖的流程

### 2.1 核心数据流程

| 流程 | 涉及代码 | 现有测试 |
|------|---------|---------|
| **数据导入/导出 round-trip** | `actions/settings.ts` | 有单元测试，无 E2E 验证导出 → 导入 → 数据一致性 |

### 2.2 功能页面交互

| 流程 | 涉及页面 | 现有测试 |
|------|---------|---------|
| **Overview 统计数据渲染** | `/dashboard/overview` | 仅验证页面可达，未验证统计数字/图表渲染 |
| **浏览器端文件上传 UI** | `/dashboard/uploads` | Action 级已覆盖，拖拽/选择文件的 UI 交互未测 |
| **标签 UI 交互** | Dashboard 链接卡片 | Action 级已覆盖，浏览器中创建/分配/筛选标签未测 |
| **搜索功能** (`Cmd+K`) | 全局搜索对话框 | 仅验证对话框弹出，未测输入查询 → 结果展示 → 点击跳转 |
| **单链接分析视图** | 链接卡片展开 | `getAnalyticsStats` 存在但 UI 级验证缺失 |
| **Webhook 管理 UI** | `/dashboard/webhook` | 仅导航测试，生成/吊销 Token、限流配置的 UI 操作未测 |
| **链接过期处理** | middleware + UI | Middleware 级已测，但无 Playwright 测试创建过期链接后访问验证 404 |

### 2.3 系统集成

| 流程 | 涉及代码 | 现有测试 |
|------|---------|---------|
| **Backy 备份**（配置/推送/拉取/历史） | `actions/backy.ts` `app/api/backy/pull/route.ts` | 有单元测试，无 E2E 完整流程 |
| **Xray Twitter 集成**（配置/推文查找/书签） | `actions/xray.ts` | 有单元测试，无 E2E 完整流程 |
| **KV 同步** (`POST /api/cron/sync-kv`) | `app/api/cron/sync-kv/route.ts` | 有单元测试，无 E2E 完整流程 |
| **Worker 状态查询** | `app/api/worker-status/route.ts` | 仅单元测试 |
| **链接元数据自动抓取** | `actions/enrichment.ts` | 仅单元测试 |
| **截图捕获** | `actions/links.ts` (`fetchAndSaveScreenshot`) | 无任何 E2E 覆盖 |

### 2.4 UI 与体验

| 流程 | 备注 |
|------|------|
| **404 页面渲染** | 无 Playwright 测试访问不存在的 Slug 验证 404 页面 |
| **主题切换效果** | 仅检测按钮存在，未验证实际切换 |
| **Preview 样式设置** | `getPreviewStyle` / `updatePreviewStyle` 无 E2E |
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

### P1 — 重要用户流程，尽快补充

| # | 缺口 | 为什么重要 | 建议补充方案 |
|---|------|-----------|-------------|
| 4 | **搜索功能完整流程** | 高频交互入口，Cmd+K 是用户快速定位链接的主要方式。 | Playwright：打开搜索 → 输入关键字 → 验证结果列表 → 点击结果跳转 |
| 5 | **数据导入/导出** | 数据可移植性是用户信任的基础，损坏导入会造成数据丢失。 | Vitest E2E：创建数据 → 导出 JSON → 清空 → 导入 JSON → 逐条比对 |
| 6 | **标签 UI 交互** | Action 级覆盖完善但用户实际通过 UI 操作，渲染和交互可能有独立问题。 | Playwright：创建标签 → 分配给链接 → 验证标签在卡片上可见 → 按标签筛选 |
| 7 | **Overview 数据渲染** | 用户理解使用状况的入口，空数据/异常数据渲染可能导致误导。 | Playwright：先创建链接+点击 → 访问 Overview → 验证关键统计数字非零 |

### P2 — 辅助功能，按需补充

| # | 缺口 | 建议补充方案 |
|---|------|-------------|
| 8 | 浏览器端文件上传 UI | Playwright：文件选择 → 上传 → 验证列表出现 → 删除 |
| 9 | Webhook 管理 UI | Playwright：生成 Token → 复制 → 吊销 → 验证状态变更 |
| 10 | 链接过期处理 | Playwright：创建已过期链接 → 访问短链 → 验证 404 页面 |
| 11 | 404 页面渲染 | Playwright：访问不存在的 Slug → 验证 404 页面元素 |
| 12 | Backy 备份集成 | Vitest E2E：配置 → 推送 → 验证数据一致性 |
| 13 | Xray Twitter 集成 | Vitest E2E：配置 → 查找推文 → 验证缓存 |

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
| 标签系统 | ✅ | ✅ | ❌ | Action 充分，UI 缺失 |
| 文件上传 | ✅ | ✅ | ❌ | Action 充分，UI 缺失 |
| 文件夹系统 | ✅ | ✅ | — | 充分 |
| 短链接重定向 | ✅ | ⚠️ 部分 | ✅ | 充分 |
| Webhook API | ✅ | ✅ | — | 充分 |
| 数据导入/导出 | ✅ | ❌ | ❌ | 缺失 |
| 搜索功能 | ✅ | — | ⚠️ 仅弹窗 | 缺失 |
| Overview 统计 | ✅ | — | ⚠️ 仅导航 | 缺失 |
| Backy 备份 | ✅ | ❌ | ❌ | 缺失 |
| Xray 集成 | ✅ | ❌ | ❌ | 缺失 |
| Webhook 管理 UI | ✅ | — | ⚠️ 仅导航 | 缺失 |
| 侧边栏导航 | — | — | ✅ | 充分 |
| 着陆页 | — | — | ✅ | 充分 |
| 404 页面 | ✅ | ❌ | ❌ | 缺失 |
| 主题切换 | — | — | ⚠️ 仅存在 | 缺失 |

> **图例**：✅ 充分覆盖 | ⚠️ 部分覆盖 | ❌ 未覆盖 | — 不适用

---

## 相关文档

- [测试策略](05-testing.md)
- [架构概览](01-architecture.md)
- [功能清单](03-features.md)
