<p align="center">
  <img src="assets/brand/icon-rounded.png" width="128" height="128" alt="Zhe" />
</p>

<h1 align="center">Zhe</h1>

<p align="center">整理短链接、想法和待办，把零散信息放进可查找的个人工作台。</p>

<p align="center">
  <a href="https://zhe.to">站点</a> ·
  <a href="docs/README.en.md">English</a>
</p>

## 这是什么

Zhe 是个人链接与信息管理应用。它可以收藏网页、生成短链接、记录 Markdown 想法、整理层级待办，并通过统一搜索找回内容。Web 管理台使用 Google 登录，短链接可直接分享给其他人。

仓库包含 Next.js 应用、处理跳转与数据库代理的 Cloudflare Worker，以及面向 zhe.to 的命令行客户端。数据按登录用户查询；自行部署需要配置身份认证和存储服务。

## 功能

- 创建和编辑短链接，设置自定义 slug、过期时间、备注、文件夹与标签；在 Inbox 逐项整理未分类链接。
- 查看点击记录与来源、地区等统计；边缘 Worker 优先读取 KV，未命中时查询源站并回填缓存。
- 撰写和搜索 Markdown 想法，使用标签归类；通过 API 或 CLI 新建和更新想法。
- 用层级列表管理待办，设置日期、标签、图标、完成状态，并移动或排序条目。
- 使用 Cmd/Ctrl + K 搜索链接、想法和待办，直接进入对应内容。
- 上传文件到 R2，生成公开文件地址或临时分享；管理存储、导入导出数据，并接入 Backy 备份。
- 在 AI 设置中配置供应商、模型和密钥，为链接生成文件夹与标签建议，由用户确认后应用。
- 通过 Webhook URL 直接收藏网页；创建带权限范围的 API Key，供 REST API 与 CLI 使用。
- 照常保存 X 链接，由 CLI 内置的本机 Connector 自动补全正文、作者、图片和视频；归档媒体纳入现有 R2 存储管理和连锁删除。

## 使用

访问 [zhe.to](https://zhe.to)，使用获准的 Google 账号登录。创建链接时填写目标网址，可选择文件夹、标签、slug 和有效期；想法与待办在侧栏单独管理。

需要命令行操作时，先在管理台的 API Keys 页面生成具有所需权限的密钥：

```bash
npm install -g @nocoo/zhe
zhe login
zhe create https://example.com/article --slug reading
zhe list
zhe idea list
```

CLI 将密钥保存在 `~/.config/zhe/config.json`，当前 API 地址固定为 `https://zhe.to/api/v1`。登录验证需要链接读取权限；创建或修改内容还需要相应写入权限。更多命令见 [CLI README](cli/README.md) 和 `zhe --help`。

开启 X 自动补全时，为同一个 CLI 密钥选择 `links:read` 和 `connector:write`，本机安装 OpenCLI 浏览器扩展、登录 X，并安装 FFmpeg，然后运行 `zhe connector start`（macOS）或 `zhe connector watch`。OpenCLI 随 CLI 安装，无需另一个 Connector 账号或 LLM；Connector 权限自密钥创建起有效 30 天。详见 [X 书签与 Connector](docs/25-x-bookmark-connector.md)。

## 开发

需要 Bun、Node.js ≥ 22.16；运行本地端到端测试还需要 PATH 中的 Wrangler、FFmpeg 和 ffprobe。根应用、Worker 和 CLI 各自维护依赖：

```bash
git clone https://github.com/nocoo/zhe.git
cd zhe
bun install --frozen-lockfile
bun install --cwd worker --frozen-lockfile
bun install --cwd cli --frozen-lockfile
cp .env.example .env.local
```

先准备自己的 Google OAuth 应用及已初始化的 D1 数据库，按 [Worker 配置模板](worker/wrangler.toml.example)配置 D1、KV 和源站。Next.js 当前通过 Worker 代理访问 D1；仅填写 Cloudflare REST API 凭据不足以运行数据库查询。

| 配置 | 用途 |
| --- | --- |
| `AUTH_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET` | Auth.js 与 Google 登录；本地回调为 `http://localhost:7006/api/auth/callback/google` |
| `D1_PROXY_URL`、`D1_PROXY_SECRET` | Next.js 访问 Worker 的 D1 代理 |
| `AUTH_ALLOWED_EMAILS` | 逗号分隔的登录邮箱名单；为空时允许任何完成 Google 登录的账号 |
| `R2_*` | 文件上传所需的端点、bucket、凭据、公开域名与用户路径盐值 |
| `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_KV_NAMESPACE_ID` | 源站写入 KV；未配置时跳过这些缓存写入 |
| `WORKER_SECRET` | 源站与 Worker 之间的统计、清理和缓存同步认证 |
| `TRUSTED_ORIGINS`、`PUBLIC_ORIGIN` | 反向代理环境下的可信主机与公开地址 |

Worker 使用 `DB`、`LINKS_KV` 绑定及 `ORIGIN_URL`、`WORKER_SECRET`、`D1_PROXY_SECRET`。它每半小时触发临时文件清理与有变更时的 KV 补偿同步。首次部署需核对[数据库 schema](lib/db/schema.ts)和[迁移文件](drizzle/migrations/)；历史迁移包含手工建表后的差异，本地测试初始化脚本会补齐这些差异，不应直接用作生产安装器。

```bash
bun run dev
bun run lint
bun run typecheck
bun run build
bun run start
```

开发与生产启动端口均为 `7006`。AI 和 Backy 在管理台单独配置；没有配置时仍可使用基础链接、想法和待办功能。

## 测试

| 测试层 | 从仓库根目录执行 |
| --- | --- |
| 单元与组件测试 | `bun run test:unit` |
| 应用集成测试 | `bun run test:integration` |
| API 端到端测试 | `bun run test:api` |
| 浏览器端到端测试 | `bun run test:e2e:pw` |
| Worker 单元测试 | `bun run --cwd worker test` |
| CLI 单元测试 | `bun run --cwd cli test` |

浏览器测试前执行 `bunx playwright install chromium`。API 与浏览器测试分别使用端口 `17006`、`27006`，并自动启动本地 D1 / KV Worker（`8788`）与 R2 文件服务（`18788`），数据保存在 `.test-storage/`。两组端到端测试共用这些本地资源，应分别运行；不需要远端 D1、KV、R2 测试账号或凭据。具体启动与清理逻辑见 [scripts/test-stack.ts](scripts/test-stack.ts)。

浏览器测试仍需在环境或 `.env.local` 中提供非空 `AUTH_SECRET`；API runner 会在未配置时提供测试值。登录使用测试 Credentials provider，不会验证真实 Google OAuth。

## 技术栈

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)

| 部分 | 实现 |
| --- | --- |
| Web 与界面 | Next.js、React、TypeScript、Tailwind CSS、Basalt |
| 登录与数据 | Auth.js / Google OAuth、Cloudflare D1、Drizzle schema |
| 跳转与文件 | Cloudflare Workers、KV、R2、S3 API |
| 可选 AI | Vercel AI SDK、@nocoo/next-ai |
| CLI 与测试 | Bun、@nocoo/base-cli、Vitest、Testing Library、Playwright、Biome |

## 文档

- [想法功能](docs/19-ideas-feature.md)
- [待办功能](docs/21-todos-feature.md)
- [统一搜索](docs/23-global-search-unification.md)
- [AI 链接整理建议](docs/24-ai-link-suggestions.md)
- [X 书签与 Connector](docs/25-x-bookmark-connector.md)
- [Backy 集成](docs/10-backy.md)
- [CLI 使用](cli/README.md)

## 许可证

仓库当前未提供根目录许可证文件；CLI 的包元数据声明为 MIT。
