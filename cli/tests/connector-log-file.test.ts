import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { trimConnectorLog } from "../src/connector/log-file.js";

it("bounds the LaunchAgent log without following links or replacing its open inode", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zhe-log-limit-"));
  try {
    const path = join(directory, "connector.log");
    await trimConnectorLog(path);
    await writeFile(path, "short log");
    await trimConnectorLog(path);
    expect(await readFile(path, "utf8")).toBe("short log");
    const inode = (await stat(path)).ino;
    await writeFile(path, Buffer.alloc(5 * 1024 * 1024 + 1));
    await trimConnectorLog(path);
    expect((await stat(path)).size).toBe(0);
    expect((await stat(path)).ino).toBe(inode);
    const link = join(directory, "alias.log");
    await symlink(path, link);
    await writeFile(path, "preserved");
    await trimConnectorLog(link);
    expect(await readFile(path, "utf8")).toBe("preserved");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
