# 网页预览图补全

本机 Connector 为 `screenshot_url` 为 NULL、空串或空白的普通链接补全截图。新建链接和已有积压使用同一发现流程，覆盖网页、Webhook、REST API 与 CLI 保存入口。X/Twitter、GitHub 的整个域名及其子域名均跳过；GitHub 继续使用 `/github-preview.jpg`。已有预览不会被自动替换。

## 尺寸与压缩

`GridScreenshot` 的预览区域使用 `aspect-[4/3]`，共享网格 `CARD_GRID_CLASS` 在各断点展示 2–6 列。图片使用 `unoptimized` 直接读取 CDN，因此在采集端控制像素和体积。

| 项目 | 配置 |
| --- | --- |
| 桌面视口 | 1280×960 CSS px |
| 渲染密度 | `deviceScaleFactor: 2`，与本机是否为视网膜屏无关 |
| 最终文件 | 1600×1200，4:3，可支撑 800 CSS px 宽的 2× 展示 |
| 编码 | 浏览器原生 WebP，质量 80；超限时依次尝试 70、60 |
| 硬上限 | 512 KiB；不降低尺寸、不上传超限图 |
| 截取范围 | 保存 URL 的首屏，包括路径和查询参数；不抓取整页长图 |

通过固定版本 OpenCLI 的 `newTab` 创建任务独占的后台标签页，绑定后用 `Emulation.setDeviceMetricsOverride` 设置桌面视口。等待页面、字体和可见图片加载，检查最终地址与错误页，再用 `Page.captureScreenshot` 的 `clip.scale=0.625` 将 2560×1920 的 2× 渲染缩到最终尺寸。浏览器直接压缩，无新增依赖，也不依赖 FFmpeg 的 WebP 编码器。

实际验证中，example.com 为 12,300 字节，Cloudflare 首页为 103,970 字节，均为 1600×1200；不同页面的大小会变化。

## 串行调度与幂等

- 三类任务共用 `zhe connector once/watch/start`。按最近执行时间轮换来源，避免某一类积压饿死其他来源。
- 每个用户最多一个有效运行租约。互斥条件在 D1 的原子领取语句内检查，覆盖多进程、多 API Key 和旧版 X-only CLI。
- 截图仅发给声明 `X-Connector-Sources: github,x,screenshot` 能力的客户端。旧版客户端继续接收其支持的来源。
- `screenshot_jobs.link_id` 主键防止同一个收藏重复入队。每次租约使用独立随机 R2 key，旧进程无法覆盖新一轮上传；同一租约的并发 PUT 只能有一个写入者。
- 重复提交已成功的相同 SHA-256 返回成功，保留原图与 URL。失败不会清空用户已有的图。
- 沿用 180 秒租约、30 秒续租、最多 5 次尝试和指数退避。`watch` 等待任务及临时文件清理结束，再等待 20 秒。取消时等待隔离子进程退出，必要时在 5 秒后强制结束。
- 每次发布重新检查用户、API Key、租约、原始 URL 和缺图状态；改 URL、手动补图、删除或撤销密钥均会阻止晚到的结果。

可选 Eagle 旁路仍按其独立配置运行；它不接收网页截图任务。

## 存储与清理

复用 `hashUserId`、`generateObjectKey`、`buildPublicUrl`，最终 key 为 `{userHash}/YYYYMMDD/{uuid}.webp`，日期为 UTC；以 `image/webp` 写入 R2，使用 `R2_PUBLIC_DOMAIN` 构造 CDN URL 并保存到 `links.screenshot_url`。CLI 不接触 R2 凭据，也不自行指定对象位置。

服务端校验实际 WebP 容器、静态画布尺寸、分块边界、SHA-256 和上传体积。写 R2 前登记持久清理记录；运行中的预留对象和已发布图被存储审计与 GC 保护。链接删除、URL 改动或人工替换触发旧 key 入队；晚到的上传再次登记清理，避免并发清理留下孤儿对象。URL 改动只清除这个任务生成的旧图，保留用户另行设置的图。

Dashboard 仅对仍缺图的普通链接做前台批量轮询，隐藏页面暂停；合并时保留最新备注和元数据，拒绝过时 URL 的结果。

## 部署与验证

部署服务端前应用 `drizzle/migrations/0027_add_screenshot_connector.sql`，再更新 CLI 并重启 Connector。此迁移增加截图队列表和清理触发器，无历史预览覆盖或回填写入；任务在支持截图的新 CLI 轮询时发现。

需要已连接的 OpenCLI 浏览器扩展，以及现有 R2 配置（包括 `R2_USER_HASH_SALT` 和指向 CDN 的 `R2_PUBLIC_DOMAIN`）。不支持的地址、错误页、验证页或加载超时会保留缺图状态并按重试策略处理。

验证覆盖 CLI 截图与文件清理、三来源并发领取、轮换调度、租约过期、重复 PUT、上传期间编辑/删除/撤销、R2 清理和卡片自动更新。`tests/api/v1/connector.test.ts` 通过本地 D1/R2 栈验证真实 HTTP 上传与公开 WebP 读取；`tests/playwright/connector.spec.ts` 验证 2× 屏幕下预览无需刷新即可出现，并检查桌面、手机的 4:3 展示和删除清理。
