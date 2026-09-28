import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lockDemo, resetDemo, unlockDemo, verifyDemo } from "@/scripts/lib/demo-storage";

it("preserves persistent Demo and refuses reset while owned by a running instance", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "zhe-demo-")));
  try {
    await lockDemo(root, "one");
    await expect(lockDemo(root, "two")).rejects.toThrow();
    await expect(resetDemo(root)).rejects.toThrow("Stop");
    await expect(unlockDemo(root, "two")).rejects.toThrow("ownership");
    await unlockDemo(root, "one");
    await expect(verifyDemo(root)).resolves.toBe(join(root, ".demo-storage"));
    await lockDemo(root, "two");
    await unlockDemo(root, "two");
    await resetDemo(root);
    await expect(verifyDemo(root)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
