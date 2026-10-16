/**
 * Packaged agent skill (`zhe --skill`) — offline Markdown on stdout.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_RELATIVE = join("skills", "zhe-cli", "SKILL.md");

function findZheCliPackageRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
        if (pkg.name === "@nocoo/zhe") {
          return dir;
        }
      } catch {
        // ignore invalid package.json
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error("Could not locate @nocoo/zhe package root for skill file");
}

/** Root-level flags recognized before the first subcommand or `--`. */
export const ROOT_KNOWN_OPTIONS = new Set(["--skill", "--help", "-h", "--version", "-v", "-V"]);

export function resolvePackagedSkillPath(moduleUrl?: string): string {
  const resolvedModuleUrl = moduleUrl ?? import.meta.url;
  const moduleDir = dirname(fileURLToPath(resolvedModuleUrl));
  const adjacent = join(moduleDir, "..", SKILL_RELATIVE);
  if (existsSync(adjacent)) {
    return adjacent;
  }

  const usePackageDiscovery = moduleUrl === undefined || moduleUrl === import.meta.url;
  const searchRoots = usePackageDiscovery ? [moduleDir, process.cwd()] : [moduleDir];

  for (const start of searchRoots) {
    try {
      const candidate = join(findZheCliPackageRoot(start), SKILL_RELATIVE);
      if (existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // try next root
    }
  }

  throw new Error(`Packaged zhe CLI skill not found at ${adjacent}`);
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
