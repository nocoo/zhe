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
| **L4: BDD E2E** | 核心主干流程 Playwright 浏览器级测试 | pre-push |

### 端口约定

| 用途 | 端口规则 | 本项目 |
|------|---------|--------|
| Dev server | 基础端口 | 7005 |
| API E2E | 万位前缀 `1` | **17005** |
| BDD E2E | 万位前缀 `2` | **27005** |

### Hook 机制

- **pre-commit**: UT + Lint + **覆盖率检查脚本**（< 90% 则 fail）
- **pre-push**: API E2E + BDD E2E，运行前检查端口占用并清理

---

## 二、现状 vs 规范 对比

### L1: Unit Test

| 项目 | 规范 | 现状 | 差距 |
|------|------|------|------|
| 覆盖率阈值 | ≥ 90% | vitest.config.ts 设了 90% lines/statements | 配置达标 |
| pre-commit 覆盖率检查 | 不达标则 fail | pre-commit 只跑 `test:unit`，**无** `--coverage` | **缺失** |
| UT 文件数 | — | 85 个（57 unit + 28 component） | 充足 |

### L2: Lint

| 项目 | 规范 | 现状 | 差距 |
|------|------|------|------|
| 0 容忍 | `--max-warnings=0` | lint-staged 和 `bun run lint` 都用了 | 达标 |
| pre-commit 执行 | 是 | `bunx lint-staged` | 达标 |

### L3: API E2E

| 项目 | 规范 | 现状 | 差距 |
|------|------|------|------|
| 100% API 覆盖 | 所有 RESTful API | 5/9 路由有 E2E，3 个仅有 UT | **缺失 3 个** |
| 真实 HTTP 测试 | 对运行中 server 发请求 | mock 级别 route handler 测试 | **偏差**（命名不准确） |
| 独立端口 | 17005 | 不启动 server | **不适用** |

### L4: BDD E2E (Playwright)

| 项目 | 规范 | 现状 | 差距 |
|------|------|------|------|
| 核心流程覆盖 | 是 | 11 个 spec 覆盖主要 UX | 达标 |
| 独立 server | 是 | playwright.config.ts 自启 | 达标 |
| 端口 | 27005 | 使用 17005 | **不符** |

---

## 三、改善计划

### P0: pre-commit 覆盖率门禁

**目标**: 每次 commit 自动检查覆盖率，低于阈值自动 fail。

**步骤**:
1. 在 `package.json` 新增 script: `"test:unit:coverage": "vitest run --exclude 'tests/e2e/**' --coverage"`
2. 修改 `.husky/pre-commit` 第一行: `bun run test:unit` → `bun run test:unit:coverage`
3. vitest.config.ts 已有 thresholds 配置，`--coverage` 会在阈值不达标时自动 fail

**验证**: 跑 `bun run test:unit:coverage`，确认输出含覆盖率报告且通过阈值检查。

---

### P1: 重命名 tests/e2e/ 为 tests/api/

**目标**: 目录命名准确反映测试性质（API Integration Tests），为未来真正的 HTTP E2E 测试预留 `tests/e2e/` 命名空间。

**步骤**:
1. `git mv tests/e2e/ tests/api/`
2. 更新 `package.json` 中 `test:e2e` script 的路径
3. 更新 `vitest.config.ts` 中 exclude 的路径（如有）
4. 更新 `test:unit` 的 exclude 路径
5. 更新所有文档引用

**验证**: `bun run test:run` 全部通过。

---

### P2: 端口约定规范化

**目标**: Playwright BDD E2E 使用 27005 端口，17005 留给 API E2E。

**步骤**:
1. 修改 `playwright.config.ts` 的 webServer port: 17005 → 27005
2. 修改 `.husky/pre-push` 的端口清理: 17005 → 27005
3. 更新 `CLAUDE.md` 端口表
4. 更新 `docs/05-testing.md` 端口说明

**验证**: `bun run test:e2e:pw` 在 27005 端口成功运行。

---

### P3: 补齐缺失的 API E2E 测试

**目标**: 为 3 个缺失 E2E 覆盖的 API 路由补充测试（不含 auth 路由，因为它是 NextAuth thin wrapper）。

**需要覆盖**:
| API 路由 | 方法 | 现有覆盖 |
|----------|------|---------|
| `/api/live` | GET | 仅 UT |
| `/api/worker-status` | GET | 仅 UT |
| `/api/cron/sync-kv` | POST | 仅 UT |

**步骤**:
1. 在 `tests/api/` 目录下新建测试文件
2. 复用现有 mock 和 setup 基础设施
3. 覆盖正常路径 + 异常路径

**验证**: `bun run test:run` 全部通过。

---

### P4: pre-push hook 双端口清理

**目标**: pre-push 运行前检查并清理 API E2E (17005) 和 BDD E2E (27005) 两个端口。

**步骤**:
1. 修改 `.husky/pre-push`，增加 17005 端口清理（在 P2 完成后 27005 已有清理）

**验证**: 手动验证 pre-push hook。

---

### P5: 文档更新

**目标**: 同步更新所有相关文档，反映改善后的测试架构。

**文件清单**:
- `CLAUDE.md` — 端口表、测试命令
- `docs/05-testing.md` — 目录结构、命令表、Hook 表
- `docs/09-e2e-coverage-analysis.md` — 路径引用

---

## 四、执行顺序与依赖关系

```
P0 (覆盖率门禁)          ← 无依赖，独立执行
    ↓
P1 (重命名 tests/e2e/)   ← 无依赖，独立执行
    ↓
P2 (端口规范化)           ← P1 完成后执行（目录已改名）
    ↓
P3 (补齐 API E2E)        ← P1 完成后执行（写入 tests/api/）
    ↓
P4 (双端口清理)           ← P2 完成后执行（端口号已确定）
    ↓
P5 (文档更新)             ← 全部完成后统一更新
```

每个 P 级任务独立 commit，保持原子化。

---

## 相关文档

- [测试策略](05-testing.md)
- [E2E 覆盖分析](09-e2e-coverage-analysis.md)
- [架构概览](01-architecture.md)
