# X 图片的 Eagle 旁路

Connector 读取已保存的 X post 后，可以同时把图片写入本机挂载的 GDrive Eagle library。此功能**默认关闭**，路径由本机 CLI 配置指定，不猜测 Google Drive 账号或资源库位置。此前旁路测试图片已由用户确认在另一台电脑的 Eagle 可见；本功能沿用目录发布方式，不做 LF 实验，也不改旧测试 metadata。

## 配置

需要 macOS 或 Linux、Python ≥ 3.9、FFmpeg、ffprobe，以及已存在的 Eagle `.library`。GDrive 同步交给桌面客户端；Connector 不持有 Google Drive 凭据。资源库路径的各级目录必须真实存在，不能经过符号链接。

```sh
zhe connector eagle --library '/absolute/path/Collection.library' --enable
zhe connector start
zhe connector eagle
zhe connector eagle --disable
zhe connector start
```

`eagle` 命令复用 `~/.config/zhe/config.json`，保留原来的 API Key。`ZHE_DEV=1` 使用开发配置和独立 outbox。改变 Eagle 设置后重启 `watch`／`start`。只指定 `--library` 不会自动启用功能。

LaunchAgent 使用运行 `start` 时的 PATH；安装或迁移 Python／FFmpeg 后，再运行 `start` 更新该环境。

可在配置文件的 `eagle` 对象设置 `timeoutMs`（默认 120000，范围 1000–600000）和 `retryMs`（默认 5000，范围 1000–300000）。已入队任务保留当时的超时和目标库设置。切换库路径时，旧库任务记录 `paused_library`，不会被悄悄改写到新库；切回原路径并重启即可继续。关闭功能会暂停全部旁路恢复。

## 行为与隔离

- 0 图跳过；1–4 张 PHOTO 各自入队并行执行；超过 4 张 PHOTO 整批跳过，记录 `too_many`。视频、GIF、引用帖媒体不作为图片归档。
- 在向 Zhe 提交 capture 前分出图片任务，持有独立数据副本。Zhe 的下载、上传、租约和完成状态不依赖 Eagle；Zhe 上传失败或租约取消，也不会取消已分出的旁路任务。
- 每图单独下载、校验、生成缩略图、重试。每个 attempt 运行于独立进程组，超时终止 Python、Node 和 FFmpeg。Drive 文件操作全部位于子进程中，避免阻塞 enrich 的文件操作线程。
- `watch` 独立恢复 outbox，即使 Zhe 不可达或没有新任务。`once` 先输出 enrich 结果，再等待本轮旁路 attempt；日志会继续输出 Eagle 的独立结果。停止 `watch` 会终止旁路进程组，持久化任务留待下次恢复。

## 写入与恢复

本机 outbox 先原子、持久化记录每图任务，再开始下载。每个任务用内核 `flock` 排他处理；同一 outbox 跨进程最多 4 个 attempt。重试次数和下次执行时间在耗时操作前落盘，指数退避至 5 分钟；下载失败、Drive 离线或超时不需要 Zhe 重新派发任务。

原图最多 10 MiB；旁路在完整解码前检查每边最多 10000 像素、总计最多 2000 万像素，并限制 FFmpeg 解码线程。缩略图为最长边 640 像素的 PNG。准备好的原图和缩略图均保存 SHA-256，恢复时重新校验，可复用有效本机缓存。

Eagle 条目 ID 根据 post ID 与 media ID 确定，并用完整 SHA-256 来源指纹检查碰撞。先在 `images` 内隐藏 staging 目录写入原图、`名称_thumbnail.png` 和 `metadata.json`，逐文件 fsync 后，以原子、禁止覆盖的 native rename 发布为 `.info`。macOS 使用 `renameatx_np(RENAME_EXCL | RENAME_NOFOLLOW_ANY)`，Linux 使用 `renameat2(RENAME_NOREPLACE)`，无覆盖／复制降级路径。

重启会清理该任务记录的未完成 staging；若上次已 rename、但尚未记完成，则识别来源指纹并补写收据。完成收据压缩为 `.done` 下的空文件，保留幂等性，不再扫描完整历史任务。已完成条目随后在 Eagle 中编辑或删除，Connector 不会根据旧任务重建。资源库根 `metadata.json`、`mtime.json` 和已有 `.info` 内容从不写入。

## 容量和诊断

outbox 最多保留 128 个待办／隔离任务；最多保留 12 个图片工作目录，原图与缩略图合计上限约 240 MiB。达到上限记录 `quota`，拒绝新任务或暂停准备图片；Zhe enrich 继续。新任务被拒绝后，需要在腾出空间后从 Zhe 重新触发该 post 的补全。完成收据每张图片只保留一个空文件。

损坏任务及已有 ID 的来源冲突会改名为 `.json.quarantined`，不自动重试或覆盖 Eagle 条目。修复配置／冲突后，可停止 Connector，检查该任务并将其移回 `.json`（清除 `lastError`，把 `nextAttemptAt` 设为 0）再启动；不要改 Eagle 旧条目来绕过冲突。隔离任务也占用 128 个任务配额，需要人工处理。

Eagle 日志独立使用 `event: "eagle"`，包含安全的状态码、任务摘要 ID、重试次数和下次执行时间；不包含帖子正文、原始 URL、库路径、Key、cookies 或上游错误。`retry` 的原因分为 `download_failed`、`drive_unavailable`、`conflict`、`quota`；跳过的原因分开记录。LaunchAgent 的 `connector.log` 每分钟检查，超过 5 MiB 后清空，后续日志继续写入同一文件。

`saved` 仅代表本机原子发布成功；跨电脑同步时间与远端 Eagle 的刷新仍由 GDrive／Eagle 决定。

## 验证

CLI `bun run test:coverage` 包含 Vitest 单元测试及 Python 原生文件系统集成测试，全部使用临时合成资源库。覆盖 0／1–4／>4 图、重复、跨进程并发、单图失败、Drive 不可用、超时与停止隔离、重启与 rename 两侧崩溃恢复，以及不覆盖和符号链接防护。发布还要求项目 lint、typecheck、L1、L2、L3、build 与 security 门禁。

CLI build 显式打包 Python helper；`prepack` 重建 `dist`。本次发布只发布 GitHub Release 和部署站点，**不执行 npm publish**。
