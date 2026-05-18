/** D1 helpers for sessions. */

import { executeD1Query } from '../db/d1-client';
import { generateId, type AdapterUser } from './users';

export interface AdapterSession {
  sessionToken: string;
  userId: string;
  expires: Date;
}

function rowToSession(row: Record<string, unknown>): AdapterSession {
  return {
    sessionToken: row.sessionToken as string,
    userId: row.userId as string,
    expires: new Date(row.expires as number),
  };
}

export async function createSession(session: AdapterSession): Promise<AdapterSession> {
  const id = generateId();
  await executeD1Query(
    `INSERT INTO sessions (id, sessionToken, userId, expires)
     VALUES (?, ?, ?, ?)`,
    [id, session.sessionToken, session.userId, session.expires.getTime()],
  );
  return session;
}

export async function getSessionAndUser(
  sessionToken: string,
): Promise<{ session: AdapterSession; user: AdapterUser } | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT s.*, u.id as u_id, u.name as u_name, u.email as u_email, u.emailVerified as u_emailVerified, u.image as u_image
     FROM sessions s
     JOIN users u ON s.userId = u.id
     WHERE s.sessionToken = ?`,
    [sessionToken],
  );

  if (!rows[0]) return null;
  const row = rows[0];
  return {
    session: {
      sessionToken: row.sessionToken as string,
      userId: row.userId as string,
      expires: new Date(row.expires as number),
    },
    user: {
      id: row.u_id as string,
      name: row.u_name as string | null,
      email: row.u_email as string,
      emailVerified: row.u_emailVerified ? new Date(row.u_emailVerified as number) : null,
      image: row.u_image as string | null,
    },
  };
}

export async function updateSession(
  session: Partial<AdapterSession> & { sessionToken: string },
): Promise<AdapterSession | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (session.expires) {
    setClauses.push('expires = ?');
    params.push(session.expires.getTime());
  }
  if (session.userId) {
    setClauses.push('userId = ?');
    params.push(session.userId);
  }

  if (setClauses.length === 0) return null;

  params.push(session.sessionToken);
  const rows = await executeD1Query<Record<string, unknown>>(
    `UPDATE sessions SET ${setClauses.join(', ')} WHERE sessionToken = ? RETURNING *`,
    params,
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function deleteSession(sessionToken: string): Promise<void> {
  await executeD1Query('DELETE FROM sessions WHERE sessionToken = ?', [sessionToken]);
}
