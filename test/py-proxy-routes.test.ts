/**
 * The allowlist in front of the FastAPI service.
 *
 * This is the boundary between the public internet and a private internal
 * service. The rewrite it replaced forwarded everything, so these tests
 * exist to make an accidental re-widening loud.
 *
 * Run: npm test
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { PY_ROUTES, resolvePyRoute } from "@/lib/py-proxy-routes";

describe("resolvePyRoute", () => {
  it("allows the three endpoints the browser actually needs", () => {
    assert.equal(resolvePyRoute(["health"])?.access, "public");
    assert.equal(resolvePyRoute(["analyze"])?.access, "public");
    assert.equal(resolvePyRoute(["quote"])?.access, "signed-in");
  });

  it("refuses the design endpoints", () => {
    // Server-to-server only: each call is minutes of generation, metered
    // per user everywhere else. A browser must never reach them.
    for (const p of [
      ["design", "generate"],
      ["design", "repair"],
      ["design"],
    ]) {
      assert.equal(resolvePyRoute(p), null, p.join("/"));
    }
  });

  it("refuses nested paths even under an allowed first segment", () => {
    // Matching on segments[0] alone would open a whole subtree the moment
    // someone adds a prefix entry.
    assert.equal(resolvePyRoute(["quote", "internal"]), null);
    assert.equal(resolvePyRoute(["health", "..", "design", "generate"]), null);
  });

  it("refuses empty and malformed paths", () => {
    assert.equal(resolvePyRoute([]), null);
    assert.equal(resolvePyRoute(undefined), null);
    assert.equal(resolvePyRoute([""]), null);
  });

  it("does not resolve inherited Object properties", () => {
    // A plain object literal as a lookup table: "constructor" and friends
    // must not come back as routes.
    for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      assert.equal(resolvePyRoute([key]), null, key);
    }
  });

  it("rate-limits every exposed route", () => {
    for (const [name, route] of Object.entries(PY_ROUTES)) {
      assert.ok(route.limitPerMin > 0, `${name} has no limit`);
      assert.ok(route.limitPerMin <= 120, `${name} limit is too generous`);
    }
  });

  it("keeps slicing behind a session", () => {
    // /quote runs PrusaSlicer. It is only ever called from /configure,
    // which is auth-gated, so requiring a session costs nothing real.
    assert.equal(PY_ROUTES.quote.access, "signed-in");
  });
});
