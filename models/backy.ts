// Pure business logic for Backy remote backup integration — no React, no DOM.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Backy configuration stored in user_settings */
export interface BackyConfig {
  webhookUrl: string;
  apiKey: string;
}

/** Backy backup history response from the remote API */
export interface BackyHistoryResponse {
  project_name: string;
  environment: string | null;
  total_backups: number;
  recent_backups: BackyBackupEntry[];
}

/** A single backup entry in the history */
export interface BackyBackupEntry {
  id: string;
  tag: string;
  environment: string;
  file_size: number;
  is_single_json: number;
  created_at: string;
}

/** Result of a push-backup operation (from Backy API response) */
export interface BackyPushResult {
  id: string;
  project_name: string;
  tag: string;
  environment: string;
  file_size: number;
  is_single_json: number;
  created_at: string;
}

/** Detailed push result with request metadata and timing */
export interface BackyPushDetail {
  ok: boolean;
  message: string;
  /** Duration of the push in milliseconds */
  durationMs?: number;
  request?: {
    tag: string;
    fileName: string;
    fileSizeBytes: number;
    backupStats: Record<string, number>;
  };
  response?: {
    status: number;
    body: unknown;
  };
  /** Backup history fetched inline on push success (avoids extra round-trip) */
  history?: BackyHistoryResponse;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Check whether a string looks like a valid URL */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Validate Backy config (both fields must be non-empty, URL must be valid) */
export function validateBackyConfig(
  config: Partial<BackyConfig>,
): { valid: true } | { valid: false; error: string } {
  if (!config.webhookUrl?.trim()) {
    return { valid: false, error: "Webhook URL 不能为空" };
  }
  if (!isValidWebhookUrl(config.webhookUrl)) {
    return { valid: false, error: "Webhook URL 格式无效" };
  }
  if (!config.apiKey?.trim()) {
    return { valid: false, error: "API Key 不能为空" };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// API key masking
// ---------------------------------------------------------------------------

/**
 * Mask an API key for display: show first 4 and last 4 chars, mask the rest.
 * Keys shorter than 10 chars are fully masked.
 */
export function maskApiKey(key: string): string {
  if (key.length < 10) return "•".repeat(key.length);
  return key.slice(0, 4) + "•".repeat(key.length - 8) + key.slice(-4);
}

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

/** Derive the environment string from NODE_ENV */
export function getBackyEnvironment(): "prod" | "dev" {
  return process.env.NODE_ENV === "production" ? "prod" : "dev";
}

// ---------------------------------------------------------------------------
// Backup tag builder
// ---------------------------------------------------------------------------

/**
 * Build a Backy backup tag in the format:
 * v{version}-{date}-{links}lnk-{folders}fld-{tags}tag
 *
 * @param version  App version (e.g. "1.2.1")
 * @param counts   Object with links, folders, tags counts
 * @param date     Optional ISO date string (defaults to today)
 */
export function buildBackyTag(
  version: string,
  counts: { links: number; folders: number; tags: number },
  date?: string,
): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return `v${version}-${d}-${counts.links}lnk-${counts.folders}fld-${counts.tags}tag`;
}

// ---------------------------------------------------------------------------
// File size formatting
// ---------------------------------------------------------------------------

/** Format a byte count to a human-readable string (e.g. "1.2 MB") */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/** Format a date string as a relative time (e.g. "3 天前") */
export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}
