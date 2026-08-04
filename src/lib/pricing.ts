import {
  DELIVERY_OPTIONS,
  MACHINE_TIME_MIN_GBP,
  MACHINE_TIME_RATE_GBP_PER_HOUR,
  MARGIN_MULTIPLIER,
  MATERIALS,
  QUALITIES,
  SERVICE_FEE_BASE_GBP,
  SERVICE_FEE_PCT,
  quantityTierDiscountPct,
  type MaterialKey,
  type QualityKey,
} from "./catalog";
import { isPlatformFeePromoActive } from "./promotions";
import {
  DEFAULT_INFILL_FRACTION,
  estimateFilamentGrams,
  materialCostGbp,
} from "./filament";

/** Industry-rough purge / waste-tower cost per extra colour change. */
export const COLOR_CHANGE_SURCHARGE_GBP = 0.4;

export type Quote = {
  weightG: number;
  estMinutes: number;
  materialCost: number;
  machineCost: number;
  /** Actually charged service fee (0 during the launch promo, on
   *  free-mode jobs, or when the affiliate creator-waiver fires). */
  serviceFee: number;
  /** What the service fee would be without any waiver — for the
   *  strikethrough display in the breakdown. Equal to serviceFee when
   *  no waiver is active. */
  serviceFeeListPrice: number;
  /** Launch promo. */
  promoApplied: boolean;
  /** Affiliate creator-waiver — referred creator's first paid job. */
  affiliateWaiverApplied: boolean;
  delivery: number;
  subtotal: number;
  discountApplied: number; // £ saved vs list price (before service fee)
  /** Volume-break % actually applied (0 when none, or when a bigger
   *  community discount won). Drives the "10+ −10%" badge. */
  quantityTierPct: number;
  multiMaterialSurcharge: number; // £ added for purge / colour changes
  total: number;
};

/**
 * Stage-1 estimate: shell + infill from the mesh's own geometry (see
 * `./filament`). Stage-2 replaces `weightG` and `estMinutes` with values
 * from the server-side slicer.
 *
 * Community discount semantics:
 *   - `freeMode` wins → subtotal = 0 (service fee still applies; delivery too)
 *   - `discountPct` applies to the (material + machine) * margin subtotal
 *   - Service fee + delivery are never discounted
 */
export function estimateQuote({
  volumeCm3,
  surfaceAreaCm2 = 0,
  material,
  quality,
  infillPct,
  quantity,
  delivery,
  discountPct = 0,
  freeMode = false,
  colorCount = 1,
  deliveryFeeOverride,
  creatorReferralEligible = false,
  weightGPerPartOverride,
  ratePerGramGbpOverride,
}: {
  volumeCm3: number;
  /** Mesh triangle area. 0 falls back to a cube approximation — see
   *  `approxSurfaceAreaCm2`. */
  surfaceAreaCm2?: number;
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
  /** When true, the creator is a referred user on their first paid job —
   *  the service fee is dropped to 0 (the maker-side cut still fires
   *  and gets redirected to the affiliate at capture time). */
  creatorReferralEligible?: boolean;
  /** Known filament mass for ONE unit — from the slicer, or from a design
   *  job's recorded metrics. Skips the geometric estimate entirely. */
  weightGPerPartOverride?: number;
  /** Maker's own filament rate (£/g) once makers set one. Falls back to
   *  the platform default from the catalogue. */
  ratePerGramGbpOverride?: number;
}): Quote {
  const mat = MATERIALS.find((m) => m.key === material)!;
  const q = QUALITIES.find((qq) => qq.key === quality)!;

  const infillFraction =
    infillPct > 0 ? infillPct / 100 : DEFAULT_INFILL_FRACTION;

  const perPartWeightG =
    weightGPerPartOverride ??
    estimateFilamentGrams({
      volumeCm3,
      surfaceAreaCm2,
      infillFraction,
      densityGPerCm3: mat.densityGPerCm3,
    });
  const weightG = perPartWeightG * quantity;

  // Time is still the old volume heuristic — the slicer's own estimate
  // replaces it at stage 2, which is the only way to get it honest.
  const timeInfillFactor = 0.25 + infillFraction * 0.75;
  const perPartMinutes =
    volumeCm3 * 1.6 * q.timeMultiplier * (0.6 + timeInfillFactor * 0.4);
  const estMinutes = perPartMinutes * quantity;

  const ratePerGram = ratePerGramGbpOverride ?? mat.pricePerGramGbp;
  const materialCost = materialCostGbp(weightG, ratePerGram);
  const rawMachineCost = (estMinutes / 60) * MACHINE_TIME_RATE_GBP_PER_HOUR;
  const machineCost = Math.max(MACHINE_TIME_MIN_GBP, rawMachineCost);
  const deliveryFee =
    deliveryFeeOverride !== undefined
      ? deliveryFeeOverride
      : (DELIVERY_OPTIONS.find((d) => d.key === delivery)?.priceGbp ?? 0);

  const listSubtotal = (materialCost + machineCost) * MARGIN_MULTIPLIER;

  // Volume break for multi-unit runs. It does NOT stack with a community
  // discount — the creator gets whichever is larger, so the two schemes can
  // be tuned independently without compounding toward a free print.
  const tierPct = quantityTierDiscountPct(quantity);
  const effectivePct = Math.max(discountPct, tierPct);
  const quantityTierPct = tierPct > discountPct ? tierPct : 0;

  let subtotal = listSubtotal;
  if (freeMode) subtotal = 0;
  else if (effectivePct > 0)
    subtotal = listSubtotal * (1 - Math.min(100, Math.max(0, effectivePct)) / 100);

  const discountApplied = listSubtotal - subtotal;
  // Service fee = £2 base + 10% of the printing subtotal. Waivers that
  // bring it to 0:
  //   - free-mode / £0 subtotal (no money changes hands)
  //   - launch promo
  //   - affiliate creator-waiver on a referred user's first paid job
  // List price is still computed for the strikethrough display.
  const serviceFeeListPrice = SERVICE_FEE_BASE_GBP + subtotal * SERVICE_FEE_PCT;
  const promoApplied = isPlatformFeePromoActive();
  const freeJob = subtotal === 0;
  const affiliateWaiverApplied = creatorReferralEligible && !freeJob;
  const serviceFee =
    promoApplied || freeJob || affiliateWaiverApplied ? 0 : serviceFeeListPrice;

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
    serviceFeeListPrice,
    promoApplied,
    affiliateWaiverApplied,
    delivery: deliveryFee,
    subtotal,
    discountApplied,
    quantityTierPct,
    multiMaterialSurcharge,
    total,
  };
}
