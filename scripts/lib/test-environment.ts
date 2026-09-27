import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function prepareTestEnvironment(): void {
  if (process.env.ZHE_AUTOMATION_ENV_READY === "1") return;
  process.env.ZHE_AUTOMATION_ENV_READY = "1";
  for (const [key] of Object.entries(process.env)) {
    if (
      /^(AUTH_|CLOUDFLARE_|D1_|R2_|OPENAI_|ANTHROPIC_|AZURE_|GOOGLE_|BACKY_|WORKER_SECRET|PUBLIC_ORIGIN|TRUSTED_ORIGINS)/.test(
        key,
      )
    ) {
      process.env[key] = "";
    }
  }
  for (const file of [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    ".env.development",
    ".env.development.local",
  ]) {
    const path = resolve(file);
    if (!existsSync(path)) continue;
    for (const match of readFileSync(path, "utf8").matchAll(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm,
    )) {
      if (match[1]) process.env[match[1]] = "";
    }
  }
  process.env.AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.AUTH_GOOGLE_ID = "";
  process.env.AUTH_GOOGLE_SECRET = "";
  process.env.AUTH_ALLOWED_EMAILS = "e2e@test.local";
  process.env.ZHE_LAUNCH_INTENT = "automation";
  process.env.ZHE_ENVIRONMENT = "e2e";
}
