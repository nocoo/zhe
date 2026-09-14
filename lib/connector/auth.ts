import { executeD1Query } from "@/lib/db/d1-client";

export type ConnectorIdentity = { userId: string; keyId: string };

// Reuse CLI login, expiry/revocation and user binding at the mutation itself too.
export const ACTIVE_KEY_SQL = `EXISTS (
  SELECT 1 FROM api_keys WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > ?) AND (',' || scopes || ',') LIKE '%,connector:write,%'
)`;

export function activeKeyParams(auth: ConnectorIdentity, now: number): unknown[] {
  return [auth.keyId, auth.userId, Math.floor(now / 1000)];
}

export async function connectorKeyActive(
  auth: ConnectorIdentity,
  now = Date.now(),
): Promise<boolean> {
  return (
    (await executeD1Query(`SELECT 1 WHERE ${ACTIVE_KEY_SQL}`, activeKeyParams(auth, now))).length >
    0
  );
}
