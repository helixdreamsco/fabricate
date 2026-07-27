import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDesignIdentity } from "@/lib/design/identity";
import { conceptImagesAvailable } from "@/lib/design/meshy";
import { classifierAvailable, moderatePrompt } from "@/lib/design/moderation";
import { clarifyPrompt } from "@/lib/design/refine";

const bodySchema = z.object({ prompt: z.string().min(3).max(400) });

/**
 * First step of the refine flow: moderate the raw prompt, then ask Claude
 * whether it needs clarifying questions before a concept image is generated.
 */
export async function POST(req: Request) {
  const identity = await getDesignIdentity();
  if (!identity.userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!checkRateLimit({ key: `design-clarify:${identity.userId}`, limit: 20, windowMs: 60_000 })) {
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

  const questions = await clarifyPrompt(parsed.data.prompt);
  return NextResponse.json({ questions });
}
