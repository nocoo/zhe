import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { D1Adapter } from "@/lib/auth-adapter";
import { signInCallback } from "@/lib/auth-allowlist";
import { isD1Configured } from "@/lib/db/d1-client";

import { authorizeLocalIdentity, localIdentityEnabled } from "@/lib/local-identity";

const providers: Provider[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID ?? "",
    clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
  }),
];
if (localIdentityEnabled()) {
  providers.push(
    Credentials({
      id: "local-fixture",
      name: "Local fixture account",
      credentials: { token: { type: "password" } },
      authorize: (credentials) => authorizeLocalIdentity(credentials.token),
    }),
  );
}
const useAdapter = isD1Configured();

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  ...(useAdapter && { adapter: D1Adapter() }),
  session: {
    strategy: "jwt",
  },
  providers,
  pages: {
    signIn: "/",
  },
  callbacks: {
    signIn({ user, account }) {
      return signInCallback({ user, account });
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect to login
      }

      return true;
    },
    jwt({ token, user }) {
      // On sign-in, persist the database user id into the JWT
      if (user?.id) {
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
