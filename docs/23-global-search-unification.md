# 全局搜索统一化（Sidebar Cmd+K）

> 状态：规划（未实施）· **Codex 文档评审后修订**  
> 日期：2026-07-24  
> 关联：原 Todo 模块任务 #2「合并搜索功能」；现有实现 `components/search-command-dialog.tsx`  
> 权威 UI 契约：`docs/22-design-tokens.md` · Agent 入口：`CLAUDE.md`

---

## 0. 目标

把左侧 Sidebar / Cmd+K 做成 **唯一跨资源搜索入口**（跨类型跳转与发现），**不是** 消灭一切页面内筛选。

| 要求 | 说明 |
|------|------|
| 多类型 | 同时搜 **链接 + 想法 + 待办**（保留页面跳转 / 主题动作） |
| 任意匹配 | 类型内多字段 **OR 子串匹配**（case-insensitive）；不要求用户指定类型 |
| 分类展示 | 结果按类型分组，组内有计数，空组不渲染；命中需有 **可见证据**（§2.6） |
| 点击导航 | 每类结果打开正确应用内页面，并落到正确资源（含 deep-link 完整验收 §2.4） |
| 文案一致 | Sidebar / placeholder 明确「多类型」，不再写「仅链接」 |

**页面内筛选（保留）**

| 页面 | 保留 | 理由 |
|------|------|------|
| Todo FilterBar | **保留**「搜索待办」+ due / tag / showDone | 列表筛选可与标签、截止组合；与 Cmd+K「跨页跳转」职责不同 |
| Ideas 工具栏搜索 | **保留** | 同上（列表筛选 vs 全局跳转） |

> Codex P1：原「唯一入口并移除 Todo 搜索」与「Ideas 可保留筛选」自相矛盾，且会破坏 Todo 文档中的 `/` 聚焦搜索等契约。已改为 **唯一跨资源入口 + 页面内筛选并存**。

**非目标（本轮不做）**

- 服务端全文检索 / 跨用户搜索  
- 语义 / embedding 搜索  
- 上传文件全文、Webhook、API Key 等系统页内容  
- 复杂布尔查询语法（`AND`/`OR`/`type:todo`）——v2  
- 用「每组 20 条」解决 O(n) 过滤成本（那只是 **渲染保护**，见 §2.5 / §7）

---

## 1. 现状审计（事实，不是猜测）

### 1.1 已经有的能力

| 能力 | 位置 | 现状 |
|------|------|------|
| Sidebar 打开搜索 | `sidebar-expanded.tsx` / `sidebar-collapsed.tsx` + Cmd/Ctrl+K | 打开 `SearchCommandDialog` |
| 链接 / 想法 / 待办分组 | `search-command-dialog.tsx` | `CommandGroup`：`链接` / `想法` / `待办` |
| 页面跳转 / 动作 | `launcher-groups.tsx` | 空查询与有查询均可 |
| 想法懒加载 | `ensureIdeasLoaded` | dialog open 时触发；slice 内有 `ideasLoaded` 但 **未暴露给 UI** |
| 待办懒加载 | `ensureTodosLoaded` | 同上；`todosLoaded` **未暴露** |
| 公开加载标志 | `DashboardState` | 仅 `ideasLoading` / `todosLoading`；**无** `ideasError` / `todosError` / `*Loaded` |
| 想法导航 | `router.push(/dashboard/ideas/{id})` | 已有 |
| 待办导航 | `router.push(/dashboard/todos?id={id})` | 仅 `setSelectedId`；**无** 显式展开祖先 / 滚动进视口 |
| 链接主点击 | `link-result-item.tsx` | 打开 **原站** URL |
| L1 测试 | `search-command-dialog-*.test.tsx` | 有覆盖 |
| L3 测试 | `tests/playwright/search.spec.ts` | 以链接为主 |

### 1.2 与「产品预期」的差距

| # | 缺口 | 证据 / 影响 |
|---|------|-------------|
| G1 | Sidebar 文案「搜索链接...」 | 误导为单类型 |
| G2 | 待办匹配字段不全 | `filterTodos` 仅 title + excerpt，缺 tagNames / emoji |
| G3 | 加载态模型不足 | 仅 `*Loading`，无 loaded/error；`success:false` 进不了 catch → 无法区分 empty / error；首次打开可能 **误报空结果** |
| G4 | 链接主点击非应用内 | 主 select 开原站；缺 Dashboard deep-link 契约 |
| G5 | 待办 deep-link 不完整 | 只 seed selection；折叠父节点下可能不可见 |
| G6 | 无「为何命中」证据 | 命中第 4 个 tag 或未展示的 URL path 时行上无高亮 |
| G7 | 无 per-group 渲染上限 | 列表可能极长（纯 UX，非过滤成本） |
| G8 | 测试未锁三类并存 + 完整导航 | L3 偏链接；E4 级验收不足 |
| G9 | folder 名匹配 | 链接过滤未带 folder；规格须定为 v1 **必做** |

### 1.3 设计结论

本任务 **不是从零做搜索**，而是：

1. **状态契约补齐**（idle / loading / success / error，暴露 loaded）  
2. **匹配与命中证据补齐**  
3. **导航契约写死 + deep-link 完整实现**  
4. **文案与测试对齐**  
5. **页面内筛选保留**（Todo / Ideas）

---

## 2. 产品规格

### 2.1 入口

| 入口 | 行为 |
|------|------|
| Sidebar 搜索条 | 打开 `SearchCommandDialog`；文案 → **「搜索链接、想法、待办…」**（与 dialog placeholder 对齐） |
| Cmd/Ctrl+K | 全局（已有） |
| Todo 页 FilterBar | **保留** 搜索 + due / tag / showDone（页面内筛选） |
| Ideas 页工具栏 | **保留** 本地搜索（页面内筛选） |

### 2.2 匹配规则（「任意匹配」定义）

**查询预处理**

- `trim` + case-fold（`toLowerCase`）
- 空串 → 不展示资源组，只展示 empty hint + 页面/动作  
- **本轮**：单段子串；多词按 **整串** 匹配（不拆词）。v2 可 AND token  

**按类型字段（OR）— v1 全部必做**

| 类型 | 匹配字段 | 不匹配 |
|------|----------|--------|
| **链接** | `slug`、`originalUrl`（去协议）、`metaTitle`、`metaDescription`、`note`、关联 **tag 名**、**folder 名**（ctx 必须传 `folders`） | 截图二进制 |
| **想法** | `title`、`excerpt`、关联 **tag 名** | 完整 `content` 正文 |
| **待办** | `title`、`excerpt`、**tagNames[]**、**emoji** | 完整 Markdown content |
| **页面 / 动作** | 既有 launcher | — |

**已完成待办**：全局搜索 **包含** done（删除线展示）。Todo 页「显示已完成」**不** 影响 Cmd+K。

### 2.3 分类展示

固定顺序（有命中 **且该类型 load 成功** 才渲染组；loading/error 见 §2.5）：

1. 页面 · 2. 动作 · 3. **链接 (N)** · 4. **想法 (N)** · 5. **待办 (N)**  

- 每组最多 **`SEARCH_GROUP_LIMIT = 20` 条**（**渲染保护**，见 §2.5）  
- 超出：组底弱文案「还有 M 条，请缩小关键词」（v1 不可点）  
- 组内排序：稳定原数组顺序  

### 2.4 点击导航契约（已锁定，无待定）

| 结果类型 | 主点击（`onSelect` / Enter） | 精确 URL / 行为 | 行内次要 |
|----------|------------------------------|-----------------|----------|
| **链接** | 进入 Dashboard 并高亮该链接 | **`/dashboard?highlight={linkId}`**（仅数字 id；无 folder 时仍有效） | 打开原站（新标签）、复制短链、进文件夹 |
| **想法** | 想法编辑页 | **`/dashboard/ideas/{id}`** | — |
| **待办** | 待办页并选中 | **`/dashboard/todos?id={id}`** | — |
| **页面** | 路由 | 既有 href | — |
| **动作** | 执行 | 关 dialog | — |

**链接主点击（锁定）**

- **主 select = 应用内** `/dashboard?highlight={linkId}`  
- **原站** 仅行内按钮（现有 open original）  
- 不再保留「主 select 开原站」选项  

**链接 highlight 实现要点**

- `LinksList`（或 dashboard 页）读 `searchParams.highlight`  
- 找到 `data-link-id` 或等价标记 → `scrollIntoView` + 短暂 ring  
- 无效 id：静默忽略  

**待办 deep-link 完整验收（E4 必须全部满足）**

实现侧（`todos-page` + `todo-tree-shell`）：

1. `?id=N` → `setSelectedId(N)`（已有）  
2. **展开全部祖先**（arborist `openParents` / 遍历 parentId 打开节点；`openByDefault` 不足）  
3. **行进入视口**（`scrollIntoView` / arborist scrollTo）  
4. **选中高亮**（`aria-selected` / 既有 selected 样式）  
5. **右侧 detail** 标题与该 todo 一致  

L3 不得只断言 URL 或 detail 文案。

### 2.5 加载 / 空 / 错误状态（状态契约 — 实施前置）

#### 2.5.1 问题（Codex P1）

当前 `DashboardState` 只有 `ideasLoading` / `todosLoading`：

- 内部 `ideasLoaded` / `todosLoaded` **未暴露** → UI 无法区分「未加载」与「已加载且空」  
- action `success: false` 通常不 throw → **无 error 通道**  
- 首次打开 dialog 时三类可能短暂显示「没有找到匹配的结果」  

#### 2.5.2 目标状态模型（三类资源对称）

对 **links / ideas / todos** 使用同一语义：

```ts
type ResourceLoadState =
  | { status: "idle" }           // 从未请求
  | { status: "loading" }
  | { status: "success" }        // 已成功至少一次（数组可为空）
  | { status: "error"; message: string };
```

| 资源 | 现状缺口 | v1 必做 |
|------|----------|---------|
| **ideas** | 仅 `ideasLoading`；内部 `ideasLoaded` 未暴露 | 暴露 `ideasLoadState`（或 loaded+error+loading） |
| **todos** | 同上 | 同上 |
| **links** | `useDashboardCore`：`getDashboardData` 的 `success:false` **静默当空数组**（`useDashboardCore.ts` ~L21–25）；仅 `loading` 布尔 | 补 **`linksLoadState`**：mount fetch 进入 loading → success / error；`success:false` **必须** 进 error，不得伪装 empty |

暴露字段命名可微调，但 Dialog 必须能对 **三类** 分别问：是否仍 loading、是否 error、是否已 success。

#### 2.5.3 重试契约

| API | 行为 |
|-----|------|
| `ensureIdeasLoaded` / `ensureTodosLoaded` | 当前状态为 **`error` 时允许再次请求**（不得因「曾经尝试过」永久卡死）；`success` 时仍跳过；`loading` 时 no-op |
| **links / dashboard core 初始失败** | **禁止** 复用现有 `refreshLinks` 作为唯一重试路径（见下） |

**为何不能 `refreshLinks` 顶替初始失败重试（Codex 三轮 P1）**

- 初始加载走 `getDashboardData()`，一次拿 **links + tags + linkTags**（`actions/dashboard.ts`）。  
- 现有 `refreshLinks` **只** 调 `getLinks()`（`useDashboardCore.ts`），不刷新 tags/linkTags。  
- 若 mount 时 `getDashboardData` 失败，仅 `retry` 成 `refreshLinks` → 链接列表可能回来，但 **标签关联仍空** → 全局搜索「按 tag 名搜链接」永久失效。  

**锁定 API 名与语义**

```ts
// DashboardActions（命名可微调，语义锁定）
retryDashboardData(): Promise<void>
// 行为：
// 1. 仅在 linksLoadState 为 error（或整体 core 未 success）时由 UI 调用；也可无条件强制重拉
// 2. set linksLoadState = loading
// 3. 再次调用 getDashboardData()
// 4. success → 写入 links + tags + linkTags，linksLoadState = success
// 5. failure → linksLoadState = error（tags/linkTags 保持失败前快照或清空，二选一写死：失败不清成功数据；首次从未成功则保持 []）
```

`refreshLinks` **保留** 给「已成功加载后的用户手动刷新链接列表」；**不得** 作为 search dialog「加载失败 · 重试」的实现。

U4 必须锁定：

1. ideas/todos：error → ensure\* 再请求 → success  
2. **links：error → `retryDashboardData` → links+tags+linkTags 均有数据且 tag 搜索可用**

#### 2.5.4 Dialog 展示规则

| 条件 | UI |
|------|----|
| 有 query 且该类型 `idle`/`loading` | 该组 **「加载中…」**，**不** 计入「全空」 |
| 该类型 `error` | 该组 **「加载失败」**（可点「重试」调用 ensure\*/retry）；其它类型正常 |
| **links + ideas + todos 均为 `success`**，且三类命中为 0，且页面/动作无命中 | `CommandEmpty` |
| 任一类型仍非 success | **禁止** 因「当前可见命中为 0」下 empty 结论 |
| 无 query | 现有 hint + 页面/动作 |

#### 2.5.5 「20 条上限」语义

- **是**：渲染保护（限制 DOM 节点）  
- **不是**：过滤/网络性能方案；全量数据仍在内存中 O(n) filter  
- **客户端搜索数据量假设（v1）**：单用户 links+ideas+todos 合计 **&lt; 5k** 条时交互可接受；超过则 v2 评估服务端 / 索引  

### 2.6 命中证据（「为何命中」）

用户必须能在结果行上理解 **为何进列表**（至少一处可见高亮或说明）：

| 命中字段 | 展示规则 |
|----------|----------|
| 标题 / slug / excerpt 已展示字段 | 既有 `HighlightText` |
| 待办 tag（含第 4+ 个） | 结果行展示 **命中的 tag chip**（可临时打破「最多 3 个」仅对命中 tag 强制露出） |
| 待办 emoji | 标题前显示 emoji；query 等于 emoji 时仍可见 |
| 链接 URL path / note | 副行增加一行 truncated URL 或 note，并对匹配段高亮 |
| 链接 folder 名 | meta 行展示 folder（已有 folder 按钮时可对名称高亮） |
| 想法 tag | 已有 TagBadges；确保命中 tag 在可见集合内 |

---

## 3. 技术设计

### 3.1 架构

```
Sidebar / Cmd+K
  → SearchCommandDialog (shouldFilter=false)
       → ensureIdeasLoaded + ensureTodosLoaded
       → 读 *LoadState（或 loaded/error）
       → filterLinks / filterIdeas / filterTodos
       → 命中证据 enrich（可选 helper）
       → takeSearchHits(20)  // 仅截断渲染
       → CommandGroup × 类型
       → *ResultItem → router.push / window.open
```

无新搜索 API。

### 3.2 DashboardService 状态（必做 — ideas **和** todos **和** links）

| 文件 | 变更 |
|------|------|
| `useIdeasSlice.ts` | `ideasLoadState`；`ensureIdeasLoaded`：`success:false` → error；**error 可重试** |
| `useTodosSlice.ts` | 同上 |
| **`useDashboardCore.ts`** | **`linksLoadState`**：mount loading；`getDashboardData` success → success + 写 **links+tags+linkTags**；`success:false`/throw → **error**（禁止静默空数组）；**新增 `retryDashboardData`**（再走 `getDashboardData`，**不是** `refreshLinks`） |
| `dashboard-service.tsx` | 三类 load state + `retryDashboardData` 透出 |
| 测试 | U4：ideas/todos ensure 重试；**links `retryDashboardData` 后 tag 关联恢复** |

### 3.3 模型层 — 统一「自身命中」谓词

| 文件 | 变更 |
|------|------|
| `models/todos.ts` | **抽出并导出** `todoMatchesQuery(node, needle): boolean`，字段 = §2.2 全量：`title` \| `excerpt` \| `tagNames[]` \| `emoji` |
| `filterTodos` | 文本轴调用 `todoMatchesQuery`（祖先链逻辑不变） |
| `search-command-dialog.tsx` | **禁止** 手写 `title/excerpt` 二次 filter；改为：`filterTodos(...).filter((t) => todoMatchesQuery(t, needle))`（或 filterTodos 增加 `selfOnly: true` 选项，内部同一谓词） |
| `models/links.ts` | folder 名匹配（`FilterContext.folders` **必传**） |
| `models/search.ts` | `SEARCH_GROUP_LIMIT`、`takeSearchHits` |

> Codex P1：若 dialog 仍用旧的 title/excerpt 二次判断，A2 扩展 tag/emoji 后命中行仍会被滤掉。

### 3.4 链接 highlight 与列表筛选交互（必做）

**问题**：`/dashboard?highlight=N` 清掉 URL `folder` 后，`useLinksListFilters` 的 **本地** `filterFolderId` / `filterTagIds` 仍可能把该链接滤出列表，导致无法滚动高亮。

**契约（锁定）**

当 `searchParams.highlight` 为合法 link id 时：

1. **清除** 本地 folder/tag 筛选（`setFilterFolderId(null)`、`setFilterTagIds(empty)`）  
2. **忽略** URL `folder` 对该次定位的约束（或路由只带 `highlight`、不带 `folder`——搜索导航已保证）  
3. 在 **全量 `links`** 中找 id → `scrollIntoView` + ring  
4. 若 id 不存在：静默忽略  

实现落点：`useLinksListFilters` 增加 `useEffect` 监听 `highlight`，或 `LinksList` 在读到 highlight 时调用 `clearFilters()` + 滚动。

**测试**：B4 必须有 **组件测试**（非仅 U10 路由断言）：

- 先设 tag/folder 过滤使目标不可见  
- 注入 `?highlight={id}`  
- 断言：过滤被清、卡片在 DOM 中可见、scroll/ring 被调用或 data-attribute 存在  

### 3.5 UI 层

| 文件 | 变更 |
|------|------|
| `sidebar-*.tsx` | 文案 / aria |
| `search-command-dialog.tsx` | 三类 load 门闩；`todoMatchesQuery`；cap；folders ctx；error 重试 |
| `link-result-item.tsx` | 主 select → `/dashboard?highlight=` |
| `todo-result-item.tsx` | emoji；命中 tag 露出 |
| `todos-page` + `todo-tree-shell` | openParents + scrollIntoView |
| `links-list` + `useLinksListFilters` | highlight 清筛选 + 滚动高亮 |

**不** 删除 Todo / Ideas 页内搜索。

### 3.6 常量

```ts
export const SEARCH_GROUP_LIMIT = 20;
export const SEARCH_CLIENT_SOFT_MAX_ITEMS = 5000;
```

---

## 4. 测试计划

### 4.1 L1

| ID | 内容 |
|----|------|
| U1 | `todoMatchesQuery` / `filterTodos`：title / excerpt / **tag** / **emoji** |
| U1b | **Dialog 级**：query 仅命中 tag 或仅命中 emoji 时，结果列表仍含该 todo（防二次 filter 回归） |
| U2 | `filterLinks`：folder 名命中 |
| U3 | `takeSearchHits` 截断 |
| U4 | **ideas + todos**：loading→success；success:false→error；error→ensure\*→success |
| U4b | **links core**：success:false→error（非空数组伪装）；error→**`retryDashboardData`**→success 且 **tags/linkTags 非空可搜**（mock getDashboardData 第二次返回完整 payload） |
| U5 | Dialog：任一类型 loading 时不 CommandEmpty |
| U6 | Dialog：error 组文案 + 重试触发 ensure\* |
| U7 | 三类分组 + 计数 |
| U8 | idea → `/dashboard/ideas/id` |
| U9 | todo → `/dashboard/todos?id=` |
| U10 | link **路由** → `/dashboard?highlight=`（dialog 层） |
| U10b | **LinksList 组件**（强制行为断言，禁止只查 data-attribute）：① 预设 folder/tag 过滤使目标卡被滤掉；② 注入 `?highlight={id}`；③ 断言本地过滤已清、目标卡 **在 DOM 可见**；④ **mock/spy `scrollIntoView` 被调用**（或等价 arborist API）；⑤ 高亮 class / data-state 存在（如 `data-highlighted` 或 ring class） |
| U11 | open → ensureIdeas + ensureTodos |
| U12 | 命中隐藏 tag → 行上可见该 chip |
| U13 | Todo deep-link：openParents + scroll |

### 4.2 L2

无新 API；不强制。

### 4.3 L3 Playwright

| ID | 内容 |
|----|------|
| E1 | Sidebar 文案可打开 dialog |
| E2 | 同关键词下三类 heading 均可见 |
| E3 | 想法 → `/dashboard/ideas/{id}` |
| E4 | 待办 → URL + **祖先展开 + 行可见 + 选中 + 详情标题**（嵌套 fixture） |
| E5 | 链接 → `/dashboard?highlight=` + 卡片可见 |
| E6 | 空查询 hint |
| E7 | （可选）慢加载：mock 延迟时先 loading 后结果 |

---

## 5. 原子化提交计划

| Step | Commit message | 内容 | 测试 |
|------|----------------|------|------|
| A1 | `feat: expose ideas/todos load error state` | ideas/todos slice + retry | U4（ideas/todos） |
| A1b | `feat: track links load error and retryDashboardData` | **linksLoadState**；禁止 success:false→空数组；**`retryDashboardData` = 再拉 getDashboardData（含 tags/linkTags）**；dialog 失败重试不得走 `refreshLinks` | **U4b** |
| A2 | `feat: extract todoMatchesQuery for search fields` | models/todos 全字段谓词 | U1 |
| A3 | `feat: match folder name in filterLinks` | models/links + folders ctx | U2 |
| A4 | `feat: add search group limit helper` | models/search.ts | U3 |
| B1 | `feat: gate search empty state on load status` | dialog 三类 load + 重试 | U5/U6 |
| B2 | `feat: use todoMatchesQuery in search dialog` | 替换 title/excerpt 二次 filter | **U1b** |
| B3 | `feat: cap rendered search hits per group` | dialog | U3 |
| B4 | `feat: navigate link search hits via highlight query` | link item | U10 |
| B5 | `feat: clear filters and scroll to highlighted link` | filters clear + **scrollIntoView spy + ring 状态** | **U10b**（完整行为断言） |
| B6 | `feat: expand ancestors on todo deep link` | shell + page | U13 |
| B7 | `fix: show match evidence on search results` | result items | U12 |
| C1 | `fix: update sidebar search copy for multi-type` | sidebar | E1 |
| C2 | `docs: lock global search contracts after review` | 本文件 + 21 交叉引用 | — |
| D1 | `test: multi-type search and deep links in playwright` | E2–E6 | L3 |

预计 **12–15** 个原子 commit。

---

## 6. 实现检查清单

### 状态

- [ ] ideas / todos / **links** 均有 load success/error  
- [ ] links：`success:false` 不再静默空数组  
- [ ] links 失败重试 = **`retryDashboardData`**（完整 getDashboardData），**不是** `refreshLinks`（U4b）  
- [ ] ensure* 在 error 后可重试（U4）  
- [ ] Dialog 不在任一类 loading 时 empty  

### 匹配与展示

- [ ] `todoMatchesQuery` 覆盖 §2.2；dialog **只用** 该谓词做自身过滤  
- [ ] folder 匹配 v1  
- [ ] §2.6 命中证据  
- [ ] 每组 cap 20（渲染保护）  

### 导航

- [ ] 链接 `/dashboard?highlight={id}`  
- [ ] highlight **清除** 本地 folder/tag 过滤后高亮（U10b）  
- [ ] 想法 / 待办 deep-link 完整验收  
- [ ] 页面内 Todo/Ideas 筛选仍在  

### 测试

- [ ] L1 含 U1b、U4 links、U10b  
- [ ] L3 E2–E6  
- [ ] placeholder 单点维护  

---

## 7. 风险与数据假设

| 风险 | 缓解 |
|------|------|
| 客户端 O(n) filter | 软上限 5k；20 条仅渲染 |
| deep-link / arborist | B6 + E4 嵌套 fixture |
| highlight 被本地筛选挡住 | §3.4 强制 clear filters；U10b |
| dialog 二次 filter 丢掉 tag/emoji | 共享 `todoMatchesQuery`；U1b |
| links 静默失败 | A1b + U4 |

**已锁定决策（原 §7 待拍板项）**

| # | 决策 |
|---|------|
| 链接主点击 | **Dashboard `?highlight=`**；原站仅次要按钮 |
| Ideas / Todo 页内搜索 | **均保留** |
| 每组上限 | **20**（渲染保护） |
| folder 匹配 | **v1 必做** |

---

## 8. 可选后续（v2）

- `type:todo` 语法、多 token AND、相关度  
- 服务端 FTS；超过 5k 条策略  
- 最近访问  

---

## 9. 验收标准（DoD）

1. Sidebar / Cmd+K 可搜链接、想法、待办；分组清晰；文案非「仅链接」。  
2. 加载中不误报 empty；失败有分类型提示。  
3. 匹配字段满足 §2.2；命中有可见证据 §2.6。  
4. 导航满足 §2.4（含待办祖先展开与滚动）。  
5. 页面内 Todo/Ideas 筛选仍可用。  
6. L1 + L3 通过；本文件状态改为「已实施」。  

---

## 10. 参考路径

| 角色 | 路径 |
|------|------|
| Dialog | `components/search-command-dialog.tsx` |
| 结果行 | `search-command-dialog-parts/*-result-item.tsx` |
| 过滤 | `models/links.ts` `ideas.ts` `todos.ts` |
| 状态 | `contexts/dashboard-service.tsx` · `useIdeasSlice` · `useTodosSlice` |
| Sidebar | `sidebar-parts/sidebar-expanded.tsx` |
| 待办 deep-link | `todos-page.tsx` · `todo-tree-shell.tsx` |
| L3 | `tests/playwright/search.spec.ts` |

---

## 11. 状态日志

| 日期 | 事件 |
|------|------|
| 2026-07-24 | 初稿 |
| 2026-07-24 | Codex 一轮评审修订（入口/导航/deep-link/folder/命中证据/渲染保护） |
| 2026-07-24 | **Codex 二轮复核修订**：linksLoadState 纳入 A1b 与 U4；`todoMatchesQuery` 防二次 filter（U1b）；highlight 必须清本地筛选 + U10b 组件测；error→retry 契约 |
| 2026-07-24 | **Codex 三轮复核修订**：links 重试锁定为 **`retryDashboardData`（getDashboardData 全量）**，禁止用 `refreshLinks` 顶替；U10b 强制 scrollIntoView + 高亮状态断言 |
| — | 待：`su-go` 按 §5 实施 |
