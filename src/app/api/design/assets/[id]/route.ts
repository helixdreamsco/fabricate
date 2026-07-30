import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnedAsset, readAssetSvg, readAssetGeometry } from "@/lib/design/assets";
import { analysePrintability } from "@/lib/design/svg/printability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/design/assets/<id> — the sanitised logo, for the flat 2D preview.
 *
 * Serves only the sanitised form (the raw upload is never persisted), only to
 * its owner, and with a CSP that neuters the file even if something got past
 * the sanitiser. `?format=geometry` returns the extracted polygons instead,
 * which is what the live 3D preview extrudes.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const asset = await getOwnedAsset(userId, id);
  if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "geometry") {
    const geometry = await readAssetGeometry(asset);
    if (!geometry) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const targetMm = Number(url.searchParams.get("targetMm") ?? 30) || 30;
    return NextResponse.json({
      geometry,
      printability: analysePrintability(geometry, targetMm),
    });
  }

  const svg = await readAssetSvg(asset);
  if (svg === null) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Defence in depth behind the sanitiser: even a hypothetical bypass
      // can't fetch, script, or frame anything from here.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
