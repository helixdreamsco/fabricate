/**
 * Curated list of consumer / prosumer FDM printers makers are likely to own.
 *
 * Used for the searchable "Printer model" picker on /maker/profile. The
 * field is still a free-text string — makers can type anything not on the
 * list — so this is just to make the common case fast.
 */

export type PrinterCategory =
  | "Bambu Lab"
  | "Prusa"
  | "Creality"
  | "Elegoo"
  | "Anycubic"
  | "Voron"
  | "Sovol"
  | "AnkerMake"
  | "FlashForge"
  | "Snapmaker"
  | "QIDI";

export type PrinterModel = {
  brand: PrinterCategory;
  model: string;
  /** Searchable nickname or alt name. */
  aliases?: string[];
  /** True if AMS / multi-material capable out of the box. Used as a hint
   *  toggle when picked. */
  msColor?: boolean;
};

export const PRINTER_MODELS: PrinterModel[] = [
  // Bambu Lab
  { brand: "Bambu Lab", model: "A1 Mini" },
  { brand: "Bambu Lab", model: "A1" },
  { brand: "Bambu Lab", model: "P1P" },
  { brand: "Bambu Lab", model: "P1S", msColor: true },
  { brand: "Bambu Lab", model: "P2S", msColor: true },
  { brand: "Bambu Lab", model: "X1C", aliases: ["X1 Carbon"], msColor: true },
  { brand: "Bambu Lab", model: "X1E", msColor: true },
  { brand: "Bambu Lab", model: "H2D", msColor: true },
  // Prusa
  { brand: "Prusa", model: "Mini+", aliases: ["Mini"] },
  { brand: "Prusa", model: "MK3S+", aliases: ["MK3"] },
  { brand: "Prusa", model: "MK4" },
  { brand: "Prusa", model: "MK4S" },
  { brand: "Prusa", model: "Core One" },
  { brand: "Prusa", model: "XL", msColor: true },
  // Creality
  { brand: "Creality", model: "Ender 3 V3 SE" },
  { brand: "Creality", model: "Ender 3 V3 KE" },
  { brand: "Creality", model: "Ender 3 V3" },
  { brand: "Creality", model: "Ender 5 Max" },
  { brand: "Creality", model: "K1" },
  { brand: "Creality", model: "K1C" },
  { brand: "Creality", model: "K1 Max" },
  { brand: "Creality", model: "K2 Plus", msColor: true },
  { brand: "Creality", model: "CR-10 Smart Pro" },
  // Elegoo
  { brand: "Elegoo", model: "Neptune 4" },
  { brand: "Elegoo", model: "Neptune 4 Pro" },
  { brand: "Elegoo", model: "Neptune 4 Plus" },
  { brand: "Elegoo", model: "Neptune 4 Max" },
  { brand: "Elegoo", model: "Centauri Carbon" },
  // Anycubic
  { brand: "Anycubic", model: "Kobra 2 Pro" },
  { brand: "Anycubic", model: "Kobra 3", msColor: true },
  { brand: "Anycubic", model: "Kobra 3 Combo", msColor: true },
  { brand: "Anycubic", model: "Kobra S1 Combo", msColor: true },
  { brand: "Anycubic", model: "Kobra Max" },
  // Voron
  { brand: "Voron", model: "0.2", aliases: ["V0", "Voron 0"] },
  { brand: "Voron", model: "Trident" },
  { brand: "Voron", model: "2.4", aliases: ["V2"] },
  { brand: "Voron", model: "Switchwire" },
  // Sovol
  { brand: "Sovol", model: "SV06 Plus" },
  { brand: "Sovol", model: "SV07" },
  { brand: "Sovol", model: "SV08" },
  // AnkerMake
  { brand: "AnkerMake", model: "M5" },
  { brand: "AnkerMake", model: "M5C" },
  // FlashForge
  { brand: "FlashForge", model: "Adventurer 5M" },
  { brand: "FlashForge", model: "Adventurer 5M Pro" },
  { brand: "FlashForge", model: "Creator 4" },
  // Snapmaker
  { brand: "Snapmaker", model: "Artisan" },
  { brand: "Snapmaker", model: "J1" },
  { brand: "Snapmaker", model: "J1S" },
  // QIDI
  { brand: "QIDI", model: "X-Plus 3" },
  { brand: "QIDI", model: "X-Max 3" },
  { brand: "QIDI", model: "Q1 Pro" },
];

/** Format the canonical "Brand Model" label. */
export function fullName(p: PrinterModel): string {
  return `${p.brand} ${p.model}`;
}

/** Search across brand + model + aliases (case-insensitive substring). */
export function searchPrinters(query: string): PrinterModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return PRINTER_MODELS;
  return PRINTER_MODELS.filter((p) => {
    const blob = [p.brand, p.model, ...(p.aliases ?? [])].join(" ").toLowerCase();
    return blob.includes(q);
  });
}
