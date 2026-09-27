import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export function runDirectory(root: string, id: string): string {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error("Invalid local run ID");
  return resolve(root, ".test-storage", "runs", id);
}

export function localRunId(): string {
  return (process.env.ZHE_RUN_ID ??= randomUUID());
}

export function assertLocalOrigin(value: string): void {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Expected a plain loopback HTTP origin");
}

export async function createRun(root: string, id: string): Promise<string> {
  const path = runDirectory(await realpath(root), id);
  await mkdir(dirname(path), { recursive: true });
  if ((await realpath(dirname(path))) !== dirname(path)) throw new Error("Symlinked run parent");
  await mkdir(path);
  await writeFile(join(path, "owner.json"), JSON.stringify({ id, root: resolve(root) }), {
    flag: "wx",
  });
  return path;
}

export async function removeRun(root: string, id: string): Promise<void> {
  const path = runDirectory(await realpath(root), id);
  if ((await lstat(path)).isSymbolicLink() || (await realpath(path)) !== path) {
    throw new Error("Symlinked run directory");
  }
  const owner = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
  if (owner.id !== id || owner.root !== resolve(root)) throw new Error("Run ownership mismatch");
  await rm(path, { recursive: true });
}
