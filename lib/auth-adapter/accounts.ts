/** D1 helpers for OAuth account links. */

import type { AdapterAccount } from '@auth/core/adapters';
import { executeD1Query } from '../db/d1-client';
import { generateId } from './users';

export async function linkAccount(account: AdapterAccount): Promise<AdapterAccount> {
  const id = generateId();
  await executeD1Query(
    `INSERT INTO accounts (id, userId, type, provider, providerAccountId, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      account.userId,
      account.type,
      account.provider,
      account.providerAccountId,
      account.refresh_token ?? null,
      account.access_token ?? null,
      account.expires_at ?? null,
      account.token_type ?? null,
      account.scope ?? null,
      account.id_token ?? null,
      account.session_state ?? null,
    ],
  );
  return account;
}

export async function unlinkAccount(
  providerAccountId: string,
  provider: string,
): Promise<void> {
  await executeD1Query(
    'DELETE FROM accounts WHERE provider = ? AND providerAccountId = ?',
    [provider, providerAccountId],
  );
}
