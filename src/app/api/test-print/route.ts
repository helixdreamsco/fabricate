import { generateTestStripStlFromSvg } from "@/lib/test-print/generate-stl";

export const runtime = "nodejs";

const MAX_SVG_BYTES = 2_000_000;

export async function POST(req: Request) {
  const svg = await req.text();

  if (svg.length === 0 || !svg.includes("<svg")) {
    return new Response("Body must be an SVG document.", { status: 400 });
  }
  if (svg.length > MAX_SVG_BYTES) {
    return new Response(`SVG too large (max ${MAX_SVG_BYTES} bytes).`, {
      status: 413,
    });
  }

  let stl: Buffer;
  try {
    stl = generateTestStripStlFromSvg(svg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    return new Response(msg, { status: 400 });
  }

  return new Response(new Uint8Array(stl), {
    status: 200,
    headers: {
      "Content-Type": "model/stl",
      "Content-Disposition": 'attachment; filename="test-strip.stl"',
      "Content-Length": String(stl.byteLength),
    },
  });
}
