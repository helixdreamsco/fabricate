import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_STATUSES = new Set(["IN_STOCK", "LOW", "EMPTY"]);

type SpoolInput = {
  id?: string;
  material: string;
  brand?: string | null;
  colorName: string;
  colorHex: string;
  status: string;
  notes?: string | null;
};

function clean(input: unknown): SpoolInput[] {
  if (!Array.isArray(input)) return [];
  const out: SpoolInput[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const material = String(r.material ?? "").trim().toUpperCase().slice(0, 24);
    const colorName = String(r.colorName ?? "").trim().slice(0, 60);
    const colorHexRaw = String(r.colorHex ?? "").trim();
    const colorHex = HEX_RE.test(colorHexRaw) ? colorHexRaw.toUpperCase() : "";
    const status = String(r.status ?? "IN_STOCK").trim().toUpperCase();
    if (!material || !colorName || !colorHex) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : undefined,
      material,
      brand: r.brand == null ? null : String(r.brand).trim().slice(0, 80) || null,
      colorName,
      colorHex,
      status: ALLOWED_STATUSES.has(status) ? status : "IN_STOCK",
      notes:
        r.notes == null
          ? null
          : String(r.notes).trim().slice(0, 500) || null,
    });
  }
  return out;
}

/**
 * Replace the full spool inventory for a printer in a single round trip.
 * Mirrors how /api/maker/me handles the printer list — simpler to reason
 * about than per-row CRUD and keeps the form logic on the client.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ printerId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { printerId } = await ctx.params;

  const printer = await prisma.printer.findUnique({
    where: { id: printerId },
    select: { id: true, maker: { select: { userId: true } } },
  });
  if (!printer || printer.maker.userId !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const incoming = clean((body as { spools?: unknown })?.spools);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.filamentSpool.findMany({
      where: { printerId },
      select: { id: true },
    });
    const incomingIds = new Set(
      incoming.map((s) => s.id).filter((x): x is string => !!x),
    );
    const toDelete = existing.filter((e) => !incomingIds.has(e.id));
    if (toDelete.length > 0) {
      await tx.filamentSpool.deleteMany({
        where: { id: { in: toDelete.map((d) => d.id) } },
      });
    }
    for (const s of incoming) {
      const data = {
        material: s.material,
        brand: s.brand ?? null,
        colorName: s.colorName,
        colorHex: s.colorHex,
        status: s.status,
        notes: s.notes ?? null,
      };
      if (s.id) {
        await tx.filamentSpool.update({ where: { id: s.id }, data });
      } else {
        await tx.filamentSpool.create({
          data: { ...data, printerId },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
