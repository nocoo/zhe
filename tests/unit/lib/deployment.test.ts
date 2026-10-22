import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { verifyDeployment } from "../../../scripts/verify-deployment.mjs";

const sourceSha = "a".repeat(40);
const imageManifest = JSON.stringify([
  {
    service: "web",
    image: "ghcr.io/nocoo/zhe",
    digest: `sha256:${"b".repeat(64)}`,
    sourceSha,
  },
]);
const expectedVersion = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
).version;
const releaseWorkflow = readFileSync(
  new URL("../../../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

describe("Docker deployment contract", () => {
  it("uses verified main CI and the pinned shared CD without build secrets", () => {
    const workflow = parse(releaseWorkflow);
    expect(workflow.on.workflow_run).toEqual({
      workflows: ["CI"],
      types: ["completed"],
      branches: ["main"],
    });
    expect(workflow.jobs.deploy.uses).toBe(
      "nocoo/base-ci/.github/workflows/deploy-docker.yml@ac635753a869cb85fad1f52aae4ccbd6119f3cae",
    );
    expect(JSON.parse(workflow.jobs.deploy.with.images)).toEqual([
      { image: "ghcr.io/nocoo/zhe", service: "web" },
    ]);
    expect(workflow.jobs.deploy.with["deploy-directory"]).toBe("/opt/zhe");
    expect(workflow.jobs.deploy.secrets).not.toHaveProperty("BUILD_ARGS");
    expect(workflow.jobs.deploy.with["remote-verify-command"]).toContain(
      "'http://127.0.0.1:17006'",
    );
    expect(workflow.jobs.deploy.with["remote-verify-command"]).toContain(
      "org.opencontainers.image.revision",
    );
    expect(workflow.jobs.deploy.with["remote-verify-command"]).toContain(
      "request('/api/v1/links', 'POST', b'{}')[0] != 401",
    );
    expect(workflow.jobs.deploy.with["remote-verify-command"]).toContain(
      "server-reference-manifest.json",
    );
    expect(workflow.jobs.deploy.with["remote-verify-command"]).toContain(
      "action.get('exportedName') == 'getLinks'",
    );
    expect(workflow.jobs.deploy.with["remote-verify-command"]).toContain("status != 307");
    expect(workflow.jobs.deploy.with["remote-verify-command"]).toContain(
      "'/?callbackUrl=%2Fdashboard'",
    );
    expect(workflow.jobs.deploy.with["remote-verify-command"]).toContain(
      "Private Next JS/CSS asset check failed",
    );
  });

  it("keeps staging private and preserves runtime variables", () => {
    const compose = parse(
      readFileSync(new URL("../../../deploy/compose.yaml", import.meta.url), "utf8"),
    );
    expect(compose.services.web.ports).toEqual(["127.0.0.1:17006:7005"]);
    expect(compose.services.web.env_file).toEqual([
      { path: ".env.runtime", required: true, format: "raw" },
    ]);
    expect(compose.services.web).not.toHaveProperty("environment");
    expect(compose.services.web.mem_limit).toBe(4_000_000_000);
    expect(compose.services.web.image).toMatch(/\$\{IMAGE_SHA:\?IMAGE_SHA is required\}/);
    expect(compose.networks.edge.external).toBe(true);
  });

  it("publishes releases without restarting the old Railway origin", () => {
    const script = readFileSync(new URL("../../../scripts/release.ts", import.meta.url), "utf8");
    expect(script).not.toMatch(/railway|skip-redeploy/i);
    expect(script).toContain("Deployment is asynchronous: verify CI and Release for");
    expect(script).toContain("a published tag is not deployment proof");
  });
});

function options(overrides: Record<string, unknown> = {}) {
  return {
    phase: "precutover",
    sourceSha,
    imageManifest,
    ...overrides,
  } as Parameters<typeof verifyDeployment>[0];
}

describe("deployment verification", () => {
  it("precutover verifies only the release manifest and never calls the public origin", async () => {
    const fetchImpl = vi.fn();
    await expect(
      verifyDeployment(
        options({
          target: "https://zhe.to",
          fetchImpl,
        }),
      ),
    ).resolves.toContain(`${sourceSha}; public origin was not contacted`);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed for missing phase, source proof, or image digest", async () => {
    await expect(verifyDeployment(options({ phase: undefined }))).rejects.toThrow("DEPLOY_PHASE");
    await expect(verifyDeployment(options({ sourceSha: "main" }))).rejects.toThrow(
      "full commit SHA",
    );
    await expect(verifyDeployment(options({ imageManifest: "{}" }))).rejects.toThrow("exactly one");
    await expect(
      verifyDeployment(
        options({
          imageManifest: JSON.stringify([
            {
              service: "web",
              image: "ghcr.io/nocoo/zhe",
              digest: "latest",
              sourceSha,
            },
          ]),
        }),
      ),
    ).rejects.toThrow("release manifest");
    await expect(
      verifyDeployment(
        options({
          imageManifest: JSON.stringify([
            {
              service: "web",
              image: "ghcr.io/nocoo/zhe",
              digest: `sha256:${"b".repeat(64)}`,
              sourceSha: "c".repeat(40),
            },
          ]),
        }),
      ),
    ).rejects.toThrow("release manifest");
  });

  it("requires the explicit jp2 marker and a configured HTTPS origin in production", async () => {
    const fetchImpl = vi.fn();
    await expect(
      verifyDeployment(
        options({
          phase: "production",
          target: "https://example.com",
          fetchImpl,
        }),
      ),
    ).rejects.toThrow("DEPLOY_ORIGIN_MARKER=jp2");
    await expect(
      verifyDeployment(
        options({
          phase: "production",
          originMarker: "jp2",
          fetchImpl,
        }),
      ),
    ).rejects.toThrow("DEPLOY_URL is required");
    await expect(
      verifyDeployment(
        options({
          phase: "production",
          target: "http://localhost",
          originMarker: "jp2",
          fetchImpl,
        }),
      ),
    ).rejects.toThrow("canonical https://zhe.to");
    await expect(
      verifyDeployment(
        options({
          phase: "production",
          target: "https://zhe.to/old",
          originMarker: "jp2",
          fetchImpl,
        }),
      ),
    ).rejects.toThrow("without a path");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("pins private checks to the intended host, HTTPS forwarding, image version, no redirects and no-store", () => {
    expect(releaseWorkflow).toContain("class NoRedirect(urllib.request.HTTPRedirectHandler):");
    expect(releaseWorkflow).toContain("opener = urllib.request.build_opener(NoRedirect())");
    expect(releaseWorkflow).toContain("'Host': 'zhe.to'");
    expect(releaseWorkflow).toContain("'X-Forwarded-Proto': 'https'");
    expect(releaseWorkflow).toContain("headers.get('Cache-Control') == 'no-store'");
    expect(releaseWorkflow).toContain("live.get('version') != version");
    expect(releaseWorkflow).toContain(
      "JSON.parse(require('fs').readFileSync('/app/package.json')).version",
    );
  });

  it("rejects redirects rather than accepting an old or unexpected production origin", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("redirect mode is error"));
    await expect(
      verifyDeployment(
        options({
          phase: "production",
          target: "https://zhe.to",
          originMarker: "jp2",
          fetchImpl,
          sleep: vi.fn(),
        }),
      ),
    ).rejects.toThrow("request to /api/live failed");
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://zhe.to/api/live"),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("requires jp2 response identity, exact package version and live database health", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          component: "zhe",
          version: expectedVersion,
          database: { connected: true },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-zhe-origin": "jp2",
            "Cache-Control": "no-store",
          },
        },
      ),
    );
    await expect(
      verifyDeployment(
        options({
          phase: "production",
          target: "https://zhe.to",
          originMarker: "jp2",
          fetchImpl,
        }),
      ),
    ).resolves.toContain(`Zhe ${expectedVersion}`);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://zhe.to/api/live"),
      expect.objectContaining({ redirect: "error" }),
    );

    const validBody = {
      status: "ok",
      component: "zhe",
      version: expectedVersion,
      database: { connected: true },
    };
    const validHeaders = { "x-zhe-origin": "jp2", "Cache-Control": "no-store" };
    for (const variant of [
      {
        body: { ...validBody, version: `${expectedVersion}-wrong` },
        headers: validHeaders,
        status: 200,
      },
      {
        body: { ...validBody, database: { connected: false } },
        headers: validHeaders,
        status: 200,
      },
      { body: { ...validBody, component: "other" }, headers: validHeaders, status: 200 },
      { body: { ...validBody, status: "error" }, headers: validHeaders, status: 200 },
      { body: validBody, headers: { ...validHeaders, "x-zhe-origin": "railway" }, status: 200 },
      {
        body: validBody,
        headers: { ...validHeaders, "Cache-Control": "public, max-age=0" },
        status: 200,
      },
      { body: validBody, headers: validHeaders, status: 503 },
    ]) {
      const wrongIdentity = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(variant.body), {
            status: variant.status,
            headers: variant.headers,
          }),
        ),
      );
      await expect(
        verifyDeployment(
          options({
            phase: "production",
            target: "https://zhe.to",
            originMarker: "jp2",
            fetchImpl: wrongIdentity,
            sleep: vi.fn(),
          }),
        ),
      ).rejects.toThrow("did not prove jp2 origin");
      expect(wrongIdentity).toHaveBeenCalledTimes(5);
    }
  });
});
