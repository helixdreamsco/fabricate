/**
 * Which FastAPI endpoints a browser may reach through /api/py/*.
 *
 * Kept apart from the route handler so the decision is testable on its own:
 * this is the whole security boundary between the public internet and a
 * private internal service, and "did we accidentally expose the generator"
 * is not a question to answer by reading a switch statement.
 */

export type PyRouteAccess = "public" | "signed-in";

export type PyRoute = {
  access: PyRouteAccess;
  limitPerMin: number;
};

/**
 * The old next.config rewrite forwarded `/api/py/*` wholesale, which would
 * have exposed `/design/generate` — minutes of mesh generation per call,
 * metered per user everywhere else — to anyone who could spell the URL.
 * Those endpoints are server-to-server only (see lib/design/pyapi.ts).
 */
export const PY_ROUTES: Record<string, PyRoute> = {
  // Slicer availability, for the engine badge.
  health: { access: "public", limitPerMin: 60 },
  // Mesh metrics. Anonymous by design — this runs on the landing page the
  // moment a signed-out visitor drops a file.
  analyze: { access: "public", limitPerMin: 30 },
  // Runs PrusaSlicer. Only reachable from /configure, which is itself
  // behind the auth gate, so requiring a session costs a real user nothing
  // and keeps anonymous traffic off the expensive path.
  quote: { access: "signed-in", limitPerMin: 60 },
};

/**
 * Resolve a proxied path to its rules, or null if it isn't proxyable.
 *
 * Only single-segment paths resolve. Nested ones (`design/generate`) are
 * rejected outright rather than matched on their first segment, so a new
 * `design` entry could never accidentally open the whole subtree.
 */
export function resolvePyRoute(segments: string[] | undefined): PyRoute | null {
  if (!segments || segments.length !== 1) return null;
  const key = segments[0];
  // hasOwn, not a bare lookup: `PY_ROUTES["constructor"]` walks the
  // prototype and hands back a truthy function, which sails past a
  // `?? null` and reaches the proxy with `access` and `limitPerMin`
  // undefined — no session required and no rate limit applied.
  if (!Object.hasOwn(PY_ROUTES, key)) return null;
  return PY_ROUTES[key];
}
