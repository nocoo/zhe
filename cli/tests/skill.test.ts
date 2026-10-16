import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const packagedSkillModuleUrl = pathToFileURL(join(cliRoot, "src", "skill.ts")).href;

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
    const content = readPackagedSkill(packagedSkillModuleUrl);
    expect(content).toContain("name: zhe-cli");
    expect(content).toContain("# zhe CLI");
    expect(resolvePackagedSkillPath(packagedSkillModuleUrl)).toContain(
      join("skills", "zhe-cli", "SKILL.md"),
    );
  });

  it("walks upward from the module directory to the package skill file", () => {
    const pkgRoot = mkdtempSync(join(tmpdir(), "zhe-pkg-walk-"));
    const skillDir = join(pkgRoot, "skills", "zhe-cli");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(pkgRoot, "package.json"), JSON.stringify({ name: "@nocoo/zhe" }));
    writeFileSync(join(skillDir, "SKILL.md"), "walked-skill-content");

    const moduleFile = join(pkgRoot, "vendor", "bundle", "skill.js");
    mkdirSync(dirname(moduleFile), { recursive: true });
    writeFileSync(moduleFile, "export {}");

    const resolved = resolvePackagedSkillPath(pathToFileURL(moduleFile).href);
    expect(readFileSync(resolved, "utf8")).toBe("walked-skill-content");
  });

  it("ignores invalid package.json files while walking upward", () => {
    const pkgRoot = mkdtempSync(join(tmpdir(), "zhe-pkg-invalid-json-"));
    const skillDir = join(pkgRoot, "skills", "zhe-cli");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(pkgRoot, "package.json"), JSON.stringify({ name: "@nocoo/zhe" }));
    writeFileSync(join(skillDir, "SKILL.md"), "valid-skill");

    const mid = join(pkgRoot, "nested");
    mkdirSync(mid, { recursive: true });
    writeFileSync(join(mid, "package.json"), "{ not-json");

    const moduleFile = join(mid, "src", "skill.js");
    mkdirSync(dirname(moduleFile), { recursive: true });
    writeFileSync(moduleFile, "export {}");

    expect(readPackagedSkill(pathToFileURL(moduleFile).href)).toBe("valid-skill");
  });

  it("does not load a forged @nocoo/zhe skill from process.cwd()", () => {
    const forgedRoot = mkdtempSync(join(tmpdir(), "zhe-forged-"));
    const forgedSkillDir = join(forgedRoot, "skills", "zhe-cli");
    mkdirSync(forgedSkillDir, { recursive: true });
    writeFileSync(join(forgedRoot, "package.json"), JSON.stringify({ name: "@nocoo/zhe" }));
    writeFileSync(join(forgedSkillDir, "SKILL.md"), "FORGED_SKILL_CONTENT");

    const isolatedDir = mkdtempSync(join(tmpdir(), "zhe-isolated-"));
    const fakeModule = join(isolatedDir, "src", "skill.js");
    mkdirSync(dirname(fakeModule), { recursive: true });
    writeFileSync(fakeModule, "export {}");

    const previousCwd = process.cwd();
    try {
      process.chdir(forgedRoot);
      expect(() => readPackagedSkill(pathToFileURL(fakeModule).href)).toThrow(
        /Packaged zhe CLI skill not found/,
      );
    } finally {
      process.chdir(previousCwd);
    }
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

  it("throws when the resolved skill path cannot be read", () => {
    const pkgRoot = mkdtempSync(join(tmpdir(), "zhe-pkg-unreadable-"));
    writeFileSync(join(pkgRoot, "package.json"), JSON.stringify({ name: "@nocoo/zhe" }));
    mkdirSync(join(pkgRoot, "skills", "zhe-cli", "SKILL.md"), { recursive: true });

    const moduleFile = join(pkgRoot, "lib", "skill.js");
    mkdirSync(dirname(moduleFile), { recursive: true });
    writeFileSync(moduleFile, "export {}");

    expect(() => readPackagedSkill(pathToFileURL(moduleFile).href)).toThrow(
      /Packaged zhe CLI skill not found at/,
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

    printPackagedSkillAndExit(packagedSkillModuleUrl);
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
