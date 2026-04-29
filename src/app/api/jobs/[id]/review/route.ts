import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { fetchJobReviews, submitReview, ReviewError } from "@/lib/reviews";

export const runtime = "nodejs";

const SubmitSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const view = await fetchJobReviews({ jobId: id, viewerId: session.user.id });
    return NextResponse.json(view);
  } catch (err) {
    if (err instanceof ReviewError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  try {
    const created = await submitReview({
      jobId: id,
      viewerId: session.user.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    });
    return NextResponse.json({ review: created });
  } catch (err) {
    if (err instanceof ReviewError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
