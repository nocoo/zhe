/**
 * CLI version - read from package.json at build time
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

interface PackageJson {
	version: string;
}

// Read package.json relative to dist/ or src/
function getVersion(): string {
	try {
		// Try dist/../package.json first (runtime)
		const pkg = require(join(__dirname, "..", "package.json")) as PackageJson;
		return pkg.version;
	} catch {
		try {
			// Fall back to src/../package.json (dev)
			const pkg = require(
				join(__dirname, "..", "..", "package.json"),
			) as PackageJson;
			return pkg.version;
		} catch {
			return "0.0.0";
		}
	}
}

export const CLI_VERSION = getVersion();
