import { formatDuration, formatSize, pc } from "@nocoo/base-cli";
import { ApiClientError } from "../api/client.js";
import { CLI_VERSION } from "../version.js";
import { ConnectorError } from "./core.js";
import type { EagleEvent } from "./eagle.js";
import type { PollResult } from "./runtime.js";
import type { ConnectorProgress, ConnectorStatus } from "./types.js";

const fallbackHint = "Connector processing failed. Check the connection and retry.";
const hints: Record<string, string> = {
  0: "Cannot reach Zhe. Check the network connection.",
  401: "Zhe rejected the API Key (invalid, expired or revoked). Run `zhe logout`, then `zhe login` in this environment.",
  403: "Connector access denied. Use an active API Key with `connector:write`.",
  409: "This job's lease is no longer valid; it will not be overwritten.",
  429: "API rate limit reached. Waiting before the next poll.",
  missing_api_key:
    "No saved API Key was found in this CLI environment. Run `zhe login` here; no request was sent.",
  needs_login: "Connect the OpenCLI browser extension and sign in to X.",
  opencli_unavailable: "OpenCLI is unavailable. Check its browser extension and connection.",
  unsupported_opencli_version: "OpenCLI version mismatch. Reinstall the Zhe CLI dependencies.",
  adapter_contract_changed: "OpenCLI adapter changed. Update the Zhe CLI.",
  post_unavailable: "The saved X post is unavailable or protected.",
  invalid_post_id: "The saved X post ID is invalid.",
  screenshot_unavailable:
    "The page could not be captured. Check that it loads in the connected browser.",
  screenshot_too_large: "The compressed preview exceeds the 512 KiB limit.",
  invalid_screenshot: "The preview is not a valid 1600×1200 WebP image.",
  unsafe_screenshot_url: "The page redirected to an excluded site or an unsupported address.",
  storage_unavailable: "Zhe's R2 storage or CDN configuration is unavailable.",
  github_needs_login:
    "GitHub rejected the local credential. Run `gh auth login` or update GH_TOKEN.",
  github_rate_limited:
    "GitHub access or rate limit reached. Check the local GitHub login and retry later.",
  github_repository_unavailable:
    "The GitHub repository is unavailable or inaccessible to the local login.",
  github_unavailable: "GitHub is temporarily unavailable; the saved snapshot is retained.",
  github_response_invalid: "GitHub returned an incomplete snapshot; update the CLI and retry.",
  github_content_too_large:
    "The README exceeds the archive limit; it was not truncated. Open it on GitHub.",
  github_unsafe_redirect: "The GitHub redirect could not be verified.",
  invalid_media: "Media has an unsupported type or exceeds the size limit.",
  media_too_large:
    "Video exceeds 100 MB in every eligible version (down to 720p); no smaller version was downloaded.",
  video_variant_unavailable: "No supported MP4 version is available at 4K, 1080p or 720p.",
  media_http_error: "X media returned an unsuccessful HTTP response.",
  unsupported_media_type: "The media response is not a supported MP4 or image format.",
  invalid_media_length: "X media returned a missing or invalid file size.",
  decode_failed: "Media verification failed. Check FFmpeg and ffprobe are installed.",
  download_failed: "Media download failed. The saved text is retained for retry.",
  size_mismatch: "Media download was incomplete or its size changed.",
  unsafe_redirect: "The media redirect could not be verified.",
  unsafe_media_address: "The media address could not be verified.",
  media_dns_unavailable: "Media DNS lookup failed. Check the network connection.",
  interrupted: "Processing interrupted; unfinished work can be retried.",
  connector_error: fallbackHint,
};

/** Only known codes become log text; upstream errors may contain cookies or response bodies. */
export function connectorErrorHint(error: unknown): string {
  const code =
    error instanceof ApiClientError
      ? error.status
      : error instanceof ConnectorError
        ? error.code
        : error;
  return (typeof code === "string" || typeof code === "number") && typeof hints[code] === "string"
    ? hints[code]
    : fallbackHint;
}

export class ConnectorLogger {
  private started = Date.now();
  private lastProgress = Date.now();
  private active?: ConnectorProgress;
  private queueSnapshot = "";
  private totalMedia = 0;
  private stats = {
    complete: 0,
    partial: 0,
    failed: 0,
    interrupted: 0,
    media: 0,
    skipped: 0,
    bytes: 0,
    errors: 0,
  };

  constructor(private json = false) {}

  private write(event: string, message: string, fields: Record<string, unknown> = {}) {
    const time = new Date();
    if (this.json) {
      console.log(JSON.stringify({ time: time.toISOString(), event, message, ...fields }));
      return;
    }
    const color = ["failed", "offline"].includes(event)
      ? pc.red
      : ["warning", "partial", "interrupted"].includes(event)
        ? pc.yellow
        : ["complete", "uploaded", "saved"].includes(event)
          ? pc.green
          : pc.cyan;
    console.log(
      `${pc.dim(time.toLocaleTimeString("en-GB", { hour12: false }))} ${color(event.toUpperCase().padEnd(11))} ${message}`,
    );
  }

  start() {
    this.write(
      "ready",
      `Zhe · X / GitHub / Preview Connector ${CLI_VERSION} · one job at a time · 20s between polls · Ctrl+C to stop`,
    );
  }

  eagle = (event: EagleEvent) => {
    this.write(
      "eagle",
      `Eagle sidecar: ${event.code}${event.reason ? ` · ${event.reason}` : ""}${event.attempts ? ` · attempt ${event.attempts}` : ""}${event.retryAt ? ` · retry after ${new Date(event.retryAt).toISOString()}` : ""}`,
      { ...event },
    );
  };

  queue(status: ConnectorStatus) {
    const states = Object.fromEntries(status.states.map(({ state, count }) => [state, count]));
    const snapshot = JSON.stringify([states, status.expiresAt]);
    if (snapshot === this.queueSnapshot) return;
    this.queueSnapshot = snapshot;
    this.write(
      "queue",
      `${["pending", "running", "complete", "partial", "failed", "unavailable"].map((state) => `${states[state] ?? 0} ${state}`).join(" · ")} · ${status.expiresAt === null ? "key never expires" : `key expires ${new Date(status.expiresAt).toISOString()}`}`,
      { states, expiresAt: status.expiresAt },
    );
  }

  progress = (event: ConnectorProgress) => {
    this.active = event;
    this.lastProgress = Date.now();
    if (event.stage === "claim") this.totalMedia = 0;
    if (event.stage === "capture") this.totalMedia = event.total ?? 0;
    if (event.stage === "uploaded") this.stats.bytes += event.bytes ?? 0;
    if (event.stage === "skipped") this.stats.skipped++;
    let message = event.message;
    if (event.stage === "download" && event.bytes) {
      const percent = Math.min(100, Math.floor(((event.received ?? 0) / event.bytes) * 100));
      const filled = Math.floor(percent / 10);
      message += ` [${"━".repeat(filled)}${"·".repeat(10 - filled)}] ${percent}% · ${formatSize(event.received ?? 0)} / ${formatSize(event.bytes)}`;
    } else if (event.bytes) message += ` · ${formatSize(event.bytes)}`;
    this.write(event.stage, message, { ...event, message });
  };

  tick() {
    if (!this.active || Date.now() - this.lastProgress < 10_000) return;
    this.write(
      "working",
      `${this.active.stage}: ${this.active.message} · still running (${formatDuration(Date.now() - this.lastProgress)} since last progress)`,
    );
  }

  result(result: PollResult, durationMs: number, watching = false) {
    this.active = undefined;
    const interrupted = result.error === "interrupted";
    if (result.status !== "idle") {
      this.stats[interrupted ? "interrupted" : result.status]++;
      this.stats.media += result.media;
    }
    const detail =
      result.status === "idle"
        ? "No job ready"
        : `${result.media}/${this.totalMedia} media archived · ${formatDuration(durationMs)}${result.error ? ` · ${connectorErrorHint(result.errorStatus ?? result.error)}` : ""}`;
    this.write(
      interrupted ? "interrupted" : result.status,
      `${detail}${watching ? " · next poll in 20s" : ""}`,
      { ...result, durationMs, stats: { ...this.stats } },
    );
    if (result.status !== "idle")
      this.write("session", this.summary(), { stats: { ...this.stats } });
  }

  offline(error: unknown) {
    this.active = undefined;
    this.stats.errors++;
    this.write("offline", `${connectorErrorHint(error)} Next poll in 20s.`, {
      status: "offline",
      code:
        error instanceof ApiClientError
          ? error.status
          : error instanceof ConnectorError && error.code === "missing_api_key"
            ? error.code
            : "connector_error",
    });
  }

  private summary() {
    const s = this.stats;
    return `${s.complete} complete · ${s.partial} partial · ${s.failed} failed · ${s.interrupted} interrupted · ${s.media} media · ${s.skipped} skipped · ${formatSize(s.bytes)} uploaded · ${s.errors} connection errors · uptime ${formatDuration(Date.now() - this.started)}`;
  }

  stop() {
    this.active = undefined;
    this.write("stopped", this.summary(), {
      stats: { ...this.stats },
      durationMs: Date.now() - this.started,
    });
  }
}
