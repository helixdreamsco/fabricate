/**
 * Location of, and credentials for, the FastAPI service (mesh analysis,
 * slicing, design generation).
 *
 * In production it's a private Cloud Run service: it grants run.invoker to
 * this app's service account and nothing else, so every call needs an ID
 * token minted for its URL as audience. Locally it's plain http on
 * 127.0.0.1 with no auth at all, and the token logic no-ops.
 */

export const API_HOST = process.env.API_HOST ?? "http://127.0.0.1:8000";

const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Authorization header for the API, or `{}` when it doesn't need one.
 *
 * The cache is per-process and shared by every caller — the metadata server
 * is a hop we shouldn't take on each proxied request.
 */
export async function serviceAuthHeaders(): Promise<Record<string, string>> {
  if (!API_HOST.startsWith("https://")) return {};
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return { Authorization: `Bearer ${cachedToken.value}` };
  }
  try {
    const res = await fetch(
      `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(API_HOST)}`,
      {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!res.ok) return {};
    const token = await res.text();
    // Tokens live 1 h; refresh 5 min early.
    cachedToken = { value: token, expiresAt: now + 55 * 60_000 };
    return { Authorization: `Bearer ${token}` };
  } catch {
    // Not on GCP (no metadata server) — assume the API needs no auth.
    return {};
  }
}
