import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { D1Adapter } from '@/lib/auth-adapter';
import { isD1Configured } from '@/lib/db/d1-client';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  adapter: isD1Configured() ? D1Adapter() : undefined,
  session: {
    // Use JWT strategy when no adapter, database strategy when adapter is present
    strategy: isD1Configured() ? 'database' : 'jwt',
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
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
    session({ session, user }) {
      // When using database strategy, user comes from the database
      if (user && session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
