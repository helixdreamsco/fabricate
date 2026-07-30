import { z } from "zod";

/** Parameter spec kinds — mirrored by the Python worker's validation. */
export const textParamSchema = z.object({
  kind: z.literal("text"),
  label: z.string(),
  minLength: z.number().int().min(0),
  maxLength: z.number().int().max(64),
  default: z.string(),
  pattern: z.string(),
});
export const enumParamSchema = z.object({
  kind: z.literal("enum"),
  label: z.string(),
  options: z.array(z.string()).min(2).max(16),
  default: z.string(),
});
export const numberParamSchema = z.object({
  kind: z.literal("number"),
  label: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  default: z.number(),
  unit: z.string().optional(),
});
export const iconParamSchema = z.object({
  kind: z.literal("icon"),
  label: z.string(),
  default: z.string(),
});
export const partParamSchema = z.object({
  kind: z.literal("part"),
  label: z.string(),
  socket: z.string(),
  options: z.array(z.string()).min(2).max(16),
  default: z.string(),
});
/**
 * User-uploaded vector asset (a brand logo). The parameter VALUE is an asset
 * id, never the artwork itself: the artwork is sanitised and stored once at
 * upload, so the canonical params hash stays a pure function of the design
 * and the geometry cache keeps working. "" means no logo.
 *
 * The Python worker cannot read our storage, so the Node side resolves the id
 * to polygons and passes them inline — see `assets` in lib/design/pyapi.ts.
 */
export const assetParamSchema = z.object({
  kind: z.literal("asset"),
  label: z.string(),
  accept: z.literal("svg"),
  /** Fraction of the part's primary dimension the artwork is scaled to. */
  areaFraction: z.number().positive().max(1),
  required: z.boolean(),
  default: z.literal(""),
});

export const paramSpecSchema = z.discriminatedUnion("kind", [
  textParamSchema,
  enumParamSchema,
  numberParamSchema,
  iconParamSchema,
  partParamSchema,
  assetParamSchema,
]);

/** Asset ids are opaque; the format is fixed here so both validators agree. */
export const ASSET_ID_RE = /^asset_[a-f0-9]{24}$/;

/**
 * Multi-unit ordering. Deliberately NOT a parameter: N units are one
 * byte-identical STL, so quantity must stay out of the canonical params hash
 * or it would miss the geometry cache and re-slice the same solid. It rides
 * alongside the params as a sibling field on the job.
 *
 * Absent = single-item template: quantity is 1 and the picker is hidden.
 */
export const quantitySpecSchema = z.object({
  min: z.number().int().positive(),
  max: z.number().int().positive(),
  default: z.number().int().positive(),
  /** Present a fixed set of sizes (e.g. a 4/6/12 coaster set) instead of a stepper. */
  presets: z.array(z.number().int().positive()).min(2).max(6).optional(),
});

export const templateSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    version: z.number().int().positive(),
    name: z.string(),
    category: z.string(),
    /** Gallery grouping: "brands" | "you". Defaults to "you". */
    audience: z.enum(["brands", "you"]).default("you"),
    description: z.string(),
    thumbnail: z.string(),
    params: z.record(z.string(), paramSpecSchema),
    quantity: quantitySpecSchema.optional(),
    constraints: z.object({
      minTextHeightMm: z.number(),
      minStrokeMm: z.number(),
      reliefDepthMm: z.number(),
      maxBBoxMm: z.tuple([z.number(), z.number(), z.number()]),
    }),
  })
  .refine(
    (s) =>
      !s.quantity ||
      (s.quantity.min <= s.quantity.default &&
        s.quantity.default <= s.quantity.max &&
        (!s.quantity.presets ||
          s.quantity.presets.every(
            (n) => n >= s.quantity!.min && n <= s.quantity!.max,
          ))),
    { message: "quantity default/presets must lie within [min, max]" },
  );

export type ParamSpec = z.infer<typeof paramSpecSchema>;
export type TemplateSpec = z.infer<typeof templateSpecSchema>;
export type ParamValues = Record<string, string | number>;

export const ICON_IDS = [
  "star", "heart", "bolt", "moon", "crown", "flower",
  "paw", "note", "rocket", "diamond", "cat", "sun",
] as const;

/**
 * Build a zod validator for a template's parameter values. Invalid values are
 * rejected server-side even though the UI makes them unreachable.
 */
export function paramValuesValidator(spec: TemplateSpec) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, p] of Object.entries(spec.params)) {
    switch (p.kind) {
      case "text":
        shape[key] = z
          .string()
          .min(p.minLength)
          .max(p.maxLength)
          .regex(new RegExp(p.pattern));
        break;
      case "enum":
      case "part":
        shape[key] = z.enum(p.options as [string, ...string[]]);
        break;
      case "icon":
        shape[key] = z.enum(ICON_IDS);
        break;
      case "asset":
        // Ownership of the id is checked separately (the validator has no
        // session); this only enforces the shape. "" = no asset.
        shape[key] = p.required
          ? z.string().regex(ASSET_ID_RE)
          : z.union([z.literal(""), z.string().regex(ASSET_ID_RE)]);
        break;
      case "number":
        shape[key] = z
          .number()
          .min(p.min)
          .max(p.max)
          .refine(
            (v) => Math.abs((v - p.min) / p.step - Math.round((v - p.min) / p.step)) < 1e-6,
            { message: `must be a multiple of ${p.step} from ${p.min}` },
          );
        break;
    }
  }
  return z.object(shape).strict();
}

export function defaultParams(spec: TemplateSpec): ParamValues {
  return Object.fromEntries(
    Object.entries(spec.params).map(([k, p]) => [k, p.default]),
  );
}

/** Asset param keys on a spec, in declaration order. */
export function assetParamKeys(spec: TemplateSpec): string[] {
  return Object.entries(spec.params)
    .filter(([, p]) => p.kind === "asset")
    .map(([k]) => k);
}

/**
 * The size, in mm, that a logo will actually be printed at.
 *
 * Taken as the asset's `areaFraction` of the part's largest dimension —
 * which is the largest numeric parameter, since every template's size knobs
 * are in mm and thickness is always the smaller one. Printability has to be
 * judged at this size: the same artwork can be fine on a 100 mm coaster and
 * unprintable on a 30 mm tag.
 */
export function logoAreaMm(
  spec: TemplateSpec,
  values: ParamValues,
  assetKey: string,
): number {
  const param = spec.params[assetKey];
  if (!param || param.kind !== "asset") return 30;
  let largest = 0;
  for (const [key, p] of Object.entries(spec.params)) {
    if (p.kind !== "number") continue;
    const v = Number(values[key] ?? p.default);
    if (Number.isFinite(v) && v > largest) largest = v;
  }
  return largest > 0 ? largest * param.areaFraction : 30;
}

/**
 * Clamp a requested quantity to what the template allows. Single-item
 * templates (no quantity block) are always 1.
 */
export function resolveQuantity(spec: TemplateSpec, requested?: number): number {
  if (!spec.quantity) return 1;
  const { min, max, default: dflt, presets } = spec.quantity;
  if (requested === undefined || !Number.isInteger(requested)) return dflt;
  if (presets) return presets.includes(requested) ? requested : dflt;
  return Math.min(max, Math.max(min, requested));
}
