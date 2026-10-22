# Railway to jp2 Migration

Status: pre-cutover implementation authorized on 2026-10-22 (Asia/Shanghai).
The owner requires confirmation before changing domains. No public cutover,
Railway shutdown, certificate work or shared proxy changes are authorized yet.
Baseline: `e0fdb5c3e22803aff3146932d6ceaa729bed155b`, application `2.2.11`.

## Scope

Deploy the existing Next.js application as one native Node container on jp2.
Keep `zhe-edge`, D1, KV, R2, schema, Google authentication, CLI credentials and
canonical URLs unchanged. Browser capture, Python/FFmpeg and Eagle remain in
the user's local CLI, not in the web container.

Reuse Firefly's pinned
`nocoo/base-ci/.github/workflows/deploy-docker.yml` at
`ac635753a869cb85fad1f52aae4ccbd6119f3cae`. Successful main-push CI proves the
source SHA; CD builds in GitHub Actions and deploys the resulting image digest.
Do not build on jp2, use `latest` for deployment, or bypass normal Git hooks.
This staging task does not publish a version or npm package.

## Observed Baseline

Read-only checks on 2026-10-22 found:

| Item | Evidence |
| --- | --- |
| Public health | `2.2.11`, HTTP 200, `Cache-Control: no-store`, D1 connected |
| Railway deployment | `d497e198-8b61-4899-b9c5-0f70a32df9a5`, baseline SHA, running |
| Railway image | `sha256:d89f370fbad1b8fb2e2985ed442317d598acda0d3e2a804d4f345c4387844cd5` |
| Railway resources | One instance, no volumes; configured memory ceiling 4,000,000,000 bytes |
| Railway variables | 18 application variables, none sealed; `PORT=7005`, `HOSTNAME=0.0.0.0`, `AUTH_URL=https://zhe.to`; no application `NODE_OPTIONS` override |
| Railway trigger | GitHub `nocoo/zhe`, main, waits for checks; disconnect approval pending |
| jp2 capacity | 2 CPUs, 15,934 MiB RAM, 13,459 MiB available, 44 GiB root disk free; instantaneous snapshot |
| jp2 platform | Docker 29.7.2, Compose 5.5.0, external `edge` network |
| Target collision | `/opt/zhe` absent; ports 7005, 7006 and 17006 unused |
| Shared proxy | `proxy-caddy`, started `2026-10-21T05:50:17.30329842Z`; do not restart |

Do not confuse the repository's default port 7006 with Railway's explicit
runtime port 7005. Preserve the application variable rather than silently
overriding it. Early architecture/deployment docs contain historical D1 REST
descriptions; current `lib/db/d1-client.ts` sends all SQL through the D1 Worker.

## Target

| Item | Value |
| --- | --- |
| Image | `ghcr.io/nocoo/zhe`, verified digest |
| GitHub environment | `zhe / production` |
| Directory | `/opt/zhe` |
| Compose service / container | `web` / `zhe-app` |
| Private staging listener | `127.0.0.1:17006` to container port 7005 |
| Runtime | One non-root Node process, standalone/static/public assets, writable disposable Next cache |
| Runtime environment | Private `.env.runtime`, mode 0600, raw Compose env-file semantics |

Railway is the authoritative source of production values. Transfer application
values unchanged over SSH, reject sealed or unrepresentable values, and compare
source, private file and running container without printing secrets or hashes.
Do not substitute local `.env` values, regenerate keys, or bake credentials into
images. Exclude local identities, test flags and local resource overrides.

The owner explicitly approved disconnecting the Railway main trigger and adding
a dedicated Zhe CI SSH key before the first push. Keep the current deployment
running. Preserve existing SSH authorizations and reuse existing registry access;
the single approved key addition does not authorize broader host ACL or shared
service changes.

## Implementation and Verification

1. Record the scope and baseline; harden the existing Docker context and image.
2. Add the pinned CD caller, single-service Compose and bounded origin checks.
   Replace the release script's Railway redeploy step with Docker CD evidence.
3. Run focused checks, full existing quality gates, isolated HTTP/browser tests,
   and a clean Linux image build without production variables or credentials.
4. Independently review the changes, commit atomically, and prepare private
   runtime configuration and scoped deployment credentials.
5. After trigger approval, push the completed changes once through normal hooks.
   Record exact-SHA CI/CD, image digest/revision and private origin acceptance.
6. Stop and ask the owner to approve public routing and any necessary TLS work.

Container acceptance covers UID, native Sharp, static/public assets, writable
cache, no test flags/secrets, database-disconnected health without configuration,
and unauthorized write denial. Existing L2/L3 fixtures must remain isolated from
production; never run automated mutations against the staging production data.

Private-origin acceptance requires exact image digest and OCI source revision,
the package version, no-store database health, canonical Host/HTTPS forwarding,
no redirect following, public login/assets, and unauthorized API/Server Action
denial. Do not accept a response from the still-running Railway origin as proof.
The Server Action probe identifies the real read-only `getLinks` action in the
deployed manifest and requires the session Proxy's exact anonymous login redirect
without following it. This proves the session route boundary, not execution of
the action's own authorization guard; isolated authenticated browser journeys
cover the working action path.
Production authenticated writes and real Google OAuth need separately controlled
acceptance, not synthetic data or a configured callback alone.

Connector regression must preserve unbuffered 100,000,000-byte video uploads,
lease renewal, cancellation, checksum verification and idempotency. Browser
uploads retain R2 presigning; the temporary-file API retains its 10 MiB limit.

## Cutover Boundary and Rollback

Public topology remains `zhe.to -> zhe-edge -> origin.zhe.to -> Railway` until
approval. Unlike Firefly's retired duplicate hostname, `origin.zhe.to` is an
active Worker dependency for forwarding, lookup, analytics and cron. Do not
delete it, remove the Worker route, or redirect it back to the apex.

Before proposing cutover, inspect and record DNS, Worker origin configuration,
TLS/AOP, Caddy routing, active Railway deployment, image digests and the runtime
environment equality result. Present the exact proposed changes for approval.
Validate the relevant origin certificate and canonical forwarding; a public edge
certificate or another site's certificate is not origin TLS proof.

If approved later, modify only Zhe routing. Preserve the shared Caddy file's
bind-mounted inode, validate, hot reload rather than restart, and verify other
sites. Reconcile staging caches and keep one intended write origin. Exercise
short-link hit/miss/expiry, click analytics, OAuth/session, Server Actions, CLI
uploads, R2 access and cron through the public Worker path.

The shared CD workflow replaces the container before verification; failure does
not automatically roll back. Retain accepted digest receipts in
`.base-ci-releases/` and restore a recorded digest, never `latest` or a rebuild.
There is no previous jp2 Zhe digest before the first deployment. Railway remains
the rollback origin; its shutdown requires separate confirmation. Routing/image
rollback does not undo database writes. This task performs no schema migration.

## Progress

- [x] Owner authorized pre-cutover implementation and jp2 deployment.
- [x] Repository, Railway and jp2 baseline inspected without infrastructure changes.
- [x] Container hardening, clean Linux build and isolated HTTP/browser regressions passed.
- [x] CD and private deployment verification independently reviewed; the session acceptance gap was fixed and closed.
- [x] Railway main-trigger handling approved and performed; the original instance remains running.
- [x] Runtime file/Compose values and scoped deployment credentials prepared and verified; running-container equality still awaits deployment.
- [ ] Exact-SHA CI/CD deployed the private origin; acceptance evidence recorded.
- [ ] Owner approved public routing/TLS changes.
- [ ] Public cutover and authenticated acceptance completed.

### Preparation Evidence

- Commits `47279e89` (plan) and `b351c03d` (container packaging) passed normal
  index-snapshot hooks. Container-commit L1 coverage was 98.09 / 95.06 / 96.71 /
  98.80 for statements / branches / functions / lines; 197 in-process integration
  tests, strict types, Biome and staged gitleaks passed. Existing Vite and Node
  test-runner warnings were observed, not suppressed.
- Commit `4ebfc04b` adds the reviewed CD, deployment acceptance and release
  handoff; its full index-snapshot hook also passed. The independent review's
  Server Action acceptance finding was fixed and closed before this commit.
- A clean Linux amd64 image built without application variables or database
  credentials. The approved company mirror lacked several exact locked
  tarballs; a temporary Dockerfile using the approved Tencent mirror succeeded.
  The tracked installer and lockfile are unchanged. Canonical-Dockerfile GitHub
  CI remains required; this local build is not that receipt.
- The image ran as UID 1000 with no network, production mode and no application
  secrets/test flags. Health returned 503/no-store with D1 disconnected, Bearer
  reads/writes returned 401, public assets and actual Next JS/CSS loaded, and
  the Next cache was writable. Native Sharp generated a PNG in the final image.
  A separate isolated synthetic-auth run proved the manifest-identified Server
  Action request receives the expected Proxy/session denial.
- Isolated real HTTP tests passed 239 cases in 30 files; the full desktop Chromium
  and iPhone browser run passed 200 cases in six minutes. These runs
  include existing Connector journeys, not a new maximum-size 100 MB upload
  stress test or the future public Caddy path. No production fixtures or
  authenticated writes were performed.
- `/opt/zhe` is mode 0700; `.env.runtime`, `compose.yaml` and the private Railway
  rollback record are mode 0600. All 18 application values match Railway after
  raw Compose parsing. No container has started, so running-container equality
  is still unverified.
- At the initial preparation checkpoint, deployment phase was `precutover`. Six environment-scoped deployment
  values are configured, reusing trusted local SSH host keys and existing host
  registry credentials. `VPS_SSH_KEY` is deliberately unset: approval to create
  a Zhe-specific CI key and append its SSH authorization is pending. The user's
  personal SSH private key was not copied to GitHub.
- At that checkpoint, Railway main-trigger disconnection awaited approval. No push,
  GHCR publication, jp2 container start, DNS/Worker/TLS/Caddy change or Railway
  restart/shutdown has occurred. There is no jp2 deployment or rollback digest.

### Approved Deployment Credentials and Trigger Isolation

On 2026-10-22 the owner approved both pending operations, but not public cutover.

- Generated an Ed25519 key at `/opt/zhe/deploy-key` (0600), with comment
  `zhe-deploy@github-actions` and public fingerprint
  `SHA256:arldk9r/hxIoHnW8FKmtVTtHijnEzua3tHFhCyyk28Q`. Added only this public
  key to `nocoo`'s existing `authorized_keys`, using `restrict` to disable PTY,
  forwarding and user rc. Existing authorization bytes were preserved.
- Verified the new key over SSH with strict trusted-host verification and the
  shared action's `bash -s` execution pattern. Stored it as `VPS_SSH_KEY` in the
  `zhe / production` GitHub environment. Its temporary local test copy was
  removed; the user's personal SSH private key was not copied to GitHub.
- Rechecked all 18 Railway application values against the private env-file and
  parsed Compose environment, and verified installed Compose matches the repo.
- Recorded the exact Railway trigger before-image in the private rollback file,
  then deleted trigger `6c07f687-51dd-4710-9269-0050f1deb8e9`. A fresh query
  returned no triggers. Deployment `d497e198-8b61-4899-b9c5-0f70a32df9a5`
  remained successful and running at the original source SHA.
- All seven deployment secrets are configured. The deployment phase remains
  `precutover`; DNS, TLS, Caddy, Worker, schema and Railway instance are unchanged.
