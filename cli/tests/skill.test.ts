import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPackagedSkill,
  resolvePackagedSkillPath,
  shouldPrintPackagedSkill,
} from "../src/skill.js";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("shouldPrintPackagedSkill", () => {
  const nodeArgv = (args: string[]) => ["node", join(cliRoot, "dist/index.js"), ...args];

  it("returns true for zhe --skill", () => {
    expect(shouldPrintPackagedSkill(nodeArgv(["--skill"]))).toBe(true);
  });

  it("returns true when --skill precedes a subcommand", () => {
    expect(shouldPrintPackagedSkill(nodeArgv(["--skill", "list", "unused"]))).toBe(true);
  });

  it("returns true for --skill --help before runMain", () => {
    expect(shouldPrintPackagedSkill(nodeArgv(["--skill", "--help"]))).toBe(true);
  });

  it("returns false when a subcommand appears first", () => {
    expect(shouldPrintPackagedSkill(nodeArgv(["list", "--skill"]))).toBe(false);
  });

  it("returns false after --", () => {
    expect(shouldPrintPackagedSkill(nodeArgv(["--", "--skill"]))).toBe(false);
  });

  it("returns false after an unknown root option", () => {
    expect(shouldPrintPackagedSkill(nodeArgv(["--unknown", "--skill"]))).toBe(false);
  });

  it("returns false without --skill", () => {
    expect(shouldPrintPackagedSkill(nodeArgv(["--help"]))).toBe(false);
  });
});

describe("readPackagedSkill", () => {
  it("loads the packaged markdown from the package root", () => {
    const content = readPackagedSkill();
    expect(content).toContain("name: zhe-cli");
    expect(content).toContain("# zhe CLI");
    expect(resolvePackagedSkillPath()).toContain(join("skills", "zhe-cli", "SKILL.md"));
  });

  it("throws when the skill file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "zhe-skill-"));
    const fakeModule = join(dir, "skill.js");
    writeFileSync(fakeModule, "export {}");
    expect(() => readPackagedSkill(`file://${fakeModule}`)).toThrow(/Packaged zhe CLI skill not found/);
  });
});

describe("zhe --skill (built entry)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints skill markdown and exits 0 without running trailing commands", () => {
    execFileSync("bun", ["run", "build"], { cwd: cliRoot, stdio: "pipe" });
    const entry = join(cliRoot, "dist/index.js");
    const stdout = execFileSync(process.execPath, [entry, "--skill", "list"], {
      encoding: "utf8",
      env: { ...process.env, ZHE_API_KEY: "" },
    });
    expect(stdout).toContain("name: zhe-cli");
    expect(stdout).toContain("zhe --skill");
  });
});
