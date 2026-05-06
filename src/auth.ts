import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./lib/prisma";
import { authConfig } from "./auth.config";
import { verifyPassword } from "./lib/passwords";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { prompt: "select_account" } },
    }),
    Credentials({
      // Email + password sign-in for users who don't / won't use Google.
      // Sign-up happens via /api/auth/signup (which seeds the User row +
      // sends a verification email). This provider only handles the
      // sign-in step: look up by email, verify the bcrypt hash, refuse
      // if the email isn't yet verified.
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const email =
          typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
        const password =
          typeof raw?.password === "string" ? raw.password : "";
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;
        if (!user.emailVerified) {
          // Throw a known string so the client can show the "verify your
          // email first" prompt instead of "wrong password".
          throw new Error("EMAIL_NOT_VERIFIED");
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    // On first sign-in, NextAuth passes the DB user; stash its id into the JWT
    // so we can resolve it cheaply on every request without hitting the DB.
    // Also stash the user's accepted terms/privacy versions so the proxy
    // (Edge runtime, no DB access) can run the consent gate from the JWT
    // alone. Refreshed via `useSession().update()` after acceptance.
    async jwt({ token, user, trigger, session }) {
      if (user?.id) {
        token.id = user.id;
        // The PrismaAdapter passes the full DB row at sign-in. Stash the
        // accepted-version pointers so the proxy can read them without
        // hitting the DB. This keeps the callback Edge-safe (no prisma).
        const u = user as typeof user & {
          acceptedTermsVersion?: number;
          acceptedPrivacyVersion?: number;
        };
        token.acceptedTermsVersion = u.acceptedTermsVersion ?? 0;
        token.acceptedPrivacyVersion = u.acceptedPrivacyVersion ?? 0;
      }
      // After acceptance, the client calls update({ ... }) which arrives
      // here as `trigger === "update"` with the new versions in `session`.
      // Merge them into the JWT without re-reading the DB.
      if (trigger === "update" && session && typeof session === "object") {
        const s = session as {
          acceptedTermsVersion?: number;
          acceptedPrivacyVersion?: number;
        };
        if (typeof s.acceptedTermsVersion === "number") {
          token.acceptedTermsVersion = s.acceptedTermsVersion;
        }
        if (typeof s.acceptedPrivacyVersion === "number") {
          token.acceptedPrivacyVersion = s.acceptedPrivacyVersion;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.id) {
        session.user.id = token.id as string;
      } else if (session.user?.email) {
        // Fallback for users whose JWT was minted before the `jwt` callback
        // started stashing `token.id` — look up by email so they don't need
        // to sign out and back in.
        const u = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true },
        });
        if (u && session.user) session.user.id = u.id;
      }
      // Expose consent versions on the session for the middleware gate to
      // read without a DB roundtrip.
      const s = session as typeof session & {
        acceptedTermsVersion?: number;
        acceptedPrivacyVersion?: number;
      };
      s.acceptedTermsVersion =
        (token?.acceptedTermsVersion as number | undefined) ?? 0;
      s.acceptedPrivacyVersion =
        (token?.acceptedPrivacyVersion as number | undefined) ?? 0;
      return session;
    },
  },
});
