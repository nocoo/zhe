// @vitest-environment node
import { createServer, get as httpGet, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import { request as undiciRequest } from "undici";
import urlMetadata from "url-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const undiciPkg = require("undici/package.json") as { version: string };
const metadataRequire = createRequire(require.resolve("url-metadata"));
const filteringAgentPath = metadataRequire.resolve("request-filtering-agent");
const { RequestFilteringHttpAgent } = await import(pathToFileURL(filteringAgentPath).href);

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
  let requestCount = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      requestCount += 1;
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

  it("rejects private IP connections asynchronously without a synchronous throw", async () => {
    const requestsBefore = requestCount;
    const agent = new RequestFilteringHttpAgent();
    const request = httpGet(baseUrl, { agent });

    await expect(
      new Promise<never>((_resolve, reject) => request.once("error", reject)),
    ).rejects.toThrow(/private IP address/i);
    expect(requestCount).toBe(requestsBefore);
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

  it("uses a patched undici release and requests the local fixture", async () => {
    expect(undiciPkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    const [major = 0, minor = 0, patch = 0] = undiciPkg.version.split(".").map(Number);
    const patched = major > 8 || (major === 8 && (minor > 11 || (minor === 11 && patch >= 2)));
    expect(patched, `undici must be >=8.11.2, got ${undiciPkg.version}`).toBe(true);

    const { statusCode, body } = await undiciRequest(baseUrl);
    expect(statusCode).toBe(200);
    const text = await body.text();
    expect(text).toContain("<title>Smoke Test Page</title>");
  });
});
