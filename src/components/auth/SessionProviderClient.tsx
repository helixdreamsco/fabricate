"use client";
import { SessionProvider } from "next-auth/react";

/**
 * Thin wrapper so the root layout (server component) can mount the
 * NextAuth client SessionProvider. Required by `useSession()` consumers
 * — currently only the legal consent form, which calls `update()` to
 * refresh JWT versions after acceptance.
 */
export function SessionProviderClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
