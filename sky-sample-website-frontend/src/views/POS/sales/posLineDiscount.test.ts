import {
  defaultDiscountForItem,
  lineDiscountAmount,
  lineGross,
  maxDiscountValueFor,
  maxLineDiscountAmount,
  normalizeDiscountType,
  priceLine,
} from "./posLineDiscount";

// These cases mirror backend/tests/Unit/LineDiscountTest.php one-for-one. The
// till's running total and the saved sale must agree to the cent.
describe("lineDiscountAmount (mirrors server LineDiscount)", () => {
  test("percent comes off the line gross", () => {
    expect(lineDiscountAmount(3, 1000, "percent", 10)).toBe(300);
  });

  test("amount is per unit, not per line", () => {
    expect(lineDiscountAmount(3, 1000, "amount", 50)).toBe(150);
  });

  test("never exceeds the line", () => {
    expect(lineDiscountAmount(1, 1000, "percent", 150)).toBe(1000);
    expect(lineDiscountAmount(1, 1000, "amount", 5000)).toBe(1000);
  });

  test("zero or negative value means no discount", () => {
    expect(lineDiscountAmount(2, 1000, "percent", 0)).toBe(0);
    expect(lineDiscountAmount(2, 1000, "percent", -10)).toBe(0);
  });

  test("a free line has nothing to discount", () => {
    expect(lineDiscountAmount(2, 0, "percent", 10)).toBe(0);
  });

  test("unknown type is treated as percent", () => {
    expect(normalizeDiscountType("bogus")).toBe("percent");
    expect(normalizeDiscountType(null)).toBe("percent");
    expect(normalizeDiscountType("amount")).toBe("amount");
  });

  test("rounded to cents", () => {
    expect(lineDiscountAmount(1, 99.99, "percent", 33.33)).toBe(33.33);
  });

  test("decimal quantities scale an amount discount", () => {
    expect(lineDiscountAmount(1.5, 400, "amount", 20)).toBe(30);
  });

  test("gross ignores negative inputs", () => {
    expect(lineGross(-1, 1000)).toBe(0);
    expect(lineGross(1, -1000)).toBe(0);
    expect(lineGross(1, 2500.5)).toBe(2500.5);
  });
});

describe("maxLineDiscountAmount", () => {
  test("zero ceiling means no limit", () => {
    expect(maxLineDiscountAmount(2, 1000, 0, "percent")).toBeNull();
  });

  test("percent ceiling scales with the line", () => {
    expect(maxLineDiscountAmount(2, 1000, 20, "percent")).toBe(400);
  });

  test("amount ceiling is per unit", () => {
    expect(maxLineDiscountAmount(2, 1000, 100, "amount")).toBe(200);
  });
});

describe("maxDiscountValueFor — clamping what the cashier types", () => {
  test("no ceiling, no clamp", () => {
    expect(maxDiscountValueFor(2, 1000, "percent", 0, "percent")).toBeNull();
  });

  test("percent line against a percent ceiling", () => {
    expect(maxDiscountValueFor(2, 1000, "percent", 20, "percent")).toBe(20);
  });

  test("percent line against a Rs ceiling converts the unit", () => {
    // Ceiling Rs 100/unit on a Rs 1,000 item = 10% of the line.
    expect(maxDiscountValueFor(2, 1000, "percent", 100, "amount")).toBe(10);
  });

  test("Rs line against a percent ceiling converts the unit", () => {
    // 20% of Rs 1,000 = Rs 200 per unit.
    expect(maxDiscountValueFor(3, 1000, "amount", 20, "percent")).toBe(200);
  });

  test("the clamp itself is always accepted by the ceiling", () => {
    // Awkward prices that do not divide cleanly must still round down, never
    // up past the ceiling — otherwise the server would reject the clamp.
    const cases: [number, number, number][] = [
      [3, 333.33, 17],
      [7, 99.99, 13.5],
      [1, 1, 33.33],
    ];

    for (const [qty, price, max] of cases) {
      const value = maxDiscountValueFor(qty, price, "percent", max, "percent")!;
      const ceiling = maxLineDiscountAmount(qty, price, max, "percent")!;
      expect(lineDiscountAmount(qty, price, "percent", value)).toBeLessThanOrEqual(
        ceiling + 0.01
      );
    }
  });
});

describe("priceLine", () => {
  test("net line total is gross minus the discount", () => {
    const priced = priceLine({
      qty: 2,
      unit_price: 1000,
      discount_type: "percent",
      discount_value: 10,
    });

    expect(priced.discount_amount).toBe(200);
    expect(priced.line_total).toBe(1800);
  });

  test("recomputes when the quantity changes, so a discount never goes stale", () => {
    const one = priceLine({ qty: 1, unit_price: 1000, discount_type: "amount", discount_value: 50 });
    const three = priceLine({ ...one, qty: 3 });

    expect(one.line_total).toBe(950);
    expect(three.discount_amount).toBe(150);
    expect(three.line_total).toBe(2850);
  });

  test("an undiscounted line totals at gross", () => {
    const priced = priceLine({ qty: 4, unit_price: 250 });

    expect(priced.discount_amount).toBe(0);
    expect(priced.line_total).toBe(1000);
  });

  test("keeps the line's other fields", () => {
    const priced = priceLine({ qty: 1, unit_price: 10, key: "a", item_number: "TEE" });

    expect(priced.key).toBe("a");
    expect(priced.item_number).toBe("TEE");
  });
});

describe("defaultDiscountForItem", () => {
  test("uses the item's default when discounts are on", () => {
    expect(
      defaultDiscountForItem({ default_discount: 10, default_discount_type: "percent" }, true)
    ).toEqual({ discount_type: "percent", discount_value: 10 });
  });

  test("ignores the default when the shop turned item discounts off", () => {
    expect(
      defaultDiscountForItem({ default_discount: 10, default_discount_type: "percent" }, false)
    ).toBeNull();
  });

  test("no default means no discount, not an explicit zero", () => {
    expect(defaultDiscountForItem({ default_discount: 0 }, true)).toBeNull();
    expect(defaultDiscountForItem({}, true)).toBeNull();
  });
});
