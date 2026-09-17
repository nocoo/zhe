# 收藏搜索：字段调查与实现

调查基线：`7d96fd1`（从 `6d8f691` fast-forward 的新增提交只调整维护文档）。版本发布目标为 root `package.json` 的 Z+1。

## 实际数据与原有覆盖

| 来源 | 已存字段／数据链路 | 原有搜索覆盖 |
| --- | --- | --- |
| 链接 | `links.slug/original_url/meta_title/meta_description/note/folder_id`；`tags` + `link_tags` | `models/links.ts` 全局客户端匹配前五项和收藏标签；`lib/db/scoped/links.ts` REST/服务端只匹配前五项，使用 INSTR，不是 FTS 或 LIKE |
| X | `cli/src/connector/core.ts:XPost` 经 OpenCLI 读取、规范化，`stageXCapture` 写 draft，`completeXBookmark` 发布至 `x_bookmarks.result_json`；媒体另存 R2/x_media/uploads | 完整 `tweet.text` 写回 `links.meta_description`，`author.name/username` 写回 `meta_title`，因此全局已间接可搜。X 页面还显式匹配这些字段、URL、备注、收藏标签 |
| X 文本实体 | `entities.hashtags/mentioned_users/urls`、`quoted_tweet.text/author/实体`、`lang` | 已采集存储，但未进入原全局及 X 页关键词过滤 |
| X 展示字段 | `id/url/created_at`、作者 `id/name/username/profile_image_url/followers_count/is_verified`；metrics 六项计数；转发/引用/回复标记、`reply_to_id`；媒体 id/type/url/thumbnail_url/尺寸/时长 | 帖子 id 可通过原 URL 间接匹配；计数、媒体与标记用于展示/类型过滤，不是原来的关键词字段。媒体展示还要求对应上传处于 published，不能盲用原始 JSON 当可播放附件 |
| GitHub | `github-core.ts:GitHubRepository`：`sourceFullName/fullName/description/stars/commits/forks/language/defaultBranch/pushedAt/archived/license/topics/readme/readmePath`。Connector 调官方 REST，读取默认分支完整 README（最多 1,000,000 字节），存 `github_bookmarks.result_json` | `fullName/description` 写回链接基础字段，可间接全局匹配；Github 页额外匹配 language/fullName/topics |
| GitHub AI | `result_json.analysis`：`summary/features/useCases/techStack/tags/model/provider/generatedAt`；服务端用完整 README 分析，保存前核对用户、URL 和 README；README 变化清除旧分析 | GitHub 页匹配前五项 AI 内容，全局不匹配。它们不是收藏标签表，不能混淆 |
| GitHub API/UI | `getGitHubBookmarks` 用 `json_remove` 去掉 README，仅返回结构化摘要及 analysis；`getGitHubRepository`/`loadGitHubReadme` 按需读取全文且验证用户/URL | 原浏览器列表没有完整 README；不能声称已有全文搜索。owner/repo 由 fullName 派生；没有独立 issue、PR、labels、commit SHA 字段 |
| 想法/待办 | ideas：title/content/excerpt、关联收藏标签；todos：title/content/excerpt/tagNames/emoji、完成/到期状态 | 原全局想法搜 title/excerpt/标签，待办搜 title/excerpt；完整 content 未加载至列表。树过滤器保留祖先，不能把祖先当作搜索命中 |
| 索引 | `0008_add_search_indexes.sql` 用户、分类、标签 B-tree；X/GitHub 的 poll 索引服务租约队列 | 无内容搜索索引；普通 B-tree 不加速任意子串搜索 |

关键代码：`lib/connector/jobs.ts`、`github-jobs.ts`、`actions/connector.ts`、`actions/github-connector.ts`、`app/api/ai/analyze-github/route.ts`、`components/dashboard/{x,github}-library-page.tsx`。历史 `23-global-search-unification.md` 的规划未在调查基线实施，不能当作当时行为。

## 目标契约

1. 同一纯模型提取可搜索文本。基础字段、分类和收藏标签，X 正文/作者/账号/语言/实体/引用上下文，GitHub 原始及当前仓库标识、描述、语言、许可证、分支、README 路径与全文、五项 AI 内容，想法/待办标题、正文、摘要与标签。数字计数、时间、模型供应商、图片地址、租约、凭据、draft 不作为关键词；计数和采集状态可作结果元数据。
2. NFC、Unicode 小写、合并空白后做整段字面子串匹配；不解释 SQL/正则/布尔语法。保留 `% _ + # @ / 引号` 等字面含义。标题精确/前缀优先，再依次为标题子串、作者/仓库/URL、标签/属性、简介、正文。时间与 id 提供稳定排序。
3. D1 保存用户隔离的规范化投影；源表触发器递增 revision，查询前只重建脏记录，CAS 防止并发写入旧投影。查询采用用户索引 + INSTR，不受 D1 LIKE 的 50-byte 模式限制。所有入口使用同一匹配规则，REST 列表仍保留显式排序选项。
4. Cmd/Ctrl+K 与 `/dashboard/search?q=…` 共用服务端结果和高亮上下文。客户端不下载所有 README。请求防抖、取消及版本检查；空查询、加载、空结果、错误分开，支持重试和分页。
5. 使用 Basalt/cmdk 原语，来源图标、标题、匹配片段和元数据分层。Enter 保留打开原链接的契约；想法/待办维持应用内导航；弹层 Esc 立即关闭并恢复焦点，结果页 Esc 返回。验证上下、IME、Tab、Cmd/Ctrl+K、窄屏与深浅色。

## 验证与发布

- SQLite 实跑迁移、触发器、更新/删除/标签改名/URL 变更、并发 CAS、跨用户和查询计划；正文尾部、Unicode、空白及特殊字符。
- HTTP/API 与客户端竞态、错误恢复；真实浏览器键盘、来源过滤、完整结果页、响应式和颜色模式。
- Grok `wG:p2` 和 Pi `wG:p3` 独立只读 review，修复有证据的问题；不把推测当成模型字段。
- 迁移先于依赖部署，预先准备搜索投影。正常 main 原子提交及质量钩子；按项目 release 脚本发布，核验 tag/CI/Railway/线上版本与搜索。延续本会话不执行 npm publish 的约束。

## 实现与运维细节

- 新增 `POST /api/search`，只接受当前登录用户；无客户端 userId。JSON 请求最多 16 KiB，关键词最多 2000 字符，每页最多 50 项，默认 20 项；每用户每分钟 120 次，响应 `private, no-store`。关键词日志不记录正文或用户内容。
- 关键词是整段字面子串；例如 `C++`、`%_`、`@name` 原样匹配，`CAFÉ\n中文` 与 `café 中文` 一致。字段之间不拼接匹配。页面内原有树/列表过滤仍服务于其自身列表；跨资源弹层与结果页统一使用此接口，链接/想法 REST 的关键词也使用同一投影。
- 迁移 0028 种下存量记录并注册触发器。每次重建最多 32 批，每批 4 项，循环预算 8 秒；已写入投影保留进度。查询与 hydration 之间发生变更时最多再查 2 次，持续变更返回可重试错误。源数据仍是权威，不使用 draft。
- 先执行 `wrangler d1 execute zhe-db --remote --file=drizzle/migrations/0028_add_search_documents.sql`，再在正确 D1 proxy 环境运行 `bun run scripts/backfill-search.ts`。脚本只输出完成用户数；不输出原文。最后检查 `indexed_revision <> revision` 为零，再部署依赖版本。
- 任意子串搜索使用 owner 索引限制候选，并扫描该用户规范化文本；不是全文倒排索引。只有脏记录和命中的当前页需要解析源快照，完整 README 不回传浏览器。极大收藏库的延迟应通过线上 smoke 持续观测。

## Review 与验证记录

Grok（`wG:p2`）和 Pi（`wG:p3`）分别 review 后复核修复：分页 hydration 变化重试、重建预算、Ideas REST/launcher 语义、异步首项选择、加载期禁用全结果跳转、IME 与关闭焦点恢复。排除了不存在表/字段和未经证实的投影体积推测；最大合法 Unicode README 已有实跑测试。

本次把旧的“Dashboard 内存数组过滤”组件测试迁移成服务端结果、请求取消/迟到响应、重试、复制/分类、想法/待办路由测试；字段和权限语义在真实 SQLite 迁移测试及 HTTP 测试验证。新增模型纳入覆盖率范围，沿用项目既有质量门槛，不修改其他领域覆盖率配置。

浏览器实跑 1365px / 390px、应用深浅主题、Cmd/Ctrl+K、输入焦点、上下、Enter、Esc 与返回、IME、错误重试、来源筛选、无结果和无横向溢出；保留原搜索快捷键测试。最终全套 L3 由 release preflight 再执行。
