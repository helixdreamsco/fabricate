import { generateTestStripStl, isValidCode } from "@/lib/test-print/generate-stl";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase();

  if (!isValidCode(code)) {
    return new Response("Invalid code: must be 1-16 chars of A-Z, 0-9, or '-'.", {
      status: 400,
    });
  }

  const stl = generateTestStripStl(code);

  return new Response(new Uint8Array(stl), {
    status: 200,
    headers: {
      "Content-Type": "model/stl",
      "Content-Disposition": `attachment; filename="test-strip-${code}.stl"`,
      "Content-Length": String(stl.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
