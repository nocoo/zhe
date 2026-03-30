# 四层测试架构改善执行计划

本文档基于记忆系统中的「四层测试架构」规范，对 zhe 项目当前测试体系进行对比分析，并制定具体的改善执行计划。

> 返回 [README](../README.md) | 参考 [测试策略](05-testing.md) | [E2E 覆盖分析](09-e2e-coverage-analysis.md)

---

## 一、四层测试架构规范（来源：记忆系统）

| 层级 | 内容 | Git Hook 阶段 |
|------|------|---------------|
| **L1: UT** | 单元测试覆盖率 ≥ 90% | pre-commit |
| **L2: Lint** | strict 模式，0 errors、0 warnings | pre-commit |
| **L3: API E2E** | 100% RESTful API 都有 E2E 测试 | pre-push |
| **L4: BDD E2E** | 核心主干流程 Playwright 浏览器级测试 | on-demand（手动触发） |

### 端口约定

| 用途 | 端口规则 | 本项目 |
|------|---------|--------|
| Dev server | 基础端口 | 7006 |
| BDD E2E | 万位前缀 `2` | **27006** |

> 注：L3 API E2E 使用 mock 级别 route handler 测试，不启动独立 server，因此无需专用端口。

### Hook 机制

- **pre-commit**: `bun run test:unit:coverage`（覆盖率不达标自动 fail） + `bunx lint-staged`（`--max-warnings=0`）
- **pre-push**: `bun run test:api`（L3 API E2E，mock 级别，无需端口）
- **on-demand**: `bun run test:e2e:pw`（L4 Playwright BDD E2E，端口 27006）

---

## 二、现状 vs 规范 对比

### L1: Unit Test ✅ 达标

| 项目 | 规范 | 现状 | 状态 |
|------|------|------|------|
| 覆盖率阈值 | ≥ 90% | vitest.config.ts: statements/lines ≥ 90%, functions ≥ 85%, branches ≥ 80% | ✅ 达标 |
| pre-commit 覆盖率检查 | 不达标则 fail | pre-commit 运行 `bun run test:unit:coverage`，阈值不达标自动 fail | ✅ 达标 |
| UT 文件数 | — | ~2030 个测试用例（unit + component + integration） | ✅ 充足 |

### L2: Lint ✅ 达标

| 项目 | 规范 | 现状 | 状态 |
|------|------|------|------|
| 0 容忍 | `--max-warnings=0` | lint-staged 和 `bun run lint` 都用了 | ✅ 达标 |
| pre-commit 执行 | 是 | `bunx lint-staged` | ✅ 达标 |

### L3: API E2E ✅ 达标

| 项目 | 规范 | 现状 | 状态 |
|------|------|------|------|
| API 覆盖 | 所有 RESTful API | 全部 API 路由均有 E2E 覆盖 | ✅ 达标 |
| 测试方式 | mock 级别 route handler 测试 | Vitest E2E（`tests/api/`） | ✅ 达标 |
| pre-push 执行 | 是 | `bun run test:api` | ✅ 达标 |

### L4: BDD E2E (Playwright) ✅ 达标

| 项目 | 规范 | 现状 | 状态 |
|------|------|------|------|
| 核心流程覆盖 | 是 | 15 个 spec 覆盖主要 UX 流程（108 用例） | ✅ 达标 |
| 独立 server | 是 | playwright.config.ts 自启 Next.js dev server | ✅ 达标 |
| 端口 | 27006 | 使用 27006（`PLAYWRIGHT=1`, `AUTH_URL=http://localhost:27006`） | ✅ 达标 |
| 触发方式 | on-demand | `bun run test:e2e:pw`（不在 pre-push hook 中） | ✅ 达标 |

---

## 三、改善计划（执行状态）

### P0: pre-commit 覆盖率门禁 ✅ 已完成

**目标**: 每次 commit 自动检查覆盖率，低于阈值自动 fail。

**已执行**:
1. `package.json` 新增 script: `"test:unit:coverage": "vitest run --exclude 'tests/api/**' --coverage"`
2. `.husky/pre-commit` 第一行改为 `bun run test:unit:coverage`
3. vitest.config.ts 已有 thresholds 配置，`--coverage` 在阈值不达标时自动 fail

---

### P1: 重命名 tests/e2e/ 为 tests/api/ ✅ 已完成

**目标**: 目录命名准确反映测试性质（API Integration Tests），为 Playwright E2E 预留 `tests/e2e/` 命名空间。

**已执行**:
1. `git mv tests/e2e/ tests/api/`
2. 更新 `package.json` 中 `test:api` script 路径
3. 更新 `vitest.config.ts` 中 exclude 路径
4. 更新所有文档引用

---

### P2: 端口约定规范化 ✅ 已完成

**目标**: Playwright BDD E2E 使用 27006 端口。

**已执行**:
1. `playwright.config.ts` 的 webServer port 设为 27006
2. `CLAUDE.md` 端口表已更新
3. `docs/05-testing.md` 端口说明已更新

---

### P3: 补齐缺失的 API E2E 测试 ✅ 已完成

**目标**: 为所有 API 路由补充 E2E 测试覆盖。

**已覆盖**:

| API 路由 | 测试文件 | 用例数 |
|----------|---------|--------|
| `GET /api/health` | `tests/api/api.test.ts` | 1 |
| `GET /api/lookup` | `tests/api/api.test.ts` | 4 |
| `POST /api/record-click` | `tests/api/api.test.ts` `tests/api/api-extra.test.ts` | 16 |
| `GET /api/live` | `tests/api/live.test.ts` | 3 |
| `GET /api/worker-status` | `tests/api/worker-status.test.ts` | 4 |
| `POST /api/cron/sync-kv` | `tests/api/sync-kv.test.ts` | 9 |
| `POST /api/cron/cleanup` | `tests/api/cleanup.test.ts` | 11 |
| `POST /api/link/create/[token]` | `tests/api/webhook.test.ts` | 17 |
| `POST /api/tmp/upload/[token]` | `tests/api/tmp-upload.test.ts` | 12 |
| Server Actions: links CRUD + edit | `tests/api/edit-link.test.ts` | 34 |
| Server Actions: uploads | `tests/api/upload.test.ts` | 9 |
| Server Actions: folders | `tests/api/folders.test.ts` | 29 |
| Server Actions: settings | `tests/api/settings.test.ts` | 24 |
| Server Actions: backy | `tests/api/backy.test.ts` | 30 |
| Server Actions: xray | `tests/api/xray.test.ts` | 37 |

---

### P4: pre-push hook 配置 ✅ 已完成

**目标**: pre-push 运行 L3 API E2E 测试。

**已执行**:
- `.husky/pre-push` 内容: `bun run test:api`（L3 mock 级别测试，无需端口清理）
- L4 Playwright 为 on-demand（`bun run test:e2e:pw`），不纳入 pre-push

---

### P5: 文档更新 ✅ 已完成

**目标**: 同步更新所有相关文档，反映改善后的测试架构。

**已更新文件**:
- `CLAUDE.md` — 端口表、测试命令、git hooks
- `docs/05-testing.md` — 四层架构表、Playwright 配置、端口分配、git hooks
- `docs/09-e2e-coverage-analysis.md` — 完整覆盖分析（343 用例）
- `docs/11-four-layer-test-plan.md` — 本文档

---

## 四、执行顺序与依赖关系（全部已完成）

```
P0 (覆盖率门禁)          ✅
    ↓
P1 (重命名 tests/e2e/)   ✅
    ↓
P2 (端口规范化)           ✅
    ↓
P3 (补齐 API E2E)        ✅
    ↓
P4 (pre-push hook)       ✅
    ↓
P5 (文档更新)             ✅
```

所有改善项已完成。当前测试体系完全符合四层测试架构规范。

---

## 相关文档

- [测试策略](05-testing.md)
- [E2E 覆盖分析](09-e2e-coverage-analysis.md)
- [架构概览](01-architecture.md)
