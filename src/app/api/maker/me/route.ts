import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MaterialKey = z.enum(["PLA", "PETG", "ABS", "TPU"]);

const PrinterInputSchema = z.object({
  // Optional id — present when updating an existing row, absent when creating.
  id: z.string().optional(),
  displayName: z.string().trim().min(1).max(80),
  printerModel: z.string().trim().min(1).max(80),
  hasAMS: z.boolean().default(false),
  materials: z.array(MaterialKey).max(8).default([]),
  active: z.boolean().default(true),
  notes: z.string().trim().max(500).optional().nullable(),
});

const UpsertSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500).optional().nullable(),
  postcode: z.string().trim().max(16).optional().nullable(),
  freeCompletionPhoto: z.boolean().optional(),
  // Printers array; index in array becomes priority (0 = highest).
  printers: z.array(PrinterInputSchema).min(1).max(10),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      printers: { orderBy: { priority: "asc" } },
    },
  });
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );

  const profile = await prisma.makerProfile.upsert({
    where: { userId: session.user.id },
    update: {
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      postcode: parsed.data.postcode ?? null,
      freeCompletionPhoto: parsed.data.freeCompletionPhoto ?? false,
    },
    create: {
      userId: session.user.id,
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      postcode: parsed.data.postcode ?? null,
      freeCompletionPhoto: parsed.data.freeCompletionPhoto ?? false,
    },
  });

  // Replace the printer set in a transaction. Identity by id when supplied;
  // any existing printer not in the new list is deleted (cascade clears bid
  // links via SetNull).
  const incomingIds = parsed.data.printers
    .map((p) => p.id)
    .filter((x): x is string => !!x);

  await prisma.$transaction([
    prisma.printer.deleteMany({
      where: {
        makerId: profile.id,
        ...(incomingIds.length > 0 ? { id: { notIn: incomingIds } } : {}),
      },
    }),
    ...parsed.data.printers.map((p, idx) => {
      const data = {
        displayName: p.displayName,
        printerModel: p.printerModel,
        hasAMS: p.hasAMS,
        materials: JSON.stringify(Array.from(new Set(p.materials))),
        priority: idx,
        active: p.active,
        notes: p.notes ?? null,
      };
      if (p.id) {
        return prisma.printer.update({
          where: { id: p.id },
          data,
        });
      }
      return prisma.printer.create({
        data: { ...data, makerId: profile.id },
      });
    }),
  ]);

  const refreshed = await prisma.makerProfile.findUnique({
    where: { id: profile.id },
    include: { printers: { orderBy: { priority: "asc" } } },
  });
  return NextResponse.json({ profile: refreshed });
}
