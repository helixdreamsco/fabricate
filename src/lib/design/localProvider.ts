import { createHash } from "node:crypto";
import type { GenerationProvider, TaskKind, TaskState } from "./provider";

/**
 * Demo generation provider, auto-selected when MESHY_API_KEY is absent.
 * Exercises the full AI flow (moderation → generating with progress →
 * downloading → repair → slice → quote) using the FastAPI service's
 * deterministic prompt-seeded placeholder models. Jobs carry
 * provider="local-demo" and the UI labels the result accordingly.
 *
 * Stateless: prompt/seed/start-time are encoded in the task id itself, so
 * polling survives server restarts.
 */

const SIMULATED_DURATION_MS = 12_000;
const API_HOST = process.env.API_HOST ?? "http://127.0.0.1:8000";

interface LocalTask {
  p: string; // prompt basis (shaped prompt, or image hash marker)
  s: number; // seed
  t: number; // start epoch ms
}

function encodeTask(task: LocalTask): string {
  return Buffer.from(JSON.stringify(task)).toString("base64url");
}

function decodeTask(id: string): LocalTask | null {
  try {
    const parsed = JSON.parse(Buffer.from(id, "base64url").toString());
    if (typeof parsed.p === "string" && typeof parsed.t === "number") {
      return parsed as LocalTask;
    }
    return null;
  } catch {
    return null;
  }
}

export const localProvider: GenerationProvider = {
  name: "local-demo",

  available() {
    return true;
  },

  async createTextTask(prompt: string): Promise<string> {
    return encodeTask({ p: prompt.slice(0, 600), s: 0, t: Date.now() });
  },

  async createRefineTask(): Promise<string> {
    throw Object.assign(new Error("local provider has no refine stage"), {
      friendly: "Refine isn't available on the demo generator.",
    });
  },

  async createImageTask(imageRef: string): Promise<string> {
    const digest = createHash("sha256").update(imageRef).digest("hex").slice(0, 24);
    return encodeTask({ p: `image reference ${digest}`, s: 0, t: Date.now() });
  },

  async getTask(providerTaskId: string, _kind: TaskKind): Promise<TaskState> {
    const task = decodeTask(providerTaskId);
    if (!task) {
      return { status: "failed", progress: 0, error: "unknown demo task", creditsUsed: 0 };
    }
    const elapsed = Date.now() - task.t;
    if (elapsed < SIMULATED_DURATION_MS) {
      return {
        status: "in_progress",
        progress: Math.min(95, Math.round((elapsed / SIMULATED_DURATION_MS) * 100)),
        creditsUsed: 0,
      };
    }
    const url = `${API_HOST}/design/mock-model?prompt=${encodeURIComponent(task.p)}&seed=${task.s}`;
    return { status: "succeeded", progress: 100, modelUrls: { glb: url }, creditsUsed: 0 };
  },
};
