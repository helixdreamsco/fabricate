import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const c = await prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (c.ownerId === session.user.id) {
    return NextResponse.json(
      {
        error:
          "owners cannot leave — transfer ownership or delete the community first",
      },
      { status: 400 },
    );
  }

  await prisma.communityMember.deleteMany({
    where: { communityId: c.id, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}
