import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTemplate } from "@/lib/design/registry";
import { validateParams } from "@/lib/design/params";
import { resolveQuantity, assetParamKeys } from "@/lib/design/schema";
import { getOwnedAsset } from "@/lib/design/assets";
import { createPresetJob } from "@/lib/design/jobs";
import { getDesignIdentity } from "@/lib/design/identity";

const bodySchema = z.object({
  templateId: z.string(),
  templateVersion: z.number().int(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  /** Units ordered. Clamped to the template's quantity block server-side. */
  quantity: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  const identity = await getDesignIdentity();
  const rlKey = `design-preset:${identity.userId ?? identity.anonId}`;
  if (!checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { templateId, templateVersion, params, quantity } = parsed.data;

  const spec = getTemplate(templateId);
  if (!spec) return NextResponse.json({ error: "unknown_template" }, { status: 404 });
  if (spec.version !== templateVersion) {
    return NextResponse.json({ error: "template_version_mismatch" }, { status: 409 });
  }
  const result = validateParams(spec, params);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // The schema validator only checks that an asset id is well-formed — it has
  // no session. Ownership is enforced here, so a guessed or borrowed id can't
  // pull someone else's logo into a build.
  const assetKeys = assetParamKeys(spec);
  const referenced = assetKeys
    .map((k) => result.values[k])
    .filter((v): v is string => typeof v === "string" && v !== "");
  if (referenced.length) {
    if (!identity.userId) {
      return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
    }
    for (const assetId of referenced) {
      if (!(await getOwnedAsset(identity.userId, assetId))) {
        return NextResponse.json({ error: "unknown_asset" }, { status: 404 });
      }
    }
  }

  const { jobId, cached } = await createPresetJob({
    identity,
    templateId,
    templateVersion,
    canonicalParams: result.canonical,
    hash: result.hash,
    params: result.values,
    quantity: resolveQuantity(spec, quantity),
    assetKeys,
  });
  return NextResponse.json({ jobId, cached }, { status: 202 });
}
