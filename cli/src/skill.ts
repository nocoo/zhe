/**
 * Packaged agent skill (`zhe --skill`) — offline Markdown on stdout.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_RELATIVE = join("skills", "zhe-cli", "SKILL.md");

/** Root-level flags recognized before the first subcommand or `--`. */
export const ROOT_KNOWN_OPTIONS = new Set(["--skill", "--help", "-h", "--version", "-v", "-V"]);

export function resolvePackagedSkillPath(moduleUrl: string = import.meta.url): string {
  const moduleDir = dirname(fileURLToPath(moduleUrl));
  return join(moduleDir, "..", SKILL_RELATIVE);
}

export function readPackagedSkill(moduleUrl?: string): string {
  const path = resolvePackagedSkillPath(moduleUrl);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`Packaged zhe CLI skill not found at ${path}`);
  }
}

/**
 * True when argv requests the packaged skill before citty sees a subcommand.
 * Stops scanning at the first positional command, `--`, or unknown root option.
 */
export function shouldPrintPackagedSkill(argv: readonly string[]): boolean {
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--skill") {
      return true;
    }
    if (arg === "--") {
      return false;
    }
    if (!arg.startsWith("-")) {
      return false;
    }
    if (!ROOT_KNOWN_OPTIONS.has(arg)) {
      return false;
    }
  }
  return false;
}

export function printPackagedSkillAndExit(moduleUrl?: string): never {
  try {
    const content = readPackagedSkill(moduleUrl);
    process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load zhe CLI skill";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

export function handleSkillFlagIfNeeded(argv: readonly string[] = process.argv): void {
  if (shouldPrintPackagedSkill(argv)) {
    printPackagedSkillAndExit();
  }
}
