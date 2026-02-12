import { describe, it, expect, vi, beforeEach } from 'vitest';
import { D1Adapter } from '@/lib/auth-adapter';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/d1-client', () => ({
  executeD1Query: vi.fn(),
}));

import { executeD1Query } from '@/lib/db/d1-client';

const mockExecute = vi.mocked(executeD1Query);

const FIXED_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => FIXED_UUID });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = 1700000000000; // fixed epoch ms

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    emailVerified: NOW,
    image: 'https://img.example.com/alice.png',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('D1Adapter', () => {
  const adapter = D1Adapter();

  // ---- createUser --------------------------------------------------------

  describe('createUser', () => {
    it('inserts a new user and returns it', async () => {
      const row = userRow({ id: FIXED_UUID });
      mockExecute.mockResolvedValueOnce([row]);

      const emailVerified = new Date(NOW);
      const result = await adapter.createUser!({
        name: 'Alice',
        email: 'alice@example.com',
        emailVerified,
        image: 'https://img.example.com/alice.png',
        id: '', // ignored by adapter
      });

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        [FIXED_UUID, 'Alice', 'alice@example.com', NOW, 'https://img.example.com/alice.png']
      );
      expect(result).toEqual({
        id: FIXED_UUID,
        name: 'Alice',
        email: 'alice@example.com',
        emailVerified,
        image: 'https://img.example.com/alice.png',
      });
    });

    it('passes nulls for optional fields when missing', async () => {
      const row = userRow({ id: FIXED_UUID, name: null, emailVerified: null, image: null });
      mockExecute.mockResolvedValueOnce([row]);

      await adapter.createUser!({
        email: 'bob@example.com',
        id: '',
        emailVerified: null,
      });

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        [FIXED_UUID, null, 'bob@example.com', null, null]
      );
    });
  });

  // ---- getUser -----------------------------------------------------------

  describe('getUser', () => {
    it('returns user when found', async () => {
      mockExecute.mockResolvedValueOnce([userRow()]);

      const result = await adapter.getUser!('user-1');

      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', ['user-1']);
      expect(result).toEqual({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        emailVerified: new Date(NOW),
        image: 'https://img.example.com/alice.png',
      });
    });

    it('returns null when not found', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const result = await adapter.getUser!('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ---- getUserByEmail ----------------------------------------------------

  describe('getUserByEmail', () => {
    it('returns user when found', async () => {
      mockExecute.mockResolvedValueOnce([userRow()]);

      const result = await adapter.getUserByEmail!('alice@example.com');

      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM users WHERE email = ?', [
        'alice@example.com',
      ]);
      expect(result?.email).toBe('alice@example.com');
    });

    it('returns null when not found', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const result = await adapter.getUserByEmail!('nobody@example.com');

      expect(result).toBeNull();
    });
  });

  // ---- getUserByAccount --------------------------------------------------

  describe('getUserByAccount', () => {
    it('returns user when found', async () => {
      mockExecute.mockResolvedValueOnce([userRow()]);

      const result = await adapter.getUserByAccount!({
        provider: 'github',
        providerAccountId: 'gh-123',
        type: 'oauth',
      });

      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('JOIN accounts'), [
        'github',
        'gh-123',
      ]);
      expect(result?.id).toBe('user-1');
    });

    it('returns null when not found', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const result = await adapter.getUserByAccount!({
        provider: 'github',
        providerAccountId: 'nonexistent',
        type: 'oauth',
      });

      expect(result).toBeNull();
    });
  });

  // ---- updateUser --------------------------------------------------------

  describe('updateUser', () => {
    it('updates name only', async () => {
      mockExecute.mockResolvedValueOnce([userRow({ name: 'Bob' })]);

      const result = await adapter.updateUser!({ id: 'user-1', name: 'Bob' });

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET name = ? WHERE id = ? RETURNING *',
        ['Bob', 'user-1']
      );
      expect(result.name).toBe('Bob');
    });

    it('updates email only', async () => {
      mockExecute.mockResolvedValueOnce([userRow({ email: 'new@example.com' })]);

      await adapter.updateUser!({ id: 'user-1', email: 'new@example.com' });

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET email = ? WHERE id = ? RETURNING *',
        ['new@example.com', 'user-1']
      );
    });

    it('updates emailVerified with a date', async () => {
      const ts = 1700001000000;
      mockExecute.mockResolvedValueOnce([userRow({ emailVerified: ts })]);

      const result = await adapter.updateUser!({
        id: 'user-1',
        emailVerified: new Date(ts),
      });

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET emailVerified = ? WHERE id = ? RETURNING *',
        [ts, 'user-1']
      );
      expect(result.emailVerified).toEqual(new Date(ts));
    });

    it('updates emailVerified to null', async () => {
      mockExecute.mockResolvedValueOnce([userRow({ emailVerified: null })]);

      const result = await adapter.updateUser!({
        id: 'user-1',
        emailVerified: null,
      });

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET emailVerified = ? WHERE id = ? RETURNING *',
        [null, 'user-1']
      );
      expect(result.emailVerified).toBeNull();
    });

    it('updates image only', async () => {
      mockExecute.mockResolvedValueOnce([userRow({ image: 'https://new.png' })]);

      await adapter.updateUser!({ id: 'user-1', image: 'https://new.png' });

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET image = ? WHERE id = ? RETURNING *',
        ['https://new.png', 'user-1']
      );
    });

    it('updates multiple fields at once', async () => {
      mockExecute.mockResolvedValueOnce([
        userRow({ name: 'Charlie', email: 'charlie@example.com' }),
      ]);

      await adapter.updateUser!({
        id: 'user-1',
        name: 'Charlie',
        email: 'charlie@example.com',
      });

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET name = ?, email = ? WHERE id = ? RETURNING *',
        ['Charlie', 'charlie@example.com', 'user-1']
      );
    });
  });

  // ---- deleteUser --------------------------------------------------------

  describe('deleteUser', () => {
    it('deletes the user by id', async () => {
      mockExecute.mockResolvedValueOnce([]);

      await adapter.deleteUser!('user-1');

      expect(mockExecute).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', ['user-1']);
    });
  });

  // ---- linkAccount -------------------------------------------------------

  describe('linkAccount', () => {
    it('inserts account with all fields', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const account = {
        userId: 'user-1',
        type: 'oauth' as const,
        provider: 'github',
        providerAccountId: 'gh-123',
        refresh_token: 'rt-abc',
        access_token: 'at-xyz',
        expires_at: 3600,
        token_type: 'bearer',
        scope: 'read:user',
        id_token: 'id-tok',
        session_state: 'active',
      };

      const result = await adapter.linkAccount!(account);

      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO accounts'), [
        FIXED_UUID,
        'user-1',
        'oauth',
        'github',
        'gh-123',
        'rt-abc',
        'at-xyz',
        3600,
        'bearer',
        'read:user',
        'id-tok',
        'active',
      ]);
      expect(result).toBe(account);
    });

    it('passes null for optional nullable fields', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const account = {
        userId: 'user-1',
        type: 'oauth' as const,
        provider: 'google',
        providerAccountId: 'g-456',
      };

      await adapter.linkAccount!(account);

      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO accounts'), [
        FIXED_UUID,
        'user-1',
        'oauth',
        'google',
        'g-456',
        null, // refresh_token
        null, // access_token
        null, // expires_at
        null, // token_type
        null, // scope
        null, // id_token
        null, // session_state
      ]);
    });
  });

  // ---- unlinkAccount -----------------------------------------------------

  describe('unlinkAccount', () => {
    it('deletes by provider + providerAccountId', async () => {
      mockExecute.mockResolvedValueOnce([]);

      await adapter.unlinkAccount!({ provider: 'github', providerAccountId: 'gh-123' });

      expect(mockExecute).toHaveBeenCalledWith(
        'DELETE FROM accounts WHERE provider = ? AND providerAccountId = ?',
        ['github', 'gh-123']
      );
    });
  });

  // ---- createSession -----------------------------------------------------

  describe('createSession', () => {
    it('inserts session and returns input', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const expires = new Date(NOW);
      const session = {
        sessionToken: 'tok-abc',
        userId: 'user-1',
        expires,
      };

      const result = await adapter.createSession!(session);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        [FIXED_UUID, 'tok-abc', 'user-1', NOW]
      );
      expect(result).toBe(session);
    });
  });

  // ---- getSessionAndUser -------------------------------------------------

  describe('getSessionAndUser', () => {
    it('returns session and user when found', async () => {
      mockExecute.mockResolvedValueOnce([
        {
          sessionToken: 'tok-abc',
          userId: 'user-1',
          expires: NOW,
          u_id: 'user-1',
          u_name: 'Alice',
          u_email: 'alice@example.com',
          u_emailVerified: NOW,
          u_image: 'https://img.example.com/alice.png',
        },
      ]);

      const result = await adapter.getSessionAndUser!('tok-abc');

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('JOIN users u ON s.userId = u.id'),
        ['tok-abc']
      );
      expect(result).toEqual({
        session: {
          sessionToken: 'tok-abc',
          userId: 'user-1',
          expires: new Date(NOW),
        },
        user: {
          id: 'user-1',
          name: 'Alice',
          email: 'alice@example.com',
          emailVerified: new Date(NOW),
          image: 'https://img.example.com/alice.png',
        },
      });
    });

    it('returns null when not found', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const result = await adapter.getSessionAndUser!('nonexistent');

      expect(result).toBeNull();
    });

    it('handles null emailVerified for user', async () => {
      mockExecute.mockResolvedValueOnce([
        {
          sessionToken: 'tok-abc',
          userId: 'user-1',
          expires: NOW,
          u_id: 'user-1',
          u_name: 'Alice',
          u_email: 'alice@example.com',
          u_emailVerified: null,
          u_image: null,
        },
      ]);

      const result = await adapter.getSessionAndUser!('tok-abc');

      expect(result!.user.emailVerified).toBeNull();
      expect(result!.user.image).toBeNull();
    });
  });

  // ---- updateSession -----------------------------------------------------

  describe('updateSession', () => {
    it('updates expires only', async () => {
      const newExpires = NOW + 86400000;
      mockExecute.mockResolvedValueOnce([
        { sessionToken: 'tok-abc', userId: 'user-1', expires: newExpires },
      ]);

      const result = await adapter.updateSession!({
        sessionToken: 'tok-abc',
        expires: new Date(newExpires),
      });

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE sessions SET expires = ? WHERE sessionToken = ? RETURNING *',
        [newExpires, 'tok-abc']
      );
      expect(result).toEqual({
        sessionToken: 'tok-abc',
        userId: 'user-1',
        expires: new Date(newExpires),
      });
    });

    it('updates userId only', async () => {
      mockExecute.mockResolvedValueOnce([
        { sessionToken: 'tok-abc', userId: 'user-2', expires: NOW },
      ]);

      const result = await adapter.updateSession!({
        sessionToken: 'tok-abc',
        userId: 'user-2',
      });

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE sessions SET userId = ? WHERE sessionToken = ? RETURNING *',
        ['user-2', 'tok-abc']
      );
      expect(result!.userId).toBe('user-2');
    });

    it('updates both expires and userId', async () => {
      const newExpires = NOW + 86400000;
      mockExecute.mockResolvedValueOnce([
        { sessionToken: 'tok-abc', userId: 'user-2', expires: newExpires },
      ]);

      await adapter.updateSession!({
        sessionToken: 'tok-abc',
        expires: new Date(newExpires),
        userId: 'user-2',
      });

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE sessions SET expires = ?, userId = ? WHERE sessionToken = ? RETURNING *',
        [newExpires, 'user-2', 'tok-abc']
      );
    });

    it('returns null when no fields to update', async () => {
      const result = await adapter.updateSession!({ sessionToken: 'tok-abc' });

      expect(mockExecute).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('returns null when row not found', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const result = await adapter.updateSession!({
        sessionToken: 'tok-abc',
        userId: 'user-2',
      });

      expect(result).toBeNull();
    });
  });

  // ---- deleteSession -----------------------------------------------------

  describe('deleteSession', () => {
    it('deletes by sessionToken', async () => {
      mockExecute.mockResolvedValueOnce([]);

      await adapter.deleteSession!('tok-abc');

      expect(mockExecute).toHaveBeenCalledWith(
        'DELETE FROM sessions WHERE sessionToken = ?',
        ['tok-abc']
      );
    });
  });

  // ---- createVerificationToken -------------------------------------------

  describe('createVerificationToken', () => {
    it('inserts token and returns input', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const expires = new Date(NOW);
      const token = {
        identifier: 'alice@example.com',
        token: 'vt-abc',
        expires,
      };

      const result = await adapter.createVerificationToken!(token);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO verificationTokens'),
        ['alice@example.com', 'vt-abc', NOW]
      );
      expect(result).toBe(token);
    });
  });

  // ---- useVerificationToken ----------------------------------------------

  describe('useVerificationToken', () => {
    it('deletes and returns token when found', async () => {
      mockExecute.mockResolvedValueOnce([
        { identifier: 'alice@example.com', token: 'vt-abc', expires: NOW },
      ]);

      const result = await adapter.useVerificationToken!({
        identifier: 'alice@example.com',
        token: 'vt-abc',
      });

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM verificationTokens'),
        ['alice@example.com', 'vt-abc']
      );
      expect(result).toEqual({
        identifier: 'alice@example.com',
        token: 'vt-abc',
        expires: new Date(NOW),
      });
    });

    it('returns null when not found', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const result = await adapter.useVerificationToken!({
        identifier: 'nobody@example.com',
        token: 'nonexistent',
      });

      expect(result).toBeNull();
    });
  });
});
