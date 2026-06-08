# Zhe 前端设计诊断报告

> 评审范围:整站前端(首页 badge 登录、Dashboard 13 个子页面、Sidebar、AppShell、UI 组件)
> 方法:源码 + 设计 token 扫描(Preview MCP 在当前会话不可用,Dashboard 内页需 Google OAuth,只能从源码静态分析)
> 维度:① 视觉一致性 / 品牌  ② 信息架构 / 导航  ③ 交互细节 / 微交互  ④ 信息密度 / 可读性
> 日期:2026-06-08

---

## 0. 总体印象

Zhe 整体已经达到一个**「干净的 shadcn 中后台」**水准:design token 体系完整(三层背景 L0/L1/L2、统一 radius、24 色图表、明暗双套配色),组件库自洽,部件文件切分合理。整体调性接近 Linear/Raycast 那一派「极简软白 + 紫色 accent」的语言,首页 badge 是亮点设计,有产品记忆点。

但站在「再上一个台阶」的视角,问题集中在三个方向:

1. **视觉层级偏弱**——L0/L1/L2 三层背景的分工虽然存在(L1 面板在 `app-shell.tsx`,L2 卡片在 shadcn `<Card>`),但 L1 与 L0 对比度仅 3% 亮度差,二级卡片又多为 `bg-secondary`,缺少 hover/阴影/border 反馈,看久了"扁平到糊"。
2. **品牌只在首页**——进入 Dashboard 后 badge 的"身份证"叙事完全消失,产品退化为通用模板。紫色 primary 在内页几乎不出现,品牌存在感弱。
3. **信息架构存在分类拍脑袋**——"系统集成 / 系统"分组语义模糊;Webhook 已是 deprecated 还放在主导航;`/dashboard` 默认进的"链接管理"和 `/dashboard/overview`(概览)首页定位冲突。

下面按四个维度展开,**P0=必修,P1=建议修,P2=锦上添花**。

---

## 1. 视觉风格一致性 / 品牌 (Visual System)

### 1.1 [P1] 品牌色 primary 紫只在首页用,内页几乎不出现

**位置**:
- 首页 badge 头部 `bg-primary` (`app/page-parts/badge-chrome.tsx:7`)
- Sidebar 当前态 / 按钮 hover 用的是 `bg-accent`(灰),不是 primary

**问题**:进入 Dashboard 后整页是灰白 + 黑字,紫色只在「新建链接 Plus 按钮」「焦点 ring」「图表第一根线」出现。用户看不到品牌色 → 这等于把首页那张漂亮的 badge 当作"门面 painting",一推门进去就变成另一个产品。

**建议**:
- **激活态用 primary 而非 accent**:Sidebar 当前路由 `bg-accent text-foreground` → 改成 `bg-primary/10 text-primary` 或 `border-l-2 border-primary` 左竖条(Linear 风格)。
- **品牌色微量点缀**:页面标题左侧 4px 紫色细条;StatCard 数字 hover 时变 primary;Tag/Folder 图标默认 muted、hover primary。
- **保留首页 badge 的"票据"语言到 Dashboard**:Sidebar 顶部 logo 那行可以借鉴 badge 头条码 + ID 编号的"票面"质感(用极小字号 mono 显示 v1.18.2 + 一行 ID/serial),把品牌叙事延续到内页。

### 1.2 [P1] 三层背景 L0/L1/L2 的纵深没有完全发挥

`globals.css:7-17` 定义了:
```
L0 background: 220 14% 94%   (#ededee)
L1 card:       220 14% 97%   (#f6f6f7)
L2 secondary:  0 0% 100%     (#ffffff)
```

实际用法是分工明确的:
- `app-shell.tsx:120` 内容大面板用 `bg-card` (L1) ← **用上了**
- `card.tsx:6` `<Card>` 默认 `bg-secondary` (L2),作为 L1 面板内的二级容器 ← **符合层级**
- `<StatCard>` `<LinkCard>` 也 `bg-secondary` (L2),嵌在 L1 面板里

层级架构本身合理:**L0 body → L1 面板 → L2 卡片**。问题不在"没用上",而在以下两点:

1. **`bg-card` 仅 L1 面板自己一处使用**,token 命名容易让新人误以为通用 Card 应该用 `bg-card`。建议把 `--card` 重命名为更明确的 `--panel`(或 `--surface-l1`),避免和 shadcn `<Card>` 的命名混淆。
2. **L1 与 L0 视觉差太小**(94% vs 97% 亮度,只差 3%),在多数显示器上几乎看不出"内容面板边界",白天的环境光下面板像悬浮在统一灰底上。可把 L1 提到 100%(纯白),或给 L0 降到 91-92%,拉开对比。

**注意**:不要把 `<Card>` 默认改成 `bg-card`——会让卡片和外层面板融为一体,反而损失现有的 L1+L2 层级。

### 1.3 [P1] 圆角 token 过多但混用混乱

定义了 4 个圆角 token + Tailwind 默认的 `lg/md/sm`:
- `--radius: 0.75rem` (12px) → `lg`
- `--radius-island: 20px`
- `--radius-card: 14px`
- `--radius-widget: 10px`

实际使用:
- `app-shell.tsx:120` 直接 `rounded-[16px] md:rounded-[20px]` 写死像素值(为啥不是 `rounded-island`?)
- `link-card.tsx:130/139` 用 `rounded-card` (14px)
- `links-list-toolbar.tsx:60/87` 用 `rounded-lg` (12px) + `rounded-widget` (10px) 同屏
- `create-link-modal.tsx:34` `INPUT_CLS` 用 `rounded-widget` (10px),但 Input 组件本身是 `rounded-md` (10px from `calc(--radius - 2px)`)

**建议**:
- 统一一份 **「圆角阶梯」**: page panel 20px → card 14px → control 10px → micro chip 6px。文档化到 `globals.css` 注释。
- 删除任何硬编码 `rounded-[16px]` `rounded-[20px]`,改用 token。
- `rounded-widget` (10px) 和 Tailwind `rounded-md` (10px) 撞了——选一个,删另一个。

### 1.4 [P2] 24 色图表色板被严重浪费

`globals.css:69-92` 定义了 24 个 chart token,但 `charts.tsx` 只用 `CHART_COLORS[0/1/2/4]`,且 ClickTrend 里三条线全是紫/蓝/青,色差太小,叠加区域几乎分不出。

**建议**:
- 三层堆叠图换成「主色饱和 + 辅色降饱和」的搭配,比如 `--chart-1`(紫)+ `--chart-5`(绿)+ `--chart-8`(橙),增加色相距离。
- 24 色用不上的删一半,留 12 色就够了,**少即是多**;现在的 24 个 token 在 dark mode 全要重新 tune,维护负担大。

### 1.5 [P2] 字体方案没充分发挥

`layout.tsx:7-15` 引了 Inter + DM Sans,定义了 `font-display` 工具类,但全站只在一处用了 `font-display`(`charts.tsx:80` 的 StatCard 数字)。其他标题都是默认 Inter。

**建议**:
- 页面 H2/H1 大标题用 `font-display`(DM Sans 在大字号下更有性格),正文继续 Inter。
- 数字类 KPI 已经用了 `tabular-nums`,可以再加 `font-display` 强化"数据感"。或者反向决策——干脆删 DM Sans,只留 Inter,**消除一个未充分使用的依赖**。

### 1.6 [P2] AppShell 顶部 header 太空

`app-shell.tsx:91` header 只有 Breadcrumbs + GitHub + ThemeToggle,左边留白大,右边只有 3 个 icon → 视觉上"上半身空荡"。

**建议**:
- 主导航 search 按钮可以提到 header 中间(类似 Linear/Vercel),sidebar 里那个搜索框就可以收掉。
- 当前页面的快捷动作(创建链接、刷新等)从页面内 toolbar 上提到全局 header 右侧,降低重复 chrome。

---

## 2. 信息架构 / 导航 / 页面结构 (IA)

### 2.1 [P0] Sidebar 分组「系统集成 / 系统」语义模糊

`nav-config.ts:60-77`:
- **系统集成**: 文件上传 / Backy / Xray
- **系统**: 存储管理 / 数据管理 / Webhook / API Keys

这两个分类用户难以区分:
- "文件上传"是用户功能,不是集成
- Webhook / API Keys 是「集成」更对,但被放在「系统」
- "数据管理"(导入导出)是「设置」,既不是集成也不是系统

**建议**重新分组:
```
概览
  └ 概览 / 想法
内容 (新名,替代"链接管理")
  └ 全部链接 / Inbox / 文件夹...
工具 (新名)
  └ 文件上传 / Backy(同步) / Xray(API 测试)
开发者 / 集成
  └ Webhook / API Keys
设置
  └ 存储管理 / 数据管理
```
或者更激进:**砍掉分组,扁平化展示 10 个 item**——10 项以内 grouping 收益很低,反而增加点击成本(还要展开)。

### 2.2 [P0] `/dashboard` (链接管理) vs `/dashboard/overview` (概览) 默认页冲突

- `app/(dashboard)/dashboard/page.tsx` 是「链接管理」(LinksList 主页面)
- 但 Sidebar 第一项是「概览」`/dashboard/overview`
- Breadcrumbs (`breadcrumbs.tsx:27-42`) 在 `/dashboard` 直接显示"链接管理"

这意味着用户登录默认落在"链接管理"而不是 "概览"——这跟 Sidebar 把 "概览" 放在最顶部的视觉暗示矛盾。

**建议(任选其一)**:
- **A**:`/dashboard` redirect 到 `/dashboard/overview`,把链接管理移到 `/dashboard/links`,信息架构和 sidebar 对齐。**注意工作量被严重低估**——`/dashboard` 当前被 Sidebar folder 链接(`?folder=` 参数挂在 `/dashboard` 上)、Breadcrumbs(`breadcrumbs.tsx:27` 根判定)、SearchCommandDialog 跳转、多处 E2E/单元测试 引用,迁移要联动:① folder 路由参数迁移到 `/dashboard/links?folder=` ② Breadcrumbs 根判定改写 ③ search 跳转 handler 更新 ④ 全量 grep `/dashboard"` 字面量替换 ⑤ Playwright/vitest 测试用例修正。是 **半天到一天**的工作,不是 1h 小改。
- **B**:Sidebar 把"链接管理 / 全部链接"提到第一组最上方,概览作为次级。但这跟通用 SaaS 习惯反——绝大多数后台默认进 dashboard overview。
- **C(轻量过渡方案,推荐先做)**:保留 `/dashboard = 链接管理` 现状作为内容入口,Sidebar 中「全部链接」依然指向 `/dashboard`(`nav-config.ts:40`)。但把**登录后的默认落点**改到 `/dashboard/overview`——具体动作:① `app/page.tsx:32` 的 Google 登录回调 `redirectTo` 从 `${...}/dashboard` 改为 `${...}/dashboard/overview`;② `app/page.tsx:39` 已登录 redirect 从 `/dashboard` 改为 `/dashboard/overview`。这样用户心智从"概览"开始,但仍然可以从 Sidebar「全部链接」一键进入内容入口,改动只 1 个文件 2 行,保留所有旧 URL 兼容,**先用方案 C 验证心智,再评估是否值得做 A 全量迁移**。

### 2.3 [P1] Breadcrumbs 实现是硬编码 mapping,扩展性差

`breadcrumbs.tsx:8-18` 把所有 route 写死成对象,且根 `/dashboard` 直接显示"链接管理"——一旦改路由就要双向同步,容易漏。

**建议**:
- 把 label 收敛进 `nav-config.ts` 的每个 NavItem,让 sidebar 和 breadcrumbs 共用同一份 metadata。
- `ROUTE_LABELS` 和 `IDEA_EDIT_PATTERN` 应该是 nav-config 的派生数据,不是另写一份。

### 2.4 [P0] Webhook 已 deprecated 仍占主导航

`webhook-page.tsx` 里有 `DeprecationWarning` 组件,说明 Webhook 已经 deprecate 给 API Keys 取代,但导航里两者并排同级。新用户会迷惑该选哪个。

**建议**:
- 把 Webhook 折叠到 API Keys 页面里作为「Legacy Webhook 迁移」tab。
- 或者在 sidebar 项后加 `<Badge>Legacy</Badge>` 视觉降权。

### 2.5 [P1] Sidebar 「链接管理」组同时混合两类语义元素

`sidebar-expanded.tsx:144` 的 「链接管理」组下包含:
1. 「全部链接」「Inbox」(全局视图,本质是 filter)
2. 用户创建的 folders(数据)
3. 右上角的「+」按钮是「新建 folder」(动作)

三种心智混在一起。**全部链接 ≠ folder**,但 UI 上它们是同样的行项。

**建议**:
- 「全部链接 / Inbox」用更轻量的 toggle 或 pill,放在分组 header 下方,和 folder 列表视觉分离。
- 「+」按钮的 tooltip 强化:`新建文件夹`(目前已经写了,但按钮位置贴在分组标题右,容易误以为是"新建链接")。
- 考虑给 Folder 区域加一个明确的小标题 `MY FOLDERS`(已有 + 当前的整组标题二选一)。

### 2.6 [P2] Cmd+K 已支持链接 + 想法搜索,但缺少页面跳转和动作命令

`Cmd+K` 已实现并打开 SearchCommandDialog (`search-command-dialog.tsx:154-179`),目前能搜索**链接**和**想法**(placeholder: "搜索链接、想法、标题、备注、标签..."),不能跳转页面或触发动作。

**建议**:扩展为统一 launcher,新增两类:
- 页面跳转(`Go to: 概览 / Ideas / Webhook ...`)——可直接复用 `nav-config.ts` 的 NavItem 列表生成
- 动作(`Action: 新建链接 / 切换主题 / 退出登录`)
做成 Raycast/Linear 风格的统一 launcher。这是从「中后台」迈向「专业工具」最高 ROI 的一步。

---

## 3. 交互细节 / 微交互 / 反馈 (Interaction)

### 3.1 [P1] LinkCard 几乎没有 hover 反馈

`link-card.tsx:130 & 139`:
```tsx
className="...rounded-card border-0 bg-secondary shadow-none ... transition-colors"
```
有 `transition-colors` 但没有任何 hover class——也就是说卡片本身鼠标移上去**毫无反应**。Grid 模式下截图会出现 `bg-black/60` 遮罩,但 List 模式完全静默。

操作图标(刷新/截图/编辑)只在 hover 才显高亮 → 但卡片本身没有"我能交互"的提示,可发现性差。

**建议**:
- 卡片 hover:`hover:bg-secondary/70` 或 `hover:ring-1 hover:ring-border` 给一个轻反馈。
- 一组操作图标默认 `opacity-50`,卡片 hover 时 `opacity-100`——保持安静、按需可见。

### 3.2 [P0] IdeaCard 操作按钮 `opacity-0 group-hover:opacity-100`,触屏无法访问

`idea-card.tsx:135` 和 `:253` 把编辑/删除按钮做成「悬停才出现」。在桌面正常,但:
- 触屏设备(iPad、手机)永远点不到
- 键盘 tab 焦点会先到一个不可见按钮
- 无障碍上是反模式

**建议**:
- 桌面 hover 可见 / 移动端始终可见 → 给一个 `@media (hover: none)` 的 fallback:`group-hover:opacity-100 [@media(hover:none)]:opacity-100`。
- 或者更稳的方案:始终展示一个 `⋯` 三点按钮,点击展开操作菜单(DropdownMenu)。

### 3.3 [P1] 关键状态反馈缺失或薄弱

逐页扫一遍:
- **storage-page**: 删除/清理 toast 已就位(`useStoragePage.ts:63-67/78` 成功失败都有 sonner toast)✓
- **data-management**: 导入完成是 inline 显示 CheckCircle + 文本(`data-management-page.tsx:78`),没接 Toaster——`layout.tsx` 已经引了 `<Toaster />` 但这里仍走 inline,跟 storage 不一致。
- **webhook-page**: 复制 toast 有(`webhook-page.tsx:18-21`),但「生成令牌 / 撤销令牌」成功失败缺成功失败 toast(只看到 `disabled={isGenerating}` 在 button 上转圈,后端返回后没 toast 反馈)。
- **inbox-triage / links-list**: 刷新按钮 spinner OK,但**没有刷新成功 toast**——用户分不清"是刷新完了还是没动"。
- **api-keys-page**: 创建/撤销 API Key 后的反馈(需进一步看 viewmodel 才能判定,这里仅作为待复核项)。

**建议**:统一一条反馈规范——**所有改动后端状态的操作**必须走 sonner toast(成功/失败),不要 inline 文案、不要静默。data-management 的 inline 成功提示应改为 toast,与 storage 拉齐。

### 3.4 [P2] 微交互动画时长不统一

抽样:
- 全局 fade-up: 0.45s (`globals.css:201`)
- StatCard 渐入: 80ms 间隔 stagger (`charts.tsx:73`)
- accordion: 0.15s
- Sidebar 折叠: `transition-all duration-300` (`sidebar-expanded.tsx:253`)
- Collapsible 组: `200ms` (`collapsible-nav-group.tsx:46`)

**建议**:定义 `--motion-fast: 150ms / --motion-base: 250ms / --motion-slow: 400ms` 三档,所有动画用这三个值,不要单点 80/150/200/250/300/450 散落。

### 3.5 [P2] FilterControls 内的 view-mode 切换没有动效过渡

`links-list-toolbar.tsx:60-82` 切 list/grid 是瞬切——`LinksContent` 是两套不同 DOM(`grid` 还是 `space-y-2`)。从 list 到 grid 整个列表"咵"一下重排,体验割裂。

**建议**:
- 切换时给个 80-100ms 的淡出再淡入。或者用 framer-motion 的 LayoutGroup 做布局动画。
- 至少 viewMode toggle 按钮本身的「滑块指示器」可以用 spring 动画(目前是 class 切换,没有滑块)。

### 3.6 [P1] CreateLinkModal 提交按钮文案在等待时模糊

`create-link-modal.tsx:78`:
```tsx
{isLoading ? "创建中..." : "创建链接"}
```
有 spinner 没问题。但失败态:`{vm.error && <p className="text-sm text-destructive">{vm.error}</p>}` 显示在 form 底部——错误时用户看不到顶部 input 的关联问题。

**建议**:
- 字段级错误就近显示(每个 input 下方),全局错误显示在 form 顶部。
- 错误状态时 input 加 `border-destructive`。

### 3.7 [P2] Sidebar Cmd+K 快捷键挂在 `sidebar.tsx` 上

`sidebar.tsx:48-57` 把 Cmd+K 监听写在 sidebar 组件里。如果 sidebar 因为权限 / mobile 状态没渲染,快捷键就失效。

**建议**:移到 AppShell 或独立 hook(`useGlobalShortcuts`),与 UI 渲染解耦。

---

## 4. 信息密度 / 可读性 / 排版 (Density & Readability)

### 4.1 [P0] 中文 + 西文混排没有声明 lang,行高偏紧

`layout.tsx:36`: `<html lang="en">` 但全站内容是中文。
`globals.css:189-193` 字体栈 `"Inter", system-ui, -apple-system, sans-serif` 没有 CJK fallback——中文会落到系统默认(macOS 上是 PingFang,Windows 上是微软雅黑),但渲染细节因系统而异。

更具体的可读性问题:
- Sidebar 行高 `py-2.5` 是 OK(`sidebar-expanded.tsx:46`)
- 但正文 `<p className="text-sm text-muted-foreground">` 没设 `leading-relaxed`,中文段落比英文显得拥挤
- `webhook-page.tsx:120`:「通过 Webhook 令牌,外部系统可以调用 API 创建短链接,无需登录认证」这种长说明在 mobile 下挤成一团

**建议**:
- `<html lang="zh-CN">`(根据用户偏好可切换)
- 字体栈补 CJK:`"Inter", -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`
- 全局给中文正文加 `text-wrap: pretty` + `leading-relaxed` (1.625)
- 章节描述类的 `<p>` 加 `max-w-prose`(60-75ch)避免一行过长

### 4.2 [P1] StatCard / 卡片标题用 14px (text-sm) 太小

`charts.tsx:80`: 主数据 `text-xl md:text-2xl` (20-24px)
`charts.tsx:76`: label `text-xs` (12px)
`charts.tsx:67`: CardTitle `text-sm font-medium` (14px)

12-14px 的 label/title 在 4k 显示器上看着很疲劳。Stripe / Linear 的 dashboard 普遍 label 14-15px,title 15-16px。

**建议**:
- CardTitle 升到 `text-[15px] font-semibold`
- StatCard 的 label 升到 `text-sm`,数据升到 `text-2xl md:text-3xl`
- 整体页面 base font-size 不变,只是 KPI 层级更鲜明

### 4.3 [P1] 列表视图链接信息密度过高,且 meta row 干杂

`list-view.tsx:107-158` ListMetaRow 一行展示:
```
🔗 slug [copy]  📊 N次点击 ▼  日期  过期: 日期  [tag] [tag] [tag]...
```
4-7 个元素挤在一行,中文夹杂 emoji-like icon,小字号 (`text-xs`)。一旦标签多就溢出或换行,信息层级丢失。

**建议**:
- 把 meta 分成两组:**核心**(slug + 点击数) 在第一行,**辅助**(日期 + 过期) 用更浅颜色 `text-muted-foreground/60`。
- Tags 单独换行或挤压成 `+N` 折叠按钮(超过 3 个时)。
- 整列表用 12-column grid 而不是 flex,固定列宽,避免随内容飘移。

### 4.4 [P1] sidebar 中文分组标题是 uppercase + tracking-wider

`collapsible-nav-group.tsx:27`:
```tsx
className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
```
中文字符没有大小写,`uppercase` 在中文上 no-op。`tracking-wider` 让中文字符间距过大,看着像 PPT。

**建议**:
- 中文分组标题去掉 `uppercase`、把 `tracking-wider` 改成 `tracking-wide`(或 `tracking-normal`)。
- 或者:中文用普通 weight,英文标题再用 uppercase。

### 4.5 [P1] Overview 页 16 个 chart token 在 dark mode 用 boost 后,跟 light mode 不是同一套色相

`globals.css:69-92` (light) vs `:155-178` (dark):
- light chart-1: `262 83% 58%` (紫)
- dark chart-1: `262 83% 63%` (紫,亮 5%)
- light chart-3: `186 80% 45%` (青)
- dark chart-3: `186 80% 50%`

整体策略是 boost 5-7%。但 chart-19 light `160 50% 50%` → dark `160 50% 55%`,boost 一致 OK。Chart-24:light `0 0% 25%` → dark `0 0% 65%`——为了在深色背景上能看清,黑灰色翻了一倍。这破坏了"系列色"的连贯性。

**建议**:
- 中性灰系单独维护(chart-neutral-1/2/3),不要混在主调色板里。
- 或者每根线显式标 `--chart-line-1` `--chart-area-1` 区分线色和面色——目前都用一套 token,Area Chart 的填充透明度让色差更难辨认。

### 4.6 [P2] DataManagement 导入卡片下方 `<input type="file">` 直接裸露

`data-management-page.tsx:93-104` 用 Tailwind 把原生 file input 美化了一下,但和上面"导出"卡片的 `<Button>` 不一致——同一页两个动作,UI 一个是 button 一个是 file input,视觉一致性差。

**建议**:
- 导入也用 `<Button variant="outline">` 包装,点击后弹文件选择器。蓝图:`<label><input className="hidden" /><Button>选择文件</Button></label>`。
- 或者整个区域升级成 dropzone(类似 upload-zone),拖拽 JSON 即导入,体验更现代。

### 4.7 [P1] PageHeader 模式不统一

- `links-list-toolbar.tsx:128` h2 + 描述 + 工具栏 横排
- `upload-list.tsx:120-127` h2 + 描述 竖排,没有工具栏
- `webhook-page.tsx:113` 用 Card + CardHeader 把页面标题做成卡片标题(没有独立 h2)
- `overview-page-parts/links-section.tsx:24` 用 `<h2 className="mb-4 text-sm font-medium text-muted-foreground">链接统计</h2>` 作为 section header,跟其他 h2 完全不同(text-sm + muted)

**建议**:
- 抽一个 `<PageHeader title description actions>` 组件,所有 dashboard 页面用同一个。
- Section header 抽 `<SectionHeader>`,统一 `text-sm uppercase tracking-wide muted`(或不 uppercase,按 4.4 的建议)。

### 4.8 [P2] Tag/Folder 颜色逻辑分散

- `getTagStyles` 在 `models/tags`(没读到细节,推测是 hash 化)
- `feature-card.tsx:8-15` `ACCENT_CLASSES` 又单独定义了 6 色
- 图表用 24 色 token

3 套色彩逻辑各管各。

**建议**:统一一份 `getAccentColor(seed: string)` 函数,从 chart-1..chart-24 里取,Tag/Folder/FeatureCard 共用。

---

## 5. 横向问题(跨多个页面的系统级)

### 5.1 [P1] Empty state 模板重复 + 文案套路化

至少 4 处一模一样的空态:
- `links-list.tsx:87-99`:`Link2` icon + "暂无链接" + "点击上方按钮创建您的第一个短链接" + button
- `upload-list.tsx:160-170`:`UploadIcon` + "暂无文件" + 提示
- `inbox-triage.tsx:42-52`:`InboxIcon` + "Inbox 已清空"
- `api-keys-page.tsx:82-87`:"还没有 API Key。创建一个来开始使用 API。"(连图标都没有)

**建议**:
- 抽 `<EmptyState icon title description action>` 组件,删掉散落副本。
- 空态文案升级到更有性格——目前是 plain "暂无 X",可以更主动:「你的 Inbox 已清空 ✓」「还没有链接,试试创建第一条 ↑」。

### 5.2 [P1] Loading skeleton 散落各文件,样式不一

- `overview-page.tsx:18-30` 自己写 stat + chart skeleton
- `links-list.tsx:17-40` 自己写 list/grid skeleton
- `inbox-triage.tsx:15-39` 自己写 inbox skeleton
- `upload-list.tsx:11-45` 自己写 upload skeleton
- `storage-page-parts/storage-skeleton.tsx` 单独文件
- 还有 `@/components/ui/skeleton` 现成组件,但被忽略了

每个页面骨架尺寸都按各自页面"硬拟",样式参差。

**建议**:
- 强制使用 `<Skeleton>` 基础组件,只在外层组合长度。
- 抽 `<ListSkeleton rows={6}>` `<CardGridSkeleton cols={4}>` 两个通用模式。

### 5.3 [P1] 无障碍(a11y)细节

- 多处 `<button>` 用 hover bg 但没有 `focus-visible:ring`(button.tsx 自带,但裸 `<button>` 全部没有)。例:`badge-content.tsx:8` `<a>` 的 GitHub icon、`app-shell.tsx:94` mobile menu button、`sidebar-expanded.tsx:99` 折叠按钮——大量裸 button 都缺 focus 样式。
- `app/page-parts/badge-content.tsx:30` `<img src="/logo-80.png" alt="Zhe">`,alt 就一个 "Zhe" 单字,对屏幕阅读器不友好。
- `formatRelativeDate` (`idea-card.tsx:16-32`) 英文 "Yesterday"/"Xd ago" 跟全站中文不一致。

**建议**:
- 全局 `<button>` 默认样式补 `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`。
- alt 文本完整化(品牌 + 角色)。
- i18n 工具函数对齐(中文 "昨天" "X 天前")。

### 5.4 [P1] 命名混用中英文

文件里同时出现:
- 中文:概览、想法、文件上传、备份(Backy)、检视(Xray)
- 英文:Inbox / Webhook / API Keys / Backy / Xray
- 中英混:`链接管理` 组里有 `Inbox`

**建议**:统一一条策略——
- 路线 A:**全中文**(Inbox→收件箱、Webhook→Webhook 通知、API Keys→密钥)
- 路线 B:**功能词中文 + 产品名英文**(Inbox 是收件箱概念,Backy/Xray 是产品名保留英文)
现在是无策略混用,看起来像随手起的。

### 5.5 [P2] 没有 Tour / Onboarding

13 个页面,新用户登录后第一次进入 dashboard 落地"链接管理",没有任何 onboarding 提示——也没有 `点这里开始` 的引导。

**建议**:首次登录后弹一个 3 步 Tour:① 创建你的第一个短链 → ② 拖拽文件上传 → ③ 看 Overview 数据。可以用 `<dialog>` 或 react-joyride。

---

## 6. 优先级总览

按建议执行顺序,从 P0 起步:

### P0 — 必做,先解决用户感知层最尖锐的问题

| # | 类型 | 改动 | 工作量 | 影响 |
|---|------|------|--------|------|
| 1 | IA | 修正 `/dashboard` 默认页策略(优先做 2.2 方案 C:`app/page.tsx:32` 登录回调 + `:39` 已登录 redirect 都改到 `/dashboard/overview`,Sidebar「全部链接」入口保留),验证心智后再评估方案 A 全量迁移 | C: 30min / A: 0.5-1d | 心智模型对齐 |
| 2 | 交互/a11y | 修复 IdeaCard 操作按钮(3.2 `idea-card.tsx:135/253`)+ LinkCard Grid overlay(`grid-view.tsx:91`)的触屏可访问性 | 1h | 可发现性 + a11y |
| 3 | 可读性 | `<html lang="zh-CN">` + 字体栈补 CJK fallback + 中文正文 leading-relaxed (4.1) | 30min | 阅读舒适度 |
| 4 | IA | Sidebar 重新分组 + Webhook 标记 Legacy 视觉降权(2.1, 2.4) | 1h | 信息清晰 |

### P1 — 体感和一致性,接着做

| # | 类型 | 改动 | 工作量 | 影响 |
|---|------|------|--------|------|
| 5 | 视觉 | Dashboard active 状态从 `bg-accent` 升级到 `bg-primary/10` 引入品牌色 (1.1) | 30min | 全站品牌感↑ |
| 6 | 交互 | LinkCard hover/focus 反馈(3.1),配合 P0#2 一起做更顺手 | 30min | 可发现性 |
| 7 | 系统 | 抽 `<PageHeader>` `<EmptyState>` `<Skeleton*>` 三个共享组件(4.7, 5.1, 5.2) | 2h | 一致性 + 维护 |
| 8 | 反馈 | 统一 toast 反馈规范(3.3):data-management inline → toast、Webhook 生成/撤销补 toast、刷新动作补 toast | 1h | 状态清晰 |
| 9 | 视觉 | L1 与 L0 拉对比度 + `--card` 重命名为 `--panel`(1.2)避免命名歧义 | 30min | 纵深感 + token 卫生 |
| 10 | 视觉 | 圆角 token 统一 + 删除硬编码 `rounded-[16px]` `rounded-[20px]`(1.3) | 30min | token 卫生 |

### P2 — 锦上添花,有余力再做

| # | 类型 | 改动 | 工作量 |
|---|------|------|--------|
| 11 | 视觉 | 24 色图表色板精简到 12 色,中性灰系单独维护(1.4, 4.5) | 1h |
| 12 | 动效 | 全局 motion token 三档 (--motion-fast/base/slow),归一散落动效时长(3.4, 3.5) | 1h |
| 13 | 系统 | Cmd+K 扩展为全局 launcher(在已有链接+想法之外补页面跳转 + 动作命令)(2.6) | 4h |
| 14 | 品牌 | Sidebar 顶部沿用首页 badge 票面/条码元素延续品牌叙事(1.1 衍生) | 2h |

---

## 7. 我没看到但想顺手提的几个隐忧

- **dark mode 没做对比测试**:`--muted-foreground: 0 0% 48%` (#7a7a7a) on `--background: 0 0% 9%` (#171717) WCAG contrast ratio 大概是 4.4:1——刚过 AA 4.5 阈值边缘。Sidebar 分组 header 用的 `muted-foreground/70` 等于 33% 灰,**未达 AA**。可能需要让深色模式 muted-foreground 提到 55-60%。
- **响应式断点 useIsMobile 闪动风险**:`hooks/use-mobile.tsx:6` 初始 state 是 `undefined`(经 `!!` 退化为 `false`),首帧按桌面态 SSR/CSR,`useEffect` 跑完后 `:14` 才把状态切到 `true`。结果是**移动端进入页面会有一帧桌面布局闪过再切到移动布局**(不是典型 hydration mismatch,而是 effect-driven layout flash)。可在 hook 里返回 `boolean | undefined` 让消费方在 undefined 时渲染骨架,或用 `<div className="md:hidden">` 这类纯 CSS 判定替代 JS 检测。
- **Image domain 配置**:LinkCard 里大量 `<Image src={screenshotUrl} unoptimized>`——unoptimized 用得多说明 next.config 没配 remotePatterns 或者性能没法优化,长期来说要么配上要么换 `<img>`。

---

## 附:设计 token 体检表

✅ 已经做得好的:
- HSL 颜色变量结构清晰,light/dark 双套
- 三层背景 token 完整(L0/L1/L2 各司其职)
- 24 色图表 token + 语义色(success/warning/info/purple/teal)
- DM Sans 作为 display 字体的引入
- shadcn UI 标准化组件库

❌ 缺失或问题:
- 没有 spacing token(全靠 Tailwind 默认 4px scale)
- 没有 shadow token(globals 里完全没定义 box-shadow)
- 没有 motion token(动效时长散落)
- 没有 font-size scale token(全靠 Tailwind text-*)
- 字体栈没有 CJK fallback
- `--card` 命名容易和 shadcn `<Card>` 默认背景产生混淆,且 L1 与 L0 亮度差仅 3%,纵深感不足
