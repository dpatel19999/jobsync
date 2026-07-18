import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
    };
  }
}

export const authConfig = {
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  secret: process.env.AUTH_SECRET,
  // Explicit rather than implicit framework default: JWT sessions expire
  // after 30 days. Acceptable for a fully-local single-user app; revisit if
  // this ever gets deployed anywhere reachable by others.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isApiRoute = nextUrl.pathname.startsWith("/api");

      if (isOnDashboard || isApiRoute) {
        return isLoggedIn;
      } else if (isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      const userId = (token.id as string) || token.sub;
      if (userId) {
        session.user.id = userId;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
