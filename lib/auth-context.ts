import { cache } from 'react';
import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';

/**
 * Deduplicated auth() — cached within a single React server render.
 * For server components and layout renders this avoids multiple D1 session
 * lookups. Server Actions are separate requests so each still calls once.
 */
export const getSession = cache(() => auth());

/**
 * Get a ScopedDB instance for the current authenticated user.
 * Returns null if not authenticated.
 */
export async function getScopedDB(): Promise<ScopedDB | null> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  return new ScopedDB(userId);
}

/**
 * Get a ScopedDB instance and userId for the current authenticated user.
 * Useful when the raw userId is needed (e.g. for R2 key hashing).
 * Returns null if not authenticated.
 */
export async function getAuthContext(): Promise<{ db: ScopedDB; userId: string } | null> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  return { db: new ScopedDB(userId), userId };
}

/**
 * Verify the current user is authenticated and return the userId.
 * Returns null if not authenticated.
 */
export async function requireAuth(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}
