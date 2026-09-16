# 特殊来源与 GitHub 收藏

书签的「特殊来源」筛选默认包含 GitHub、排除全部 X（含 `twitter.com`、帖子、文章和个人页）。用户可以分别勾选两个来源；普通网页不受影响。选择保存在当前浏览器，在全部链接、文件夹页与 Inbox 之间同步，重新打开页面后仍然有效。「恢复默认」恢复 GitHub 开、X 关。

Sidebar 在「链接管理」上方增加「特殊来源」分组，包含 X 收藏和 GitHub 收藏。两个独立页面始终展示各自来源，不受书签区的来源开关影响。图标保留 Lucide 官方历史版本的 GitHub / Twitter 图形，复用当前 Lucide renderer 与现有线宽。

X 保留瀑布流，卡片直接显示分类和标签名称；分类、标签、内容类型和搜索取交集。Inbox 和其他书签页共享来源规则；AI 整理 X 时不推荐名称为「视频」「图片」「图像」「照片」及对应英文名称的文件夹。帖子、文章与其他主题分类仍可被推荐，人工归类不受限制。

## 仓库与 README

`/dashboard/github` 汇集保存的 GitHub 仓库链接，包括 issue、文件和分支等仓库子页面；个人页、topics、orgs 等全站页面不会被识别为仓库。卡片显示名称、描述、stars、默认分支 commit 总数、forks、语言、许可证、归档状态、最近提交时间、topics、分类和 tags。支持搜索、分类标签过滤，以及最近收藏、stars、commits 排序。

点击「阅读 README」加载全文，支持 Markdown 阅读视图和原文切换。列表轮询只传输摘要。相对链接和图片按 README 所在目录与默认分支解析；脚本、危险 URL 和带用户名密码的链接不会执行。HTML 可以在 Markdown 原文中阅读，不作为可执行页面插入。

卡片根据内容区宽度显示 1–4 列，各行卡片等高。标题最多 2 行，简介 3 行，备注 2 行；最多展示 3 个主题标签和 2 个收藏标签，多余标签显示数量，点击可查看完整内容。编辑收藏使用弹窗，不改变网格高度。

## README AI 分析

完成 README 采集后，点击卡片的「AI 分析」，使用设置页配置的供应商、模型和密钥，从 **完整 README** 提取中文简介、核心功能、适用场景、技术栈和主题标签。未在 README 中说明的列表保持为空；不以仓库描述代替全文，也不截断长 README。模型上下文不足时会报错，可更换长上下文模型重试。

结果自动保存，卡片优先显示 AI 简介与主题标签，「AI 详情」可查看全部字段及重新分析。GitHub 页搜索同时匹配所有 AI 字段。AI 分析独立保存在 `github_bookmarks.result_json.analysis`，不覆盖人工备注、分类、收藏标签或 GitHub 原始统计；无需新增数据库迁移。

分析接口为登录态 `POST /api/ai/analyze-github`，仅接收 `linkId`，由服务端读取属于当前用户的归档。保存时再次核对用户、链接 URL 和 README 原文；采集更新若只变动统计则保留分析，README 改动后清除旧分析。失败不会覆盖已有分析；提示词将 README 作为待分析资料，返回结果经过结构和长度校验。

## 本机采集

```sh
npm install -g @nocoo/zhe
zhe login
zhe connector start
```

Connector 延续原有 Zhe 登录与 `connector:write` 权限。macOS 使用现有 LaunchAgent，其他系统运行 `zhe connector watch`；`zhe connector once` 处理一个任务。仅采集 GitHub 时不需要 X 会话或 FFmpeg。

GitHub 采集调用官方 REST API。凭据优先使用本机 `GH_TOKEN` / `GITHUB_TOKEN`，否则在内存中读取 `gh auth token --hostname github.com`；没有凭据时读取公开仓库。GitHub 凭据不会回传 Zhe、写入任务结果或日志，重定向只允许留在 `api.github.com`。

commit 数来自 `commits?per_page=1&sha=<默认分支>` 的最后一页页码；单提交与空仓库分别为 1 和 0。无法确定完整计数时保留原快照并报错。README 使用 contents API 的 Base64 全文，并校验解码字节数；没有文件时明确显示没有 README。每份 README 最多 1,000,000 字节，编码后快照最多 1,800,000 字节。超限会报错并提供 GitHub 阅读入口，不保存截断文本。

完成的快照保留到用户点击「重新采集」。失败最多重试五次，间隔逐步延长，已有快照继续可读。网页在前台每 15 秒刷新；Connector 每次处理一个任务，两轮之间等待 20 秒。旧 CLI 不声明 GitHub 能力，仍只领取 X 任务。

## 数据与发布

`0026_add_github_connector.sql` 新增 `github_bookmarks`，复用现有 D1、API Key 和租约校验。写入检查用户、Key 权限、撤销状态、有效期和租约；修改 URL 或删除链接会使旧任务失效。README 不出现在摘要接口中，全文读取同样要求用户登录。

生产发布前执行并校验增量迁移，再部署 Web 并发布同版本 `@nocoo/zhe`。升级本机 CLI 后重新执行 `zhe connector start`，现有 GitHub 书签会由轮询发现。

验证覆盖 URL 识别、真实 SQLite 租约与删除、REST 数据完整性与凭据隔离、本地 HTTP/D1 回传，以及桌面和手机筛选、分类标签、README 阅读。真实 GitHub 验证将 `nocoo/zhe` 的 commit 数和 README SHA-256 与 Git 历史及源码对照。
