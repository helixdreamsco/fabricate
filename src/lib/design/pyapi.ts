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

export class DesignServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly friendly: string,
  ) {
    super(message);
  }
}

function friendly(status: number, body: string): string {
  if (status === 422 && body.includes("slice_failed")) {
    return "This model can't be printed reliably — try different settings.";
  }
  if (status === 422) return "These settings produced an invalid model.";
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

export async function generateDesign(
  templateId: string,
  templateVersion: number,
  params: Record<string, string | number>,
): Promise<DesignArtifacts> {
  const res = await fetch(`${API_HOST}/design/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      template_id: templateId,
      template_version: templateVersion,
      params,
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
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  return parseArtifacts(res);
}

export async function designServiceHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_HOST}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
