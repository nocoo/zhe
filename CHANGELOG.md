# 变更日志

## 2026-02-14 — 品牌视觉体系 & 工程基础设施

本次工作围绕两条主线展开：**建立品牌视觉体系**（Logo、主题切换）和**强化工程基础设施**（Git Hooks、Lint、测试）。

---

### 一、工程基础设施

#### 1. Git Hooks 自动化

在 `.husky/` 下配置了两个 hook，确保代码质量在提交和推送时自动把关：

- **pre-commit**：运行 `bun run test:unit`（单元测试）+ `bunx lint-staged`（仅 lint 暂存文件）
- **pre-push**：运行 `bun run test:run`（全量测试含 E2E）+ `bun run lint`（全量 ESLint）

`lint-staged` 在 `package.json` 中配置，对暂存的 `*.{ts,tsx}` 文件执行 `eslint --max-warnings=0`，实现增量 lint 反馈。

团队成员 `bun install` 后 hook 自动生效（`prepare` 脚本调用 `husky`），无需手动配置。

#### 2. 测试体系

当前 **479 个测试**全部通过，覆盖率 96%+，分三层：

- **单元测试**：`tests/unit/` — lib、models、viewmodels、hooks
- **组件测试**：`tests/components/` — React Testing Library + jsdom
- **E2E 测试**：`tests/e2e/` — API 路由处理器端到端验证

---

### 二、Logo 与品牌视觉

#### 1. 双主题 Logo 生成体系

创建了 `scripts/generate-logos.sh`，从两张 2048x2048 源图（`logo-light.jpg` 白底、`logo-dark.jpg` 黑底）使用 macOS `sips` 命令生成全套尺寸：

| 文件 | 尺寸 | 用途 |
|------|------|------|
| `logo-light-24.png` / `logo-dark-24.png` | 24px | 侧边栏 |
| `logo-light-80.png` | 80px | README 展示 |
| `logo-light-320.png` / `logo-dark-320.png` | 320px | 登录页（96px CSS 容器，~3.3x retina） |
| `favicon.png` / `favicon-16.png` | 32/16px | 浏览器标签页 |
| `apple-touch-icon.png` | 180px | iOS 主屏幕 |
| `icon-192.png` / `icon-512.png` | 192/512px | Android/PWA |

Favicon 和系统图标使用 light 版本（不支持主题切换）。脚本内置了旧文件清理逻辑，防止遗留资源干扰。

#### 2. 侧边栏 Logo 替换

`components/app-sidebar.tsx` 中，将原来的 Lucide `Zap` 图标替换为主题感知的 Logo 图片对：

```tsx
<img src="/logo-light-24.png" className="block dark:hidden" />
<img src="/logo-dark-24.png"  className="hidden dark:block" />
```

利用 Tailwind 的 `dark:` 变体实现自动切换，无需 JavaScript 介入。

#### 3. 登录页（`app/page.tsx`）调整

登录页采用竖版银行卡/工牌设计风格，本次做了三处修改：

- **卡片头部**：保留 Zap 闪电图标（不使用 Logo，保持视觉层次）
- **中央 Logo**：使用 320px 图片在 96px 圆形容器中显示，提供充足的 retina 清晰度
- **移除底部版权**：去掉 `© {year} Zhe.to` 文字，简化页面

同步更新了 `tests/components/home.test.tsx`，移除了已废弃的 copyright footer 测试用例。

#### 4. Metadata 图标配置

`app/layout.tsx` 中更新了 Next.js metadata 的 `icons` 字段，声明了 favicon（16/32px）、apple-touch-icon（180px）等多尺寸图标，确保各平台正确识别。

---

### 三、GitHub 链接 & 主题切换统一

仿照 surety 项目的做法，在两个位置统一添加了 GitHub 链接和主题切换按钮：

#### 1. 登录页右上角

在卡片外部绝对定位，添加 GitHub 图标链接 + `ThemeToggle` 组件：

```tsx
<div className="absolute top-4 right-4 z-10 flex items-center gap-1">
  <a href="https://github.com/nocoo/zhe" ...>
    <Github className="h-[18px] w-[18px]" />
  </a>
  <ThemeToggle />
</div>
```

登录页是 Server Component，`ThemeToggle` 作为 Client Component 子组件嵌入，正常工作。

#### 2. Dashboard 头部

`components/dashboard-shell.tsx` 的 header 右侧，在原有 `ThemeToggle` 前面增加了 GitHub 链接，样式一致。

#### 3. ThemeToggle 组件

三态循环切换：`system` → `light` → `dark` → `system`，基于 `next-themes` 的 `useTheme`，图标分别为 Monitor / Sun / Moon（来自 lucide-react）。

---

### 四、README 重写

仿照 surety 项目风格重写 `README.md`：

- 顶部居中 Logo（80px）+ 项目标题 + 一句话介绍
- 技术栈 badge（Next.js 15、TypeScript、Cloudflare D1、MIT）
- 功能特点、快速开始、技术栈表格、常用命令
- 移除了原来冗长的测试覆盖率、Git Hooks 配置等开发细节，聚焦项目介绍

---

### 提交记录

```
5175989 feat: add lint-staged to pre-commit hook for incremental lint
288dbf0 docs: enhance testing, linting and git hooks section in README
2439174 feat: update logo generation for dark/light theme variants
4e5f92d feat: replace sidebar Zap icon with themed logo images
5ff2f8e feat: replace signin page icons with themed logo images
495917f fix: add apple-touch-icon and icon sizes to metadata
2cff03d fix: update signin page with retina logo, restore zap header, remove copyright footer
a786540 fix: upgrade signin logo to 320px for retina clarity
ee988b9 docs: rewrite readme with project introduction and logo
d6aaa61 feat: add github link and theme toggle to signin page and dashboard header
```
