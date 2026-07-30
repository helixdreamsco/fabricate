import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAsset } from "@/lib/design/assets";
import { MAX_SVG_BYTES } from "@/lib/design/svg/sanitise";
import { classifierAvailable } from "@/lib/design/moderation";
import { analysePrintability } from "@/lib/design/svg/printability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/design/assets — upload a brand logo (multipart, field "file").
 *
 * Requires a signed-in user: assets are per-owner, moderated, and referenced
 * from paid orders, so there is an audit trail either side of this route.
 *
 * The response carries a printability report for the logo area the caller
 * names, so the UI can offer the scale/thicken fixes immediately rather than
 * waiting for a failed print to teach the user.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!checkRateLimit({ key: `design-asset:${userId}`, limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  // Moderation is mandatory — no classifier, no uploads. Same fail-closed
  // stance as the AI generator.
  if (!classifierAvailable()) {
    return NextResponse.json({ error: "moderation_unavailable" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing 'file'" }, { status: 400 });
  }
  if (file.size > MAX_SVG_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "That file is over 2 MB — please upload a smaller SVG." },
      { status: 413 },
    );
  }

  const autoOutline = form.get("autoOutline") !== "false";
  const targetMm = Number(form.get("targetMm") ?? 30) || 30;

  const result = await createAsset({
    identity: { userId, anonId: null },
    bytes: new Uint8Array(await file.arrayBuffer()),
    filename: file.name || "logo.svg",
    autoOutline,
  });

  if (!result.ok) {
    // Moderation blocks are a 403; everything else is the file's shape.
    const status = result.code === "moderation" ? 403 : 422;
    return NextResponse.json(
      { error: result.code, message: result.message },
      { status },
    );
  }

  const printability = analysePrintability(result.geometry, targetMm);
  return NextResponse.json(
    {
      assetId: result.asset.id,
      filename: result.asset.filename,
      shapeCount: result.asset.shapeCount,
      autoOutlined: result.asset.autoOutlined,
      widthUnits: result.asset.widthUnits,
      heightUnits: result.asset.heightUnits,
      reused: result.reused,
      printability,
    },
    { status: result.reused ? 200 : 201 },
  );
}
