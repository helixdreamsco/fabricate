import { prisma } from "./prisma";

export type VerificationStatus =
  | "not_started"
  | "id_verified"
  | "pending_review"
  | "approved"
  | "rejected";

export class VerificationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getMakerVerification(makerId: string) {
  return prisma.makerVerification.findUnique({ where: { makerId } });
}

/**
 * Verified == Stripe Identity returned `verified` (passport / driving
 * licence + selfie liveness). The previous calibration-print gate was
 * security theatre — anyone could upload a JPEG from the internet — so
 * we dropped it. Bad actors get filtered organically via reviews and the
 * admin reject path.
 */
export async function isMakerVerified(makerId: string): Promise<boolean> {
  const v = await prisma.makerVerification.findUnique({
    where: { makerId },
    select: { stripeIdentityStatus: true, status: true },
  });
  // status=rejected lets an admin manually block a maker even if their
  // Stripe Identity passed — keep that escape hatch.
  return v?.stripeIdentityStatus === "verified" && v.status !== "rejected";
}

/**
 * Maker submits the calibration print. ID verification (Stripe Identity)
 * must already be complete before this is allowed. Sets overall status to
 * `pending_review` for an admin to look at the calibration.
 */
export async function submitCalibrationPrint(opts: {
  makerId: string;
  calibrationPrintUrl: string;
}) {
  if (!opts.calibrationPrintUrl)
    throw new VerificationError(400, "Calibration print URL is required.");

  const v = await prisma.makerVerification.findUnique({
    where: { makerId: opts.makerId },
  });
  if (!v || v.stripeIdentityStatus !== "verified")
    throw new VerificationError(
      400,
      "Complete the identity verification step before uploading a calibration print.",
    );
  if (v.status === "approved")
    throw new VerificationError(400, "Already approved.");

  return prisma.makerVerification.update({
    where: { id: v.id },
    data: {
      calibrationPrintUrl: opts.calibrationPrintUrl,
      status: "pending_review",
      submittedAt: new Date(),
      rejectionReason: null,
    },
  });
}

/**
 * Initialise a verification record (called when the maker starts an ID
 * session). Stores the Stripe Identity session id; sets status to
 * `not_started` until the webhook confirms.
 */
export async function recordIdentitySessionStart(opts: {
  makerId: string;
  stripeIdentityVerificationId: string;
}) {
  const existing = await prisma.makerVerification.findUnique({
    where: { makerId: opts.makerId },
  });
  if (existing) {
    return prisma.makerVerification.update({
      where: { id: existing.id },
      data: {
        stripeIdentityVerificationId: opts.stripeIdentityVerificationId,
        stripeIdentityStatus: "requires_input",
        stripeIdentityVerifiedAt: null,
        // If user re-runs ID after rejection, reset their overall status.
        status: existing.status === "approved" ? "approved" : "not_started",
      },
    });
  }
  return prisma.makerVerification.create({
    data: {
      makerId: opts.makerId,
      stripeIdentityVerificationId: opts.stripeIdentityVerificationId,
      stripeIdentityStatus: "requires_input",
    },
  });
}

/**
 * Apply the verified-state from Stripe Identity (called from the webhook
 * or sim-mode handler). Idempotent.
 */
export async function applyIdentityVerified(opts: {
  stripeIdentityVerificationId: string;
}) {
  const v = await prisma.makerVerification.findUnique({
    where: { stripeIdentityVerificationId: opts.stripeIdentityVerificationId },
  });
  if (!v) return null;
  return prisma.makerVerification.update({
    where: { id: v.id },
    data: {
      stripeIdentityStatus: "verified",
      stripeIdentityVerifiedAt: new Date(),
      // Auto-approve on Identity success — calibration-print step retired.
      // Preserve a prior `rejected` so an admin block can't be auto-undone.
      status: v.status === "rejected" ? "rejected" : "approved",
      reviewedAt: v.status === "rejected" ? v.reviewedAt : new Date(),
    },
  });
}

export async function applyIdentityFailed(opts: {
  stripeIdentityVerificationId: string;
  newStatus: "requires_input" | "canceled";
}) {
  const v = await prisma.makerVerification.findUnique({
    where: { stripeIdentityVerificationId: opts.stripeIdentityVerificationId },
  });
  if (!v) return null;
  return prisma.makerVerification.update({
    where: { id: v.id },
    data: { stripeIdentityStatus: opts.newStatus },
  });
}

export async function approveVerification(opts: {
  verificationId: string;
  adminId: string;
}) {
  return prisma.makerVerification.update({
    where: { id: opts.verificationId },
    data: {
      status: "approved",
      reviewedAt: new Date(),
      reviewedByAdminId: opts.adminId,
      rejectionReason: null,
    },
  });
}

export async function rejectVerification(opts: {
  verificationId: string;
  adminId: string;
  reason: string;
}) {
  return prisma.makerVerification.update({
    where: { id: opts.verificationId },
    data: {
      status: "rejected",
      reviewedAt: new Date(),
      reviewedByAdminId: opts.adminId,
      rejectionReason: opts.reason.trim().slice(0, 500),
    },
  });
}
