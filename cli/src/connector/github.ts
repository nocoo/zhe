import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ConnectorError, record } from "./core.js";
import {
  canonicalGitHubRepo,
  type GitHubRepository,
  MAX_README_BYTES,
  validateGitHubRepository,
} from "./github-core.js";

const execute = promisify(execFile);
const API = "https://api.github.com";

async function localToken(signal: AbortSignal): Promise<string | undefined> {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN)
    return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try {
    const { stdout } = await execute("gh", ["auth", "token", "--hostname", "github.com"], {
      signal,
      timeout: 5_000,
      maxBuffer: 16_384,
    });
    return stdout.trim() || undefined;
  } catch {
    signal.throwIfAborted();
    return undefined; // Public repositories also work without a GitHub login.
  }
}

async function limitedText(response: Response, limit: number): Promise<string> {
  if (!response.body) throw new ConnectorError("github_response_invalid");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new ConnectorError("github_content_too_large");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

const json = async (response: Response) =>
  JSON.parse(await limitedText(response, 1_500_000)) as unknown;

async function commitCount(response: Response): Promise<number> {
  let commits = 0;
  if (response.status === 409) {
    await response.body?.cancel(); // An empty repository has no commit history.
  } else {
    if (!response.ok) {
      await response.body?.cancel();
      throw new ConnectorError("github_response_invalid");
    }
    const first = await json(response);
    if (!Array.isArray(first)) throw new ConnectorError("github_response_invalid");
    commits = first.length;
    const last = response.headers
      .get("link")
      ?.split(",")
      .find((part) => /rel="last"/.test(part));
    if (last) {
      const url = /<([^>]+)>/.exec(last)?.[1];
      const count = url ? Number(new URL(url).searchParams.get("page")) : NaN;
      if (!Number.isSafeInteger(count) || count < 1)
        throw new ConnectorError("github_response_invalid");
      commits = count;
    } else if (response.headers.get("link")?.includes('rel="next"')) {
      throw new ConnectorError("github_response_invalid"); // Never publish an incomplete count.
    }
  }
  return commits;
}

export async function readGitHubRepository(
  fullName: string,
  parent?: AbortSignal,
): Promise<GitHubRepository> {
  const target = canonicalGitHubRepo(`https://github.com/${fullName}`);
  if (!target || target.fullName !== fullName)
    throw new ConnectorError("invalid_github_repository");
  const timeout = AbortSignal.timeout(90_000);
  const signal = parent ? AbortSignal.any([parent, timeout]) : timeout;
  signal.throwIfAborted();
  const token = await localToken(signal);
  const request = async (
    path: string,
    accept = "application/vnd.github+json",
  ): Promise<Response> => {
    let url = new URL(path, API);
    for (let redirects = 0; redirects < 4; redirects++) {
      // Auth stays on GitHub's API, including repository-rename redirects.
      if (url.origin !== API || url.username || url.password)
        throw new ConnectorError("github_unsafe_redirect");
      const response = await fetch(url, {
        signal,
        redirect: "manual",
        headers: {
          Accept: accept,
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": "Zhe-Connector",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if ([301, 302, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) throw new ConnectorError("github_unsafe_redirect");
        url = new URL(location, url);
        continue;
      }
      if ([401, 403, 429].includes(response.status)) {
        await response.body?.cancel();
        throw new ConnectorError(
          response.status === 401 ? "github_needs_login" : "github_rate_limited",
        );
      }
      if (!response.ok && ![404, 409].includes(response.status)) {
        await response.body?.cancel();
        throw new ConnectorError("github_unavailable");
      }
      return response;
    }
    throw new ConnectorError("github_unsafe_redirect");
  };
  const repositoryResponse = await request(`/repos/${fullName}`);
  if (!repositoryResponse.ok) {
    await repositoryResponse.body?.cancel();
    throw new ConnectorError("github_repository_unavailable");
  }
  const repository = record(await json(repositoryResponse));
  const resolved =
    typeof repository.full_name === "string"
      ? canonicalGitHubRepo(`https://github.com/${repository.full_name}`)
      : null;
  if (!resolved || typeof repository.default_branch !== "string")
    throw new ConnectorError("github_response_invalid");
  const branch = encodeURIComponent(repository.default_branch);
  const base = `/repos/${resolved.fullName}`;
  const commitsResponse = await request(`${base}/commits?per_page=1&sha=${branch}`);
  const commits = await commitCount(commitsResponse);
  let readme: string | null = null;
  let readmePath: string | null = null;
  const readmeResponse = await request(`${base}/readme?ref=${branch}`);
  if (readmeResponse.status === 404) await readmeResponse.body?.cancel();
  else {
    if (!readmeResponse.ok) {
      await readmeResponse.body?.cancel();
      throw new ConnectorError("github_response_invalid");
    }
    const file = record(await json(readmeResponse));
    if (typeof file.size !== "number" || file.size > MAX_README_BYTES)
      throw new ConnectorError("github_content_too_large");
    if (
      typeof file.path !== "string" ||
      file.encoding !== "base64" ||
      typeof file.content !== "string"
    )
      throw new ConnectorError("github_response_invalid");
    const decoded = Buffer.from(file.content, "base64");
    if (decoded.length !== file.size) throw new ConnectorError("github_response_invalid");
    readme = decoded.toString("utf8");
    readmePath = file.path;
  }
  return validateGitHubRepository(
    {
      sourceFullName: fullName,
      fullName: resolved.fullName,
      description: repository.description,
      stars: repository.stargazers_count,
      commits,
      forks: repository.forks_count,
      language: repository.language,
      defaultBranch: repository.default_branch,
      pushedAt: repository.pushed_at,
      archived: repository.archived,
      license: record(repository.license).spdx_id ?? null,
      topics: repository.topics ?? [],
      readme,
      readmePath,
    },
    fullName,
  );
}
