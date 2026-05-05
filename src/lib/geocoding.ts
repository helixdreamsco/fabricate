/**
 * UK postcode → lat/lng resolver via postcodes.io. Free, no auth, fast
 * (~100ms typical). Bulk endpoint accepts up to 100 postcodes per call.
 *
 * On failure (network error, postcodes.io outage, malformed postcode) we
 * return null entries — geocoding is a nice-to-have for the marketplace
 * map and shouldn't break the underlying maker list.
 */

type PostcodesResult = {
  status: number;
  result: Array<{
    query: string;
    result: { latitude: number; longitude: number } | null;
  }>;
};

export async function geocodePostcodes(
  postcodes: string[],
): Promise<Map<string, { lat: number; lng: number }>> {
  const out = new Map<string, { lat: number; lng: number }>();
  const cleaned = Array.from(
    new Set(postcodes.map((p) => p.trim()).filter((p) => p.length > 0)),
  );
  if (cleaned.length === 0) return out;

  // postcodes.io batch limit is 100; chunk if we ever exceed.
  for (let i = 0; i < cleaned.length; i += 100) {
    const chunk = cleaned.slice(i, i + 100);
    try {
      const res = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postcodes: chunk }),
        // 5s timeout — postcodes.io is normally < 200ms.
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as PostcodesResult;
      for (const r of data.result ?? []) {
        if (r.result?.latitude != null && r.result?.longitude != null) {
          out.set(r.query, {
            lat: r.result.latitude,
            lng: r.result.longitude,
          });
        }
      }
    } catch {
      // Swallow — degraded mode (no map markers for this batch).
    }
  }
  return out;
}
