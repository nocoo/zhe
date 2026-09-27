import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertLocalOrigin, createRun, removeRun, runDirectory } from "@/scripts/lib/local-run";

describe("owned local runs", () => {
  it("isolates runs and preserves foreign data before cleanup", async () => {
    const root = await mkdtemp(join(tmpdir(), "zhe-runs-"));
    try {
      const first = await createRun(root, "first");
      const second = await createRun(root, "second");
      await writeFile(join(second, "data"), "keep");
      await expect(createRun(root, "first")).rejects.toThrow();
      await removeRun(root, "first");
      expect(await readFile(join(second, "data"), "utf8")).toBe("keep");
      await writeFile(join(second, "owner.json"), JSON.stringify({ id: "foreign", root }));
      await expect(removeRun(root, "second")).rejects.toThrow("ownership");
      await symlink(second, first);
      await expect(removeRun(root, "first")).rejects.toThrow("Symlinked");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("rejects path traversal and disguised remote targets", () => {
    expect(() => runDirectory("/tmp", "../demo")).toThrow();
    for (const url of [
      "https://localhost",
      "http://localhost.evil",
      "http://evil/127.0.0.1",
      "http://localhost@evil",
      "http://localhost/path",
      "http://localhost/?target=prod",
    ]) {
      expect(() => assertLocalOrigin(url)).toThrow();
    }
    assertLocalOrigin("http://127.0.0.1:8788");
    assertLocalOrigin("http://localhost:8788");
  });
});
