/**
 * Job state machine helpers, event emit, status validation.
 */

import { prisma } from "./prisma";
import { bus } from "./events";

export const JOB_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  OPEN: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "CANCELLED", "DISPUTED"],
  IN_PROGRESS: ["READY_FOR_PICKUP", "CANCELLED", "DISPUTED"],
  READY_FOR_PICKUP: ["PICKED_UP", "DISPUTED"],
  PICKED_UP: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ["COMPLETED", "CANCELLED"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function statusLabel(s: string): string {
  switch (s) {
    case "OPEN": return "Open to bids";
    case "ASSIGNED": return "Maker assigned";
    case "IN_PROGRESS": return "In progress";
    case "READY_FOR_PICKUP": return "Ready for pickup";
    case "PICKED_UP": return "Picked up";
    case "COMPLETED": return "Completed";
    case "CANCELLED": return "Cancelled";
    case "DISPUTED": return "Disputed";
    default: return s;
  }
}

export type JobEventActor = "system" | "creator" | "maker";

export type JobEventKind =
  | "status_change"
  | "log"
  | "bid_placed"
  | "bid_accepted"
  | "bid_withdrawn"
  | "pickup_minted"
  | "pickup_verified"
  | "payment_authorized"
  | "payment_captured"
  | "payment_refunded"
  | "payout_released"
  | "issue_reported"
  | "message"; // chat message — emitted via bus only, not persisted to JobEvent

export type JobBusEvent =
  | { type: "event:new"; jobId: string; event: SerializedJobEvent }
  | { type: "message:new"; jobId: string; message: SerializedJobMessage };

export type SerializedJobEvent = {
  id: string;
  jobId: string;
  actor: JobEventActor;
  actorId: string | null;
  kind: string;
  body: string;
  data: unknown | null;
  createdAt: string;
};

export type SerializedJobMessage = {
  id: string;
  jobId: string;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  imageUrl: string | null;
  imageMime: string | null;
  createdAt: string;
};

export function emitJobBusEvent(jobId: string, e: JobBusEvent) {
  bus.emit(`job:${jobId}`, e);
}

/**
 * Append a JobEvent and broadcast to subscribers.
 *
 * `data` is JSON-stringified for storage. Pass null to omit.
 */
export async function recordJobEvent(opts: {
  jobId: string;
  actor: JobEventActor;
  actorId?: string | null;
  kind: JobEventKind;
  body: string;
  data?: unknown;
}) {
  const dataStr = opts.data == null ? null : JSON.stringify(opts.data);
  const ev = await prisma.jobEvent.create({
    data: {
      jobId: opts.jobId,
      actor: opts.actor,
      actorId: opts.actorId ?? null,
      kind: opts.kind,
      body: opts.body,
      data: dataStr,
    },
  });
  emitJobBusEvent(opts.jobId, {
    type: "event:new",
    jobId: opts.jobId,
    event: serializeJobEvent(ev),
  });
  return ev;
}

export function serializeJobEvent(ev: {
  id: string;
  jobId: string;
  actor: string;
  actorId: string | null;
  kind: string;
  body: string;
  data: string | null;
  createdAt: Date;
}): SerializedJobEvent {
  return {
    id: ev.id,
    jobId: ev.jobId,
    actor: ev.actor as JobEventActor,
    actorId: ev.actorId,
    kind: ev.kind,
    body: ev.body,
    data: ev.data ? JSON.parse(ev.data) : null,
    createdAt: ev.createdAt.toISOString(),
  };
}

/**
 * Atomic status change: validates the transition, updates the row, writes a
 * JobEvent, broadcasts. Throws if transition is invalid. Returns the updated
 * Job.
 */
export async function transitionJob(opts: {
  jobId: string;
  to: JobStatus;
  actor: JobEventActor;
  actorId?: string | null;
  body?: string;
}) {
  const job = await prisma.job.findUnique({ where: { id: opts.jobId } });
  if (!job) throw new Error(`job ${opts.jobId} not found`);
  const from = job.status as JobStatus;
  if (from === opts.to) return job;
  if (!canTransition(from, opts.to)) {
    throw new Error(`invalid transition ${from} → ${opts.to}`);
  }
  const updated = await prisma.job.update({
    where: { id: opts.jobId },
    data: { status: opts.to },
  });
  await recordJobEvent({
    jobId: opts.jobId,
    actor: opts.actor,
    actorId: opts.actorId ?? null,
    kind: "status_change",
    body: opts.body ?? `${from} → ${opts.to}`,
    data: { from, to: opts.to },
  });
  return updated;
}
