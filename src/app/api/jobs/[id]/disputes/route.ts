import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  fileDispute,
  getActiveDispute,
  DisputeError,
} from "@/lib/disputes";

export const runtime = "nodejs";

const FileSchema = z.object({
  reason: z.string().min(1).max(1000),
  evidenceUrl: z.string().max(500).optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = FileSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  try {
    const dispute = await fileDispute({
      jobId: id,
      filedById: session.user.id,
      reason: parsed.data.reason,
      evidenceUrl: parsed.data.evidenceUrl ?? null,
    });
    return NextResponse.json({ dispute });
  } catch (err) {
    if (err instanceof DisputeError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const dispute = await getActiveDispute(id);
  return NextResponse.json({ dispute });
}
