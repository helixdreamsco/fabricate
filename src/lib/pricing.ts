import {
  DELIVERY_OPTIONS,
  MACHINE_TIME_RATE_GBP_PER_HOUR,
  MARGIN_MULTIPLIER,
  MATERIALS,
  QUALITIES,
  SERVICE_FEE_GBP,
  type MaterialKey,
  type QualityKey,
} from "./catalog";

/** Industry-rough purge / waste-tower cost per extra colour change. */
export const COLOR_CHANGE_SURCHARGE_GBP = 0.4;

export type Quote = {
  weightG: number;
  estMinutes: number;
  materialCost: number;
  machineCost: number;
  serviceFee: number;
  delivery: number;
  subtotal: number;
  discountApplied: number; // £ saved vs list price (before service fee)
  multiMaterialSurcharge: number; // £ added for purge / colour changes
  total: number;
};

/**
 * Stage-1 estimate: pure volume-based. Stage-2 replaces `weightG` and
 * `estMinutes` with values from the server-side slicer.
 *
 * Community discount semantics:
 *   - `freeMode` wins → subtotal = 0 (service fee still applies; delivery too)
 *   - `discountPct` applies to the (material + machine) * margin subtotal
 *   - Service fee + delivery are never discounted
 */
export function estimateQuote({
  volumeCm3,
  material,
  quality,
  infillPct,
  quantity,
  delivery,
  discountPct = 0,
  freeMode = false,
  colorCount = 1,
  deliveryFeeOverride,
}: {
  volumeCm3: number;
  material: MaterialKey;
  quality: QualityKey;
  infillPct: number;
  quantity: number;
  delivery: "pickup" | "courier";
  discountPct?: number;
  freeMode?: boolean;
  /** Number of distinct colours in the print. >1 triggers AMS surcharge. */
  colorCount?: number;
  /** Override the static catalogue delivery fee with a live courier quote. */
  deliveryFeeOverride?: number;
}): Quote {
  const mat = MATERIALS.find((m) => m.key === material)!;
  const q = QUALITIES.find((qq) => qq.key === quality)!;

  const infillFactor = 0.25 + (infillPct / 100) * 0.75;
  const perPartWeightG = volumeCm3 * mat.densityGPerCm3 * infillFactor;
  const weightG = perPartWeightG * quantity;

  const perPartMinutes = volumeCm3 * 1.6 * q.timeMultiplier * (0.6 + infillFactor * 0.4);
  const estMinutes = perPartMinutes * quantity;

  const materialCost = weightG * mat.pricePerGramGbp;
  const machineCost = (estMinutes / 60) * MACHINE_TIME_RATE_GBP_PER_HOUR;
  const serviceFee = SERVICE_FEE_GBP;
  const deliveryFee =
    deliveryFeeOverride !== undefined
      ? deliveryFeeOverride
      : (DELIVERY_OPTIONS.find((d) => d.key === delivery)?.priceGbp ?? 0);

  const listSubtotal = (materialCost + machineCost) * MARGIN_MULTIPLIER;

  let subtotal = listSubtotal;
  if (freeMode) subtotal = 0;
  else if (discountPct > 0)
    subtotal = listSubtotal * (1 - Math.min(100, Math.max(0, discountPct)) / 100);

  const discountApplied = listSubtotal - subtotal;

  // Per-extra-colour purge surcharge. Applied per part (not multiplied by
  // quantity since AMS sequences colours within a single multi-part job).
  const extraColors = Math.max(0, colorCount - 1);
  const multiMaterialSurcharge = freeMode
    ? 0
    : extraColors * COLOR_CHANGE_SURCHARGE_GBP;

  const total = subtotal + serviceFee + deliveryFee + multiMaterialSurcharge;

  return {
    weightG,
    estMinutes,
    materialCost,
    machineCost,
    serviceFee,
    delivery: deliveryFee,
    subtotal,
    discountApplied,
    multiMaterialSurcharge,
    total,
  };
}
