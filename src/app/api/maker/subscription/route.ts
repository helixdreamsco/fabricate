import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const Strictness = z.enum(["strict", "primary_or_alt", "firehose"]);
const Strategy = z.enum(["match_listed", "undercut_pct", "fixed_offset"]);
const Time = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/)
  .nullable();

const UpdateSchema = z.object({
  alertsEnabled: z.boolean().optional(),
  alertsEmailEnabled: z.boolean().optional(),
  alertsRadiusKm: z.number().int().min(0).max(500).optional(),
  alertsGlobal: z.boolean().optional(),
  alertsStrictness: Strictness.optional(),
  alertsQuietStart: Time.optional(),
  alertsQuietEnd: Time.optional(),

  autoBidEnabled: z.boolean().optional(),
  autoBidUseAlertsCoverage: z.boolean().optional(),
  autoBidRadiusKm: z.number().int().min(0).max(500).optional(),
  autoBidGlobal: z.boolean().optional(),
  autoBidStrictness: Strictness.optional(),
  autoBidStrategy: Strategy.optional(),
  autoBidUndercutPct: z.number().int().min(0).max(50).optional(),
  autoBidFixedOffsetPence: z.number().int().min(0).max(50000).optional(),
  autoBidMakerFloorPence: z.number().int().min(0).max(1000000).optional(),
  autoBidEtaHours: z.number().int().min(1).max(24 * 14).optional(),
  autoBidMessage: z.string().max(200).nullable().optional(),
  autoBidBadgeVisible: z.boolean().optional(),
});

/**
 * GET /api/maker/subscription — fetch the signed-in maker's subscription
 * row, creating one with defaults if none exists yet.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile)
    return NextResponse.json({ error: "no maker profile" }, { status: 400 });

  const sub = await prisma.makerSubscription.upsert({
    where: { makerId: profile.id },
    update: {},
    create: { makerId: profile.id },
  });
  return NextResponse.json({ subscription: sub });
}

/** PUT /api/maker/subscription — patch one or more fields. */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile)
    return NextResponse.json({ error: "no maker profile" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );

  const sub = await prisma.makerSubscription.upsert({
    where: { makerId: profile.id },
    update: parsed.data,
    create: { makerId: profile.id, ...parsed.data },
  });
  return NextResponse.json({ subscription: sub });
}
