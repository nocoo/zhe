/** D1 helpers for one-time verification tokens (magic-link flow). */

import { executeD1Query } from '../db/d1-client';

export interface AdapterVerificationToken {
  identifier: string;
  token: string;
  expires: Date;
}

export async function createVerificationToken(
  token: AdapterVerificationToken,
): Promise<AdapterVerificationToken> {
  await executeD1Query(
    `INSERT INTO verificationTokens (identifier, token, expires)
     VALUES (?, ?, ?)`,
    [token.identifier, token.token, token.expires.getTime()],
  );
  return token;
}

/** Consume the token; returns null if no matching row existed. */
// `use` prefix is the NextAuth adapter API contract, not a React hook.
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
export async function useVerificationToken(
  identifier: string,
  token: string,
): Promise<AdapterVerificationToken | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `DELETE FROM verificationTokens WHERE identifier = ? AND token = ? RETURNING *`,
    [identifier, token],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    identifier: row.identifier as string,
    token: row.token as string,
    expires: new Date(row.expires as number),
  };
}
