import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDesignIdentity } from "@/lib/design/identity";
import {
  conceptImagesAvailable,
  createConceptImage,
  createConceptImageFromReference,
  GenerationError,
} from "@/lib/design/meshy";
import {
  classifierAvailable,
  moderateImage,
  moderatePrompt,
} from "@/lib/design/moderation";

const MAX_IMAGE_DATA_URI = 7_000_000; // ~5 MB decoded

const bodySchema = z.object({
  prompt: z.string().min(3).max(500),
  /** Reference photo. With one, the prompt describes the edit to apply to
   *  it rather than the whole subject. */
  imageDataUri: z
    .string()
    .regex(/^data:image\/(png|jpeg);base64,/)
    .max(MAX_IMAGE_DATA_URI)
    .optional(),
});

/**
 * Second step of the refine flow: generate a concept image so the user can
 * approve the look before a 3D generation is spent. The prompt is
 * re-moderated here — it may have been edited client-side since /clarify
 * saw it.
 *
 * With a reference photo the concept comes from image-to-image, so the
 * words and the picture both shape it. Both inputs are moderated: a benign
 * photo doesn't launder the prompt, and benign words don't launder the
 * photo.
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

  const who = { userId: identity.userId, anonId: null };
  const { prompt, imageDataUri } = parsed.data;

  // Every input that reaches the generator gets screened, not just the
  // first one — otherwise an innocuous photo carries a blocked prompt
  // through, or vice versa.
  const checks = [await moderatePrompt(who, prompt)];
  if (imageDataUri) checks.push(await moderateImage(who, imageDataUri));
  const blocked = checks.find((m) => !m.allowed);
  if (blocked) {
    return NextResponse.json(
      { error: "blocked", message: blocked.message },
      { status: 422 },
    );
  }

  try {
    const taskId = imageDataUri
      ? await createConceptImageFromReference(prompt, imageDataUri)
      : await createConceptImage(prompt);
    return NextResponse.json(
      { taskId, kind: imageDataUri ? "reference" : "text" },
      { status: 202 },
    );
  } catch (e) {
    const message =
      e instanceof GenerationError
        ? e.friendly
        : "Couldn't create a concept image — please try again.";
    return NextResponse.json({ error: "concept_failed", message }, { status: 502 });
  }
}
