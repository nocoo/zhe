# 全局搜索统一化（Sidebar Cmd+K）

> 状态：规划（未实施）  
> 日期：2026-07-24  
> 关联：原 Todo 模块任务 #2「合并搜索功能」；现有实现 `components/search-command-dialog.tsx`  
> 权威 UI 契约：`docs/22-design-tokens.md` · Agent 入口：`CLAUDE.md`

---

## 0. 目标

把左侧 Sidebar 的全局搜索做成 **唯一搜索入口**：

| 要求 | 说明 |
|------|------|
| 多类型 | 同时搜 **链接 + 想法 + 待办**（保留页面跳转 / 主题动作） |
| 任意匹配 | 类型内多字段 **OR 子串匹配**（case-insensitive）；不要求用户指定类型 |
| 分类展示 | 结果按类型分组，组内有计数，空组不渲染 |
| 点击导航 | 每类结果打开正确页面，并落到正确资源（含 deep-link） |
| 单一入口 | 去掉 Todo 页右上角「搜索待办」等页面内搜索框，避免双入口 |

**非目标（本轮不做）**

- 服务端全文检索 / 跨用户搜索
- 语义 / embedding 搜索
- 上传文件全文、Webhook、API Key 等系统页内容
- 复杂布尔查询语法（`AND`/`OR`/`type:todo`）——可放 v2

---

## 1. 现状审计（事实，不是猜测）

### 1.1 已经有的能力

| 能力 | 位置 | 现状 |
|------|------|------|
| Sidebar 打开搜索 | `sidebar-expanded.tsx` / `sidebar-collapsed.tsx` + Cmd/Ctrl+K | 打开 `SearchCommandDialog` |
| 链接 / 想法 / 待办分组 | `search-command-dialog.tsx` | `CommandGroup`：`链接` / `想法` / `待办` |
| 页面跳转 / 动作 | `launcher-groups.tsx` | 空查询与有查询均可 |
| 想法懒加载 | `ensureIdeasLoaded` | dialog open 时触发 |
| 待办懒加载 | `ensureTodosLoaded` | dialog open 时触发 |
| 想法导航 | `router.push(/dashboard/ideas/{id})` | 已有 |
| 待办导航 | `router.push(/dashboard/todos?id={id})` | 页内 `?id=` 已 seed selection |
| L1 测试 | `search-command-dialog-search.test.tsx` / `*-todos.test.tsx` | 有覆盖 |
| L3 测试 | `tests/playwright/search.spec.ts` | 以链接为主 |

### 1.2 与「产品预期」的差距

| # | 缺口 | 证据 / 影响 |
|---|------|-------------|
| G1 | **Sidebar 文案仍是「搜索链接...」** | `sidebar-expanded.tsx` — 用户误以为只能搜链接 |
| G2 | **Todo 页仍有独立「搜索待办」** | `todos-filter-bar.tsx` — 双入口，与全局搜索重复 |
| G3 | **待办匹配字段不全** | `filterTodos` 只匹配 `title` + `excerpt`，**不匹配** free-form `tagNames` / `emoji` |
| G4 | **想法不匹配正文全文** | 只有 `title` + `excerpt`（设计如此；文档需写清） |
| G5 | **链接主行点击行为** | 主 `CommandItem` 打开原 URL；跳转 Dashboard 卡片需确认是否缺「打开详情」——规划中定为 **主点击进链接管理并高亮**（见 3.3），与「打开原站」拆开 |
| G6 | **空查询 / 有查询信息架构** | 有 query 时才显示链接/想法/待办组；合理，但需统一 empty / loading |
| G7 | **加载态不完整** | ideas/todos 懒加载期间无 skeleton / spinner，可能短暂「无结果」 |
| G8 | **结果上限 / 性能** | 客户端全量 filter，无 per-group cap；数据量大时列表过长 |
| G9 | **测试未锁定「三类并存 + 导航」** | L3 偏链接；L1 对三类同框展示与 deep-link 组合不足 |

### 1.3 设计结论

本任务 **不是从零做搜索**，而是：

1. **产品语义统一**（文案、入口、Todo 页本地搜索下线）  
2. **匹配契约补齐**（尤其待办 tag / emoji）  
3. **导航契约写死并测通**  
4. **加载 / 空态 / 上限打磨**  
5. **测试与文档对齐**

---

## 2. 产品规格

### 2.1 入口

| 入口 | 行为 |
|------|------|
| Sidebar 搜索条 | 打开 `SearchCommandDialog`；文案改为 **「搜索…」** 或 **「搜索链接、想法、待办…」** |
| Cmd/Ctrl+K | 全局（已有） |
| Todo 页 FilterBar | **移除**搜索输入框；保留 due / tag / 显示已完成 |
| Ideas 页 | 保留列表内 filter **可选**：本轮 **不强制**下线（想法列表本地 filter 与 Cmd+K 用途不同：列表筛选 vs 全局跳转）。若强制统一，见 §8 可选 |

### 2.2 匹配规则（「任意匹配」定义）

**查询预处理**

- `trim` + case-fold（`toLowerCase`）
- 空串 → 不展示资源组，只展示 empty hint + 页面/动作（现状保留）
- **本轮**：单段子串匹配；多词按 **整串** 匹配（不拆词）。v2 可拆为 AND token

**按类型字段（OR）**

| 类型 | 匹配字段 | 不匹配 |
|------|----------|--------|
| **链接** | `slug`、`originalUrl`（去协议）、`metaTitle`、`metaDescription`、`note`、关联 **tag 名**、**folder 名**（若 ctx 提供） | 截图二进制 |
| **想法** | `title`、`excerpt`、关联 **tag 名** | 完整 `content` 正文（仅 excerpt 200 字） |
| **待办** | `title`、`excerpt`、**tagNames**（free-form）、**emoji**（字面量） | 完整 Markdown content |
| **页面跳转** | 既有 `PageJumpGroup` 标题/keywords | — |
| **动作** | 既有 theme actions | — |

**已完成待办**：全局搜索 **包含** done 项（与 Todo 页 filter「显示已完成」无关）；UI 用删除线区分（`TodoResultItem` 已有）。

### 2.3 分类展示

固定顺序（有命中才渲染组）：

1. **页面**（`PageJumpGroup`）  
2. **动作**（`ActionGroup`）  
3. **链接 (N)**  
4. **想法 (N)**  
5. **待办 (N)**  

每组：

- `heading` 含计数：`链接 (3)`
- **每组最多 20 条**（常量 `SEARCH_GROUP_LIMIT = 20`）；超出在组底一行弱提示「还有 M 条，请缩小关键词」（非可点击或可点进对应列表页——v1 仅文案）
- 组内排序：本轮 **稳定原数组顺序**（links/ideas/todos 各自默认序）；不引入相关度评分（v2）

### 2.4 点击导航契约

| 结果类型 | 主点击（`CommandItem.onSelect` / Enter） | 行内次要操作 |
|----------|------------------------------------------|--------------|
| **链接** | `router.push(/dashboard?highlight={linkId})` 或现有 inbox/list 约定；**优先进入 Dashboard 链接列表并高亮该卡** | 保留：打开原 URL（新标签）、复制短链、跳转文件夹 |
| **想法** | `router.push(/dashboard/ideas/{id})` | 无 |
| **待办** | `router.push(/dashboard/todos?id={id})`；Todos 页 seed selection + 详情 | 无 |
| **页面** | `router.push(href)` | 无 |
| **动作** | 执行 action（关 dialog） | 无 |

**链接主点击变更（重要）**

现状：`LinkResultItem` 主 select 打开原站。产品要求「正确打开对应的页面」更偏向 **应用内页面**。

- **P0 推荐**：主 select → Dashboard 并高亮链接；原站打开保留为行内按钮 / 次要 action。  
- 若担心破坏习惯：主 select 仍打开原站，但增加「在 Dashboard 打开」按钮。  
- **本规划锁定 P0 推荐**；实施前可在 PR 描述中再次确认。

**待办 deep-link 验收**

- `?id=N` 选中该行  
- 右侧 detail 加载正确  
- 祖先展开（若 arborist 默认折叠，需 `openParents` / 等价逻辑——实施时核对 `TodoTreeShell`）

### 2.5 加载与空态

| 状态 | UI |
|------|-----|
| Dialog 打开且 ideas/todos 未 load 完 | 资源组区域 `加载中…` 一行（不假装「没有结果」） |
| 有 query、三类+页面+动作皆空且已 load 完 | `CommandEmpty`：没有找到匹配的结果 |
| 无 query | 现有 hint + 页面/动作预览 |

`ensureIdeasLoaded` / `ensureTodosLoaded` 失败：console.error + 该类型组显示「加载失败」弱文案（不阻塞其它类型）。

---

## 3. 技术设计

### 3.1 架构（保持客户端搜索）

```
Sidebar / Cmd+K
    → SearchCommandDialog (shouldFilter=false)
         → ensureIdeasLoaded + ensureTodosLoaded
         → filterLinks / filterIdeas / filterTodos (models/*)
         → CommandGroup × 类型
         → *ResultItem → router.push / window.open
```

数据源：`DashboardService` 内存缓存（links 启动加载；ideas/todos 懒加载）。**不新增 API**。

### 3.2 模型层补齐

**`models/todos.ts` — `filterTodos`**

- 文本 query 匹配：`title` OR `excerpt` OR `tagNames[]` OR `emoji`
- 保持祖先链逻辑供树筛选；全局搜索侧 **继续** 对结果再 filter「自身命中」（与现 dialog 一致），避免只显示祖先空壳

**`models/links.ts` — `filterLinks`（可选增强）**

- 增加 folder 名匹配（ctx 传入 `folders`）

**`models/ideas.ts`**

- 保持 title/excerpt/tag；文档写清不含全文

建议抽出共享：

```ts
// models/search.ts（可选，若重复多再抽）
export function normalizeSearchQuery(q: string): string
export const SEARCH_GROUP_LIMIT = 20
export function takeSearchHits<T>(items: T[], limit = SEARCH_GROUP_LIMIT): { hits: T[]; more: number }
```

### 3.3 UI 层

| 文件 | 变更 |
|------|------|
| `sidebar-expanded.tsx` | 文案「搜索链接...」→「搜索…」/「搜索链接、想法、待办…」 |
| `sidebar-collapsed.tsx` | aria-label 同步 |
| `search-command-dialog.tsx` | loading 态；group limit；filterTodos 字段；链接导航 |
| `link-result-item.tsx` | 主 select 导航契约调整 |
| `todos-filter-bar.tsx` | **删除**搜索 Input 与相关 props |
| `todos-page.tsx` / `useTodosFilters` | 去掉 `searchQuery` 或保留 API 但 UI 不暴露（推荐 **删除 UI + 简化 filter**，减少状态） |
| `todo-result-item.tsx` | 展示 emoji（标题前）；tag 命中时 highlight 可选 |

### 3.4 ViewModel / Filter

Todo 页：

- `useTodosFilters` 去掉 `searchQuery` 或标记 deprecated  
- FilterBar 只剩 due / tag / showDone / clear  
- active filter count 不再含 search  

Global search **不** 写入 Todo 页 filter 状态（跳转后不预填本地搜索）。

### 3.5 导航辅助（链接高亮）

若 `?highlight=` 尚不存在：

1. 增加 `app/(dashboard)/dashboard/page.tsx` 或 links list 读 `searchParams.highlight`  
2. `LinksList` 滚动到对应卡 + 短暂 ring 高亮  
3. 无该 id 时静默忽略  

此步可单独原子 commit。

---

## 4. 测试计划

### 4.1 L1 — 单元 / 组件

| ID | 内容 | 文件 |
|----|------|------|
| U1 | `filterTodos` 命中 title / excerpt / tag / emoji | `tests/unit/todos-model.test.ts` 或新建 |
| U2 | `filterTodos` 祖先链 + 全局侧「仅自身命中」行为 | 同上 + dialog 测试 |
| U3 | `filterLinks` folder 名（若做） | `tests/unit/links-model.test.ts` |
| U4 | Dialog：三类同框分组 heading 与计数 | `search-command-dialog-*.test.tsx` |
| U5 | Dialog：点击想法 → `push(/dashboard/ideas/id)` | 已有则加固 |
| U6 | Dialog：点击待办 → `push(/dashboard/todos?id=)` | todos 测试加固 |
| U7 | Dialog：点击链接 → Dashboard highlight（新契约） | search test |
| U8 | Dialog open → `ensureIdeasLoaded` + `ensureTodosLoaded` | 已有 |
| U9 | loading 时不显示「没有找到」 | 新断言 |
| U10 | group limit 截断 + more 文案 | 新 |
| U11 | TodosFilterBar **无**「搜索待办」输入 | filter-bar test 更新 |
| U12 | 文案 / placeholder 常量与 Playwright 共用 | 防止 C14 类回归 |

### 4.2 L2 — API（本轮）

无需新 API；**不强制** L2。若加服务端 search 端点再补。

### 4.3 L3 — Playwright

| ID | 内容 |
|----|------|
| E1 | Sidebar 按钮文案可打开 dialog |
| E2 | 创建一条 link + idea + todo，用公共关键词搜索，三类 heading 均可见 |
| E3 | 点想法结果 → URL `/dashboard/ideas/{id}` |
| E4 | 点待办结果 → `/dashboard/todos?id=` 且详情标题匹配 |
| E5 | 点链接结果 → Dashboard 且可见该 slug（按新导航契约） |
| E6 | Todo 页无「搜索待办」placeholder |
| E7 | 空查询显示 hint，不显示资源组 |

`SEARCH_INPUT_PLACEHOLDER` 继续单点维护（`search.spec.ts` 已有常量模式）。

### 4.4 手动验收清单

- [ ] Cmd+K / Sidebar 打开  
- [ ] 中英混合、部分子串  
- [ ] 待办 tag / emoji 可搜  
- [ ] 已完成待办可搜且带删除线  
- [ ] 懒加载慢网：先 loading 后结果  
- [ ] light / dark  

---

## 5. 原子化提交计划（建议顺序）

每个 commit 独立可 build / L1 绿；Conventional Commits；**禁止** `git add -A`。

### Phase A — 契约与匹配（纯逻辑）

| Step | Commit message | 内容 | 测试 |
|------|----------------|------|------|
| A1 | `feat: match todo tags and emoji in filterTodos` | `models/todos.ts` 文本匹配扩展 | U1/U2 |
| A2 | `feat: match folder name in filterLinks` | （可选）`models/links.ts` + ctx.folders | U3 |
| A3 | `feat: add search group limit helper` | `models/search.ts` 或 constants | U10 单测 |

### Phase B — Dialog 行为

| Step | Commit message | 内容 | 测试 |
|------|----------------|------|------|
| B1 | `feat: show loading state in search dialog` | ideas/todos loading 门闩 | U9 |
| B2 | `feat: cap search results per group` | 应用 `SEARCH_GROUP_LIMIT` | U10 |
| B3 | `feat: navigate link search hits to dashboard` | `link-result-item` + handlers | U7 |
| B4 | `feat: highlight link from search query param` | links page deep-link | U7 + 组件测试 |
| B5 | `fix: show emoji on todo search results` | `todo-result-item` | 展示断言 |

### Phase C — 入口统一

| Step | Commit message | 内容 | 测试 |
|------|----------------|------|------|
| C1 | `fix: update sidebar search label for multi-type` | expanded/collapsed 文案 + aria | U12 |
| C2 | `refactor: remove todos page local search box` | FilterBar + page + viewmodel filter | U11 |
| C3 | `docs: document global search match and nav contract` | 更新 21/19 与本文件状态；README 一行可选 | — |

### Phase D — E2E

| Step | Commit message | 内容 | 测试 |
|------|----------------|------|------|
| D1 | `test: cover multi-type global search in playwright` | E2–E6 | L3 |

**建议不要** 把 A+B+C 揉成一个 commit。预计 8–11 个原子 commit。

---

## 6. 实现检查清单（开发时勾）

### 逻辑

- [ ] 三类匹配字段符合 §2.2  
- [ ] 组顺序与计数正确  
- [ ] 每组 cap 20  
- [ ] loading 不误报 empty  
- [ ] 导航契约 §2.4  
- [ ] Todo `?id=` 选中 + 详情  
- [ ] 链接 highlight 滚动  

### 产品

- [ ] Sidebar 不再写「仅链接」  
- [ ] Todo 页无本地搜索框  
- [ ] Cmd+K placeholder 与 Sidebar 语义一致  

### 测试

- [ ] L1 全绿 + coverage  
- [ ] L3 search.spec 扩展  
- [ ] 无硬编码版本号  

### 回归

- [ ] 主题动作仍可用  
- [ ] 页面跳转组仍可用  
- [ ] 想法/待办懒加载不重复请求（已 load 则 skip）  

---

## 7. 风险与决策点

| 风险 | 缓解 |
|------|------|
| 链接主点击从「开原站」改为「进 Dashboard」改变习惯 | 行内保留开原站；PR 说明；可开关 feature flag（默认不需要） |
| 客户端全量 filter 性能 | 每组 20 条 cap；数据量极大时 v2 服务端 |
| excerpt 滞后于 content | 写时生成已有；搜索依赖 excerpt 契约写进文档 |
| Todo 树 deep-link 未展开祖先 | 实施时在 shell 补 expand；加 L3 E4 |
| 与 Ideas 页本地搜索并存 | §2.1 本轮保留 Ideas 本地 filter |

**需要你拍板（实施前）**

1. 链接主点击：进 Dashboard 高亮 **vs** 继续开原站？  
2. Ideas 页搜索框：保留 **vs** 一并下线？  
3. 每组上限 20 是否合适？  

默认建议：**1=Dashboard 高亮，2=保留 Ideas 本地，3=20**。

---

## 8. 可选后续（v2）

- 查询语法：`type:todo tag:work`  
- 多 token AND  
- 相关度排序  
- 最近访问 / 固定结果  
- 服务端 FTS（D1 FTS5）  
- 搜索上传文件名  

---

## 9. 验收标准（DoD）

1. Sidebar / Cmd+K 可搜到链接、想法、待办，分组清晰。  
2. 点击结果进入正确页面且资源可见/选中。  
3. Todo 页无第二搜索框；Sidebar 文案不再暗示「仅链接」。  
4. 匹配字段满足 §2.2（含待办 tag/emoji）。  
5. L1 + 扩展 L3 通过；本文件状态改为「已实施」并链接最终 commit 列表。  

---

## 10. 参考路径速查

| 角色 | 路径 |
|------|------|
| Dialog | `components/search-command-dialog.tsx` |
| 结果行 | `components/search-command-dialog-parts/*-result-item.tsx` |
| 过滤 | `models/links.ts` `models/ideas.ts` `models/todos.ts` |
| 数据 | `contexts/dashboard-service.tsx` + `useIdeasSlice` / `useTodosSlice` |
| Sidebar | `components/sidebar-parts/sidebar-expanded.tsx` |
| Todo 本地搜 | `todos-filter-bar.tsx` `useTodosFilters.ts` |
| 待办 deep-link | `components/dashboard/todos-page.tsx` (`?id=`) |
| L3 | `tests/playwright/search.spec.ts` |
| 设计背景 | `docs/21-todos-feature.md` § Global Search |

---

## 11. 状态日志

| 日期 | 事件 |
|------|------|
| 2026-07-24 | 初稿：审计现状 + 规格 + 测试 + 原子 commit 计划 |
| — | 待：用户拍板 §7 三点后 `su-go` 实施 |
