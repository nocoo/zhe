import { formatDuration, formatSize, pc } from "@nocoo/base-cli";
import { ApiClientError } from "../api/client.js";
import { CLI_VERSION } from "../version.js";
import { ConnectorError } from "./core.js";
import type { PollResult } from "./runtime.js";
import type { ConnectorProgress, ConnectorStatus } from "./types.js";

const fallbackHint = "Connector processing failed. Check the connection and retry.";
const hints: Record<string, string> = {
  0: "Cannot reach Zhe. Check the network connection.",
  401: "API Key missing, invalid or revoked. Run `zhe login` with a valid key.",
  403: "Connector permission missing or expired. Use a key with `connector:write` created within 30 days.",
  409: "This job's lease is no longer valid; it will not be overwritten.",
  429: "API rate limit reached. Waiting before the next poll.",
  needs_login: "Connect the OpenCLI browser extension and sign in to X.",
  opencli_unavailable: "OpenCLI is unavailable. Check its browser extension and connection.",
  unsupported_opencli_version: "OpenCLI version mismatch. Reinstall the Zhe CLI dependencies.",
  adapter_contract_changed: "OpenCLI adapter changed. Update the Zhe CLI.",
  post_unavailable: "The saved X post is unavailable or protected.",
  invalid_post_id: "The saved X post ID is invalid.",
  invalid_media: "Media has an unsupported type or exceeds the size limit.",
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
      `Zhe · X Connector ${CLI_VERSION} · one job at a time · 20s between polls · Ctrl+C to stop`,
    );
  }

  queue(status: ConnectorStatus) {
    const states = Object.fromEntries(status.states.map(({ state, count }) => [state, count]));
    const snapshot = JSON.stringify([states, status.expiresAt]);
    if (snapshot === this.queueSnapshot) return;
    this.queueSnapshot = snapshot;
    this.write(
      "queue",
      `${["pending", "running", "complete", "partial", "failed", "unavailable"].map((state) => `${states[state] ?? 0} ${state}`).join(" · ")} · key expires ${new Date(status.expiresAt).toISOString().slice(0, 10)}`,
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
      code: error instanceof ApiClientError ? error.status : "connector_error",
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
