import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDesignIdentity } from "@/lib/design/identity";
import { conceptImagesAvailable, createConceptImage, GenerationError } from "@/lib/design/meshy";
import { classifierAvailable, moderatePrompt } from "@/lib/design/moderation";

const bodySchema = z.object({ prompt: z.string().min(3).max(500) });

/**
 * Second step of the refine flow: generate a concept image from the
 * (possibly clarified) prompt so the user can approve the look before a 3D
 * generation is spent. The prompt is re-moderated here — it may have been
 * edited client-side since /clarify saw it.
 */
export async function POST(req: Request) {
  const identity = await getDesignIdentity();
  if (!identity.userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!checkRateLimit({ key: `design-concept:${identity.userId}`, limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!conceptImagesAvailable() || !classifierAvailable()) {
    return NextResponse.json({ error: "refine_unavailable" }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const moderation = await moderatePrompt(
    { userId: identity.userId, anonId: null },
    parsed.data.prompt,
  );
  if (!moderation.allowed) {
    return NextResponse.json(
      { error: "blocked", message: moderation.message },
      { status: 422 },
    );
  }

  try {
    const taskId = await createConceptImage(parsed.data.prompt);
    return NextResponse.json({ taskId }, { status: 202 });
  } catch (e) {
    const message =
      e instanceof GenerationError
        ? e.friendly
        : "Couldn't create a concept image — please try again.";
    return NextResponse.json({ error: "concept_failed", message }, { status: 502 });
  }
}
