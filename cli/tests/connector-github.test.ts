import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/api/client.js";
import { readGitHubRepository } from "../src/connector/github.js";
import {
  canonicalGitHubRepo,
  MAX_README_BYTES,
  validateGitHubRepository,
} from "../src/connector/github-core.js";
import { processOne } from "../src/connector/runtime.js";

const execFileMock = vi.hoisted(() =>
  vi.fn(
    (
      _file: string,
      _args: string[],
      _options: object,
      callback: (error: Error | null, stdout: string) => void,
    ) => callback(new Error("not installed"), ""),
  ),
);
vi.mock("node:child_process", () => ({
  execFile: execFileMock,
  spawn: vi.fn(),
}));
const source = "octocat/Hello-World";
const readme = `# Complete README\n${"内容\n".repeat(3000)}END OF README`;
const metadata = {
  full_name: source,
  description: "A saved repository",
  stargazers_count: 1234,
  forks_count: 56,
  language: "TypeScript",
  default_branch: "feature/docs",
  pushed_at: "2026-09-12T00:00:00Z",
  archived: false,
  license: { spdx_id: "MIT" },
  topics: ["notes"],
};
const file = {
  path: ".github/README.md",
  size: Buffer.byteLength(readme),
  encoding: "base64",
  content: Buffer.from(readme).toString("base64"),
};
const snapshot = {
  sourceFullName: source,
  fullName: source,
  description: metadata.description,
  stars: 1234,
  commits: 999,
  forks: 56,
  language: "TypeScript",
  defaultBranch: "feature/docs",
  pushedAt: metadata.pushed_at,
  archived: false,
  license: "MIT",
  topics: ["notes"],
  readme,
  readmePath: file.path,
};
const githubJob = {
  source: "github" as const,
  fullName: source,
  linkId: 12,
  userId: "owner",
  sourceUrl: `https://github.com/${source}`,
  leaseToken: "synthetic-lease",
  leaseUntil: Date.now() + 180000,
  attempts: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GH_TOKEN", "synthetic-github-credential");
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/commits"))
        return Response.json([{ sha: "head" }], {
          headers: {
            link: `<https://api.github.com/repos/${source}/commits?per_page=1&page=999>; rel="last"`,
          },
        });
      if (url.pathname.endsWith("/readme")) return Response.json(file);
      return Response.json(metadata);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("repository URL and snapshot validation", () => {
  it.each([
    `https://github.com/${source}`,
    `https://www.github.com/${source}.git?tab=readme`,
    `http://github.com/${source}/tree/main`,
  ])("identifies repository URL %s", (url) => {
    expect(canonicalGitHubRepo(url)).toEqual({
      fullName: source,
      url: `https://github.com/${source}`,
    });
  });
  it.each([
    "bad",
    "https://github.com",
    "https://github.com/octocat",
    "https://github.com/topics/typescript",
    "https://github.com/orgs/test",
    "https://github.com.evil.test/a/b",
    "https://token@github.com/a/b",
    "https://github.com:8443/a/b",
    "ftp://github.com/a/b",
    "https://github.com//repo",
    "https://github.com/a/b%2Fc",
  ])("rejects non-repository URL %s", (url) => {
    expect(canonicalGitHubRepo(url)).toBeNull();
  });
  it.each([null, [], "string"])("rejects non-object snapshots: %j", (raw) => {
    expect(() => validateGitHubRepository(raw, source)).toThrow("invalid_github_capture");
  });

  it.each([
    { stars: -1 },
    { commits: 1.5 },
    { commits: undefined },
    { fullName: "topics/hello" },
    { sourceFullName: "another/repo" },
    { readme: "文".repeat(MAX_README_BYTES) },
    { readmePath: "../README.md" },
    { defaultBranch: "" },
    { pushedAt: "invalid" },
    { archived: "false" },
    { topics: [12] },
  ])("rejects invalid snapshot %s", (change) => {
    expect(() => validateGitHubRepository({ ...snapshot, ...change }, source)).toThrow(
      "invalid_github_capture",
    );
  });
  it("preserves the README exactly and accepts renamed repositories tied to the original source", () => {
    expect(validateGitHubRepository(snapshot, source)).toEqual(snapshot);
    expect(
      validateGitHubRepository({ ...snapshot, fullName: "new-owner/new-name" }, source)
        .sourceFullName,
    ).toBe(source);
  });
});

describe("GitHub REST collection", () => {
  it("collects full README bytes, stars and exact default-branch commit count", async () => {
    expect(await readGitHubRepository(source)).toEqual(snapshot);
    const calls = vi.mocked(fetch).mock.calls;
    expect(String(calls[1][0])).toContain("sha=feature%2Fdocs");
    expect(String(calls[2][0])).toContain("ref=feature%2Fdocs");
    expect(calls.every(([url]) => new URL(String(url)).origin === "https://api.github.com")).toBe(
      true,
    );
    expect(new Headers(calls[0][1]?.headers).get("authorization")).toBe(
      "Bearer synthetic-github-credential",
    );
  });
  it("handles empty repositories and an absent README without invented counts", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(new Response("empty", { status: 409 }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    expect(await readGitHubRepository(source)).toMatchObject({
      commits: 0,
      readme: null,
      readmePath: null,
    });
  });
  it("handles one commit without a pagination header", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(Response.json([{ sha: "one" }]));
    expect((await readGitHubRepository(source)).commits).toBe(1);
  });
  it.each([401, 403, 429, 500, 404])(
    "sanitizes upstream HTTP %s instead of exposing response bodies",
    async (status) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("private upstream credential", { status }),
      );
      await expect(readGitHubRepository(source)).rejects.toMatchObject({
        code:
          status === 401
            ? "github_needs_login"
            : [403, 429].includes(status)
              ? "github_rate_limited"
              : status === 404
                ? "github_repository_unavailable"
                : "github_unavailable",
      });
    },
  );
  it("rejects foreign redirects before sending any credential to their target", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://evil.test/collect" } }),
    );
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_unsafe_redirect",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("follows same-API repository renames while preserving the saved source", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "/repositories/123" } }),
      )
      .mockResolvedValueOnce(Response.json({ ...metadata, full_name: "renamed/name" }));
    expect(await readGitHubRepository(source)).toMatchObject({
      sourceFullName: source,
      fullName: "renamed/name",
    });
  });
  it.each([{ size: MAX_README_BYTES + 1 }, { size: 1 }, { encoding: "none" }])(
    "fails oversized or incomplete README %s without truncating it",
    async (change) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(Response.json(metadata))
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(Response.json({ ...file, ...change }));
      await expect(readGitHubRepository(source)).rejects.toHaveProperty("code");
    },
  );
  it("fails when pagination cannot produce an exact commit count", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(
        Response.json([{}], {
          headers: { link: '<https://api.github.com/next?page=2>; rel="next"' },
        }),
      );
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_response_invalid",
    });
  });
  it("rejects commit responses that are not arrays", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(Response.json({ head: true }));
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_response_invalid",
    });
  });

  it("rejects malformed last-page pagination metadata", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(
        Response.json([{ sha: "a" }], {
          headers: { link: '<https://api.github.com/commits?page=bad>; rel="last"' },
        }),
      );
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_response_invalid",
    });
  });

  it("rejects oversized metadata bodies before JSON parsing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("x".repeat(1_500_001), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_content_too_large",
    });
  });

  it("accepts GITHUB_TOKEN when GH_TOKEN is unset", async () => {
    vi.stubEnv("GH_TOKEN", "");
    vi.stubEnv("GITHUB_TOKEN", "github-only-token");
    await readGitHubRepository(source);
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get("authorization")).toBe(
      "Bearer github-only-token",
    );
  });

  it("rejects commit histories that return a bare 404", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(new Response("missing branch", { status: 404 }));
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_response_invalid",
    });
  });

  it("rejects README conflicts that are not a clean missing file", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response("empty repository", { status: 409 }));
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_response_invalid",
    });
  });

  it("rejects redirects that omit a location header", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 302, headers: {} }));
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_unsafe_redirect",
    });
  });

  it("rejects redirect chains that never settle on the GitHub API", async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(null, {
          status: 301,
          headers: { location: "/repos/next-hop" },
        }),
    );
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_unsafe_redirect",
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("rejects metadata missing a default branch", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({ ...metadata, full_name: source, default_branch: null }),
      )
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    await expect(readGitHubRepository(source)).rejects.toMatchObject({
      code: "github_response_invalid",
    });
  });

  it("uses a local gh credential in memory or reads public repositories without one", async () => {
    vi.stubEnv("GH_TOKEN", "");
    await readGitHubRepository(source);
    expect(execFileMock).toHaveBeenCalled();
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).has("authorization")).toBe(
      false,
    );
  });

  it("never contacts GitHub for invalid repository names or a cancelled job", async () => {
    await expect(readGitHubRepository("../escape")).rejects.toMatchObject({
      code: "invalid_github_repository",
    });
    await expect(readGitHubRepository(source, AbortSignal.abort())).rejects.toHaveProperty(
      "name",
      "AbortError",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("passes snapshots through the Connector without invoking the X media or Eagle pipeline", async () => {
    const upstream = vi.mocked(fetch).getMockImplementation();
    if (!upstream) throw new Error("Missing GitHub fixture handler");
    const zheRequests: RequestInit[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (new URL(String(url)).hostname === "zhe.to") {
        zheRequests.push(init ?? {});
        return Response.json(
          String(url).endsWith("/connector") ? { job: githubJob } : { ok: true },
        );
      }
      return upstream(url, init);
    });
    const eagle = { submit: vi.fn() };
    expect(
      await processOne(new ApiClient("synthetic-zhe-credential"), undefined, undefined, eagle),
    ).toEqual({ status: "complete", media: 0 });
    expect(eagle.submit).not.toHaveBeenCalled();
    expect(new Headers(zheRequests[0].headers).get("x-connector-sources")).toBe(
      "github,x,screenshot",
    );
    expect(JSON.parse(zheRequests[1].body as string)).toEqual({
      action: "complete",
      repository: snapshot,
    });
    expect(JSON.stringify(zheRequests)).not.toContain("synthetic-github-credential");
  });
});
