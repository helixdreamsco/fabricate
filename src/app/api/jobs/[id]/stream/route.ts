import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { bus } from "@/lib/events";
import type { JobBusEvent } from "@/lib/jobs";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/:id/stream — SSE stream of new events + chat messages.
 *
 * Visibility: creator + assigned maker only. (Market readers don't get the
 * stream — they re-fetch the OPEN job list from /api/jobs?scope=market.)
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    select: { creatorId: true, assignedMakerId: true },
  });
  if (!job) return new Response("not found", { status: 404 });

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const isCreator = job.creatorId === session.user.id;
  const isAssignedMaker = profile && job.assignedMakerId === profile.id;
  if (!isCreator && !isAssignedMaker) {
    return new Response("forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* closed */
        }
      };

      send(`: stream open\n\n`);

      const onEvent = (e: JobBusEvent) => {
        send(`event: ${e.type}\n`);
        send(`data: ${JSON.stringify(e)}\n\n`);
      };
      bus.on(`job:${id}`, onEvent);

      const ping = setInterval(() => send(`: ping\n\n`), 15000);

      const close = () => {
        if (closed) return;
        closed = true;
        bus.off(`job:${id}`, onEvent);
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* closed */
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
