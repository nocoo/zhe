/** D1 helpers for the Auth.js User model. */

import type { AdapterUser } from '@auth/core/adapters';
import { executeD1Query } from '../db/d1-client';

export function generateId(): string {
  return crypto.randomUUID();
}

export function rowToUser(row: Record<string, unknown>): AdapterUser {
  return {
    id: row.id as string,
    name: (row.name as string | null) ?? undefined,
    email: row.email as string,
    emailVerified: row.emailVerified ? new Date(row.emailVerified as number) : null,
    image: (row.image as string | null) ?? undefined,
  } as AdapterUser;
}

export async function createUser(user: AdapterUser): Promise<AdapterUser> {
  const id = generateId();
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO users (id, name, email, emailVerified, image)
     VALUES (?, ?, ?, ?, ?)
     RETURNING *`,
    [id, user.name ?? null, user.email, user.emailVerified?.getTime() ?? null, user.image ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT RETURNING * returned no rows');
  return rowToUser(row);
}

export async function getUser(id: string): Promise<AdapterUser | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM users WHERE id = ?',
    [id],
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<AdapterUser | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM users WHERE email = ?',
    [email],
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByAccount(
  providerAccountId: string,
  provider: string,
): Promise<AdapterUser | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT u.* FROM users u
     JOIN accounts a ON u.id = a.userId
     WHERE a.provider = ? AND a.providerAccountId = ?`,
    [provider, providerAccountId],
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function updateUser(
  user: Partial<AdapterUser> & { id: string },
): Promise<AdapterUser> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (user.name !== undefined) { setClauses.push('name = ?'); params.push(user.name); }
  if (user.email !== undefined) { setClauses.push('email = ?'); params.push(user.email); }
  if (user.emailVerified !== undefined) {
    setClauses.push('emailVerified = ?');
    params.push(user.emailVerified?.getTime() ?? null);
  }
  if (user.image !== undefined) { setClauses.push('image = ?'); params.push(user.image); }

  params.push(user.id);

  const rows = await executeD1Query<Record<string, unknown>>(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = ? RETURNING *`,
    params,
  );
  const row = rows[0];
  if (!row) throw new Error('UPDATE RETURNING * returned no rows');
  return rowToUser(row);
}

export type { AdapterUser };

export async function deleteUser(userId: string): Promise<void> {
  await executeD1Query('DELETE FROM users WHERE id = ?', [userId]);
}
