import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MaterialKey = z.enum(["PLA", "PETG", "ABS", "TPU"]);

const UpsertSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500).optional().nullable(),
  postcode: z.string().trim().max(16).optional().nullable(),
  hasAMS: z.boolean().optional(),
  printerModel: z.string().trim().max(80).optional().nullable(),
  materials: z.array(MaterialKey).max(8).optional(),
  freeCompletionPhoto: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
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
      { status: 400 }
    );

  // Dedupe + JSON-encode the materials array. Empty array stored as null so
  // "unspecified" reads cleanly.
  const dedupedMaterials = parsed.data.materials
    ? Array.from(new Set(parsed.data.materials))
    : [];
  const data = {
    displayName: parsed.data.displayName,
    bio: parsed.data.bio ?? null,
    postcode: parsed.data.postcode ?? null,
    hasAMS: parsed.data.hasAMS ?? false,
    printerModel: parsed.data.printerModel ?? null,
    materials: dedupedMaterials.length > 0 ? JSON.stringify(dedupedMaterials) : null,
    freeCompletionPhoto: parsed.data.freeCompletionPhoto ?? false,
  };

  const profile = await prisma.makerProfile.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { ...data, userId: session.user.id },
  });

  return NextResponse.json({ profile });
}
