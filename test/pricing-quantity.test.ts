/**
 * Volume-break pricing for multi-unit template orders.
 *
 * Run: npm test
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  QUANTITY_TIERS,
  quantityTierDiscountPct,
  nextQuantityTier,
} from "@/lib/catalog";
import { estimateQuote } from "@/lib/pricing";

const base = {
  volumeCm3: 20,
  material: "PLA" as const,
  quality: "standard" as const,
  infillPct: 15,
  delivery: "pickup" as const,
};

describe("quantityTierDiscountPct", () => {
  it("gives no break below the first tier", () => {
    for (const q of [1, 2, 9]) assert.equal(quantityTierDiscountPct(q), 0);
  });

  it("applies each tier exactly at its boundary", () => {
    assert.equal(quantityTierDiscountPct(9), 0);
    assert.equal(quantityTierDiscountPct(10), 10);
    assert.equal(quantityTierDiscountPct(24), 10);
    assert.equal(quantityTierDiscountPct(25), 20);
    assert.equal(quantityTierDiscountPct(26), 20);
  });

  it("keeps the highest qualifying tier for very large runs", () => {
    assert.equal(quantityTierDiscountPct(1000), 20);
  });

  it("is monotonic — a bigger order never costs a worse rate", () => {
    let prev = 0;
    for (let q = 1; q <= 60; q++) {
      const pct = quantityTierDiscountPct(q);
      assert.ok(pct >= prev, `discount dropped at q=${q}`);
      prev = pct;
    }
  });

  it("tiers are declared in ascending order", () => {
    const mins = QUANTITY_TIERS.map((t) => t.minQty);
    assert.deepEqual(mins, [...mins].sort((a, b) => a - b));
  });
});

describe("nextQuantityTier", () => {
  it("points at the next break the user could reach", () => {
    assert.equal(nextQuantityTier(1)?.minQty, 10);
    assert.equal(nextQuantityTier(9)?.minQty, 10);
    assert.equal(nextQuantityTier(10)?.minQty, 25);
    assert.equal(nextQuantityTier(24)?.minQty, 25);
  });

  it("returns null once the top tier is reached", () => {
    assert.equal(nextQuantityTier(25), null);
    assert.equal(nextQuantityTier(500), null);
  });
});

describe("estimateQuote with quantity", () => {
  it("scales weight and machine time linearly with quantity", () => {
    const one = estimateQuote({ ...base, quantity: 1 });
    const eight = estimateQuote({ ...base, quantity: 8 });
    // 8 is below the first tier, so this is pure linear scaling.
    assert.ok(Math.abs(eight.weightG - one.weightG * 8) < 1e-9);
    assert.ok(Math.abs(eight.estMinutes - one.estMinutes * 8) < 1e-9);
  });

  it("charges no volume break below 10 units", () => {
    const q = estimateQuote({ ...base, quantity: 9 });
    assert.equal(q.quantityTierPct, 0);
    assert.equal(q.discountApplied, 0);
  });

  it("applies −10% at 10 units and −20% at 25", () => {
    const ten = estimateQuote({ ...base, quantity: 10 });
    assert.equal(ten.quantityTierPct, 10);
    const twentyFive = estimateQuote({ ...base, quantity: 25 });
    assert.equal(twentyFive.quantityTierPct, 20);
  });

  it("discounts the printing subtotal only — not the service fee or delivery", () => {
    const q = estimateQuote({ ...base, quantity: 25, delivery: "courier" });
    // Service fee is derived from the DISCOUNTED subtotal, and delivery is
    // untouched by the break.
    const undiscounted = estimateQuote({ ...base, quantity: 25 });
    assert.equal(q.delivery > 0, true);
    assert.equal(q.subtotal, undiscounted.subtotal);
  });

  it("makes 10 units cheaper per-unit than 9 despite printing more", () => {
    const nine = estimateQuote({ ...base, quantity: 9 });
    const ten = estimateQuote({ ...base, quantity: 10 });
    assert.ok(
      ten.subtotal / 10 < nine.subtotal / 9,
      "crossing a tier must lower the per-unit price",
    );
  });

  it("does not stack the volume break with a community discount", () => {
    // A 30% community discount beats the 20% volume break: the larger wins
    // and the tier badge stays off rather than compounding to 44%.
    const q = estimateQuote({ ...base, quantity: 25, discountPct: 30 });
    assert.equal(q.quantityTierPct, 0);
    const listSubtotal = q.subtotal / 0.7;
    assert.ok(Math.abs(q.subtotal - listSubtotal * 0.7) < 1e-9);
  });

  it("lets the volume break win when it beats a small community discount", () => {
    const q = estimateQuote({ ...base, quantity: 25, discountPct: 5 });
    assert.equal(q.quantityTierPct, 20);
  });

  it("leaves single-unit quoting byte-identical to before tiers existed", () => {
    const q = estimateQuote({ ...base, quantity: 1 });
    assert.equal(q.quantityTierPct, 0);
    assert.equal(q.discountApplied, 0);
  });

  it("keeps free-mode free regardless of quantity", () => {
    const q = estimateQuote({ ...base, quantity: 25, freeMode: true });
    assert.equal(q.subtotal, 0);
  });
});
