/**
 * Template schema: the `asset` param kind and the template-level `quantity`
 * capability, plus the invariant that quantity never reaches the geometry
 * cache key.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  templateSpecSchema,
  paramValuesValidator,
  resolveQuantity,
  assetParamKeys,
  defaultParams,
  type TemplateSpec,
} from "@/lib/design/schema";
import { canonicaliseParams, validateParams } from "@/lib/design/params";

const VALID_ASSET = "asset_0123456789abcdef01234567";

function spec(overrides: Record<string, unknown> = {}): TemplateSpec {
  return templateSpecSchema.parse({
    id: "test-tpl",
    version: 1,
    name: "Test",
    category: "test",
    description: "d",
    thumbnail: "/t.svg",
    params: {
      logo: {
        kind: "asset",
        label: "Logo",
        accept: "svg",
        areaFraction: 0.6,
        required: false,
        default: "",
      },
      widthMm: {
        kind: "number",
        label: "Width",
        min: 30,
        max: 60,
        step: 5,
        default: 40,
      },
    },
    constraints: {
      minTextHeightMm: 4,
      minStrokeMm: 1,
      reliefDepthMm: 1,
      maxBBoxMm: [100, 100, 20],
    },
    ...overrides,
  });
}

describe("asset param kind", () => {
  it("accepts a well-formed asset id", () => {
    const r = paramValuesValidator(spec()).safeParse({
      logo: VALID_ASSET,
      widthMm: 40,
    });
    assert.equal(r.success, true);
  });

  it("accepts empty string when the asset is optional", () => {
    const r = paramValuesValidator(spec()).safeParse({ logo: "", widthMm: 40 });
    assert.equal(r.success, true);
  });

  it("rejects empty string when the asset is required", () => {
    const s = spec({
      params: {
        ...spec().params,
        logo: {
          kind: "asset",
          label: "Logo",
          accept: "svg",
          areaFraction: 0.6,
          required: true,
          default: "",
        },
      },
    });
    assert.equal(
      paramValuesValidator(s).safeParse({ logo: "", widthMm: 40 }).success,
      false,
    );
  });

  it("rejects ids that aren't in the asset id format", () => {
    for (const bad of [
      "asset_short",
      "asset_0123456789ABCDEF01234567", // uppercase hex
      "../../etc/passwd",
      "asset_0123456789abcdef012345678", // too long
      "0123456789abcdef01234567",
    ]) {
      assert.equal(
        paramValuesValidator(spec()).safeParse({ logo: bad, widthMm: 40 })
          .success,
        false,
        `should reject ${bad}`,
      );
    }
  });

  it("defaults to no asset and is discoverable via assetParamKeys", () => {
    assert.equal(defaultParams(spec()).logo, "");
    assert.deepEqual(assetParamKeys(spec()), ["logo"]);
  });
});

describe("quantity capability", () => {
  it("is 1 for templates without a quantity block", () => {
    assert.equal(resolveQuantity(spec(), 50), 1);
    assert.equal(resolveQuantity(spec(), undefined), 1);
  });

  it("clamps to the declared range", () => {
    const s = spec({ quantity: { min: 1, max: 25, default: 1 } });
    assert.equal(resolveQuantity(s, 0), 1);
    assert.equal(resolveQuantity(s, 1), 1);
    assert.equal(resolveQuantity(s, 25), 25);
    assert.equal(resolveQuantity(s, 9999), 25);
  });

  it("falls back to the default for a non-integer or missing request", () => {
    const s = spec({ quantity: { min: 1, max: 25, default: 4 } });
    assert.equal(resolveQuantity(s, undefined), 4);
    assert.equal(resolveQuantity(s, 2.5), 4);
  });

  it("only allows declared preset sizes when presets are used", () => {
    const s = spec({
      quantity: { min: 4, max: 12, default: 4, presets: [4, 6, 12] },
    });
    assert.equal(resolveQuantity(s, 6), 6);
    assert.equal(resolveQuantity(s, 12), 12);
    assert.equal(resolveQuantity(s, 7), 4, "undeclared size falls back");
  });

  it("rejects a spec whose default sits outside [min, max]", () => {
    assert.throws(() => spec({ quantity: { min: 4, max: 12, default: 20 } }));
  });

  it("rejects presets outside [min, max]", () => {
    assert.throws(() =>
      spec({ quantity: { min: 4, max: 12, default: 4, presets: [4, 6, 99] } }),
    );
  });
});

describe("quantity stays out of the geometry cache key", () => {
  it("canonical params are identical for any run size", () => {
    // Quantity is a sibling field on the job, never a param — 1 unit and 25
    // units are the same STL and must hit the same cached geometry.
    const s = spec({ quantity: { min: 1, max: 25, default: 1 } });
    const values = { logo: VALID_ASSET, widthMm: 40 };
    const a = validateParams(s, values);
    const b = validateParams(s, values);
    assert.equal(a.ok && b.ok && a.hash === b.hash, true);

    const canonical = canonicaliseParams(s.id, s.version, values);
    assert.equal(canonical.includes("quantity"), false);
  });

  it("changing the logo DOES change the hash", () => {
    const s = spec();
    const a = validateParams(s, { logo: VALID_ASSET, widthMm: 40 });
    const b = validateParams(s, {
      logo: "asset_ffffffffffffffffffffffff",
      widthMm: 40,
    });
    assert.equal(a.ok && b.ok && a.hash !== b.hash, true);
  });

  it("rejects unknown params rather than silently ignoring them", () => {
    const r = validateParams(spec(), {
      logo: "",
      widthMm: 40,
      quantity: 25,
    });
    assert.equal(r.ok, false);
  });
});
