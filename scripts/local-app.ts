import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CATALOG_ANCHOR, CATALOG_VERSION, seedCatalog } from "./fixtures-catalog";
import { terminateChild } from "./lib/crash-shutdown";
import { prepareTestEnvironment } from "./lib/test-environment";
import { applyLocalStackEnv, STACK_DIR, startLocalStack, stopLocalStack } from "./test-stack";

const mode = process.env.ZHE_ENVIRONMENT;
if (!["demo", "e2e", "prod"].includes(mode ?? "")) throw new Error("Missing environment mode");
const appPort = Number(process.env.ZHE_LOCAL_APP_PORT);
if (!Number.isInteger(appPort) || appPort < 1024) throw new Error("Invalid app port");
const origin = process.env.ZHE_LOCAL_ORIGIN;
const instance = process.env.ZHE_LOCAL_INSTANCE;
if (!origin || !instance) throw new Error("Local launcher required");
let stack: Awaited<ReturnType<typeof startLocalStack>> | null = null;
try {
  if (mode !== "prod") {
    prepareTestEnvironment();
    process.env.ZHE_ENVIRONMENT = mode;
    stack = await startLocalStack();
    applyLocalStackEnv();
    process.env.R2_PUBLIC_DOMAIN = `${origin}/_local/media/${mode === "demo" ? "demo" : instance}/r2`;
    const catalog = join(STACK_DIR, "catalog.json");
    let seeded = false;
    try {
      await readFile(catalog);
      seeded = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!seeded) {
      await seedCatalog();
      await writeFile(
        catalog,
        JSON.stringify({ version: CATALOG_VERSION, anchor: CATALOG_ANCHOR }),
      );
    }
  }
} catch (error) {
  await stopLocalStack(stack, mode === "e2e");
  throw error;
}
process.env.ZHE_LAUNCH_INTENT = "interactive";
process.env.ZHE_LOCAL_INSTANCE = instance;
process.env.AUTH_URL = origin;
process.env.PUBLIC_ORIGIN = origin;
process.env.AUTH_SECRET ||= randomBytes(32).toString("hex");
if (process.env.ZHE_LOCAL_BUILD === "1") {
  const build = spawn("bun", ["run", "next", "build"], { stdio: "inherit", env: process.env });
  const code = await new Promise((done) => build.once("exit", done));
  if (code !== 0) {
    await stopLocalStack(stack, mode === "e2e");
    throw new Error("Local build failed");
  }
}
const child = spawn(
  "bun",
  [
    "run",
    "next",
    ...(process.env.ZHE_LOCAL_BUILD === "1" ? ["start"] : ["dev", "--turbopack"]),
    "--hostname",
    "127.0.0.1",
    "-p",
    String(appPort),
  ],
  { stdio: "inherit", env: process.env },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await terminateChild(child, 5000);
  await stopLocalStack(stack, mode === "e2e");
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", () => {
  if (!stopping) void stop();
});
