"use client";

export type ServerAnalysis = {
  filename: string;
  size_bytes: number;
  triangle_count: number;
  dims_mm: { x: number; y: number; z: number };
  volume_cm3: number;
  surface_area_cm2: number;
  is_watertight: boolean;
  used_convex_hull: boolean;
  warnings: string[];
  parts: Array<{
    index: number;
    name: string;
    triangle_count: number;
    volume_cm3: number;
    is_watertight: boolean;
  }>;
  is_multi_material: boolean;
};

export type ServerQuote = {
  analysis: ServerAnalysis;
  quote: {
    weight_g: number;
    time_minutes: number;
    material_cost: number;
    machine_cost: number;
    service_fee: number;
    delivery: number;
    subtotal: number;
    discount_applied: number;
    multi_material_surcharge: number;
    total: number;
    engine: string;
  };
};

export type SlicerStatus = {
  available: boolean;
  path: string | null;
  version: string | null;
  engine: string;
};

export async function fetchHealth(): Promise<{
  status: string;
  version: string;
  slicer: SlicerStatus;
} | null> {
  try {
    const res = await fetch("/api/py/health", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as {
      status: string;
      version: string;
      slicer: SlicerStatus;
    };
  } catch {
    return null;
  }
}

export async function postAnalyze(file: File): Promise<ServerAnalysis> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/py/analyze", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`analyze failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as ServerAnalysis;
}

export async function postQuote({
  file,
  material,
  quality,
  infill,
  quantity,
  delivery,
  discountPct,
  freeMode,
  colorCount,
  signal,
}: {
  file: File;
  material: string;
  quality: string;
  infill: number;
  quantity: number;
  delivery: "pickup" | "courier";
  discountPct?: number;
  freeMode?: boolean;
  colorCount?: number;
  signal?: AbortSignal;
}): Promise<ServerQuote> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("material", material);
  fd.append("quality", quality);
  fd.append("infill", String(infill));
  fd.append("quantity", String(quantity));
  fd.append("delivery", delivery);
  if (discountPct !== undefined) fd.append("discount_pct", String(discountPct));
  if (freeMode !== undefined) fd.append("free_mode", freeMode ? "true" : "false");
  if (colorCount !== undefined) fd.append("color_count", String(colorCount));
  const res = await fetch("/api/py/quote", {
    method: "POST",
    body: fd,
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`quote failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as ServerQuote;
}
