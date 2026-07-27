import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { dataDir } from "@/lib/storage";
import { estimateQuote, type Quote } from "@/lib/pricing";
import { MATERIALS } from "@/lib/catalog";
import type { DesignJob, Prisma } from "@prisma/client";
import { generateDesign, repairMesh, DesignServiceError, type DesignMetrics } from "./pyapi";
import { getProvider, refineEnabled, GenerationError } from "./meshy";
import { GENERATION_TIMEOUT_MS, shapePrompt, type TaskKind } from "./provider";
import { moderatePrompt, moderateImage } from "./moderation";
import { ownerWhere, type DesignIdentity } from "./identity";

/** Identical request within this window returns the existing job. */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
export const FREE_GENERATIONS_PER_DAY = 3;

export function designsDir(): string {
  return path.join(dataDir(), "designs");
}

function artifactPath(jobId: string, file: string): string {
  const p = path.join(designsDir(), jobId, file);
  if (!p.startsWith(path.resolve(designsDir()))) throw new Error("bad key");
  return p;
}

async function writeArtifacts(
  jobId: string,
  stl: Buffer,
  glb: Buffer,
): Promise<{ stlKey: string; glbKey: string }> {
  const dir = path.join(designsDir(), jobId);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, "model.stl"), stl);
  await fs.promises.writeFile(path.join(dir, "preview.glb"), glb);
  return { stlKey: `${jobId}/model.stl`, glbKey: `${jobId}/preview.glb` };
}

export async function readArtifact(
  jobId: string,
  file: "model.stl" | "preview.glb",
): Promise<Buffer | null> {
  try {
    return await fs.promises.readFile(artifactPath(jobId, file));
  } catch {
    return null;
  }
}

async function setState(
  jobId: string,
  state: string,
  extra: Partial<{
    failReason: string | null;
    badge: string | null;
    stlKey: string;
    glbKey: string;
    metricsJson: Prisma.InputJsonValue;
    progress: number;
    providerTaskId: string;
    stage: string;
    credits: number;
    imageKey: string;
  }> = {},
): Promise<void> {
  const row = await prisma.designJob.findUnique({
    where: { id: jobId },
    select: { stateHistory: true },
  });
  const history = Array.isArray(row?.stateHistory)
    ? (row.stateHistory as unknown[])
    : [];
  history.push({ state, at: new Date().toISOString() });
  await prisma.designJob.update({
    where: { id: jobId },
    data: { state, stateHistory: history as Prisma.InputJsonValue[], ...extra },
  });
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export async function createPresetJob(opts: {
  identity: DesignIdentity;
  templateId: string;
  templateVersion: number;
  canonicalParams: string;
  hash: string;
  params: Record<string, string | number>;
}): Promise<{ jobId: string; cached: boolean }> {
  // Geometry cache: identical canonical params → reuse a finished job's
  // artifacts (files are per-job but immutable once ready).
  const cached = await prisma.designJob.findFirst({
    where: { paramsHash: opts.hash, kind: "preset", state: "ready" },
    orderBy: { createdAt: "desc" },
  });
  if (cached?.stlKey && cached.glbKey) {
    const job = await prisma.designJob.create({
      data: {
        userId: opts.identity.userId,
        anonId: opts.identity.anonId,
        kind: "preset",
        templateId: opts.templateId,
        templateVersion: opts.templateVersion,
        paramsJson: opts.canonicalParams,
        paramsHash: opts.hash,
        state: "ready",
        stateHistory: [{ state: "ready", at: new Date().toISOString() }],
        badge: cached.badge,
        stlKey: cached.stlKey,
        glbKey: cached.glbKey,
        metricsJson: cached.metricsJson ?? undefined,
      },
    });
    return { jobId: job.id, cached: true };
  }

  const job = await prisma.designJob.create({
    data: {
      userId: opts.identity.userId,
      anonId: opts.identity.anonId,
      kind: "preset",
      templateId: opts.templateId,
      templateVersion: opts.templateVersion,
      paramsJson: opts.canonicalParams,
      paramsHash: opts.hash,
      state: "processing",
      stateHistory: [{ state: "processing", at: new Date().toISOString() }],
    },
  });

  void (async () => {
    try {
      const result = await generateDesign(
        opts.templateId,
        opts.templateVersion,
        opts.params,
      );
      const keys = await writeArtifacts(job.id, result.stl, result.glb);
      await setState(job.id, "ready", {
        badge: result.badge,
        metricsJson: result.metrics as unknown as Prisma.InputJsonValue,
        ...keys,
      });
    } catch (e) {
      const friendly =
        e instanceof DesignServiceError
          ? e.friendly
          : "Something went wrong preparing this model — please try again.";
      console.error("design preset job failed", job.id, e);
      await setState(job.id, "failed", { failReason: friendly });
    }
  })();

  return { jobId: job.id, cached: false };
}

// ---------------------------------------------------------------------------
// AI (Meshy) — moderation → quota → generate → poll (5 s) → repair → ready
// ---------------------------------------------------------------------------

export function aiDedupeHash(userId: string, basis: string, seed: number): string {
  return createHash("sha256")
    .update(JSON.stringify({ ai: 2, u: userId, p: basis, s: seed }))
    .digest("hex");
}

/** Successful-or-active AI generations today (UTC). Blocked/failed excluded. */
export async function generationsUsedToday(userId: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  return prisma.designJob.count({
    where: {
      userId,
      kind: "ai",
      createdAt: { gte: dayStart },
      state: { notIn: ["failed", "blocked"] },
    },
  });
}

export async function generationsRemaining(userId: string): Promise<number> {
  return Math.max(0, FREE_GENERATIONS_PER_DAY - (await generationsUsedToday(userId)));
}

export async function createAiJob(opts: {
  identity: DesignIdentity & { userId: string };
  prompt?: string;
  imageDataUri?: string;
  seed: number;
}): Promise<
  | { jobId: string; reused: boolean; blocked: boolean }
  | { error: "quota_exceeded" }
> {
  const taskKind: TaskKind = opts.imageDataUri ? "image" : "text";
  const shaped = taskKind === "text" ? shapePrompt(opts.prompt!) : "";
  const dedupeBasis =
    taskKind === "text"
      ? shaped
      : createHash("sha256").update(opts.imageDataUri!).digest("hex");
  const hash = aiDedupeHash(opts.identity.userId, dedupeBasis, opts.seed);

  // Never call Meshy for a duplicate request within 24 h.
  const existing = await prisma.designJob.findFirst({
    where: {
      userId: opts.identity.userId,
      paramsHash: hash,
      kind: "ai",
      state: { notIn: ["failed", "blocked"] },
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { jobId: existing.id, reused: true, blocked: false };

  const job = await prisma.designJob.create({
    data: {
      userId: opts.identity.userId,
      kind: "ai",
      taskKind,
      prompt: opts.prompt,
      shapedPrompt: shaped || null,
      seed: opts.seed,
      paramsHash: hash,
      provider: getProvider().name,
      stage: "preview",
      state: "moderating",
      stateHistory: [{ state: "moderating", at: new Date().toISOString() }],
    },
  });

  const moderation =
    taskKind === "text"
      ? await moderatePrompt(opts.identity, opts.prompt!)
      : await moderateImage(opts.identity, opts.imageDataUri!);
  if (!moderation.allowed) {
    await setState(job.id, "blocked", { failReason: moderation.message });
    return { jobId: job.id, reused: false, blocked: true };
  }

  // Quota counts successful-or-active jobs only; check AFTER moderation so
  // blocked prompts never consume a slot. Failed jobs drop out of the count
  // automatically (no explicit refund needed).
  if ((await generationsUsedToday(opts.identity.userId)) > FREE_GENERATIONS_PER_DAY) {
    await prisma.designJob.delete({ where: { id: job.id } });
    return { error: "quota_exceeded" };
  }

  // Persist image uploads next to the job's future artifacts (audit).
  if (taskKind === "image") {
    const ext = opts.imageDataUri!.startsWith("data:image/png") ? "png" : "jpg";
    const dir = path.join(designsDir(), job.id);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      path.join(dir, `reference.${ext}`),
      Buffer.from(opts.imageDataUri!.split(",")[1] ?? "", "base64"),
    );
    await prisma.designJob.update({
      where: { id: job.id },
      data: { imageKey: `${job.id}/reference.${ext}` },
    });
  }

  try {
    const provider = getProvider();
    const taskId =
      taskKind === "text"
        ? await provider.createTextTask(shaped)
        : await provider.createImageTask(opts.imageDataUri!);
    await setState(job.id, "generating", { providerTaskId: taskId, progress: 0 });
    startPolling(job.id);
  } catch (e) {
    const friendly =
      e instanceof GenerationError ? e.friendly : "Generation failed — please try again.";
    await setState(job.id, "failed", { failReason: friendly });
  }
  return { jobId: job.id, reused: false, blocked: false };
}

// Server-side polling (Meshy webhooks are unsignable → poll every 5 s).
// In-process timers with poll-on-read fallback after restarts.
const pollers = new Map<string, ReturnType<typeof setInterval>>();

export function startPolling(jobId: string): void {
  if (pollers.has(jobId)) return;
  const timer = setInterval(() => {
    void pollOnce(jobId).catch((e) => console.error("design poll error", jobId, e));
  }, POLL_INTERVAL_MS);
  pollers.set(jobId, timer);
}

function stopPolling(jobId: string): void {
  const timer = pollers.get(jobId);
  if (timer) clearInterval(timer);
  pollers.delete(jobId);
}

async function pollOnce(jobId: string): Promise<void> {
  const row = await prisma.designJob.findUnique({ where: { id: jobId } });
  if (!row || row.state !== "generating" || !row.providerTaskId) {
    stopPolling(jobId);
    return;
  }
  if (Date.now() - row.createdAt.getTime() > GENERATION_TIMEOUT_MS) {
    stopPolling(jobId);
    await setState(jobId, "failed", {
      failReason: "Generation took too long — please try again.",
    });
    return;
  }
  const task = await getProvider().getTask(
    row.providerTaskId,
    (row.taskKind ?? "text") as TaskKind,
  );
  if (task.status === "pending" || task.status === "in_progress") {
    if (task.progress !== row.progress) {
      await prisma.designJob.update({
        where: { id: jobId },
        data: { progress: task.progress },
      });
    }
    return;
  }
  stopPolling(jobId);
  if (task.status !== "succeeded") {
    await setState(jobId, "failed", {
      failReason: task.error ?? "Generation failed — please try again.",
    });
    return;
  }
  await prisma.designJob.update({
    where: { id: jobId },
    data: { credits: task.creditsUsed },
  });
  await downloadAndRepair(jobId, task.modelUrls ?? {});
}

async function downloadAndRepair(
  jobId: string,
  modelUrls: { glb?: string; obj?: string; stl?: string },
): Promise<void> {
  const url = modelUrls.glb ?? modelUrls.obj ?? modelUrls.stl;
  if (!url) {
    await setState(jobId, "failed", {
      failReason: "The generator returned no model — please try again.",
    });
    return;
  }
  await setState(jobId, "downloading", { progress: 100 });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const name = modelUrls.glb ? "model.glb" : modelUrls.obj ? "model.obj" : "model.stl";
    await setState(jobId, "processing");
    const result = await repairMesh(data, name);
    const keys = await writeArtifacts(jobId, result.stl, result.glb);
    await setState(jobId, "ready", {
      badge: result.badge,
      metricsJson: result.metrics as unknown as Prisma.InputJsonValue,
      ...keys,
    });
  } catch (e) {
    const friendly =
      e instanceof DesignServiceError
        ? e.friendly
        : "We couldn't prepare the generated model — please try again.";
    console.error("design ai repair failed", jobId, e);
    await setState(jobId, "failed", { failReason: friendly });
  }
}

/** Poll-on-read fallback: revive the loop after a server restart. */
export async function refreshAiJob(row: DesignJob): Promise<DesignJob> {
  if (row.kind !== "ai" || row.state !== "generating") return row;
  if (!pollers.has(row.id)) {
    startPolling(row.id);
    await pollOnce(row.id).catch(() => {});
    return (await prisma.designJob.findUnique({ where: { id: row.id } })) ?? row;
  }
  return row;
}

/** Optional paid texture stage (MESHY_ENABLE_REFINE=1). */
export async function startRefine(
  row: DesignJob,
): Promise<{ ok: boolean; error?: string }> {
  if (!refineEnabled()) return { ok: false, error: "refine_disabled" };
  if (row.state !== "ready" || row.stage !== "preview" || !row.providerTaskId) {
    return { ok: false, error: "not_refinable" };
  }
  try {
    const taskId = await getProvider().createRefineTask(row.providerTaskId);
    await setState(row.id, "generating", {
      providerTaskId: taskId,
      stage: "refined",
      progress: 0,
    });
    startPolling(row.id);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof GenerationError ? e.friendly : "refine failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getJob(
  id: string,
  identity: DesignIdentity,
): Promise<DesignJob | null> {
  return prisma.designJob.findFirst({ where: { id, ...ownerWhere(identity) } });
}

/** Indicative price using the marketplace's own pricing engine. The real
 *  quote happens on /configure after handoff — this uses the same
 *  estimateQuote so the numbers agree. Volume is reconstructed from the
 *  slicer's true filament mass so weight matches exactly. */
export function indicativeQuote(metrics: DesignMetrics): Quote {
  const pla = MATERIALS.find((m) => m.key === "PLA")!;
  const infillFactor = 0.25 + (15 / 100) * 0.75;
  const volumeCm3 = metrics.filamentG / (pla.densityGPerCm3 * infillFactor);
  return estimateQuote({
    volumeCm3,
    material: "PLA",
    quality: "standard",
    infillPct: 15,
    quantity: 1,
    delivery: "pickup",
  });
}

export function publicJobView(row: DesignJob) {
  const metrics = (row.metricsJson ?? null) as DesignMetrics | null;
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    templateId: row.templateId,
    templateVersion: row.templateVersion,
    params: row.paramsJson ? (JSON.parse(row.paramsJson) as { p?: object }).p ?? null : null,
    state: row.state,
    progress: row.progress,
    stage: row.stage,
    failReason: row.failReason,
    badge: row.badge,
    // Keys may point at another job's directory (geometry cache reuse), so
    // URLs are built from the stored key, not this row's id.
    stlUrl: row.stlKey ? `/api/design/files/${row.stlKey}` : null,
    glbUrl: row.glbKey ? `/api/design/files/${row.glbKey}` : null,
    metrics,
    quote: row.state === "ready" && metrics ? indicativeQuote(metrics) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
