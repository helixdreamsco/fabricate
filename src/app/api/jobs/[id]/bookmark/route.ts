import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  /** "SAVED" — bookmark for later. "HIDDEN" — hide from market view.
   *  null — clear any existing bookmark. */
  status: z.enum(["SAVED", "HIDDEN"]).nullable(),
});

/**
 * Maker-only bookmark/decline. Stored as a `MakerJobBookmark` row keyed by
 * (makerId, jobId) so toggling is idempotent.
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

  const job = await prisma.job.findUnique({ where: { id }, select: { id: true } });
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid body" }, { status: 400 });

  if (parsed.data.status === null) {
    await prisma.makerJobBookmark
      .delete({ where: { makerId_jobId: { makerId: profile.id, jobId: id } } })
      .catch(() => null); // already absent — fine
    return NextResponse.json({ status: null });
  }

  const bm = await prisma.makerJobBookmark.upsert({
    where: { makerId_jobId: { makerId: profile.id, jobId: id } },
    update: { status: parsed.data.status },
    create: {
      makerId: profile.id,
      jobId: id,
      status: parsed.data.status,
    },
  });
  return NextResponse.json({ status: bm.status });
}
