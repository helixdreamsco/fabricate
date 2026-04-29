import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordJobEvent } from "@/lib/jobs";
import {
  platformFeePenceFor,
  COMPLETION_PHOTO_FEE_PENCE,
  TEST_STRIP_PRICE_PENCE,
} from "@/lib/money";
import { notifyJobPrioritized } from "@/lib/notifications";
import { generateUniqueTestStripCode } from "@/lib/test-print/code";

const CreateSchema = z.object({
  fileName: z.string().min(1).max(200),
  fileUrl: z.string().min(1).max(500),
  fileSizeBytes: z.number().int().nonnegative(),
  material: z.string().min(1).max(20),
  partColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(20),
  quality: z.string().max(40).optional(),
  infillPct: z.number().int().min(0).max(100),
  quantity: z.number().int().min(1).max(50),
  isMultiMaterial: z.boolean().optional(),
  partsCount: z.number().int().min(1).max(100).optional(),
  estimatedGrams: z.number().nonnegative().optional().nullable(),
  estimatedMinutes: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),

  quotedPricePence: z.number().int().positive(),
  // Auto-estimate snapshot. Creator's quoted price must be >= this. Client
  // computes via estimateQuote(); server stores it for audit + later UI.
  minPricePence: z.number().int().nonnegative(),

  // All pickup fields optional — pickup defaults to the assigned maker's
  // location. Creator only fills these if they want to suggest a meet-up
  // override at posting time.
  pickupPostcode: z.string().min(2).max(16).optional().nullable(),
  pickupLat: z.number().optional().nullable(),
  pickupLng: z.number().optional().nullable(),
  pickupNotes: z.string().max(500).optional().nullable(),

  prioritizedMakerId: z.string().optional().nullable(),
  communityId: z.string().optional().nullable(),
  requireCompletionPhoto: z.boolean().optional(),
  testStripPaid: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  const d = parsed.data;

  // Validate prioritized maker exists if supplied.
  if (d.prioritizedMakerId) {
    const m = await prisma.makerProfile.findUnique({ where: { id: d.prioritizedMakerId } });
    if (!m)
      return NextResponse.json({ error: "prioritized maker not found" }, { status: 400 });
  }

  if (d.quotedPricePence < d.minPricePence) {
    return NextResponse.json(
      {
        error: `Quoted price (£${(d.quotedPricePence / 100).toFixed(2)}) is below the minimum estimate (£${(d.minPricePence / 100).toFixed(2)}).`,
      },
      { status: 400 },
    );
  }

  const platformFee = platformFeePenceFor(d.quotedPricePence);
  const requirePhoto = d.requireCompletionPhoto ?? false;
  const testStripPaid = d.testStripPaid ?? true;
  const testStripCode = await generateUniqueTestStripCode();

  const job = await prisma.job.create({
    data: {
      requireCompletionPhoto: requirePhoto,
      completionPhotoFeePence: requirePhoto ? COMPLETION_PHOTO_FEE_PENCE : 0,
      testStripCode,
      testStripPaid,
      testStripFeePence: testStripPaid ? TEST_STRIP_PRICE_PENCE : 0,
      creatorId: session.user.id,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      fileSizeBytes: d.fileSizeBytes,
      material: d.material,
      partColors: JSON.stringify(d.partColors ?? []),
      quality: d.quality ?? "STANDARD",
      infillPct: d.infillPct,
      quantity: d.quantity,
      isMultiMaterial: d.isMultiMaterial ?? false,
      partsCount: d.partsCount ?? 1,
      estimatedGrams: d.estimatedGrams ?? null,
      estimatedMinutes: d.estimatedMinutes ?? null,
      notes: d.notes ?? null,
      quotedPricePence: d.quotedPricePence,
      minPricePence: d.minPricePence,
      platformFeePence: platformFee,
      pickupPostcode: d.pickupPostcode ?? null,
      pickupLat: d.pickupLat ?? null,
      pickupLng: d.pickupLng ?? null,
      pickupNotes: d.pickupNotes ?? null,
      prioritizedMakerId: d.prioritizedMakerId ?? null,
      communityId: d.communityId ?? null,
      status: "OPEN",
    },
  });

  await recordJobEvent({
    jobId: job.id,
    actor: "creator",
    actorId: session.user.id,
    kind: "log",
    body: "Job posted to the open market.",
  });

  // Notify the prioritized maker, if any. Lookup their User.email to deliver.
  if (d.prioritizedMakerId) {
    const m = await prisma.makerProfile.findUnique({
      where: { id: d.prioritizedMakerId },
      include: { user: { select: { email: true } } },
    });
    if (m) {
      const creator = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true },
      });
      notifyJobPrioritized({
        makerEmail: m.user.email,
        makerDisplayName: m.displayName,
        creatorName: creator?.name ?? creator?.email ?? "A creator",
        jobId: job.id,
        fileName: job.fileName,
        quotedPricePence: job.quotedPricePence,
      });
    }
  }

  return NextResponse.json({ job });
}

/**
 * GET /api/jobs?scope=mine|market|maker
 *   mine   — jobs I created (any status)
 *   market — OPEN jobs (everyone can read)
 *   maker  — jobs assigned to me as a maker
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "mine";

  if (scope === "mine") {
    const jobs = await prisma.job.findMany({
      where: { creatorId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        assignedMaker: { select: { id: true, displayName: true } },
        prioritizedMaker: { select: { id: true, displayName: true } },
        _count: { select: { bids: true } },
      },
    });
    return NextResponse.json({ jobs });
  }

  if (scope === "market") {
    const profile = await prisma.makerProfile.findUnique({
      where: { userId: session.user.id },
    });
    const jobs = await prisma.job.findMany({
      where: { status: "OPEN" },
      orderBy: [
        // Prioritized-for-me first (only meaningful if profile exists)
        { prioritizedMakerId: profile?.id ? "desc" : "asc" },
        { createdAt: "desc" },
      ],
      include: {
        creator: { select: { id: true, name: true, image: true } },
        prioritizedMaker: { select: { id: true, displayName: true } },
        _count: { select: { bids: true } },
      },
    });
    // Annotate with prioritizedForMe boolean for convenience
    const out = jobs.map((j) => ({
      ...j,
      prioritizedForMe: profile ? j.prioritizedMakerId === profile.id : false,
    }));
    return NextResponse.json({ jobs: out, makerProfileId: profile?.id ?? null });
  }

  if (scope === "maker") {
    const profile = await prisma.makerProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!profile) return NextResponse.json({ jobs: [] });
    const jobs = await prisma.job.findMany({
      where: { assignedMakerId: profile.id },
      orderBy: { updatedAt: "desc" },
      include: {
        creator: { select: { id: true, name: true, image: true } },
      },
    });
    return NextResponse.json({ jobs });
  }

  return NextResponse.json({ error: "invalid scope" }, { status: 400 });
}
