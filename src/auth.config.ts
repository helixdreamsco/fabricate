import type { NextAuthConfig } from "next-auth";

/**
 * Shared NextAuth config — no providers. This is split out so middleware
 * and edge contexts can import it without pulling in provider SDKs.
 *
 * Mirrors Genome's layout (`~/Desktop/co-lab/src/auth.config.ts`).
 */
export const authConfig = {
  pages: {
    signIn: "/account",
  },
  session: { strategy: "jwt" },
  providers: [],
} satisfies NextAuthConfig;
