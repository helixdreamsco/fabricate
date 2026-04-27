"""Server-side pricing.

Mirrors the shape of the web-side estimator but takes its weight & time
inputs from the real slicer when available. Pricing logic must live server-
side so the client can't forge a cheaper quote.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict


MATERIAL_DENSITY = {
    "PLA": 1.24,
    "PETG": 1.27,
    "ABS": 1.04,
    "TPU": 1.21,
}
MATERIAL_PRICE_PER_G = {
    "PLA": 0.085,
    "PETG": 0.11,
    "ABS": 0.12,
    "TPU": 0.18,
}

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
    weight_g_override: float | None = None,
    time_minutes_override: float | None = None,
    engine: str = "volume-estimate",
    discount_pct: int = 0,
    free_mode: bool = False,
    color_count: int = 1,
) -> Quote:
    density = MATERIAL_DENSITY[material]
    price_per_g = MATERIAL_PRICE_PER_G[material]
    time_mult = QUALITY_TIME_MULT[quality]

    if weight_g_override is not None:
        weight_g = weight_g_override * quantity
    else:
        infill_factor = 0.25 + (infill_pct / 100.0) * 0.75
        weight_g = volume_cm3 * density * infill_factor * quantity

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
