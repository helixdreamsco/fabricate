import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDesignIdentity } from "@/lib/design/identity";
import { getProvider } from "@/lib/design/meshy";
import { classifierAvailable } from "@/lib/design/moderation";
import { createAiJob, generationsRemaining, FREE_GENERATIONS_PER_DAY } from "@/lib/design/jobs";

const MAX_IMAGE_DATA_URI = 7_000_000; // ~5 MB decoded

const bodySchema = z
  .object({
    prompt: z.string().min(3).max(500).optional(),
    imageDataUri: z
      .string()
      .regex(/^data:image\/(png|jpeg);base64,/)
      .max(MAX_IMAGE_DATA_URI)
      .optional(),
    // Refine flow: an approved concept image from our own generator only.
    conceptImageUrl: z
      .string()
      .url()
      .startsWith("https://assets.meshy.ai/")
      .max(2000)
      .optional(),
    seed: z.number().int().min(0).max(2_147_483_647).default(0),
  })
  .refine(
    (b) =>
      b.conceptImageUrl
        ? Boolean(b.prompt) && !b.imageDataUri
        : Boolean(b.prompt) !== Boolean(b.imageDataUri),
    {
      message:
        "provide prompt, imageDataUri, or prompt + conceptImageUrl",
    },
  );

export async function POST(req: Request) {
  const identity = await getDesignIdentity();
  // AI generation requires a signed-in user: per-user quota + audit trail.
  if (!identity.userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!checkRateLimit({ key: `design-ai:${identity.userId}`, limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  // AI needs the generator AND the moderation classifier (fail closed).
  if (!getProvider().available() || !classifierAvailable()) {
    return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await createAiJob({
    identity: { userId: identity.userId, anonId: null },
    prompt: parsed.data.prompt,
    imageDataUri: parsed.data.imageDataUri,
    conceptImageUrl: parsed.data.conceptImageUrl,
    seed: parsed.data.seed,
  });

  if ("error" in result) {
    return NextResponse.json(
      {
        error: "quota_exceeded",
        message: `You've used your ${FREE_GENERATIONS_PER_DAY} free generations for today — more tomorrow!`,
      },
      { status: 402 },
    );
  }
  return NextResponse.json(
    { ...result, remaining: await generationsRemaining(identity.userId) },
    { status: result.reused ? 200 : 202 },
  );
}
