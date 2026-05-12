import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  AFFILIATE_COOKIE,
  AFFILIATE_COOKIE_TTL_DAYS,
  attachCodeOnce,
  normaliseCode,
} from "@/lib/affiliate";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

/**
 * Affiliate share-link landing page. /r/<code> drops a cookie with the
 * normalised code and redirects:
 *   - logged-in user with no prior redemption → attach immediately + send
 *     them to /account/affiliate so they see the confirmation.
 *   - everyone else → redirect to /access for signup; the cookie carries
 *     the code through OAuth or email-signup.
 *
 * Invalid / self-owned codes silently bounce to /access without setting
 * the cookie. We don't 404 — the URL is shareable, and a noisy error
 * page would be a bad first impression.
 */
export default async function AffiliateLandingPage({ params }: Props) {
  const { code: raw } = await params;
  const code = normaliseCode(raw);

  if (code) {
    const row = await prisma.affiliateCode.findUnique({
      where: { code },
      select: { id: true, ownerId: true },
    });
    if (row) {
      const cookieStore = await cookies();
      cookieStore.set(AFFILIATE_COOKIE, code, {
        maxAge: AFFILIATE_COOKIE_TTL_DAYS * 24 * 60 * 60,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      });

      const session = await auth();
      const userId = session?.user?.id;
      if (userId && userId !== row.ownerId) {
        const attached = await attachCodeOnce(userId, row.id);
        // Either way, send them to the redemption confirmation page.
        redirect(attached ? "/account/affiliate?redeemed=1" : "/account/affiliate");
      }
    }
  }

  redirect("/access");
}
