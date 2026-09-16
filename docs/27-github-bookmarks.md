# 特殊来源与 GitHub 收藏

书签的「特殊来源」筛选默认包含 GitHub、排除全部 X（含 `twitter.com`、帖子、文章和个人页）。用户可以分别勾选两个来源；普通网页不受影响。选择保存在当前浏览器，在全部链接、文件夹页与 Inbox 之间同步，重新打开页面后仍然有效。「恢复默认」恢复 GitHub 开、X 关。

Sidebar 在「链接管理」上方增加「特殊来源」分组，包含 X 收藏和 GitHub 收藏。两个独立页面始终展示各自来源，不受书签区的来源开关影响。图标保留 Lucide 官方历史版本的 GitHub / Twitter 图形，复用当前 Lucide renderer 与现有线宽。

X 保留瀑布流，卡片直接显示分类和标签名称；分类、标签、内容类型和搜索取交集。Inbox 和其他书签页共享来源规则；AI 整理 X 时不推荐名称为「视频」「图片」「图像」「照片」及对应英文名称的文件夹。帖子、文章与其他主题分类仍可被推荐，人工归类不受限制。

## 仓库与 README

`/dashboard/github` 汇集保存的 GitHub 仓库链接，包括 issue、文件和分支等仓库子页面；个人页、topics、orgs 等全站页面不会被识别为仓库。卡片显示名称、描述、stars、默认分支 commit 总数、forks、语言、许可证、归档状态、最近提交时间、topics、分类和 tags。支持搜索、分类标签过滤，以及最近收藏、stars、commits 排序。

点击「阅读 README」加载全文，支持 Markdown 阅读视图和原文切换。列表轮询只传输摘要。相对链接和图片按 README 所在目录与默认分支解析；脚本、危险 URL 和带用户名密码的链接不会执行。HTML 可以在 Markdown 原文中阅读，不作为可执行页面插入。

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
