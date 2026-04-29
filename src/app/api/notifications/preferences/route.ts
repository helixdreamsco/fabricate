import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PrefSchema = z.record(
  z.string(),
  z.object({
    email: z.boolean().optional(),
    inApp: z.boolean().optional(),
  }),
);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const row = await prisma.notificationPreference.findUnique({
    where: { userId: session.user.id },
  });
  let prefs: unknown = {};
  if (row?.prefs) {
    try {
      prefs = JSON.parse(row.prefs);
    } catch {
      prefs = {};
    }
  }
  return NextResponse.json({ prefs });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = PrefSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const json = JSON.stringify(parsed.data);
  await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    update: { prefs: json },
    create: { userId: session.user.id, prefs: json },
  });
  return NextResponse.json({ ok: true });
}
