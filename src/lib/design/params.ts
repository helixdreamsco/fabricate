import { createHash } from "node:crypto";
import type { ParamValues, TemplateSpec } from "./schema";
import { paramValuesValidator } from "./schema";

/**
 * Canonicalise parameter values: sorted keys, numbers normalised (no -0, no
 * trailing float noise), so the same customisation always hashes identically.
 * The hash keys the geometry cache and the per-user storage prefix.
 */
export function canonicaliseParams(
  templateId: string,
  templateVersion: number,
  values: ParamValues,
): string {
  const sorted: Record<string, string | number> = {};
  for (const key of Object.keys(values).sort()) {
    const v = values[key];
    sorted[key] = typeof v === "number" ? Number(v.toPrecision(12)) + 0 : v;
  }
  return JSON.stringify({ t: templateId, v: templateVersion, p: sorted });
}

export function hashCanonical(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export type ValidationResult =
  | { ok: true; values: ParamValues; canonical: string; hash: string }
  | { ok: false; error: string };

export function validateParams(
  spec: TemplateSpec,
  raw: unknown,
): ValidationResult {
  const parsed = paramValuesValidator(spec).safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `invalid_params: ${issue.path.join(".")} ${issue.message}`,
    };
  }
  const values = parsed.data as ParamValues;
  const canonical = canonicaliseParams(spec.id, spec.version, values);
  return { ok: true, values, canonical, hash: hashCanonical(canonical) };
}

/** Hash for AI generations: same user + prompt + seed must never re-generate. */
export function hashAiRequest(prompt: string, seed: number): string {
  return createHash("sha256")
    .update(JSON.stringify({ ai: 1, prompt: prompt.trim().toLowerCase(), seed }))
    .digest("hex");
}
