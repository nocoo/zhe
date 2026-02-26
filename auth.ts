import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { D1Adapter } from '@/lib/auth-adapter';
import { isD1Configured } from '@/lib/db/d1-client';

// Build the providers list. In Playwright E2E mode, add a Credentials
// provider so tests can authenticate without Google OAuth.
const providers: Provider[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
  }),
];

if (process.env.PLAYWRIGHT === '1' && process.env.NODE_ENV !== 'production') {
  providers.push(
    Credentials({
      id: 'e2e-credentials',
      name: 'E2E Test Login',
      credentials: {
        email: { label: 'Email', type: 'email' },
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        // Only accept the exact E2E test email — defense-in-depth
        if (credentials?.email !== 'e2e@test.local') return null;
        return {
          id: 'e2e-test-user-id',
          name: (credentials.name as string) || 'E2E Test User',
          email: credentials.email as string,
          image: null,
        };
      },
    }),
  );
}

// When PLAYWRIGHT=1 is set, skip adapter so tests run without D1.
// The adapter is still used in production for OAuth user creation/linking,
// but session strategy is always JWT to avoid per-request D1 session lookups.
const useAdapter = isD1Configured() && process.env.PLAYWRIGHT !== '1';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  adapter: useAdapter ? D1Adapter() : undefined,
  session: {
    strategy: 'jwt',
  },
  providers,
  pages: {
    signIn: '/',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect to login
      }
      
      return true;
    },
    jwt({ token, user }) {
      // On sign-in, persist the database user id into the JWT
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      // JWT strategy: user id always comes from the token
      if (token?.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
