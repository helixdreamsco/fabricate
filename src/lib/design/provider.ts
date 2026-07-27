/**
 * Generation-provider abstraction. All provider-specific request/response
 * shapes stay inside the implementation (see meshy.ts) — the job system only
 * sees these types, so a second provider (e.g. Tripo) can be added without
 * touching the pipeline.
 */

export type TaskKind = "text" | "image";

export interface TaskState {
  status: "pending" | "in_progress" | "succeeded" | "failed" | "canceled";
  /** 0–100 while generating. */
  progress: number;
  /** Set when succeeded; at least one of these will be present. */
  modelUrls?: { glb?: string; obj?: string; stl?: string };
  /** User-safe failure description when failed/canceled. */
  error?: string;
  /** Provider credits consumed by this task (0 for failed tasks). */
  creditsUsed: number;
}

export interface GenerationProvider {
  readonly name: string;
  /** Whether the provider is configured (API key present). */
  available(): boolean;
  /** Text → untextured geometry (Meshy "preview" stage). */
  createTextTask(prompt: string): Promise<string>;
  /** Optional paid texture stage over a completed text task. */
  createRefineTask(previewTaskId: string): Promise<string>;
  /** Reference image (public URL or data URI) → geometry, single stage. */
  createImageTask(imageRef: string): Promise<string>;
  getTask(providerTaskId: string, kind: TaskKind): Promise<TaskState>;
}

/** Treat any task not terminal after this long as failed. */
export const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Server-side prompt shaping: constraints prepended to every user prompt so
 * the generator produces printable geometry. Exported as one constant so it
 * can be tuned in a single place (see docs/customiser.md).
 */
export const PROMPT_WRAPPER =
  "A single solid 3D-printable object, no scene, no base plane, no floating " +
  "or disconnected parts, chunky stylised geometry with thick features, no " +
  "thin protrusions or wires, suitable for FDM 3D printing. Subject: ";

export function shapePrompt(userPrompt: string): string {
  return PROMPT_WRAPPER + userPrompt.trim();
}
