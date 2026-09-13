import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ApiClient, ApiClientError } from "../api/client.js";
import { getApiKey } from "../config.js";
import { ConnectorError } from "./core.js";
import { downloadMedia, makePoster } from "./download.js";
import { readPost } from "./opencli.js";
import type { DownloadedMedia, MediaReservation, XJob } from "./types.js";

export interface PollResult {
  status: "idle" | "complete" | "partial" | "failed";
  media: number;
  error?: string;
}

export function authenticatedClient(): ApiClient {
  const key = getApiKey();
  if (!key) throw new ApiClientError(401, "Not authenticated. Run `zhe login` first.");
  return new ApiClient(key);
}

export async function processOne(client: ApiClient, parent?: AbortSignal): Promise<PollResult> {
  const { job } = await client.claimXJob(parent);
  if (!job) return { status: "idle", media: 0 };
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  let renewing: Promise<void> | undefined;
  const heartbeat = setInterval(() => {
    if (renewing) return;
    renewing = client
      .connectorAction(job, { action: "renew" }, signal)
      .then(() => {})
      .catch(() => controller.abort())
      .finally(() => {
        renewing = undefined;
      });
  }, 30_000);
  let dir: string | undefined;
  let archived = 0;
  let incomplete = false;
  try {
    dir = await mkdtemp(join(tmpdir(), "zhe-connector-"));
    const capture = await readPost(job.postId, signal);
    await client.connectorAction(job, { action: "capture", capture }, signal);
    for (const media of capture.media) {
      signal.throwIfAborted();
      try {
        const file = await downloadMedia(media, dir, signal);
        const kind = media.type === "PHOTO" ? "photo" : "video";
        if (!(await archive(client, job, media.id, kind, file, signal))) continue;
        media.width = file.width;
        media.height = file.height;
        media.duration = file.duration;
        archived++;
        if (kind === "video") {
          const poster = await makePoster(file.path, signal);
          if (poster) await archive(client, job, media.id, "poster", poster, signal);
        }
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof ApiClientError && [401, 403, 409].includes(error.status))
        )
          throw error;
        incomplete = true;
      }
    }
    signal.throwIfAborted();
    capture.tweet.media = capture.media;
    await client.connectorAction(job, { action: "capture", capture }, signal);
    await client.connectorAction(job, { action: "complete" }, signal);
    return { status: incomplete ? "partial" : "complete", media: archived };
  } catch (error) {
    const code =
      error instanceof ConnectorError
        ? error.code
        : signal.aborted
          ? "interrupted"
          : "connector_error";
    await client.connectorAction(job, { action: "fail", code }).catch(() => {});
    return { status: "failed", media: archived, error: code };
  } finally {
    clearInterval(heartbeat);
    controller.abort();
    await renewing;
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

async function archive(
  client: ApiClient,
  job: XJob,
  mediaId: string,
  kind: string,
  file: DownloadedMedia,
  signal: AbortSignal,
): Promise<boolean> {
  const { asset } = await client.connectorAction<{ asset: MediaReservation | { skipped: true } }>(
    job,
    {
      action: "reserve",
      media: { mediaId, kind, size: file.size, mime: file.mime, sha256: file.sha256 },
    },
    signal,
  );
  if (asset.skipped) return false;
  if (!asset.uploaded) await client.uploadXMedia(job, asset, file, signal);
  return true;
}

export async function runOnce(signal?: AbortSignal): Promise<PollResult> {
  // Read the shared CLI configuration on each poll, so logout/rotation takes effect.
  return processOne(authenticatedClient(), signal);
}

export async function watchConnector(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      console.log(JSON.stringify(await runOnce(signal)));
    } catch (error) {
      console.log(
        JSON.stringify({
          status: "offline",
          code: error instanceof ApiClientError ? error.status : "connector_error",
        }),
      );
    }
    await delay(20_000, undefined, { signal }).catch(() => {});
  }
}
