import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const preCommit = readFileSync(join(repoRoot, ".husky", "pre-commit"), "utf8");
const ensureTools = readFileSync(join(repoRoot, "scripts", "ensure-tools.sh"), "utf8");
const fixtures: string[] = [];

afterEach(() => {
  for (const directory of fixtures.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function git(repo: string, args: string[], env: NodeJS.ProcessEnv): string {
  return execFileSync("git", args, { cwd: repo, env, encoding: "utf8" });
}

function snapshots(tmp: string): string[] {
  return readdirSync(tmp).filter((name) => name.startsWith("zhe-precommit-"));
}

async function waitUntil(check: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// The fixture wires the real hook into a disposable repository and replaces
// the heavyweight runners with node one-liners: the unit stage fails when the
// checked-out copy of main.txt still holds the staged-bad marker, which proves
// the stage ran against the index snapshot, not the working tree.
function createFixture(options: { unit?: string } = {}): {
  repo: string;
  env: NodeJS.ProcessEnv;
  tmp: string;
} {
  const root = mkdtempSync(join(tmpdir(), "zhe-precommit-test-"));
  fixtures.push(root);
  const home = join(root, "home");
  const tmp = join(root, "tmp");
  const repo = join(root, "repo");
  mkdirSync(home);
  mkdirSync(tmp);
  mkdirSync(repo);
  writeFileSync(
    join(home, ".gitconfig"),
    "[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n",
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    TMPDIR: tmp,
    GIT_CONFIG_NOSYSTEM: "1",
  };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX", "HUSKY"]) {
    delete env[key];
  }
  git(repo, ["init", "-b", "main"], env);
  mkdirSync(join(repo, ".git", "scripts"), { recursive: true });
  writeFileSync(join(repo, ".git", "scripts", "ensure-tools.sh"), ensureTools);
  writeFileSync(join(repo, ".git", "hooks", "pre-commit"), preCommit);
  chmodSync(join(repo, ".git", "hooks", "pre-commit"), 0o755);
  const unit =
    options.unit ??
    "node -e \"if (require('fs').readFileSync('main.txt', 'utf8').includes('staged-bad')) { console.error('snapshot content is bad'); process.exit(1); }\"";
  writeFileSync(
    join(repo, "package.json"),
    `${JSON.stringify(
      {
        scripts: {
          "test:unit:coverage": unit,
          "test:integration": 'node -e "process.exit(0)"',
          lint: 'node -e "process.exit(0)"',
        },
      },
      null,
      "\t",
    )}\n`,
  );
  writeFileSync(join(repo, "bun.lock"), "dummy-lock\n");
  writeFileSync(join(repo, "main.txt"), "healthy\n");
  mkdirSync(join(repo, "node_modules", ".bin"), { recursive: true });
  // next/tsc/vitest/biome stand in for the heavyweight runners; gitleaks is
  // stubbed because CI's L1 job installs JS dependencies only. The production
  // hook keeps the real binary; the final isolated audit exercises it.
  for (const command of ["next", "tsc", "vitest", "biome", "gitleaks"]) {
    writeFileSync(join(repo, "node_modules", ".bin", command), "#!/bin/sh\nexit 0\n");
    chmodSync(join(repo, "node_modules", ".bin", command), 0o755);
  }
  env.PATH = `${join(repo, "node_modules", ".bin")}:${process.env.PATH ?? ""}`;
  git(repo, ["add", "package.json", "bun.lock", "main.txt"], env);
  git(repo, ["commit", "-m", "seed"], env);
  return { repo, env, tmp };
}

describe("pre-commit index snapshot", () => {
  it("rejects staged-bad content when the worktree copy is fixed", () => {
    const { repo, env, tmp } = createFixture();
    const seed = git(repo, ["rev-parse", "HEAD"], env).trim();
    writeFileSync(join(repo, "scratch.txt"), "untracked\n");
    writeFileSync(join(repo, "main.txt"), "staged-bad\n");
    git(repo, ["add", "main.txt"], env);
    writeFileSync(join(repo, "main.txt"), "healthy\n");
    const result = spawnSync("git", ["commit", "-m", "should-reject"], {
      cwd: repo,
      env,
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("unit_cov");
    expect(result.stdout + result.stderr).toContain("snapshot content is bad");
    expect(git(repo, ["rev-parse", "HEAD"], env).trim()).toBe(seed);
    expect(git(repo, ["show", ":main.txt"], env)).toContain("staged-bad");
    expect(readFileSync(join(repo, "main.txt"), "utf8")).toBe("healthy\n");
    expect(readFileSync(join(repo, "scratch.txt"), "utf8")).toBe("untracked\n");
    expect(snapshots(tmp)).toEqual([]);
  }, 30000);

  it("commits a healthy index when the worktree copy is broken", () => {
    const { repo, env } = createFixture();
    writeFileSync(join(repo, "main.txt"), "healthy-2\n");
    git(repo, ["add", "main.txt"], env);
    writeFileSync(join(repo, "main.txt"), "worktree-bad\n");
    const result = spawnSync("git", ["commit", "-m", "should-accept"], {
      cwd: repo,
      env,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(git(repo, ["show", "HEAD:main.txt"], env)).toBe("healthy-2\n");
    expect(readFileSync(join(repo, "main.txt"), "utf8")).toBe("worktree-bad\n");
  }, 30000);

  it("rejects a staged manifest that diverges from the installed worktree copy", () => {
    const { repo, env } = createFixture();
    const seed = git(repo, ["rev-parse", "HEAD"], env).trim();
    const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
    manifest.scripts["test:unit:coverage"] = 'node -e "process.exit(0)"';
    writeFileSync(join(repo, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
    git(repo, ["add", "package.json"], env);
    writeFileSync(
      join(repo, "package.json"),
      `${JSON.stringify({ ...manifest, version: "worktree-copy" }, null, "\t")}\n`,
    );
    const result = spawnSync("git", ["commit", "-m", "should-reject"], {
      cwd: repo,
      env,
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("package.json");
    expect(git(repo, ["rev-parse", "HEAD"], env).trim()).toBe(seed);
  }, 30000);

  it.each([
    ["SIGTERM", 143],
    ["SIGINT", 130],
    ["SIGHUP", 129],
  ] as const)(
    "cleans the stage tree on %s and exits with %i",
    async (signal, code) => {
      const { repo, env, tmp } = createFixture();
      const marker = join(repo, "..", "child-start");
      const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
      manifest.scripts["test:unit:coverage"] =
        "node -e \"require('fs').writeFileSync(process.env.ZHE_PRECOMMIT_TEST_MARKER, String(process.pid)); setTimeout(() => {}, 30000)\"";
      writeFileSync(join(repo, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
      git(repo, ["add", "package.json"], env);
      const child = spawn("sh", [join(repo, ".git", "hooks", "pre-commit")], {
        cwd: repo,
        env: { ...env, ZHE_PRECOMMIT_TEST_MARKER: marker },
        stdio: "ignore",
      });
      await waitUntil(() => existsSync(marker), 5000);
      const stagePid = Number.parseInt(readFileSync(marker, "utf8"), 10);
      const exited = new Promise<number | null>((resolve) => {
        child.once("exit", (exitCode) => resolve(exitCode));
      });
      child.kill(signal);
      const status = await exited;
      expect(status, signal).toBe(code);
      let alive = true;
      try {
        await waitUntil(() => {
          try {
            process.kill(stagePid, 0);
            return false;
          } catch {
            return true;
          }
        }, 5000);
        alive = false;
      } catch {
        alive = true;
      }
      expect(alive, signal).toBe(false);
      expect(snapshots(tmp), signal).toEqual([]);
    },
    30000,
  );
});
