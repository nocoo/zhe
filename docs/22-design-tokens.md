# Design Tokens & UI Control Contract

> 返回 [README](../README.md) · Agent 入口见根目录 `AGENTS.md`

本文档是 **Dashboard UI 控件与 Design Token 的唯一权威约定**。  
实现新页面 / 工具栏 / Panel 时 **必须复用** `components/ui/*` 的 `size` 与 token，**禁止**在 call site 重新堆砌高度、字号、圆角。

运行时注释与 CSS 变量定义：`app/globals.css`  
原语实现：`components/ui/{button,input,select,checkbox,textarea,page-header}.tsx`  
契约测试：`tests/unit/ui/control-density.test.tsx`

---

## 1. 表面层级（Surface）

四层表面，由浅到深（light）/ 由暗到亮（dark）可读：

| 层级 | Token | 用途 |
|------|-------|------|
| L0 body | `--background` / `bg-background` | 整页底、Sidebar 底 |
| L1 panel | `--card` / `bg-card` | AppShell 内容大面板 |
| L2 card | `--secondary` / `bg-secondary` | 列表区、双栏 section、内嵌卡片 |
| L3 control | `bg-basalt-control` (`--basalt-control-fill`) + `border-border` + `shadow-xs` | Button outline / Input / Select / Textarea |

- shadcn 的 `--card` 在本项目语义上是 **L1 面板**，不是 `<Card>` 默认底。
- `<Card>` 故意用 `bg-secondary`（L2），以便嵌在 L1 面板内浮起。
- 控件填充跟当前表面走 `bg-basalt-control`，不要写死 `bg-secondary` / `bg-card`。
- Dialog / AlertDialog 通过 `data-basalt-surface-root` 使用最高层表面 `--basalt-bright`。弹窗面板、嵌套区域和表单控件统一使用该表面，浅色主题为白色，不再嵌入灰色层级；暗色主题沿用对应的 bright token。下拉菜单中的控件跟随 popover 表面。

---

## 2. 圆角阶梯（Radius）

| 层级 | 工具类 | 值 | 用途 |
|------|--------|-----|------|
| Island | `rounded-island` | 20px | AppShell 内容大面板 |
| Card | `rounded-card` | 14px | 列表卡片、双栏 section |
| **Control** | **`rounded-widget`** | **10px** | **Button / Input / Select / 图标触发器** |
| Chip | `rounded-full` | pill | **仅** Tag / Due / Badge 类 chip |

### 硬规则

- 控件 **只用** `rounded-widget`（或 primitive 内置的 sm 默认）。
- **禁止** 在控件上写 `rounded-lg` / `rounded-sm` / 硬编码 `rounded-[Npx]`。
- `rounded-md` 与 `rounded-widget` 数值同为 ~10px，但控件场景 **优先 `rounded-widget`**，便于搜索意图。
- Chip 保持 pill 是唯一例外；**标签输入框** 等「正在输入」控件仍用 control 圆角，不要做成比其它输入更大的胶囊。

---

## 3. 控件密度（Control density）

### 三档（对齐 Basalt Button / Input）

| 档位 | 高度 | 字号 | Button | Input / Select / Checkbox | 何时用 |
|------|------|------|--------|---------------------------|--------|
| **lg** | 40px (`h-10`) | `text-sm` / `text-base` | `size="lg"` | `size="lg"` | 表单主操作、Modal 主按钮 |
| **default** | 36px (`h-9`) | `text-sm` | `size="default"` | `size="default"` | 设置页、API Keys、Backy 等 **表单次要按钮** |
| **toolbar compact** | **32px (`h-8`)** | **`text-xs`** | **`size="sm"`** | **`size="sm"`** | PageHeader 工具栏、FilterBar、Panel 内联字段 |

独立图标按钮：`size="icon"`（36×36）。与 32px 筛选框同排的工具栏图标按钮使用 `size="sm" className="w-8 shrink-0 px-0"`，高度仍由原语控制。不要再发明 `xs` / `icon-sm`。

菜单项统一使用 `components/ui/dropdown-menu` / `context-menu`：最小行高 36px、正文 `text-sm`、图文间距 8px，图标固定 16×16px、1.5px 描边且不收缩。业务菜单直接放 Lucide 图标，不再单独设置尺寸或 `mr-2`；说明性图标使用 `aria-hidden`。卡片内的辅助信息图标使用 14×14px、1.5px 描边。

### 硬规则

```tsx
// ✅ 表单 / 设置
<Button size="default">保存</Button>
<Button size="default" variant="outline">取消</Button>

// ✅ 工具栏 / FilterBar / Panel 内联
<Button size="sm">新建待办</Button>
<Input size="sm" />
<SelectTrigger size="sm">…</SelectTrigger>
<Checkbox size="sm" />
<Button size="icon" aria-label="…">…</Button>
```

- 同排工具栏控件必须同高（Button `sm` + Input/Select `sm` 都是 32px）。
- 需要「伪文本」编辑（如 Todo 标题）时：静止可透明边，但 **仍用 `Input size="sm"`**，用 `className` 覆盖表面，不要裸 `<input>`。

---

## 4. 原语对照表

| 组件 | lg | default | toolbar compact | 备注 |
|------|----|---------|-----------------|------|
| `Button` | `h-10` | `h-9` | **`sm` → h-8 text-xs** | `icon` → 36×36 |
| `Input` | `h-10` | `h-9` | **`sm` → h-8 text-xs** | 无 HTML `size` 属性；用 prop `size` |
| `SelectTrigger` | `h-10` | `h-9` | **`sm` → h-8** | |
| `Checkbox` | — | `h-4` | **`sm` → h-3** | **禁止** 原生 `<input type="checkbox">` |
| `Textarea` | — | Basalt `InputArea` | `size="sm"` | |
| `PageHeader` | — | Basalt | actions 槽位：Button `sm` / 字段 `sm` | |

路径：`@nocoo/basalt` 或 `@/components/ui/...` 薄 re-export。

---

## 5. Focus / 边框 / 阴影

| 体系 | 特征 | 适用 |
|------|------|------|
| 表单控件（Input / Select） | `border` + `shadow-xs` + Basalt focus ring | 默认可编辑字段 |
| Button | Basalt `ring-2` + `ring-offset-2` | 按钮；勿在业务层再发明第三套 |
| 裸 focus | 禁止 | 不要手写 `focus:ring-2` 的一次性 input |

L3 可编辑控件默认：`bg-basalt-control` + `border-border` + `shadow-xs`。

内容卡片使用 `shadow-card` + `ring-1 ring-border/40`，由贴近边缘的小阴影和更柔和的外层阴影构成；明暗主题分别取值。可交互卡片用 `hover:shadow-card-hover` 轻微加强，不做位移。文章预览、引用与媒体框等卡片内部区域只用细边框，避免阴影层层叠加。不要用表单控件的 `shadow-xs` 代替内容卡片阴影。

---

## 列表加载与入场

`CardGridSkeleton` / `CardListSkeleton` share their column counts, spacing, and structure with the loaded collections. Link loading respects the saved grid/list preference, including uncategorized links. X masonry and shared card grids use 2–6 columns below a 2560px viewport and 8 columns from 2560px, preserving 6 columns at the 16-inch MacBook's standard 1728px logical width and using 8 on the local 3360px external desktop. Breakpoints use CSS viewport widths, not panel pixels. GitHub keeps its 1–4 container-based columns and 244px default card height. Ideas use text cards or icon rows; uploads use file icon rows. Route and in-page placeholders follow the same layout.

骨架容器提供 `role="status"`、`aria-busy` 和加载名称，内部装饰对辅助技术隐藏。骨架使用轻微 pulse；数据到达后卡片通过 `animate-fade-up` 和 `staggerStyle` 依次渐入，延迟最多累计 12 张，稳定 key 避免刷新重播。减少动态效果设置下停用 pulse 和卡片入场，保留正常布局；重排继续使用共享 `AnimatedCardList`。

契约由 `tests/unit/ui/card-skeleton.test.tsx` 与 `tests/playwright/card-reflow.spec.ts` 覆盖，包括保存的视图偏好、未分类布局、加载前后列数与卡片高度、渐入和减少动态效果。

## 多选与批量删除

全部链接、文件夹/未分类筛选、X、GitHub、想法和文件上传的页头右侧提供「多选卡片」。进入后保留当前布局和卡片高度，用统一 Checkbox、整卡点击区域与选中描边表达状态；卡片内容暂时 inert，键盘仍可通过 Checkbox 选择。工具栏显示选择数、全选当前列表、删除和退出。筛选后隐藏的内容不保留选择。

多选时，顶部操作栏滚出视口后才显示屏幕底部居中的浮动操作栏；回到顶部或退出多选即隐藏。使用 IntersectionObserver 兼容页面内滚动容器，浮层通过 portal 避免被容器裁切，保留移动设备底部安全间距。两处共用选择状态与删除弹窗，取消弹窗后焦点返回当前浮动操作，保持滚动位置。

删除前展示所选名称并确认。执行时使用模态进度条冻结本次队列，逐项 await 现有删除流程；处理中阻止关闭弹窗与重复提交。全部成功后展示结果 1 秒，自动关闭弹窗并退出多选；有失败时保留结果，继续处理后续内容，重试只处理失败项。链接/文件删除沿用 ScopedDB 的所有权校验、关联附件级联与持久化 R2 清理队列；每项等待清理尝试返回，暂时失败的对象仍由既有队列重试。文件批次识别已被级联删除的附件，不重复报错。

Inbox 独立入口、常驻编辑卡片与专用骨架已移除。未分类链接保留普通筛选和 grid/list 展示，旧 `?folder=uncategorized` 地址使用同一列表；内容整理通过统一 AI 整理与编辑弹窗完成。CLI 的 inbox 查询保持兼容。

验证：`tests/unit/bulk-delete.test.tsx`、`tests/unit/upload-viewmodel.test.ts` 与 `tests/playwright/card-reflow.spec.ts` 覆盖串行、取消、筛选、失败重试、模态进度和关联 R2 文件删除。

## 6. 字号语义（Dashboard）

| 角色 | 类 | 说明 |
|------|-----|------|
| 页头标题 | `text-2xl font-semibold` | Basalt `PageHeader` |
| 弹窗标题 | `text-lg leading-6 font-semibold` | 统一 `DialogTitle`，18px |
| Panel 主标题 / 行内 title | `text-base font-medium` | 勿用 `text-lg` 与页头抢层级 |
| 正文 / 备注 | `text-sm` | |
| 弹窗说明 | `text-sm leading-5` | 统一 `DialogDescription`，14px |
| 工具栏 / meta / 表单标签 | `text-xs` | 与 Button `sm` / 字段 `sm` 一致 |
| Chip 内文 | `text-[11px]` 或 `text-xs` | 全站 chip 选一种，勿混 `text-[10px]` 除非溢出 `+N` |

新建、编辑和 AI 整理表单的标签使用 `block text-xs font-medium leading-4`，与字段间距 6px；同行标签及控件顶端对齐。弹窗字段默认 36px / 14px，主操作区按钮同排同高。AI 整理、新建与编辑的操作按钮使用 40px。弹窗高度不超过视口的 90%，内容溢出时在弹窗内滚动。

---

## 7. 新功能检查清单

做 Dashboard UI 前自检：

1. [ ] 工具栏 / 筛选条：Button 是否 `size="sm"`（或 `icon`），字段是否 `size="sm"`？
2. [ ] 设置/表单页次要按钮是否仍用 `Button size="default"`（h-9），而不是被当成工具栏？
3. [ ] 有无 `rounded-lg` / 手写 `h-7` / 原生 checkbox？
4. [ ] 同行控件高度是否一致、`items-center`？
5. [ ] 是否复用 `PageHeader` 而不是手写一套 header？
6. [ ] Checkbox / 日期 / 搜索是否来自 `components/ui`？
7. [ ] 若改了 primitive 默认 size，是否更新了 `tests/unit/ui/control-density.test.tsx`？

---

## 8. 参考实现

| 模块 | 路径 | 说明 |
|------|------|------|
| Todo FilterBar | `components/dashboard/todos-page-parts/todos-filter-bar.tsx` | compact 工具栏范例 |
| Todo Detail | `components/dashboard/todos-page-parts/todo-detail-pane.tsx` | Panel 内联字段 + title 行对齐 |
| Todo Tree | `components/dashboard/todos-page-parts/todo-tree-row.tsx` | 行内 Checkbox + rename Input |
| 契约测试 | `tests/unit/ui/control-density.test.tsx` | size 类名锁定 |

历史诊断（背景，非权威契约）：[20-frontend-design-review.md](20-frontend-design-review.md)

---

## 9. 变更流程

改 token 或原语默认密度时：

1. 改 `app/globals.css` 注释 + 变量（如需要）
2. 改 `components/ui/*` 的 cva / size map
3. 更新 `tests/unit/ui/control-density.test.tsx`
4. 同步本文件与 `AGENTS.md` 中的摘要表
5. 原子 commit：`feat`/`fix` 原语与 `docs` 可分提交

X 收藏与 GitHub 收藏复用 PageHeader.actions：短筛选组在标题/副标题右侧居右排列，窄屏自然换行。页面不设独立内容搜索框，搜索统一从 sidebar 进入；结果数量合并到副标题。X 内容类型使用含数量的下拉筛选。

### X collection actions

Collection actions use compact 32px Lucide icon buttons with Basalt tooltips and accessible names. Filters retain their selected values. X selection controls stay at the bottom of the viewport and offer hide, unhide and delete; visibility updates disable the batch controls and preserve failed selections for retry. Image previews and expanded video/GIF attachments provide downloads with pending and failure feedback. Video badges use the Lucide video icon while retaining screen-reader text and duration.

## Responsive card actions

Link grid previews and their skeletons retain a `min-h-28` media area so the
center preview target stays clear of the top-right controls even at narrow
desktop grid widths. Mobile toasts use a bottom offset of `6rem` plus the safe
area inset, keeping the floating bulk toolbar reachable.

`CardActions` owns action overflow for links (grid/list), X, GitHub, ideas
(grid/list), and completed uploads. Each card marks its boundary with
`data-card-actions-container`; a ResizeObserver uses that card's content width,
not the viewport or the action strip's own changing width. Below 480 CSS pixels,
only the primary action and More remain visible. Wider cards expose secondary
actions directly; existing persistent menu entries remain in More. The breakpoint
reserves room for content alongside six controls, including coarse-pointer targets.

Core actions are edit for ordinary links/ideas, details for X in every layout,
README for GitHub, video
preview for video uploads, and copy for other uploads. Secondary actions keep
the same ViewModel callbacks, pending state, confirmation dialogs and ownership.
Basalt dropdowns provide portal positioning, keyboard navigation, accessible
menu semantics, Escape/outside dismissal and focus return. Menu labels wrap
within the viewport. Coarse-pointer card controls and menu rows are at least
44 CSS pixels; desktop controls retain the existing compact density. No global
Button sizing defaults change.

The existing todo tree already uses one More menu; feature/summary/Xray read-only
cards and storage rows do not have competing action strips. List metadata wraps,
while long identifiers and card headings truncate without shrinking actions.

Evidence: `tests/playwright/card-actions.spec.ts` exercises rendered cards at
320/375/390/430 CSS pixels in Chromium touch emulation and iPhone WebKit, with
1365px desktop resizing. These are browser device emulations, not physical-device
or VoiceOver certification. Shared component tests cover adaptive actions,
disabled/pending behavior and focus after resizing an open menu.
