// Pure business logic for Discord bot integration — no React, no DOM.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Discord bot configuration stored in user_settings */
export interface DiscordBotConfig {
  botToken: string;
  publicKey: string;
  applicationId: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Check whether a string looks like a Discord bot token.
 * Discord tokens have 3+ dot-separated segments: {base64_id}.{timestamp}.{hmac}
 */
export function isValidBotToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  const segments = trimmed.split('.');
  return segments.length >= 3 && segments.every((s) => s.length > 0);
}

/**
 * Check whether a string is a valid Discord public key.
 * Public keys are 64-character hex strings (Ed25519).
 */
export function isValidPublicKey(key: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(key);
}

/**
 * Check whether a string is a valid Discord application ID.
 * Application IDs are numeric snowflakes.
 */
export function isValidApplicationId(id: string): boolean {
  return /^\d+$/.test(id) && id.length > 0;
}

/** Validate Discord bot config (all three fields must be present and valid) */
export function validateDiscordBotConfig(
  config: Partial<DiscordBotConfig>,
): { valid: true } | { valid: false; error: string } {
  if (!config.botToken?.trim()) {
    return { valid: false, error: 'Bot Token 不能为空' };
  }
  if (!isValidBotToken(config.botToken)) {
    return { valid: false, error: 'Bot Token 格式无效' };
  }
  if (!config.publicKey?.trim()) {
    return { valid: false, error: 'Public Key 不能为空' };
  }
  if (!isValidPublicKey(config.publicKey)) {
    return { valid: false, error: 'Public Key 格式无效（需要 64 位十六进制字符串）' };
  }
  if (!config.applicationId?.trim()) {
    return { valid: false, error: 'Application ID 不能为空' };
  }
  if (!isValidApplicationId(config.applicationId)) {
    return { valid: false, error: 'Application ID 格式无效（需要纯数字）' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Secret masking
// ---------------------------------------------------------------------------

/**
 * Mask a secret string for display: show first 4 and last 4 chars, mask the rest.
 * Secrets shorter than 10 chars are fully masked.
 */
export function maskSecret(secret: string): string {
  if (secret.length < 10) return '•'.repeat(secret.length);
  return secret.slice(0, 4) + '•'.repeat(secret.length - 8) + secret.slice(-4);
}
