export const MAX_README_BYTES = 1_000_000;
export const MAX_GITHUB_CAPTURE_BYTES = 1_800_000;

const RESERVED_OWNERS = new Set([
  "about",
  "account",
  "apps",
  "codespaces",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "join",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "sessions",
  "settings",
  "signup",
  "site",
  "sponsors",
  "topics",
  "trending",
  "users",
]);

/** Repository subpages share the repository's default-branch snapshot. */
export function canonicalGitHubRepo(raw: string): { fullName: string; url: string } | null {
  try {
    const url = new URL(raw);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !["github.com", "www.github.com"].includes(url.hostname)
    )
      return null;
    const [owner, rawName] = url.pathname.slice(1).split("/");
    const name = rawName?.replace(/\.git$/i, "");
    if (
      !owner ||
      !name ||
      RESERVED_OWNERS.has(owner.toLowerCase()) ||
      !/^[a-z\d][a-z\d-]{0,38}$/i.test(owner) ||
      !/^[a-z\d_.-]{1,100}$/i.test(name) ||
      name === "." ||
      name === ".."
    )
      return null;
    const fullName = `${owner}/${name}`;
    return { fullName, url: `https://github.com/${fullName}` };
  } catch {
    return null;
  }
}

export interface GitHubRepository {
  sourceFullName: string;
  fullName: string;
  description: string | null;
  stars: number;
  commits: number;
  forks: number;
  language: string | null;
  defaultBranch: string;
  pushedAt: string | null;
  archived: boolean;
  license: string | null;
  topics: string[];
  readme: string | null;
  readmePath: string | null;
}

export type GitHubRepositorySummary = Omit<GitHubRepository, "readme">;

/** Validate the complete snapshot on both sides of the Connector trust boundary. */
export function validateGitHubRepository(raw: unknown, expected: string): GitHubRepository {
  const invalid = () => {
    throw new TypeError("invalid_github_capture");
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid();
  const value = raw as Record<string, unknown>;
  const string = (key: string, max: number, nullable = false): string | null => {
    const item = value[key];
    if (nullable && item === null) return null;
    if (typeof item !== "string" || item.length > max) return invalid();
    return item;
  };
  const count = (key: string): number => {
    const item = value[key];
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0) return invalid();
    return item;
  };
  const sourceFullName = string("sourceFullName", 140);
  const fullName = string("fullName", 140);
  if (
    sourceFullName?.toLowerCase() !== expected.toLowerCase() ||
    !fullName ||
    canonicalGitHubRepo(`https://github.com/${fullName}`)?.fullName !== fullName
  )
    return invalid();
  const readme = string("readme", MAX_README_BYTES, true);
  if (readme !== null && new TextEncoder().encode(readme).length > MAX_README_BYTES)
    return invalid();
  const readmePath = string("readmePath", 1024, true);
  if (
    readme !== null &&
    (!readmePath ||
      readmePath.includes("\\") ||
      [...readmePath].some((character) => character.charCodeAt(0) < 32) ||
      readmePath.split("/").some((part) => part === ".." || !part))
  )
    return invalid();
  const defaultBranch = string("defaultBranch", 255);
  const pushedAt = string("pushedAt", 40, true);
  if (!defaultBranch || (pushedAt !== null && !Number.isFinite(Date.parse(pushedAt))))
    return invalid();
  if (
    typeof value.archived !== "boolean" ||
    !Array.isArray(value.topics) ||
    value.topics.length > 50 ||
    value.topics.some((topic) => typeof topic !== "string" || topic.length > 100)
  )
    return invalid();
  return {
    sourceFullName: expected,
    fullName,
    description: string("description", 20_000, true),
    stars: count("stars"),
    commits: count("commits"),
    forks: count("forks"),
    language: string("language", 100, true),
    defaultBranch,
    pushedAt,
    archived: value.archived,
    license: string("license", 200, true),
    topics: value.topics as string[],
    readme,
    readmePath,
  };
}
