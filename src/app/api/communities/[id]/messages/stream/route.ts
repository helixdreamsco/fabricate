import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/community-helpers";
import { bus, type CommunityEvent } from "@/lib/events";

type Params = { params: Promise<{ id: string }> };

// This route has to run on the Node.js runtime because it uses EventEmitter
// and long-lived streams.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — Server-Sent Events stream of new messages for this community.
 *
 * Clients open an `EventSource`, we pipe any `community:<id>` events from the
 * shared bus into the stream as `data: <json>` frames. A 15 s heartbeat keeps
 * proxies from closing idle connections.
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await params;

  const c = await prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true },
  });
  if (!c) return new Response("not found", { status: 404 });

  const member = await getMembership(session.user.id, c.id);
  if (!member) return new Response("forbidden", { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed — swallow.
        }
      };

      send(`: stream open\n\n`);

      const onEvent = (e: CommunityEvent) => {
        send(`event: ${e.type}\n`);
        send(`data: ${JSON.stringify(e)}\n\n`);
      };
      bus.on(`community:${c.id}`, onEvent);

      const ping = setInterval(() => send(`: ping\n\n`), 15000);

      const close = () => {
        if (closed) return;
        closed = true;
        bus.off(`community:${c.id}`, onEvent);
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* already closed */
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
