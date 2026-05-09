import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_PICKUP_LOCATIONS } from "@/lib/maker-profile";

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

const PickupLocationInputSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().max(60).optional().nullable(),
  postcode: z.string().trim().min(1).max(16),
  notes: z.string().trim().max(300).optional().nullable(),
});

const UpsertSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500).optional().nullable(),
  freeCompletionPhoto: z.boolean().optional(),
  // Printers array; index in array becomes priority (0 = highest).
  printers: z.array(PrinterInputSchema).min(1).max(10),
  // Pickup locations; index 0 is the primary. Empty array allowed for
  // brand-new profiles that haven't filled in an address yet.
  locations: z.array(PickupLocationInputSchema).max(MAX_PICKUP_LOCATIONS).default([]),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      printers: { orderBy: { priority: "asc" } },
      pickupLocations: { orderBy: { ordering: "asc" } },
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

  // The primary location is the first one in the array. Its postcode is
  // mirrored onto MakerProfile.postcode so existing single-postcode reads
  // (job lists, bid panels, JSON-LD) keep working unchanged.
  const primaryLocation = parsed.data.locations[0] ?? null;
  const primaryPostcode = primaryLocation?.postcode ?? null;

  const profile = await prisma.makerProfile.upsert({
    where: { userId: session.user.id },
    update: {
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      postcode: primaryPostcode,
      freeCompletionPhoto: parsed.data.freeCompletionPhoto ?? false,
    },
    create: {
      userId: session.user.id,
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      postcode: primaryPostcode,
      freeCompletionPhoto: parsed.data.freeCompletionPhoto ?? false,
    },
  });

  // Replace the printer set in a transaction. Identity by id when supplied;
  // any existing printer not in the new list is deleted (cascade clears bid
  // links via SetNull).
  const incomingPrinterIds = parsed.data.printers
    .map((p) => p.id)
    .filter((x): x is string => !!x);
  const incomingLocationIds = parsed.data.locations
    .map((l) => l.id)
    .filter((x): x is string => !!x);

  await prisma.$transaction([
    prisma.printer.deleteMany({
      where: {
        makerId: profile.id,
        ...(incomingPrinterIds.length > 0 ? { id: { notIn: incomingPrinterIds } } : {}),
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
    // Same replace-style upsert for pickup locations. The first row is
    // marked primary; if locations is empty, all existing rows are deleted.
    prisma.pickupLocation.deleteMany({
      where: {
        makerId: profile.id,
        ...(incomingLocationIds.length > 0 ? { id: { notIn: incomingLocationIds } } : {}),
      },
    }),
    ...parsed.data.locations.map((l, idx) => {
      const data = {
        label: l.label ?? null,
        postcode: l.postcode,
        notes: l.notes ?? null,
        isPrimary: idx === 0,
        ordering: idx,
      };
      if (l.id) {
        return prisma.pickupLocation.update({
          where: { id: l.id },
          data,
        });
      }
      return prisma.pickupLocation.create({
        data: { ...data, makerId: profile.id },
      });
    }),
  ]);

  const refreshed = await prisma.makerProfile.findUnique({
    where: { id: profile.id },
    include: {
      printers: { orderBy: { priority: "asc" } },
      pickupLocations: { orderBy: { ordering: "asc" } },
    },
  });
  return NextResponse.json({ profile: refreshed });
}
