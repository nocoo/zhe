/**
 * Custom Auth.js Adapter for Cloudflare D1 via HTTP API.
 */

import type { Adapter } from '@auth/core/adapters';
import { executeD1Query } from './db/d1-client';

function generateId(): string {
  return crypto.randomUUID();
}

function rowToUser(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string | null,
    email: row.email as string,
    emailVerified: row.emailVerified ? new Date(row.emailVerified as number) : null,
    image: row.image as string | null,
  };
}

export function D1Adapter(): Adapter {
  return {
    async createUser(user) {
      const id = generateId();
      const rows = await executeD1Query<Record<string, unknown>>(
        `INSERT INTO users (id, name, email, emailVerified, image)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *`,
        [id, user.name ?? null, user.email, user.emailVerified?.getTime() ?? null, user.image ?? null]
      );

      return rowToUser(rows[0]);
    },

    async getUser(id) {
      const rows = await executeD1Query<Record<string, unknown>>(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );

      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async getUserByEmail(email) {
      const rows = await executeD1Query<Record<string, unknown>>(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );

      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const rows = await executeD1Query<Record<string, unknown>>(
        `SELECT u.* FROM users u
         JOIN accounts a ON u.id = a.userId
         WHERE a.provider = ? AND a.providerAccountId = ?`,
        [provider, providerAccountId]
      );

      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async updateUser(user) {
      const setClauses: string[] = [];
      const params: unknown[] = [];

      if (user.name !== undefined) {
        setClauses.push('name = ?');
        params.push(user.name);
      }
      if (user.email !== undefined) {
        setClauses.push('email = ?');
        params.push(user.email);
      }
      if (user.emailVerified !== undefined) {
        setClauses.push('emailVerified = ?');
        params.push(user.emailVerified?.getTime() ?? null);
      }
      if (user.image !== undefined) {
        setClauses.push('image = ?');
        params.push(user.image);
      }

      params.push(user.id);

      const rows = await executeD1Query<Record<string, unknown>>(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = ? RETURNING *`,
        params
      );

      return rowToUser(rows[0]);
    },

    async deleteUser(userId) {
      await executeD1Query('DELETE FROM users WHERE id = ?', [userId]);
    },

    async linkAccount(account) {
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
        ]
      );

      return account;
    },

    async unlinkAccount({ providerAccountId, provider }) {
      await executeD1Query(
        'DELETE FROM accounts WHERE provider = ? AND providerAccountId = ?',
        [provider, providerAccountId]
      );
    },

    async createSession(session) {
      const id = generateId();
      await executeD1Query(
        `INSERT INTO sessions (id, sessionToken, userId, expires)
         VALUES (?, ?, ?, ?)`,
        [id, session.sessionToken, session.userId, session.expires.getTime()]
      );

      return session;
    },

    async getSessionAndUser(sessionToken) {
      const rows = await executeD1Query<Record<string, unknown>>(
        `SELECT s.*, u.id as u_id, u.name as u_name, u.email as u_email, u.emailVerified as u_emailVerified, u.image as u_image
         FROM sessions s
         JOIN users u ON s.userId = u.id
         WHERE s.sessionToken = ?`,
        [sessionToken]
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
    },

    async updateSession(session) {
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
        params
      );

      if (!rows[0]) return null;

      const row = rows[0];
      return {
        sessionToken: row.sessionToken as string,
        userId: row.userId as string,
        expires: new Date(row.expires as number),
      };
    },

    async deleteSession(sessionToken) {
      await executeD1Query('DELETE FROM sessions WHERE sessionToken = ?', [sessionToken]);
    },

    async createVerificationToken(token) {
      await executeD1Query(
        `INSERT INTO verificationTokens (identifier, token, expires)
         VALUES (?, ?, ?)`,
        [token.identifier, token.token, token.expires.getTime()]
      );

      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const rows = await executeD1Query<Record<string, unknown>>(
        `DELETE FROM verificationTokens WHERE identifier = ? AND token = ? RETURNING *`,
        [identifier, token]
      );

      if (!rows[0]) return null;

      const row = rows[0];
      return {
        identifier: row.identifier as string,
        token: row.token as string,
        expires: new Date(row.expires as number),
      };
    },
  };
}
