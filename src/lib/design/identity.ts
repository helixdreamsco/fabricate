import { createHmac, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/auth";

/**
 * Design jobs are owned by a signed-in user when there is one, else by a
 * signed anonymous cookie id — mirroring how the landing page lets guests
 * start an upload before signing in. AI jobs additionally REQUIRE a user
 * (quota + moderation audit); that's enforced at the route.
 */
export type DesignIdentity =
  | { userId: string; anonId: null }
  | { userId: null; anonId: string };

const COOKIE = "fab_design_id";
const SECRET = process.env.AUTH_SECRET ?? "dev-only-design-secret";

function sign(id: string): string {
  return createHmac("sha256", SECRET).update(id).digest("hex").slice(0, 16);
}

export async function getDesignIdentity(): Promise<DesignIdentity> {
  const session = await auth();
  if (session?.user?.id) return { userId: session.user.id, anonId: null };

  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    const [id, sig] = raw.split(".");
    if (id && sig === sign(id)) return { userId: null, anonId: id };
  }
  const id = randomUUID();
  try {
    jar.set(COOKIE, `${id}.${sign(id)}`, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  } catch {
    // read-only context (server component render) — transient id; the
    // cookie is set on the next route-handler request.
  }
  return { userId: null, anonId: id };
}

/** Prisma where-clause fragment matching jobs owned by this identity. */
export function ownerWhere(identity: DesignIdentity) {
  return identity.userId
    ? { userId: identity.userId }
    : { anonId: identity.anonId };
}
