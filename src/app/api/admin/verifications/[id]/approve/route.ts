import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { approveVerification } from "@/lib/maker-verification";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const v = await approveVerification({
    verificationId: id,
    adminId: session.user.id,
  });
  const maker = await prisma.makerProfile.findUnique({
    where: { id: v.makerId },
    select: { userId: true, displayName: true },
  });
  if (maker) {
    await notify({
      recipientId: maker.userId,
      kind: "maker_verified",
      body: "You're verified. You can now place bids on Fabricate.",
      link: "/maker",
    });
  }
  return NextResponse.json({ verification: v });
}
