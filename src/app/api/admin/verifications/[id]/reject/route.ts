import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { rejectVerification } from "@/lib/maker-verification";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";

const Schema = z.object({ reason: z.string().min(1).max(500) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  const v = await rejectVerification({
    verificationId: id,
    adminId: session.user.id,
    reason: parsed.data.reason,
  });
  const maker = await prisma.makerProfile.findUnique({
    where: { id: v.makerId },
    select: { userId: true },
  });
  if (maker) {
    await notify({
      recipientId: maker.userId,
      kind: "verification_rejected",
      body: `Your verification needs changes: ${parsed.data.reason}`,
      link: "/maker/verification",
    });
  }
  return NextResponse.json({ verification: v });
}
