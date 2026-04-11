/**
 * API Audit Logging
 *
 * Fire-and-forget logging for API key usage.
 * Logs are stored in D1 for future querying.
 */

import { executeD1Query } from "@/lib/db/d1-client";
import { nanoid } from "nanoid";

export interface AuditLogEntry {
  keyId: string;
  keyPrefix: string;
  userId: string;
  endpoint: string;
  method: string;
  statusCode: number;
}

/**
 * Log an API request (fire-and-forget).
 *
 * This function does not throw errors — failures are silently ignored
 * to avoid affecting the main request flow.
 *
 * @param entry - The audit log entry to record
 */
export function logApiRequest(entry: AuditLogEntry): void {
  // Fire-and-forget: don't await, catch errors silently
  recordAuditLog(entry).catch(() => {
    // Silently ignore errors — audit logging should never affect requests
  });
}

/**
 * Internal function to record audit log to D1.
 * Exported for testing purposes.
 */
export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  const id = nanoid();
  const timestamp = Math.floor(Date.now() / 1000);

  await executeD1Query(
    `INSERT INTO api_audit_logs (id, key_id, key_prefix, user_id, endpoint, method, status_code, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.keyId,
      entry.keyPrefix,
      entry.userId,
      entry.endpoint,
      entry.method,
      entry.statusCode,
      timestamp,
    ],
  );
}

/**
 * Get audit logs for a specific API key.
 * Useful for debugging and monitoring.
 *
 * @param keyId - The API key ID to query logs for
 * @param limit - Maximum number of logs to return (default 100)
 * @returns Array of audit log entries (most recent first)
 */
export async function getAuditLogs(
  keyId: string,
  limit: number = 100,
): Promise<{
  id: string;
  keyId: string;
  keyPrefix: string;
  userId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  timestamp: Date;
}[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT * FROM api_audit_logs WHERE key_id = ? ORDER BY timestamp DESC LIMIT ?`,
    [keyId, limit],
  );

  return rows.map((row) => ({
    id: row.id as string,
    keyId: row.key_id as string,
    keyPrefix: row.key_prefix as string,
    userId: row.user_id as string,
    endpoint: row.endpoint as string,
    method: row.method as string,
    statusCode: row.status_code as number,
    timestamp: new Date((row.timestamp as number) * 1000),
  }));
}

/**
 * Get recent audit logs for a user (across all their keys).
 *
 * @param userId - The user ID to query logs for
 * @param limit - Maximum number of logs to return (default 100)
 */
export async function getAuditLogsByUser(
  userId: string,
  limit: number = 100,
): Promise<{
  id: string;
  keyId: string;
  keyPrefix: string;
  userId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  timestamp: Date;
}[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT * FROM api_audit_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?`,
    [userId, limit],
  );

  return rows.map((row) => ({
    id: row.id as string,
    keyId: row.key_id as string,
    keyPrefix: row.key_prefix as string,
    userId: row.user_id as string,
    endpoint: row.endpoint as string,
    method: row.method as string,
    statusCode: row.status_code as number,
    timestamp: new Date((row.timestamp as number) * 1000),
  }));
}
