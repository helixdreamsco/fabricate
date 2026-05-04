import { prisma } from "./prisma";

/**
 * Bump these integers whenever the corresponding markdown file is edited
 * substantively. Existing users will be force-redirected to /legal/accept
 * on their next request and cannot use the platform until they re-tick
 * the boxes.
 *
 * Bumping is the explicit signal that the new text materially changes the
 * relationship — typo fixes don't need a bump (decide and document each
 * change in your release notes).
 */
export const TERMS_VERSION = 2;
export const PRIVACY_VERSION = 3;

export type ConsentStatus = {
  needsTerms: boolean;
  needsPrivacy: boolean;
  needsAny: boolean;
};

/**
 * Server-side check: does this user need to (re-)consent before they can
 * use the platform?
 */
export async function consentStatusFor(userId: string): Promise<ConsentStatus> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { acceptedTermsVersion: true, acceptedPrivacyVersion: true },
  });
  if (!u) return { needsTerms: true, needsPrivacy: true, needsAny: true };
  const needsTerms = u.acceptedTermsVersion < TERMS_VERSION;
  const needsPrivacy = u.acceptedPrivacyVersion < PRIVACY_VERSION;
  return { needsTerms, needsPrivacy, needsAny: needsTerms || needsPrivacy };
}

/**
 * Record acceptance of one or both documents and update the user's
 * accepted-version pointers. Writes an audit row per kind so we can prove
 * exactly when each consent was given.
 */
export async function recordConsent(opts: {
  userId: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const updates: Record<string, number> = {};
  const audits: Array<{ kind: "terms" | "privacy"; version: number }> = [];

  if (opts.acceptTerms) {
    updates.acceptedTermsVersion = TERMS_VERSION;
    audits.push({ kind: "terms", version: TERMS_VERSION });
  }
  if (opts.acceptPrivacy) {
    updates.acceptedPrivacyVersion = PRIVACY_VERSION;
    audits.push({ kind: "privacy", version: PRIVACY_VERSION });
  }
  if (audits.length === 0) return;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: opts.userId },
      data: updates,
    }),
    ...audits.map((a) =>
      prisma.legalConsent.create({
        data: {
          userId: opts.userId,
          kind: a.kind,
          version: a.version,
          ipAddress: opts.ipAddress ?? null,
          userAgent: opts.userAgent ?? null,
        },
      }),
    ),
  ]);
}

/**
 * Paths that must remain accessible even when a user has unmet consent.
 * The accept page itself, the documents being read, sign-in/out, and any
 * non-API public route. API auth routes are exempt so the OAuth round-trip
 * works.
 */
export const CONSENT_EXEMPT_PATHS = [
  "/legal/accept",
  "/terms",
  "/privacy",
  "/acceptable-use",
  "/account",
  "/api/auth",
  "/api/legal/accept",
] as const;

export function pathIsExempt(pathname: string): boolean {
  return CONSENT_EXEMPT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
