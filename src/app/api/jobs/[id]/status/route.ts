import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { transitionJob, type JobStatus, recordJobEvent } from "@/lib/jobs";
import { mintPickupToken, pickupQrPayload } from "@/lib/pickup";
import { notifyJobInProgress, notifyJobReadyForPickup } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  /** Target status. Currently the maker drives ASSIGNED → IN_PROGRESS and
   *  IN_PROGRESS → READY_FOR_PICKUP. */
  to: z.enum(["IN_PROGRESS", "READY_FOR_PICKUP"]),
  /** Optional human-readable note for the timeline. */
  note: z.string().trim().max(500).optional().nullable(),
});

/**
 * POST /api/jobs/:id/status — assigned maker pushes a status change.
 *
 * When transitioning to READY_FOR_PICKUP we also mint a pickup token so the
 * creator's UI can immediately surface the QR / 6-digit code.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile)
    return NextResponse.json({ error: "no maker profile" }, { status: 400 });

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.assignedMakerId !== profile.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const target = parsed.data.to as JobStatus;

  // Gate: if the creator paid for a completion photo, the maker must
  // upload one before they can mark the job ready for pickup.
  if (
    target === "READY_FOR_PICKUP"
    && job.requireCompletionPhoto
    && !job.completionPhotoUrl
  ) {
    return NextResponse.json(
      {
        error: "completion photo required — upload one before marking ready",
        kind: "completion_photo_required",
      },
      { status: 400 },
    );
  }

  await transitionJob({
    jobId: job.id,
    to: target,
    actor: "maker",
    actorId: session.user.id,
    body: `${job.status} → ${target}`,
  });

  if (parsed.data.note) {
    await recordJobEvent({
      jobId: job.id,
      actor: "maker",
      actorId: session.user.id,
      kind: "log",
      body: parsed.data.note,
    });
  }

  // Load creator + maker info for notifications.
  const creator = await prisma.user.findUnique({
    where: { id: job.creatorId },
    select: { name: true, email: true },
  });

  if (target === "IN_PROGRESS") {
    notifyJobInProgress({
      creatorEmail: creator?.email ?? null,
      creatorName: creator?.name ?? "there",
      jobId: job.id,
      fileName: job.fileName,
      makerName: profile.displayName,
      etaHours: null,
    });
  }

  if (target === "READY_FOR_PICKUP") {
    const token = await mintPickupToken({ jobId: job.id });
    await recordJobEvent({
      jobId: job.id,
      actor: "system",
      kind: "pickup_minted",
      body: "Pickup code generated. Show the QR or 6-digit code to the maker at handover.",
      data: { code: token.code, qr: pickupQrPayload(token.code), expiresAt: token.expiresAt.toISOString() },
    });
    notifyJobReadyForPickup({
      creatorEmail: creator?.email ?? null,
      creatorName: creator?.name ?? "there",
      jobId: job.id,
      fileName: job.fileName,
      makerName: profile.displayName,
      makerPostcode: profile.postcode,
      pickupCode: token.code,
    });
  }

  return NextResponse.json({ ok: true });
}
