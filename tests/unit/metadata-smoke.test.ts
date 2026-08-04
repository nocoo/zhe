// @vitest-environment node
/**
 * Runtime smoke test for the url-metadata / cheerio / undici deps.
 *
 * Purpose: guard against runtime regressions from the `undici` override
 * pinned in package.json (>=8.9.0). The unit-level `metadata.test.ts` mocks
 * `url-metadata`, so nothing there actually exercises the transitive
 * cheerio / undici versions. This spec drives three independent checks:
 *
 *   1. `urlMetadata()` (the real dep, which uses node-fetch internally
 *      to fetch and then cheerio to parse) against a local HTTP fixture —
 *      proves the real application path still works after the override.
 *   2. `cheerio.load()` on a known HTML snippet — proves the pinned
 *      cheerio version still parses correctly.
 *   3. The resolved `undici` package version (read from its package.json)
 *      is unconditionally asserted to satisfy the >=8.9.0 override and
 *      `undici.request()` is exercised against the same fixture — locks
 *      the override in against a silent downgrade below 8.9.0.
 */
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import * as cheerio from "cheerio";
import { request as undiciRequest } from "undici";
import urlMetadata from "url-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const undiciPkg = createRequire(import.meta.url)("undici/package.json") as {
  version: string;
};

const HTML_FIXTURE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Smoke Test Page</title>
    <meta name="description" content="Smoke test page for url-metadata" />
    <meta property="og:title" content="Smoke OG Title" />
    <meta property="og:description" content="Smoke OG Description" />
    <link rel="icon" href="/favicon.ico" />
  </head>
  <body>
    <h1>Hello</h1>
  </body>
</html>`;

describe("metadata smoke — real url-metadata / cheerio / undici", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(HTML_FIXTURE);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("url-metadata fetches (via node-fetch) and parses (via cheerio) a real page end-to-end", async () => {
    // url-metadata blocks private IPs by default (request-filtering-agent);
    // the loopback fixture must be explicitly allow-listed for the smoke test.
    const meta = await urlMetadata(baseUrl, {
      timeout: 5000,
      requestFilteringAgentOptions: { allowPrivateIPAddress: true },
    });

    expect(meta.title).toBe("Smoke Test Page");
    expect(meta.description).toBe("Smoke test page for url-metadata");
    expect(meta["og:title"]).toBe("Smoke OG Title");
    expect(meta["og:description"]).toBe("Smoke OG Description");
    expect(Array.isArray(meta.favicons)).toBe(true);
  });

  it("cheerio.load parses the same HTML snippet", () => {
    const $ = cheerio.load(HTML_FIXTURE);
    expect($("head title").text()).toBe("Smoke Test Page");
    expect($('meta[name="description"]').attr("content")).toBe("Smoke test page for url-metadata");
    expect($("h1").text()).toBe("Hello");
  });

  it("installed undici satisfies the >=8.9.0 override (patches CVEs in 8.5.0) and request() works", async () => {
    // Read the resolved version from undici's own package.json (the top-level
    // `undici` export doesn't expose a runtime version field on 8.10.0).
    // Assert unconditionally: a missing/malformed field, or a version
    // below >=8.9.0, must fail. This is the guard against a silent
    // downgrade of the override back to a vulnerable 8.5.x.
    const version = undiciPkg.version;
    expect(typeof version).toBe("string");
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) throw new Error(`unparseable undici version: ${version}`);
    const major = Number.parseInt(match[1] ?? "", 10);
    const minor = Number.parseInt(match[2] ?? "", 10);
    // Override is `undici >=8.9.0` (open-ended) — anything at or above 8.9.0 clears the CVEs.
    const satisfies = major > 8 || (major === 8 && minor >= 9);
    expect(satisfies, `undici must be >=8.9.0, got ${version}`).toBe(true);

    const { statusCode, body } = await undiciRequest(baseUrl);
    expect(statusCode).toBe(200);
    const text = await body.text();
    expect(text).toContain("<title>Smoke Test Page</title>");
  });
});
