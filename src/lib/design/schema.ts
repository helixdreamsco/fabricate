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

export const paramSpecSchema = z.discriminatedUnion("kind", [
  textParamSchema,
  enumParamSchema,
  numberParamSchema,
  iconParamSchema,
  partParamSchema,
]);

export const templateSpecSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  thumbnail: z.string(),
  params: z.record(z.string(), paramSpecSchema),
  constraints: z.object({
    minTextHeightMm: z.number(),
    minStrokeMm: z.number(),
    reliefDepthMm: z.number(),
    maxBBoxMm: z.tuple([z.number(), z.number(), z.number()]),
  }),
});

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
