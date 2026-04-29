import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { postDisputeMessage, DisputeError } from "@/lib/disputes";

export const runtime = "nodejs";

const Schema = z.object({
  body: z.string().max(2000).optional().default(""),
  evidenceUrl: z.string().max(500).optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; disputeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { disputeId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  try {
    const message = await postDisputeMessage({
      disputeId,
      authorId: session.user.id,
      body: parsed.data.body,
      evidenceUrl: parsed.data.evidenceUrl ?? null,
    });
    return NextResponse.json({ message });
  } catch (err) {
    if (err instanceof DisputeError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
