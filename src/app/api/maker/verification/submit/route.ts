import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  submitCalibrationPrint,
  VerificationError,
} from "@/lib/maker-verification";

export const runtime = "nodejs";

const Schema = z.object({
  calibrationPrintUrl: z.string().min(1),
});

export async function POST(req: Request) {
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
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  try {
    const v = await submitCalibrationPrint({
      makerId: profile.id,
      calibrationPrintUrl: parsed.data.calibrationPrintUrl,
    });
    return NextResponse.json({ verification: v });
  } catch (err) {
    if (err instanceof VerificationError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
