import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const Schema = z.object({ ids: z.array(z.string()).max(200) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const result = await prisma.notification.updateMany({
    where: {
      id: { in: parsed.data.ids },
      recipientId: session.user.id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ updated: result.count });
}
