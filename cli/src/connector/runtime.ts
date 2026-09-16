import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ApiClient, ApiClientError } from "../api/client.js";
import { getApiKey } from "../config.js";
import { ConnectorError } from "./core.js";
import { downloadMedia, makePoster } from "./download.js";
import { configuredEagle, type EagleSink } from "./eagle.js";
import { readGitHubRepository } from "./github.js";
import { ConnectorLogger, connectorErrorHint } from "./log.js";
import { trimConnectorLog } from "./log-file.js";
import { readPost } from "./opencli.js";
import type { DownloadedMedia, MediaReservation, ReportProgress, XJob } from "./types.js";

export interface PollResult {
  status: "idle" | "complete" | "partial" | "failed";
  media: number;
  error?: string;
  errorStatus?: number;
}

export function authenticatedClient(): ApiClient {
  const key = getApiKey();
  if (!key) throw new ConnectorError("missing_api_key");
  return new ApiClient(key);
}

export async function processOne(
  client: ApiClient,
  parent?: AbortSignal,
  progress?: ReportProgress,
  eagle?: EagleSink,
): Promise<PollResult> {
  const { job } = await client.claimConnectorJob(parent);
  if (!job) return { status: "idle", media: 0 };
  progress?.({
    stage: "claim",
    message: `Link #${job.linkId} · ${job.source === "github" ? `GitHub ${job.fullName}` : `X post ${job.postId}`} · attempt ${job.attempts}`,
  });
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
    if (job.source === "github") {
      progress?.({
        stage: "read",
        message: "Reading repository statistics and the complete README from GitHub",
      });
      const repository = await readGitHubRepository(job.fullName, signal);
      signal.throwIfAborted();
      progress?.({
        stage: "publish",
        message: `Saving ${repository.stars} stars · ${repository.commits} commits · ${repository.readme?.length ?? 0} README characters`,
      });
      await client.connectorAction(job, { action: "complete", repository }, signal);
      return { status: "complete", media: 0 };
    }
    dir = await mkdtemp(join(tmpdir(), "zhe-connector-"));
    progress?.({ stage: "read", message: "Reading the saved post through the local X session" });
    const capture = await readPost(job.postId, signal);
    // Fork before any Zhe write; the sidecar owns its downloads, deadlines and recovery.
    try {
      eagle?.submit(structuredClone(capture));
    } catch {
      /* enrichment is independent */
    }
    progress?.({
      stage: "capture",
      message: `Saving ${capture.tweet.text.length} characters · ${capture.media.length} media found`,
      total: capture.media.length,
    });
    await client.connectorAction(job, { action: "capture", capture }, signal);
    for (const [index, media] of capture.media.entries()) {
      signal.throwIfAborted();
      const reportMedia: ReportProgress = (event) =>
        progress?.({
          ...event,
          current: index + 1,
          total: capture.media.length,
          message: `${media.type} ${index + 1}/${capture.media.length} · ${event.message}`,
        });
      try {
        reportMedia({ stage: "download", message: "Connecting to X media" });
        const file = await downloadMedia(media, dir, signal, (phase, received, bytes) => {
          reportMedia({
            stage: phase,
            message: phase === "download" ? "Downloading" : "Verifying format and full decode",
            received,
            bytes,
          });
        });
        const kind = media.type === "PHOTO" ? "photo" : "video";
        if (!(await archive(client, job, media.id, kind, file, signal, reportMedia))) continue;
        media.width = file.width;
        media.height = file.height;
        media.duration = file.duration;
        archived++;
        if (kind === "video") {
          reportMedia({ stage: "poster", message: "Generating video poster" });
          const poster = await makePoster(file.path, signal);
          signal.throwIfAborted();
          if (poster) await archive(client, job, media.id, "poster", poster, signal, reportMedia);
          else reportMedia({ stage: "warning", message: "Poster unavailable; video is archived" });
        }
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof ApiClientError && [401, 403, 409].includes(error.status))
        )
          throw error;
        incomplete = true;
        reportMedia({ stage: "warning", message: connectorErrorHint(error) });
      }
    }
    signal.throwIfAborted();
    capture.tweet.media = capture.media;
    progress?.({
      stage: "publish",
      message: `Saving the enriched post · ${archived}/${capture.media.length} media archived`,
    });
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
    return {
      status: "failed",
      media: archived,
      error: code,
      ...(error instanceof ApiClientError ? { errorStatus: error.status } : {}),
    };
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
  progress?: ReportProgress,
): Promise<boolean> {
  progress?.({ stage: "upload", message: `Preparing ${kind} archive` });
  const { asset } = await client.connectorAction<{ asset: MediaReservation | { skipped: true } }>(
    job,
    {
      action: "reserve",
      media: { mediaId, kind, size: file.size, mime: file.mime, sha256: file.sha256 },
    },
    signal,
  );
  if (asset.skipped) {
    progress?.({ stage: "skipped", message: `${kind} was explicitly deleted; keeping it deleted` });
    return false;
  }
  if (!asset.uploaded) {
    progress?.({ stage: "upload", message: `Uploading ${kind} to Zhe`, bytes: file.size });
    await client.uploadXMedia(job, asset, file, signal);
    progress?.({ stage: "uploaded", message: `${kind} upload confirmed`, bytes: file.size });
  } else
    progress?.({ stage: "saved", message: `${kind} already archived; reusing the saved file` });
  return true;
}

export async function runOnce(
  signal?: AbortSignal,
  progress?: ReportProgress,
  eagle?: EagleSink,
): Promise<PollResult> {
  // Read the shared CLI configuration on each poll, so logout/rotation takes effect.
  return processOne(authenticatedClient(), signal, progress, eagle);
}

export async function watchConnector(signal: AbortSignal, json = false): Promise<void> {
  const log = new ConnectorLogger(json);
  const eagle = configuredEagle(log.eagle);
  const activity = setInterval(() => log.tick(), 10_000);
  const logMaintenance = setInterval(() => {
    void trimConnectorLog(join(homedir(), ".config", "zhe", "connector.log")).catch(() => {});
  }, 60_000);
  log.start();
  try {
    while (!signal.aborted) {
      const started = Date.now();
      try {
        const client = authenticatedClient();
        // Queue statistics are optional; a failed status lookup must not block enrichment.
        const status = await client.connectorStatus(signal).catch(() => undefined);
        if (signal.aborted) break;
        if (status) log.queue(status);
        log.result(
          await processOne(client, signal, log.progress, eagle),
          Date.now() - started,
          !signal.aborted,
        );
      } catch (error) {
        if (!signal.aborted) log.offline(error);
      }
      if (!signal.aborted) await delay(20_000, undefined, { signal }).catch(() => {});
    }
  } finally {
    clearInterval(activity);
    clearInterval(logMaintenance);
    await eagle?.stop();
    log.stop();
  }
}
