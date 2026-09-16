import { constants } from "node:fs";
import { open } from "node:fs/promises";

const MAX_LOG_BYTES = 5 * 1024 * 1024;

/** launchd keeps stdout open: truncate that inode instead of renaming it away. */
export async function trimConnectorLog(path: string): Promise<void> {
  let file: Awaited<ReturnType<typeof open>>;
  try {
    file = await open(path, constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return;
  }
  try {
    const info = await file.stat();
    if (info.isFile() && info.nlink === 1 && info.size > MAX_LOG_BYTES) {
      await file.truncate(0);
    }
  } finally {
    await file.close();
  }
}
