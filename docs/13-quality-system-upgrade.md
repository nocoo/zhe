# 质量体系升级：从「四层测试」到「三层测试 + 两道门控」

本文档设计 zhe 项目从旧版「四层测试架构」升级到新版「质量体系（L1+L2+L3+G1+G2）」的具体实施步骤。

> 返回 [README](../README.md) | 参考 [测试策略](05-testing.md) | [旧版四层测试计划](11-four-layer-test-plan.md)

---

## 一、新旧体系对比

### 旧版：四层测试架构

| 层级 | 名称 | Hook | 当前状态 |
|------|------|------|----------|
| L1 | Unit Test | pre-commit | ✅ 2030 用例，90% 覆盖率 |
| L2 | Lint | pre-commit | ✅ ESLint `--max-warnings=0` |
| L3 | API E2E | pre-push | ✅ 235 用例（mock 级别 import handler） |
| L4 | BDD E2E | on-demand | ✅ 108 用例，Playwright |

### 新版：三层测试 + 两道门控

| 层级 | 名称 | 验证对象 | Hook |
|------|------|----------|------|
| **L1** | Unit/Component | 纯函数、ViewModel、Hooks | pre-commit (<30s) |
| **L2** | Integration/API | **真 HTTP 请求**、跨模块协作 | pre-push (<3min) |
| **L3** | System/E2E | 真实用户端到端流程 | CI / on-demand |
| **G1** | Static Analysis | 类型检查 + Lint strict | pre-commit (与 L1 并行) |
| **G2** | Security/Perf | 依赖漏洞 + Secrets 泄露 | pre-push (与 L2 并行) |

---

## 二、Gap 分析

| # | 差距 | 影响 | 工作量 |
|---|------|------|--------|
| 1 | **G1: 缺少 `tsc --noEmit`** — TypeScript strict 已开，但未在任何 hook 中运行类型检查 | 类型错误只在 IDE 中可见，不阻止提交 | 15min |
| 2 | **G1: ESLint 非 strict 配置** — 使用 `next/core-web-vitals + next/typescript`，未启用 `@typescript-eslint/strict`；`no-unused-vars` 是 warn 而非 error；缺少 `no-explicit-any: error` | 宽松规则放行低质量代码 | 1-2h |
| 3 | **L2: API E2E 非真 HTTP** — `tests/api/` 直接 import route handler，不走网络栈 | 无法验证 HTTP 层行为（状态码、headers、CORS、middleware） | 2-4h |
| 4 | **G2: 无安全扫描** — 无 osv-scanner、gitleaks | 依赖漏洞和 secrets 泄露无门控 | 15min |
| 5 | **文档/Hook 重组** — 层级命名、hook 内容需与新体系对齐 | 文档过时，新人困惑 | 30min |

---

## 三、实施步骤与原子化提交

### Step 1: G1 — 添加 `tsc --noEmit` 到 pre-commit

**改动文件**：
- `package.json` — 新增 `"typecheck": "tsc --noEmit"` script
- `.husky/pre-commit` — 添加 `bun run typecheck`

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 1.1 | `chore: add typecheck script to package.json` | `"typecheck": "tsc --noEmit"` |
| 1.2 | `chore: add tsc --noEmit to pre-commit hook` | `.husky/pre-commit` 追加 `bun run typecheck` |

**验证**：运行 `bun run typecheck`，确认 0 errors。

---

### Step 2: G1 — ESLint 升级为 strict 配置

**改动文件**：
- `package.json` — 新增 dev dependency `typescript-eslint`
- `eslint.config.mjs` — 引入 `tseslint.configs.strict`，升级规则
- 全部源码中被新规则捕获的 lint error — 逐一修复

**规则升级清单**：

| 规则 | 旧值 | 新值 |
|------|------|------|
| `@typescript-eslint/no-unused-vars` | `warn` | `error` |
| `@typescript-eslint/no-explicit-any` | (未设置) | `error` |
| `@typescript-eslint/no-non-null-assertion` | (未设置) | `error` (strict 自带) |
| `@typescript-eslint/no-unnecessary-condition` | (未设置) | `error` (strict 自带) |
| `@typescript-eslint/prefer-nullish-coalescing` | (未设置) | `error` (strict 自带) |

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 2.1 | `chore: add typescript-eslint package` | `bun add -d typescript-eslint` |
| 2.2 | `refactor: upgrade eslint to strict typescript rules` | `eslint.config.mjs` 改为 strict 配置 |
| 2.3~N | `fix: resolve strict lint errors in <module>` | 按模块逐批修复 lint errors（每个 commit 对应一个模块或一类 error） |

**关键假设**：
- `next/core-web-vitals` 和 `tseslint.configs.strict` 可以共存（通过 flat config 合并）
- 如果 strict 规则与 Next.js 规则冲突，需要在 overrides 中关闭冲突项

**验证**：`bun run lint` 0 errors, 0 warnings。

---

### Step 3: G2 — 安装安全门控

**改动文件**：
- `.husky/pre-push` — 追加 osv-scanner 和 gitleaks 命令

**前置条件**（非代码变更，不需要 commit）：
```bash
brew install osv-scanner gitleaks
```

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 3.1 | `chore: add osv-scanner and gitleaks to pre-push hook` | `.husky/pre-push` 追加安全扫描 |

**pre-push 变为**：
```bash
# L2: Integration/API tests
bun run test:api

# G2: Security scanning
if [ -f bun.lock ]; then osv-scanner --lockfile=bun.lock; fi
gitleaks protect --staged --no-banner
```

**验证**：
- `osv-scanner --lockfile=bun.lock` — 检查是否有已知漏洞（首次可能需要修复）
- `gitleaks protect --staged --no-banner` — 确认无 secrets 泄露

---

### Step 4: L2 — API E2E 升级为真 HTTP（最大工作量）

**目标**：`tests/api/` 中的测试从 import route handler 改为真 HTTP 调用。

**改动文件**：
- `scripts/run-e2e.ts` — 新建，自动启停 dev server + 跑测试 + 关闭
- `package.json` — 更新 `test:api` script 为调用 `scripts/run-e2e.ts`
- `tests/api/*.test.ts` — 将所有 direct import 改为 `fetch()` HTTP 调用
- `tests/api/helpers/` — 新建 HTTP 请求辅助函数

**设计**：

```
scripts/run-e2e.ts 流程：
  1. 启动 Next.js dev server (port 17005, E2E=1)
  2. 轮询 GET http://localhost:17005/api/health 等待就绪
  3. 运行 vitest tests/api
  4. 无论结果如何，关闭 server
  5. 返回测试退出码
```

**端口规划更新**：

| 端口 | 用途 |
|------|------|
| 7005 | 开发服务器 |
| 17005 | L2 API Integration E2E（新增） |
| 27005 | L3 Playwright BDD E2E |

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 4.1 | `feat: add run-e2e.ts script for API integration server` | `scripts/run-e2e.ts` — server 启停逻辑 |
| 4.2 | `refactor: add HTTP helpers for API E2E tests` | `tests/api/helpers/http.ts` — base URL、fetch wrapper |
| 4.3 | `refactor: migrate health API test to real HTTP` | 迁移一个简单 API 验证模式可行 |
| 4.4~N | `refactor: migrate <endpoint> API tests to real HTTP` | 逐端点迁移（每个 commit 一个端点） |
| 4.M | `chore: update test:api script to use run-e2e.ts` | `package.json` script 更新 |

**关键假设**：
- 现有 mock 级别测试中的断言逻辑基本保留，只改调用方式（import → fetch）
- Server Actions 测试（非 HTTP API）保持 import 方式，不受此步骤影响
- 需要为 E2E 模式配置独立的 D1 测试数据库（或使用与 Playwright 相同的远程 D1）

**风险**：
- 这是最大工作量的步骤（2-4h），14 个测试文件 235 个用例
- Server Actions 的测试不经过 HTTP，可能需要保持现有方式

---

### Step 5: 文档与 Hook 重组

**改动文件**：
- `docs/05-testing.md` — 重写，对齐新质量体系（L1+L2+L3+G1+G2）
- `CLAUDE.md` — 更新 Testing section，替换旧四层引用
- `.husky/pre-commit` — 最终形态确认
- `.husky/pre-push` — 最终形态确认

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 5.1 | `docs: update testing docs to quality system (L1+L2+L3+G1+G2)` | `docs/05-testing.md` 重写 |
| 5.2 | `docs: update CLAUDE.md testing section` | CLAUDE.md 对齐新体系 |
| 5.3 | `docs: archive four-layer test plan` | `docs/11-four-layer-test-plan.md` 移至 `docs/archive/` 或标记为 archived |

**最终 Hook 形态**：

**.husky/pre-commit**：
```bash
# L1: Unit tests + coverage gate (≥90%)
bun run test:unit:coverage

# G1: Static analysis
bun run typecheck
bunx lint-staged
```

**.husky/pre-push**：
```bash
# L2: Integration/API tests (real HTTP)
bun run test:api

# G2: Security scanning
if [ -f bun.lock ]; then osv-scanner --lockfile=bun.lock; fi
gitleaks protect --staged --no-banner
```

---

## 四、执行顺序与依赖关系

```
Step 1: G1 — tsc --noEmit        [15min]    独立
    ↓
Step 2: G1 — ESLint strict       [1-2h]     依赖 Step 1（一起验证 pre-commit）
    ↓
Step 3: G2 — 安全门控             [15min]    独立（可与 Step 2 并行）
    ↓
Step 4: L2 — 真 HTTP 迁移         [2-4h]     最大工作量，独立于 G1/G2
    ↓
Step 5: 文档重组                   [30min]    依赖前四步全部完成
```

**总工作量估算**：4-7 小时

---

## 五、验证清单

完成所有步骤后，逐项确认：

- [ ] `bun run typecheck` — 0 errors（G1）
- [ ] `bun run lint` — 0 errors, 0 warnings，strict rules 生效（G1）
- [ ] `bun run test:unit:coverage` — 全部通过，覆盖率 ≥ 90%（L1）
- [ ] `bun run test:api` — 全部通过，走真 HTTP（L2）
- [ ] `osv-scanner --lockfile=bun.lock` — 无已知漏洞（G2）
- [ ] `gitleaks protect --staged --no-banner` — 无 secrets 泄露（G2）
- [ ] `bun run test:e2e:pw` — Playwright 全部通过（L3）
- [ ] `git commit` 触发 pre-commit hook — L1 + G1 全通过
- [ ] `git push` 触发 pre-push hook — L2 + G2 全通过
- [ ] `docs/05-testing.md` 反映新质量体系
- [ ] `CLAUDE.md` 无旧版四层测试引用

---

## 六、回退策略

每个 Step 的提交都是独立的，如果某个 Step 引入问题：

- **Step 1/2（G1）**：`git revert` 对应提交，恢复旧 eslint config 和 pre-commit
- **Step 3（G2）**：直接从 `.husky/pre-push` 删除安全扫描行
- **Step 4（L2）**：回退到 import handler 模式，恢复旧 `test:api` script
- **Step 5（文档）**：`git revert` 文档提交

---

## 相关文档

- [测试策略](05-testing.md) — 升级后将反映新质量体系
- [旧版四层测试计划](11-four-layer-test-plan.md) — 升级后归档
- [E2E 覆盖分析](09-e2e-coverage-analysis.md)
- [架构概览](01-architecture.md)
