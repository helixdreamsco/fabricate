import { prisma } from "./prisma";
import type { Printer } from "@prisma/client";

export type PrinterMaterials = string[];

export function parsePrinterMaterials(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Pick the highest-priority active printer that can fulfil a job. A printer
 * "fulfils" if its materials list either includes the job's material or is
 * empty (treated as "I'll print anything"), and AMS is satisfied for any
 * multi-material job.
 *
 * Returns null when no printer matches — caller should reject the bid with
 * a clear error.
 */
export async function selectBestPrinter(opts: {
  makerId: string;
  /** Primary preferred material. */
  jobMaterial: string;
  /** Optional ordered list of acceptable alternatives — any match works. */
  jobMaterialAlternatives?: string[];
  isMultiMaterial: boolean;
}): Promise<Printer | null> {
  const acceptable = [opts.jobMaterial, ...(opts.jobMaterialAlternatives ?? [])];
  const printers = await prisma.printer.findMany({
    where: { makerId: opts.makerId, active: true },
    orderBy: { priority: "asc" },
  });
  for (const p of printers) {
    const mats = parsePrinterMaterials(p.materials);
    const hasMat =
      mats.length === 0 || mats.some((m) => acceptable.includes(m));
    const amsOk = !opts.isMultiMaterial || p.hasAMS;
    if (hasMat && amsOk) return p;
  }
  return null;
}

/**
 * Public/display representation of a printer — what we expose to creators
 * and on public profile pages. Strips internal fields like notes.
 */
export type PrinterSummary = {
  id: string;
  displayName: string;
  printerModel: string;
  hasAMS: boolean;
  materials: string[];
  priority: number;
  active: boolean;
};

export function summarisePrinter(p: Printer): PrinterSummary {
  return {
    id: p.id,
    displayName: p.displayName,
    printerModel: p.printerModel,
    hasAMS: p.hasAMS,
    materials: parsePrinterMaterials(p.materials),
    priority: p.priority,
    active: p.active,
  };
}
