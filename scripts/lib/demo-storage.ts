import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
export async function verifyDemo(root: string): Promise<string> {
  const path = resolve(root, ".demo-storage");
  const owner = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
  if ((await realpath(path)) !== path || owner.root !== root || owner.mode !== "demo")
    throw new Error("Demo storage ownership mismatch");
  return path;
}
export async function lockDemo(root: string, id: string): Promise<void> {
  const path = resolve(root, ".demo-storage");
  try {
    await mkdir(path);
    await writeFile(join(path, "owner.json"), JSON.stringify({ root, mode: "demo" }), {
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await verifyDemo(root);
  await writeFile(join(path, "lock.json"), JSON.stringify({ id, pid: process.pid }), {
    flag: "wx",
  });
}
export async function unlockDemo(root: string, id: string): Promise<void> {
  const path = await verifyDemo(root);
  const lock = JSON.parse(await readFile(join(path, "lock.json"), "utf8"));
  if (lock.id !== id) throw new Error("Demo lock ownership mismatch");
  await rm(join(path, "lock.json"));
}
export async function resetDemo(root: string): Promise<void> {
  const path = await verifyDemo(root);
  try {
    await readFile(join(path, "lock.json"));
    throw new Error("Stop the Demo instance before reset");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rm(path, { recursive: true });
}
