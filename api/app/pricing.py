"""Server-side pricing.

Mirrors the shape of the web-side estimator but takes its weight & time
inputs from the real slicer when available. Pricing logic must live server-
side so the client can't forge a cheaper quote.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict


# Keep in step with src/lib/catalog.ts — MATERIAL_DENSITY_G_PER_CM3 and
# MATERIAL_RATE_GBP_PER_GRAM. The TS side is canonical (it's what the
# creator sees first); these exist because pricing must also be computed
# somewhere the client can't forge.
MATERIAL_DENSITY = {
    "PLA": 1.24,
    "PETG": 1.27,
    "ABS": 1.04,
    "ASA": 1.07,
    "TPU": 1.21,
}
MATERIAL_PRICE_PER_G = {
    "PLA": 0.045,
    "PETG": 0.058,
    "ABS": 0.064,
    "TPU": 0.095,
}

# Shell + infill estimation, mirroring src/lib/filament.ts. Only used when
# PrusaSlicer is unavailable — when it runs, weight comes from the G-code.
WALL_THICKNESS_MM = 0.9
WASTE_FACTOR = 1.07


def estimate_printed_volume_cm3(
    *,
    volume_cm3: float,
    surface_area_cm2: float,
    infill_pct: int,
    wall_thickness_mm: float = WALL_THICKNESS_MM,
) -> float:
    """Volume of plastic actually extruded for a hollow FDM part."""
    if volume_cm3 <= 0:
        return 0.0
    area = surface_area_cm2 if surface_area_cm2 > 0 else 6 * (volume_cm3 ** (2 / 3))
    shell_cm3 = min(area * (wall_thickness_mm / 10.0), volume_cm3)
    interior_cm3 = volume_cm3 - shell_cm3
    fill = min(1.0, max(0.0, infill_pct / 100.0))
    return shell_cm3 + interior_cm3 * fill

QUALITY_LAYER_MM = {"draft": 0.28, "standard": 0.20, "fine": 0.12}
QUALITY_TIME_MULT = {"draft": 0.7, "standard": 1.0, "fine": 1.7}

DELIVERY_FEE = {"pickup": 0.0, "courier": 7.5}

SERVICE_FEE = 1.5
MARGIN = 1.4
MACHINE_RATE_PER_HOUR = 2.4
COLOR_CHANGE_SURCHARGE = 0.4  # GBP per extra colour for purge / waste tower


@dataclass
class Quote:
    weight_g: float
    time_minutes: float
    material_cost: float
    machine_cost: float
    service_fee: float
    delivery: float
    subtotal: float
    discount_applied: float
    multi_material_surcharge: float
    total: float
    engine: str  # "prusa-slicer" | "volume-estimate"


def quote(
    *,
    volume_cm3: float,
    material: str,
    quality: str,
    infill_pct: int,
    quantity: int,
    delivery: str,
    surface_area_cm2: float = 0.0,
    weight_g_override: float | None = None,
    time_minutes_override: float | None = None,
    engine: str = "volume-estimate",
    discount_pct: int = 0,
    free_mode: bool = False,
    color_count: int = 1,
    price_per_g_override: float | None = None,
) -> Quote:
    density = MATERIAL_DENSITY[material]
    # Maker-set filament rates will arrive here as an override; the
    # platform default is only the fallback.
    price_per_g = (
        price_per_g_override
        if price_per_g_override is not None
        else MATERIAL_PRICE_PER_G[material]
    )
    time_mult = QUALITY_TIME_MULT[quality]

    if weight_g_override is not None:
        weight_g = weight_g_override * quantity
    else:
        printed_cm3 = estimate_printed_volume_cm3(
            volume_cm3=volume_cm3,
            surface_area_cm2=surface_area_cm2,
            infill_pct=infill_pct,
        )
        weight_g = printed_cm3 * density * WASTE_FACTOR * quantity

    if time_minutes_override is not None:
        est_minutes = time_minutes_override * quantity
    else:
        infill_factor = 0.25 + (infill_pct / 100.0) * 0.75
        per_part_minutes = volume_cm3 * 1.6 * time_mult * (0.6 + infill_factor * 0.4)
        est_minutes = per_part_minutes * quantity

    material_cost = weight_g * price_per_g
    machine_cost = (est_minutes / 60.0) * MACHINE_RATE_PER_HOUR
    list_subtotal = (material_cost + machine_cost) * MARGIN
    delivery_fee = DELIVERY_FEE[delivery]

    if free_mode:
        subtotal = 0.0
    else:
        d = max(0, min(100, int(discount_pct)))
        subtotal = list_subtotal * (1 - d / 100.0)

    discount_applied = list_subtotal - subtotal

    extra_colors = max(0, int(color_count) - 1)
    multi_material_surcharge = (
        0.0 if free_mode else extra_colors * COLOR_CHANGE_SURCHARGE
    )

    total = subtotal + SERVICE_FEE + delivery_fee + multi_material_surcharge

    return Quote(
        weight_g=round(weight_g, 2),
        time_minutes=round(est_minutes, 1),
        material_cost=round(material_cost, 2),
        machine_cost=round(machine_cost, 2),
        service_fee=SERVICE_FEE,
        delivery=round(delivery_fee, 2),
        subtotal=round(subtotal, 2),
        discount_applied=round(discount_applied, 2),
        multi_material_surcharge=round(multi_material_surcharge, 2),
        total=round(total, 2),
        engine=engine,
    )


def as_dict(q: Quote) -> dict:
    return asdict(q)
