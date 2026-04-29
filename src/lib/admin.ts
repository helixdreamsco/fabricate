/**
 * Admin authorization. Currently a hardcoded email allowlist — sufficient
 * for pre-launch (one-person ops). Replace with a role column on User when
 * the team grows.
 */
const ADMIN_EMAILS = new Set<string>([
  "miles.broomfield123@gmail.com",
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase().trim());
}
