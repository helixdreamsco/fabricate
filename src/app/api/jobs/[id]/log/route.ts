import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordJobEvent } from "@/lib/jobs";
import { notifyIssueReported } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  body: z.string().trim().min(1).max(1000),
  /** "issue" flags this as a problem report (e.g. printer error, file issue);
   *  rendered with a different style in the timeline. */
  kind: z.enum(["log", "issue"]).default("log"),
});

/**
 * POST /api/jobs/:id/log — either party adds a freeform timeline entry.
 *
 * Use this for "uploaded a quick photo of the print", "delayed by 2h",
 * "filament jam — switching spool", etc. Distinct from chat messages, which
 * are conversational and live in /messages.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isCreator = job.creatorId === session.user.id;
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  const isAssignedMaker = profile && job.assignedMakerId === profile.id;
  if (!isCreator && !isAssignedMaker)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid body" }, { status: 400 });

  await recordJobEvent({
    jobId: job.id,
    actor: isCreator ? "creator" : "maker",
    actorId: session.user.id,
    kind: parsed.data.kind === "issue" ? "issue_reported" : "log",
    body: parsed.data.body,
  });

  // Issues notify the other party. Plain "log" entries don't trigger email
  // (they're routine progress notes; the timeline + chat already surface them).
  if (parsed.data.kind === "issue") {
    if (isCreator && job.assignedMakerId) {
      const m = await prisma.makerProfile.findUnique({
        where: { id: job.assignedMakerId },
        include: { user: { select: { email: true } } },
      });
      if (m) {
        notifyIssueReported({
          recipientEmail: m.user.email,
          recipientName: m.displayName,
          jobId: job.id,
          fileName: job.fileName,
          byParty: "creator",
          body: parsed.data.body,
          isMaker: true,
        });
      }
    } else if (isAssignedMaker) {
      const c = await prisma.user.findUnique({
        where: { id: job.creatorId },
        select: { name: true, email: true },
      });
      if (c) {
        notifyIssueReported({
          recipientEmail: c.email,
          recipientName: c.name ?? "there",
          jobId: job.id,
          fileName: job.fileName,
          byParty: "maker",
          body: parsed.data.body,
          isMaker: false,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
