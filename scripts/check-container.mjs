import assert from "node:assert/strict";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

assert.equal(process.getuid(), 1000);
assert.equal(process.env.NODE_ENV, "production");
for (const key of Object.keys(process.env)) {
  assert(!/^(AUTH_|D1_PROXY_|R2_|LOCAL_|E2E_|PLAYWRIGHT|ZHE_)/.test(key), key);
}

const { version } = JSON.parse(await readFile("/app/package.json", "utf8"));
const origin = `http://127.0.0.1:${process.env.PORT}`;
let response;
for (let attempt = 0; attempt < 30; attempt++) {
  response = await fetch(`${origin}/api/live`, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (response) break;
  await setTimeout(1000);
}
assert(response, "Standalone server did not start");
assert.equal(response.status, 503);
assert.equal(response.headers.get("cache-control"), "no-store");
const live = await response.json();
assert.equal(live.component, "zhe");
assert.equal(live.version, version);
assert.equal(live.database.connected, false);

for (const method of ["GET", "POST"]) {
  const denied = await fetch(`${origin}/api/v1/links`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(denied.status, 401);
}
const asset = await fetch(`${origin}/github-preview.jpg`, {
  redirect: "error",
  signal: AbortSignal.timeout(5000),
});
assert.equal(asset.status, 200);
assert((await asset.arrayBuffer()).byteLength > 0);

const home = await fetch(origin, { redirect: "error", signal: AbortSignal.timeout(5000) });
assert.equal(home.status, 200);
const html = await home.text();
const paths = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css))"/g)].map(
  (match) => match[1],
);
assert(
  paths.some((path) => path.endsWith(".js")),
  "No Next JavaScript asset found",
);
assert(
  paths.some((path) => path.endsWith(".css")),
  "No Next stylesheet found",
);
for (const path of new Set(paths)) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, path);
  assert((await response.arrayBuffer()).byteLength > 0, path);
}

await mkdir("/app/.next/cache", { recursive: true });
const probe = "/app/.next/cache/container-smoke";
await writeFile(probe, "writable");
await unlink(probe);
console.log(
  `Container acceptance passed: UID 1000, version ${version}, isolated health/auth/assets/cache`,
);
