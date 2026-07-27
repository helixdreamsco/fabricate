import type { GenerationProvider, TaskKind, TaskState } from "./provider";
import { localProvider } from "./localProvider";

/**
 * Meshy provider. API shapes verified against https://docs.meshy.ai
 * (fetched 2026-07-27):
 * - Text-to-3D: POST /openapi/v2/text-to-3d, two-stage. `mode:"preview"`
 *   produces the full UNTEXTURED geometry; `mode:"refine"` only adds texture.
 *   For FDM printing we therefore use the preview mesh directly and skip the
 *   paid refine stage unless MESHY_ENABLE_REFINE is set.
 * - Image-to-3D: POST /openapi/v1/image-to-3d (v1!), single stage, accepts
 *   base64 data URIs; `should_texture:false` skips texture generation.
 * - Task objects: status PENDING|IN_PROGRESS|SUCCEEDED|FAILED|CANCELED,
 *   progress 0-100, model_urls{glb,...}, consumed_credits, task_error.
 * - Webhooks exist but have NO documented signature mechanism, so we treat
 *   them as unverifiable and poll instead (see aiJobs.ts).
 */

const TEXT_BASE = "https://api.meshy.ai/openapi/v2/text-to-3d";
const IMAGE_BASE = "https://api.meshy.ai/openapi/v1/image-to-3d";

const MAX_RETRIES = 3;

export class GenerationError extends Error {
  constructor(
    message: string,
    /** User-safe reason, suitable for a job fail_reason. */
    readonly friendly: string,
    readonly retryable: boolean = false,
  ) {
    super(message);
  }
}

function friendlyHttpError(status: number, body: string): GenerationError {
  switch (status) {
    case 400:
      return new GenerationError(`meshy 400: ${body}`, "The generator rejected this request — try rewording your prompt.");
    case 401:
      return new GenerationError(`meshy 401: ${body}`, "AI generation is misconfigured — please try again later.");
    case 402:
      return new GenerationError(`meshy 402: ${body}`, "AI generation is temporarily unavailable — please try again later.");
    case 404:
      return new GenerationError(`meshy 404: ${body}`, "The generation task could not be found.");
    case 429:
      return new GenerationError(`meshy 429: ${body}`, "The generator is busy — please try again in a minute.", true);
    default:
      return new GenerationError(`meshy ${status}: ${body}`, "Generation failed — please try again.", status >= 500);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function meshyFetch(url: string, init?: RequestInit): Promise<unknown> {
  let lastError: GenerationError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    } catch (e) {
      lastError = new GenerationError(
        `meshy network error: ${e instanceof Error ? e.message : e}`,
        "Couldn't reach the generator — please try again.",
        true,
      );
      continue;
    }
    if (res.ok) return res.json();
    const err = friendlyHttpError(res.status, (await res.text()).slice(0, 300));
    if (!err.retryable) throw err;
    lastError = err;
  }
  throw lastError!;
}

function mapTask(data: {
  status?: string;
  progress?: number;
  model_urls?: { glb?: string; obj?: string; stl?: string };
  task_error?: { message?: string };
  consumed_credits?: number;
}): TaskState {
  const creditsUsed = data.consumed_credits ?? 0;
  switch (data.status) {
    case "SUCCEEDED":
      return { status: "succeeded", progress: 100, modelUrls: data.model_urls, creditsUsed };
    case "FAILED":
      return {
        status: "failed",
        progress: data.progress ?? 0,
        error: data.task_error?.message?.slice(0, 200) || "generation failed",
        creditsUsed,
      };
    case "CANCELED":
      return { status: "canceled", progress: data.progress ?? 0, error: "generation canceled", creditsUsed };
    case "IN_PROGRESS":
      return { status: "in_progress", progress: data.progress ?? 0, creditsUsed };
    default:
      return { status: "pending", progress: 0, creditsUsed };
  }
}

export const meshyProvider: GenerationProvider = {
  name: "meshy",

  available() {
    return Boolean(process.env.MESHY_API_KEY);
  },

  async createTextTask(prompt: string): Promise<string> {
    const data = (await meshyFetch(TEXT_BASE, {
      method: "POST",
      body: JSON.stringify({
        mode: "preview",
        prompt: prompt.slice(0, 600),
        ai_model: "latest",
        topology: "triangle",
        // Highest geometry quality at standard tier; our pipeline decimates.
        target_polycount: 300_000,
        should_remesh: true,
        // Meshy-side content screening as defence in depth (ours runs first).
        moderation: true,
        target_formats: ["glb"],
      }),
    })) as { result: string };
    return data.result;
  },

  async createRefineTask(previewTaskId: string): Promise<string> {
    const data = (await meshyFetch(TEXT_BASE, {
      method: "POST",
      body: JSON.stringify({
        mode: "refine",
        preview_task_id: previewTaskId,
        // Cheapest texture settings — texture is irrelevant for FDM.
        enable_pbr: false,
        texture_resolution: "2k",
        target_formats: ["glb"],
      }),
    })) as { result: string };
    return data.result;
  },

  async createImageTask(imageRef: string): Promise<string> {
    const data = (await meshyFetch(IMAGE_BASE, {
      method: "POST",
      body: JSON.stringify({
        image_url: imageRef,
        ai_model: "latest",
        topology: "triangle",
        target_polycount: 300_000,
        should_remesh: true,
        // Geometry only — texturing costs extra and FDM prints one colour.
        should_texture: false,
        moderation: true,
        target_formats: ["glb"],
      }),
    })) as { result: string };
    return data.result;
  },

  async getTask(providerTaskId: string, kind: TaskKind): Promise<TaskState> {
    const base = kind === "image" ? IMAGE_BASE : TEXT_BASE;
    const data = await meshyFetch(`${base}/${providerTaskId}`);
    return mapTask(data as Parameters<typeof mapTask>[0]);
  },
};

export function getProvider(): GenerationProvider {
  // No Meshy key → built-in demo generator so the AI flow still works
  // end-to-end (clearly labelled in the UI; provider recorded on the job).
  return meshyProvider.available() ? meshyProvider : localProvider;
}

export function refineEnabled(): boolean {
  return process.env.MESHY_ENABLE_REFINE === "1";
}
