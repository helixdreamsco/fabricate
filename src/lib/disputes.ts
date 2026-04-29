import { prisma } from "./prisma";
import { recordJobEvent, transitionJob, type JobStatus } from "./jobs";
import { notify } from "./notify";

export class DisputeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DISPUTABLE_STATUSES: JobStatus[] = [
  "ASSIGNED",
  "IN_PROGRESS",
  "READY_FOR_PICKUP",
  "PICKED_UP",
];

export async function fileDispute(opts: {
  jobId: string;
  filedById: string;
  reason: string;
  evidenceUrl?: string | null;
}) {
  const reason = opts.reason.trim().slice(0, 1000);
  if (reason.length === 0)
    throw new DisputeError(400, "Reason is required.");

  const job = await prisma.job.findUnique({
    where: { id: opts.jobId },
    select: {
      id: true,
      creatorId: true,
      status: true,
      assignedMaker: { select: { userId: true, displayName: true } },
    },
  });
  if (!job) throw new DisputeError(404, "Job not found.");
  if (job.creatorId !== opts.filedById)
    throw new DisputeError(403, "Only the creator can file a dispute.");
  if (!DISPUTABLE_STATUSES.includes(job.status as JobStatus))
    throw new DisputeError(
      400,
      `Cannot file a dispute on a job in status ${job.status}.`,
    );

  const existingOpen = await prisma.dispute.findFirst({
    where: { jobId: opts.jobId, status: "OPEN" },
  });
  if (existingOpen)
    throw new DisputeError(409, "A dispute is already open on this job.");

  const dispute = await prisma.dispute.create({
    data: {
      jobId: opts.jobId,
      filedById: opts.filedById,
      reason,
      messages: opts.evidenceUrl
        ? {
            create: {
              authorId: opts.filedById,
              body: reason,
              evidenceUrl: opts.evidenceUrl,
            },
          }
        : undefined,
    },
  });

  await transitionJob({
    jobId: opts.jobId,
    to: "DISPUTED",
    actor: "creator",
    actorId: opts.filedById,
    body: "Creator opened a dispute.",
  });

  await recordJobEvent({
    jobId: opts.jobId,
    actor: "creator",
    actorId: opts.filedById,
    kind: "issue_reported",
    body: reason,
    data: { disputeId: dispute.id },
  });

  // Auto-flag for free test strip (so existing wiring picks it up).
  await prisma.job.update({
    where: { id: opts.jobId },
    data: { testStripRequestedByCreatorAt: new Date() },
  });

  if (job.assignedMaker?.userId) {
    await notify({
      recipientId: job.assignedMaker.userId,
      kind: "dispute_filed",
      body: `Creator opened a dispute on a job assigned to you.`,
      link: `/maker/jobs/${opts.jobId}`,
      data: { jobId: opts.jobId, disputeId: dispute.id },
    });
  }

  return dispute;
}

export async function postDisputeMessage(opts: {
  disputeId: string;
  authorId: string;
  body: string;
  evidenceUrl?: string | null;
}) {
  const body = opts.body.trim().slice(0, 2000);
  if (body.length === 0 && !opts.evidenceUrl)
    throw new DisputeError(400, "Message or evidence is required.");

  const dispute = await prisma.dispute.findUnique({
    where: { id: opts.disputeId },
    include: {
      job: {
        select: {
          id: true,
          creatorId: true,
          assignedMaker: { select: { userId: true } },
        },
      },
    },
  });
  if (!dispute) throw new DisputeError(404, "Dispute not found.");
  if (dispute.status !== "OPEN")
    throw new DisputeError(400, "Dispute is closed.");

  const isParty =
    dispute.job.creatorId === opts.authorId ||
    dispute.job.assignedMaker?.userId === opts.authorId;
  if (!isParty) throw new DisputeError(403, "Not a party to this dispute.");

  const message = await prisma.disputeMessage.create({
    data: {
      disputeId: opts.disputeId,
      authorId: opts.authorId,
      body,
      evidenceUrl: opts.evidenceUrl ?? null,
    },
  });

  // Notify the other party.
  const otherUserId =
    opts.authorId === dispute.job.creatorId
      ? dispute.job.assignedMaker?.userId
      : dispute.job.creatorId;
  if (otherUserId) {
    await notify({
      recipientId: otherUserId,
      kind: "message_received",
      body: "New dispute message.",
      link: `/jobs/${dispute.job.id}`,
      data: { jobId: dispute.job.id, disputeId: dispute.id },
    });
  }

  return message;
}

export async function resolveDispute(opts: {
  disputeId: string;
  outcome: "creator" | "maker";
  note?: string | null;
  resolvedByAdminId: string;
}) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: opts.disputeId },
    include: {
      job: {
        select: {
          id: true,
          creatorId: true,
          assignedMaker: { select: { userId: true } },
          payment: { select: { id: true, amountPence: true } },
        },
      },
    },
  });
  if (!dispute) throw new DisputeError(404, "Dispute not found.");
  if (dispute.status !== "OPEN")
    throw new DisputeError(400, "Dispute is already resolved.");

  const newDisputeStatus =
    opts.outcome === "creator" ? "RESOLVED_CREATOR" : "RESOLVED_MAKER";
  const newJobStatus: JobStatus =
    opts.outcome === "creator" ? "CANCELLED" : "COMPLETED";

  await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      status: newDisputeStatus,
      resolvedAt: new Date(),
      resolvedByAdminId: opts.resolvedByAdminId,
      resolutionNote: opts.note?.trim().slice(0, 500) ?? null,
    },
  });

  await transitionJob({
    jobId: dispute.job.id,
    to: newJobStatus,
    actor: "system",
    body: `Dispute resolved in ${opts.outcome === "creator" ? "creator's" : "maker's"} favour.`,
  });

  await recordJobEvent({
    jobId: dispute.job.id,
    actor: "system",
    kind: "log",
    body: `Dispute resolved · ${opts.outcome === "creator" ? "creator" : "maker"} wins${opts.note ? ` · ${opts.note}` : ""}`,
    data: { disputeId: dispute.id, outcome: opts.outcome },
  });

  // Notify both parties.
  const link = `/jobs/${dispute.job.id}`;
  const body =
    opts.outcome === "creator"
      ? "Dispute resolved in the creator's favour. The order has been cancelled."
      : "Dispute resolved in the maker's favour. The order is now complete.";
  await notify({
    recipientId: dispute.job.creatorId,
    kind: "dispute_resolved",
    body,
    link,
  });
  if (dispute.job.assignedMaker?.userId) {
    await notify({
      recipientId: dispute.job.assignedMaker.userId,
      kind: "dispute_resolved",
      body,
      link: `/maker/jobs/${dispute.job.id}`,
    });
  }

  return { dispute, jobStatus: newJobStatus };
}

export async function getActiveDispute(jobId: string) {
  return prisma.dispute.findFirst({
    where: { jobId, status: "OPEN" },
    include: {
      filedBy: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export async function getLatestDispute(jobId: string) {
  return prisma.dispute.findFirst({
    where: { jobId },
    orderBy: { createdAt: "desc" },
    include: {
      filedBy: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}
