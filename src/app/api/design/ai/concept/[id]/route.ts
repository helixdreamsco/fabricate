import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDesignIdentity } from "@/lib/design/identity";
import { conceptImagesAvailable, getConceptImage, GenerationError } from "@/lib/design/meshy";

/** Poll a concept image task. Task ids are unguessable provider UUIDs.
 *  `?kind=reference` for concepts made from a photo — text-to-image and
 *  image-to-image share a response shape but not a URL. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getDesignIdentity();
  if (!identity.userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!checkRateLimit({ key: `design-concept-poll:${identity.userId}`, limit: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!conceptImagesAvailable()) {
    return NextResponse.json({ error: "refine_unavailable" }, { status: 503 });
  }
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]{10,64}$/.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const kind =
    new URL(req.url).searchParams.get("kind") === "reference"
      ? "reference"
      : "text";
  try {
    return NextResponse.json(await getConceptImage(id, kind));
  } catch (e) {
    if (e instanceof GenerationError) {
      return NextResponse.json({ error: "concept_failed", message: e.friendly }, { status: 502 });
    }
    return NextResponse.json({ error: "concept_failed" }, { status: 502 });
  }
}
