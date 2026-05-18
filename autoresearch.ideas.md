# Deferred ideas — remaining complexity violations after 2h session

Baseline: 58 violations. Final: 37 (-36%). All 2444 unit tests still pass.

## Remaining file violations (6)

- `components/dashboard/link-card.tsx` (838) — keep splitting into row-subcomponents inside grid-view / list-view (earlier round regressed because subcomponents introduced new >100-line fns; need finer split).
- `components/dashboard/overview-page.tsx` (609) — has multiple chart/section components already; extract ClickTrendChart, UploadTrendChart, BreakdownDonut, TopLinksList, KVCacheSection into separate files.
- `components/dashboard/storage-page.tsx` (543) — extract R2FileRow, R2Section, D1Section into separate files.
- `actions/links.ts` (539) — split per concern (CRUD vs analytics vs screenshots vs metadata).
- `cli/src/commands/idea.ts` (474) — split per sub-command (list/get/create/edit/delete).
- `cli/src/utils.ts` (447) — likely a misc dumping ground; split by domain.

## Remaining function violations >100 lines (31)

Highest leverage:
- `link-card.tsx:74` (499) and `:595` (149) — same component as above.
- `ideas-page.tsx:79` (312) — apply Push/Pull-style sectioning.
- `links-list.tsx:61` (296) — extract toolbar / view-mode controls / list body.
- `api-keys-page.tsx:27` (234) — extract create form + key list + revoke dialog.
- `contexts/dashboard-service.tsx:92` (223) — extract individual mutation handlers as helper functions.
- `webhook-page.tsx:13` (221) — extract DeprecationWarning + ConfiguredView.
- `lib/auth-adapter.ts:22` (215) — already a NextAuth adapter; split factory pieces.

Quick wins (just over 100):
- `viewmodels/useWebhookViewModel.ts:27` (110) — extract mount-effect helper.
- `viewmodels/useOverviewViewModel.ts:46` (113) — same.
- `cli/src/commands/update.ts:82` (108) — extract URL/folder normalization.
- `components/dashboard/upload-item.tsx:38` (102) — extract action handlers.
- `lib/kv/sync.ts:34` (111) — extract delta-computation helper.

## Notes
- xray-page-parts/config-section and test-section (125 / 119) were created during this session. They could be split further by extracting FormFields / ResultPanel.
- worker/src/index.ts now has `handleFetch` at 139 lines — break out KV-lookup and lookup-API steps as helper functions.
- webhook-page-parts/webhook-usage-docs.tsx introduced a 165-line WebhookUsageDocs; should split MethodsTable, AgentPrompt, CurlExamples blocks.
