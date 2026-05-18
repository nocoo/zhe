/**
 * Custom Auth.js Adapter for Cloudflare D1 via HTTP API.
 *
 * Each table's CRUD lives in ./auth-adapter/*.ts as plain async functions.
 * D1Adapter() below is a thin wrapper that satisfies the Adapter contract by
 * delegating to those helpers. Keeping the adapter as a literal of small
 * arrow functions (one per Auth.js callback) avoids needing intermediate
 * type adapters between AdapterAccount / AdapterUser shapes from @auth/core
 * and our internal shapes.
 */

import type { Adapter } from '@auth/core/adapters';
import * as users from './auth-adapter/users';
import * as accounts from './auth-adapter/accounts';
import * as sessions from './auth-adapter/sessions';
import * as verificationTokens from './auth-adapter/verification-tokens';

export function D1Adapter(): Adapter {
  return {
    createUser: (user) => users.createUser(user),
    getUser: (id) => users.getUser(id),
    getUserByEmail: (email) => users.getUserByEmail(email),
    getUserByAccount: ({ providerAccountId, provider }) =>
      users.getUserByAccount(providerAccountId, provider),
    updateUser: (user) => users.updateUser(user),
    deleteUser: (userId) => users.deleteUser(userId),

    linkAccount: (account) => accounts.linkAccount(account),
    unlinkAccount: ({ providerAccountId, provider }) =>
      accounts.unlinkAccount(providerAccountId, provider),

    createSession: (session) => sessions.createSession(session),
    getSessionAndUser: (sessionToken) => sessions.getSessionAndUser(sessionToken),
    updateSession: (session) => sessions.updateSession(session),
    deleteSession: (sessionToken) => sessions.deleteSession(sessionToken),

    createVerificationToken: (token) => verificationTokens.createVerificationToken(token),
    useVerificationToken: ({ identifier, token }) =>
      verificationTokens.useVerificationToken(identifier, token),
  };
}
