/**
 * Client for the design endpoints on the existing FastAPI service
 * (api/app/design). Stateless: geometry in, artifacts out — all job state
 * lives in Prisma on the Node side.
 */
export interface DesignMetrics {
  printTimeS: number;
  filamentG: number;
  bboxMm: [number, number, number];
  triangles: number;
  thinAreas: number;
  sliced: boolean;
  supportsNeeded: boolean;
}

export interface DesignArtifacts {
  metrics: DesignMetrics;
  badge: "ready" | "needs_supports" | "too_fragile";
  stl: Buffer;
  glb: Buffer;
}

const API_HOST = process.env.API_HOST ?? "http://127.0.0.1:8000";

/**
 * Cloud Run service-to-service auth: when the API is a private *.run.app
 * service, requests need an ID token minted by the metadata server for the
 * service URL audience. Locally (or for any http host) this is a no-op.
 */
const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
let cachedToken: { value: string; expiresAt: number } | null = null;

async function authHeaders(): Promise<Record<string, string>> {
  if (!API_HOST.startsWith("https://")) return {};
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return { Authorization: `Bearer ${cachedToken.value}` };
  }
  try {
    const res = await fetch(
      `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(API_HOST)}`,
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3_000) },
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

export class DesignServiceError extends Error {
  // Explicit fields rather than constructor parameter properties: the test
  // runner strips types without transforming, and parameter properties need
  // a real transform.
  status: number;
  friendly: string;

  constructor(message: string, status: number, friendly: string) {
    super(message);
    this.status = status;
    this.friendly = friendly;
  }
}

/**
 * Builder rejections that are written FOR the user and should reach them
 * verbatim — they name the problem and what to do about it ("use a face of at
 * least 70 mm, or shorten the URL"). Everything else collapses to the generic
 * message, so internal validator text like `widthMm=99 out of range` never
 * leaks into the UI.
 *
 * Codes come from `invalid_params: <code>: <message>` raised by the Python
 * templates (api/app/design/qr.py, templates/logo_keyring.py).
 */
const USER_FACING_BUILDER_ERRORS = new Set([
  "qr_too_dense",
  "qr_undecodable",
  "url_not_https",
  "url_too_long",
  "url_invalid",
  "url_empty",
  "cut_through_splits_tag",
]);

function friendly(status: number, body: string): string {
  if (status === 422 && body.includes("slice_failed")) {
    return "This model can't be printed reliably — try different settings.";
  }
  if (status === 422) {
    // FastAPI wraps HTTPException as {"detail": "..."}.
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { detail?: unknown };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      /* not JSON — fall through with the raw body */
    }
    const match = detail.match(/^invalid_params:\s*([a-z_]+):\s*([\s\S]+)$/);
    if (match && USER_FACING_BUILDER_ERRORS.has(match[1])) {
      return match[2].trim();
    }
    return "These settings produced an invalid model.";
  }
  return "Our print-check service had a problem — please try again.";
}

async function parseArtifacts(res: Response): Promise<DesignArtifacts> {
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    throw new DesignServiceError(
      `design service ${res.status}: ${body}`,
      res.status,
      friendly(res.status, body),
    );
  }
  const data = (await res.json()) as {
    metrics: DesignMetrics;
    badge: DesignArtifacts["badge"];
    stl_b64: string;
    glb_b64: string;
  };
  return {
    metrics: data.metrics,
    badge: data.badge,
    stl: Buffer.from(data.stl_b64, "base64"),
    glb: Buffer.from(data.glb_b64, "base64"),
  };
}

/**
 * Polygon payload for an `asset` parameter, keyed by asset id.
 *
 * This service is stateless and has no access to DATA_DIR or the database,
 * so uploaded artwork cannot be passed by key — it travels inline. Omitting
 * it doesn't error; it silently builds the part with no logo, which is why
 * the caller resolves assets eagerly.
 */
export type WorkerAssets = Record<
  string,
  {
    shapes: Array<{ rings: number[][]; fillRule: "nonzero" | "evenodd" }>;
    bounds: [number, number, number, number];
  }
>;

export async function generateDesign(
  templateId: string,
  templateVersion: number,
  params: Record<string, string | number>,
  assets: WorkerAssets = {},
): Promise<DesignArtifacts> {
  const res = await fetch(`${API_HOST}/design/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      template_id: templateId,
      template_version: templateVersion,
      params,
      assets,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  return parseArtifacts(res);
}

export async function repairMesh(
  data: Buffer,
  fileName: string,
): Promise<DesignArtifacts> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)]), fileName);
  const res = await fetch(`${API_HOST}/design/repair`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  return parseArtifacts(res);
}

/** Internals exposed for unit tests only. */
export const __testing = { friendly };

export async function designServiceHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_HOST}/health`, {
      headers: await authHeaders(),
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
