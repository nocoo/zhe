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

if (process.env.PLAYWRIGHT === '1') {
  providers.push(
    Credentials({
      id: 'e2e-credentials',
      name: 'E2E Test Login',
      credentials: {
        email: { label: 'Email', type: 'email' },
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
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

// When PLAYWRIGHT=1 is set, force JWT strategy and skip adapter
// so tests run without D1 dependency for auth.
const useAdapter = isD1Configured() && process.env.PLAYWRIGHT !== '1';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  adapter: useAdapter ? D1Adapter() : undefined,
  session: {
    strategy: useAdapter ? 'database' : 'jwt',
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
    session({ session, user, token }) {
      // When using database strategy, user comes from the database
      if (user && session.user) {
        session.user.id = user.id;
      }
      // When using JWT strategy, user id comes from the token
      if (token?.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
