# Design Tokens & UI Control Contract

> 返回 [README](../README.md) · Agent 入口见根目录 `CLAUDE.md`（与 `Claude.md` 硬链）

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
| L3 control | `bg-secondary` + `border-border` + `shadow-xs` | Button outline / Input / Select |

- shadcn 的 `--card` 在本项目语义上是 **L1 面板**，不是 `<Card>` 默认底。
- `<Card>` 故意用 `bg-secondary`（L2），以便嵌在 L1 面板内浮起。

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

### 三档（Button 与字段原语的 `sm` 含义不同 — 刻意）

| 档位 | 高度 | 字号 | Button | Input / Select / Checkbox | 何时用 |
|------|------|------|--------|---------------------------|--------|
| **default** | 40px (`h-10`) | `text-sm` | `size="default"` | `size="default"` | 表单主操作、Modal 主按钮 |
| **form small** | 36px (`h-9`) | `text-sm` | **`size="sm"`** | （字段用 default 或 sm 按行高） | 设置页、API Keys、Backy、Xray 配置等 **表单次要按钮** |
| **toolbar compact** | **32px (`h-8`)** | **`text-xs`** | **`size="xs"`** | **`size="sm"`** | PageHeader 工具栏、FilterBar、Panel 内联字段、树行编辑 |

图标按钮：

| size | 盒 |
|------|-----|
| `icon` | 40×40 |
| **`icon-sm`** | **32×32**（工具栏 / 行菜单） |

> **为何 Button 不用 `sm` 表示 compact？**  
> 全站大量设置页已把 `size="sm"` 当作「表单略小按钮」(h-9)。把 `sm` 全局改成 h-8/text-xs 会误伤 API Keys / Backy 等。工具栏 compact 使用独立的 **`xs`**。

### 硬规则

```tsx
// ✅ 表单 / 设置
<Button size="sm">保存</Button>
<Button size="sm" variant="outline">取消</Button>

// ✅ 工具栏 / FilterBar / Panel 内联
<Button size="xs">新建待办</Button>
<Input size="sm" />
<SelectTrigger size="sm">…</SelectTrigger>
<Checkbox size="sm" />
<Button size="icon-sm" aria-label="…">…</Button>

// ❌ 错误 — 用 sm 冒充工具栏密度，或 call site 补丁
<Button size="sm" className="h-8 gap-1.5 px-2.5 text-xs rounded-lg">
<Input className="h-8 text-xs rounded-lg" />
<input type="checkbox" className="h-3.5 w-3.5" />
```

- **禁止** 再引入 `h-7` 作为工具栏高度补丁；`h-9` 只应通过 `Button size="sm"` 出现，不要 className 手写。
- 同排工具栏控件必须同高（Button `xs` + Input/Select `sm` 都是 32px）。
- 需要「伪文本」编辑（如 Todo 标题）时：静止可透明边，但 **仍用 `Input size="sm"`**，用 `className` 覆盖表面，不要裸 `<input>` 另起一套 focus ring。

---

## 4. 原语对照表

| 组件 | default | form small | toolbar compact | 备注 |
|------|---------|------------|-----------------|------|
| `Button` | `h-10 text-sm` | **`sm` → h-9 text-sm** | **`xs` → h-8 text-xs rounded-widget** | `icon` / `icon-sm` |
| `Input` | `h-10` | — | **`sm` → h-8 rounded-widget text-xs** | 无 HTML `size` 属性；用 prop `size` |
| `SelectTrigger` | `h-10` | — | **`sm` → h-8** + `data-size="sm"` | |
| `Checkbox` | `h-4` | — | **`sm` → h-3.5** | **禁止** 原生 `<input type="checkbox">` |
| `Textarea` | form 默认 | — | 用 `className` 补 `rounded-widget` 至迁移完成 | 长文编辑可保持 default 高度 |
| `PageHeader` | — | — | actions 槽位：Button `xs` / 字段 `sm` | |

路径：一律 `@/components/ui/...`。

---

## 5. Focus / 边框 / 阴影

| 体系 | 特征 | 适用 |
|------|------|------|
| 表单控件（Input / Select） | `border` + `shadow-xs` + `focus-visible:ring-[3px] ring-ring/50` | 默认可编辑字段 |
| Button（当前） | `ring-2` + `ring-offset-2` | 按钮；后续可对齐，勿在业务层再发明第三套 |
| 裸 focus | 禁止 | 不要手写 `focus:ring-2` 的一次性 input |

L3 可编辑控件默认：`bg-secondary` + `border-border` + `shadow-xs`。

---

## 6. 字号语义（Dashboard）

| 角色 | 类 | 说明 |
|------|-----|------|
| 页头标题 | `text-lg font-semibold` | `PageHeader` |
| Panel 主标题 / 行内 title | `text-base font-medium` | 勿用 `text-lg` 与页头抢层级 |
| 正文 / 备注 | `text-sm` | |
| 工具栏 / meta / 表单标签 | `text-xs` | 与 Button `xs` / 字段 `sm` 一致 |
| Chip 内文 | `text-[11px]` 或 `text-xs` | 全站 chip 选一种，勿混 `text-[10px]` 除非溢出 `+N` |

---

## 7. 新功能检查清单

做 Dashboard UI 前自检：

1. [ ] 工具栏 / 筛选条：Button 是否 `size="xs"`（或 `icon-sm`），字段是否 `size="sm"`？
2. [ ] 设置/表单页次要按钮是否仍用 `Button size="sm"`（h-9），而不是被当成工具栏？
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
4. 同步本文件与 `CLAUDE.md` 中的摘要表
5. 原子 commit：`feat`/`fix` 原语与 `docs` 可分提交
