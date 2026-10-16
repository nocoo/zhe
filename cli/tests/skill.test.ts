import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleSkillFlagIfNeeded,
  printPackagedSkillAndExit,
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
    const fakeModule = join(dir, "src", "skill.js");
    mkdirSync(dirname(fakeModule), { recursive: true });
    writeFileSync(fakeModule, "export {}");
    expect(() => readPackagedSkill(pathToFileURL(fakeModule).href)).toThrow(
      /Packaged zhe CLI skill not found/,
    );
  });
});

function mockProcessExit(): ReturnType<typeof vi.spyOn<typeof process, "exit">> {
  return vi.spyOn(process, "exit").mockImplementation((() => undefined) as typeof process.exit);
}

describe("printPackagedSkillAndExit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes packaged skill to stdout and exits 0", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exit = mockProcessExit();

    printPackagedSkillAndExit();
    expect(stdout).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
    const written = String(stdout.mock.calls[0]?.[0] ?? "");
    expect(written).toContain("name: zhe-cli");
    expect(written.endsWith("\n")).toBe(true);
  });

  it("appends a newline when skill content has no trailing newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "zhe-skill-nl-"));
    const fakeModule = join(dir, "src", "skill.js");
    const skillDir = join(dir, "skills", "zhe-cli");
    mkdirSync(dirname(fakeModule), { recursive: true });
    writeFileSync(fakeModule, "export {}");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "no trailing newline");

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exit = mockProcessExit();

    printPackagedSkillAndExit(pathToFileURL(fakeModule).href);
    expect(stdout).toHaveBeenCalledWith("no trailing newline\n");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("writes to stderr and exits 1 when skill file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "zhe-skill-miss-"));
    const fakeModule = join(dir, "src", "skill.js");
    mkdirSync(dirname(fakeModule), { recursive: true });
    writeFileSync(fakeModule, "export {}");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exit = mockProcessExit();

    printPackagedSkillAndExit(pathToFileURL(fakeModule).href);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/Packaged zhe CLI skill not found/));
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("handleSkillFlagIfNeeded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints skill and exits when --skill is present", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exit = mockProcessExit();

    handleSkillFlagIfNeeded(["node", "index.js", "--skill"]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("does not exit when --skill is absent", () => {
    const exit = vi.spyOn(process, "exit");
    handleSkillFlagIfNeeded(["node", "index.js", "--help"]);
    expect(exit).not.toHaveBeenCalled();
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
