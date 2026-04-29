import { prisma } from "./prisma";
import type { Review } from "@prisma/client";
import { notify } from "./notify";

export const REVIEW_REVEAL_DAYS = 14;
const REVIEW_REVEAL_MS = REVIEW_REVEAL_DAYS * 24 * 60 * 60 * 1000;
const COMMENT_MAX = 500;

export type ReviewDirection = "creator_to_maker" | "maker_to_creator";

export type SerializedReview = {
  id: string;
  jobId: string;
  direction: ReviewDirection;
  authorId: string;
  authorName: string | null;
  subjectId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  revealedAt: string | null;
};

export type JobReviewsView = {
  jobCompletedAt: string | null;
  isWindowOpen: boolean;
  // Reveal cutoff hits at jobCompletedAt + 14d. If now > cutoff, both reviews
  // are auto-revealed even if only one was submitted.
  cutoffPassed: boolean;
  // The viewer's own review (always visible).
  mine: SerializedReview | null;
  // The other party's review — only present if revealed (both submitted OR
  // cutoff passed).
  theirs: SerializedReview | null;
  // Whether the other party has submitted at all (independent of reveal).
  theirsExists: boolean;
};

export class ReviewError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function serialize(r: Review & { author?: { name: string | null } | null }): SerializedReview {
  return {
    id: r.id,
    jobId: r.jobId,
    direction: r.direction as ReviewDirection,
    authorId: r.authorId,
    authorName: r.author?.name ?? null,
    subjectId: r.subjectId,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    revealedAt: r.revealedAt?.toISOString() ?? null,
  };
}

function cutoffPassed(completedAt: Date | null): boolean {
  if (!completedAt) return false;
  return Date.now() - completedAt.getTime() >= REVIEW_REVEAL_MS;
}

async function loadJobForReview(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      creatorId: true,
      assignedMakerId: true,
      assignedMaker: { select: { userId: true } },
      status: true,
      completedAt: true,
    },
  });
  return job;
}

function rolesForViewer(
  job: { creatorId: string; assignedMaker: { userId: string } | null },
  viewerId: string,
): { isCreator: boolean; isMaker: boolean } {
  return {
    isCreator: job.creatorId === viewerId,
    isMaker: !!job.assignedMaker && job.assignedMaker.userId === viewerId,
  };
}

export async function submitReview(opts: {
  jobId: string;
  viewerId: string;
  rating: number;
  comment: string | null;
}): Promise<SerializedReview> {
  if (!Number.isInteger(opts.rating) || opts.rating < 1 || opts.rating > 5) {
    throw new ReviewError(400, "Rating must be an integer 1-5.");
  }
  const comment =
    opts.comment != null ? opts.comment.trim().slice(0, COMMENT_MAX) : null;

  const job = await loadJobForReview(opts.jobId);
  if (!job) throw new ReviewError(404, "Job not found.");
  if (job.status !== "COMPLETED")
    throw new ReviewError(400, "Reviews are only allowed on completed jobs.");

  const { isCreator, isMaker } = rolesForViewer(job, opts.viewerId);
  if (!isCreator && !isMaker)
    throw new ReviewError(403, "Only the creator or assigned maker can review this job.");

  const direction: ReviewDirection = isCreator
    ? "creator_to_maker"
    : "maker_to_creator";

  const subjectId = isCreator
    ? job.assignedMaker!.userId
    : job.creatorId;

  const existing = await prisma.review.findUnique({
    where: { jobId_direction: { jobId: opts.jobId, direction } },
  });
  if (existing) throw new ReviewError(409, "You've already reviewed this job.");

  const otherDirection: ReviewDirection = isCreator
    ? "maker_to_creator"
    : "creator_to_maker";
  const other = await prisma.review.findUnique({
    where: { jobId_direction: { jobId: opts.jobId, direction: otherDirection } },
  });

  // If the counterpart already exists, both reviews go live now. Otherwise
  // this review stays hidden until the other party submits or the 14-day
  // cutoff passes.
  const now = new Date();
  const reveal = other ? now : cutoffPassed(job.completedAt) ? now : null;

  const created = await prisma.review.create({
    data: {
      jobId: opts.jobId,
      direction,
      authorId: opts.viewerId,
      subjectId,
      rating: opts.rating,
      comment,
      revealedAt: reveal,
    },
    include: { author: { select: { name: true } } },
  });

  if (other && !other.revealedAt) {
    await prisma.review.update({
      where: { id: other.id },
      data: { revealedAt: now },
    });
  }

  // Notify the subject ("you got reviewed") and, when both reviews now
  // exist, both parties that reviews are public.
  const linkBase = direction === "creator_to_maker" ? "/maker/jobs/" : "/jobs/";
  await notify({
    recipientId: subjectId,
    kind: "review_submitted",
    body: "You received a review. It will be visible once you review them too.",
    link: `${linkBase}${opts.jobId}`,
    data: { jobId: opts.jobId },
  });
  if (other) {
    await notify({
      recipientId: opts.viewerId,
      kind: "review_revealed",
      body: "Reviews are now public — both parties have submitted.",
      link: `${linkBase === "/maker/jobs/" ? "/jobs/" : "/maker/jobs/"}${opts.jobId}`,
    });
    await notify({
      recipientId: subjectId,
      kind: "review_revealed",
      body: "Reviews are now public — both parties have submitted.",
      link: `${linkBase}${opts.jobId}`,
    });
  }

  return serialize(created);
}

export async function fetchJobReviews(opts: {
  jobId: string;
  viewerId: string;
}): Promise<JobReviewsView> {
  const job = await loadJobForReview(opts.jobId);
  if (!job) throw new ReviewError(404, "Job not found.");
  const { isCreator, isMaker } = rolesForViewer(job, opts.viewerId);
  if (!isCreator && !isMaker)
    throw new ReviewError(403, "Not a party to this job.");

  const reviews = await prisma.review.findMany({
    where: { jobId: opts.jobId },
    include: { author: { select: { name: true } } },
  });

  const myDirection: ReviewDirection = isCreator
    ? "creator_to_maker"
    : "maker_to_creator";
  const otherDirection: ReviewDirection = isCreator
    ? "maker_to_creator"
    : "creator_to_maker";

  const mine = reviews.find((r) => r.direction === myDirection) ?? null;
  const theirs = reviews.find((r) => r.direction === otherDirection) ?? null;

  // Lazy reveal: if the cutoff passed and theirs exists but is unrevealed,
  // flip it now so reads stay consistent. Same for mine.
  const passed = cutoffPassed(job.completedAt);
  if (passed) {
    const toReveal = reviews.filter((r) => !r.revealedAt).map((r) => r.id);
    if (toReveal.length > 0) {
      const now = new Date();
      await prisma.review.updateMany({
        where: { id: { in: toReveal } },
        data: { revealedAt: now },
      });
      for (const r of reviews) {
        if (toReveal.includes(r.id)) r.revealedAt = now;
      }
    }
  }

  const isWindowOpen = job.status === "COMPLETED";
  const theirsRevealed = theirs ? theirs.revealedAt !== null : false;

  return {
    jobCompletedAt: job.completedAt?.toISOString() ?? null,
    isWindowOpen,
    cutoffPassed: passed,
    mine: mine ? serialize(mine) : null,
    theirs: theirsRevealed && theirs ? serialize(theirs) : null,
    theirsExists: !!theirs,
  };
}

/**
 * Public aggregate for a maker (by their User id). Counts only revealed
 * `creator_to_maker` reviews.
 */
export async function makerRatingAggregate(makerUserId: string): Promise<{
  avg: number | null;
  count: number;
}> {
  const agg = await prisma.review.aggregate({
    where: {
      subjectId: makerUserId,
      direction: "creator_to_maker",
      revealedAt: { not: null },
    },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    avg: agg._avg.rating ?? null,
    count: agg._count._all,
  };
}

/** Bulk version — single query for many makers (used in bid lists). */
export async function makerRatingAggregates(
  makerUserIds: string[],
): Promise<Map<string, { avg: number; count: number }>> {
  if (makerUserIds.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ["subjectId"],
    where: {
      subjectId: { in: makerUserIds },
      direction: "creator_to_maker",
      revealedAt: { not: null },
    },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const out = new Map<string, { avg: number; count: number }>();
  for (const r of rows) {
    if (r._avg.rating != null) {
      out.set(r.subjectId, { avg: r._avg.rating, count: r._count._all });
    }
  }
  return out;
}

/**
 * Public reviews list for a maker's profile / badge tooltip. Revealed
 * `creator_to_maker` reviews only, newest first.
 */
export async function listMakerReviews(
  makerUserId: string,
  limit = 20,
): Promise<SerializedReview[]> {
  const rows = await prisma.review.findMany({
    where: {
      subjectId: makerUserId,
      direction: "creator_to_maker",
      revealedAt: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { author: { select: { name: true } } },
  });
  return rows.map(serialize);
}
