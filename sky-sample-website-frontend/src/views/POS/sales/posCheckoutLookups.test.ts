import { billNumberMatches, isLowStock } from "./posCheckoutLookups";

describe("billNumberMatches — finding an old bill to reprint", () => {
  test("the full number, any case", () => {
    expect(billNumberMatches("SAL-0087", "SAL-0087")).toBe(true);
    expect(billNumberMatches("SAL-0087", "sal-0087")).toBe(true);
  });

  test("a bare number, as read off a crumpled receipt", () => {
    expect(billNumberMatches("SAL-0087", "87")).toBe(true);
    expect(billNumberMatches("SAL-0087", "0087")).toBe(true);
  });

  test("a different number does not match", () => {
    expect(billNumberMatches("SAL-0087", "88")).toBe(false);
    expect(billNumberMatches("SAL-0087", "870")).toBe(false);
  });

  test("a different prefix is not loosely matched", () => {
    // Only a pure number is matched loosely, so another document type's
    // "XYZ-87" cannot pull up bill SAL-0087.
    expect(billNumberMatches("SAL-0087", "XYZ-87")).toBe(false);
  });

  test("an empty search matches nothing", () => {
    expect(billNumberMatches("SAL-0087", "")).toBe(false);
    expect(billNumberMatches("SAL-0087", "   ")).toBe(false);
  });

  test("whitespace from a scanner is ignored", () => {
    expect(billNumberMatches("SAL-0087", " SAL-0087\n")).toBe(true);
  });
});

describe("isLowStock", () => {
  test("at or below the reorder level is low", () => {
    expect(isLowStock({ qty: 5, reorder_qty: 5 })).toBe(true);
    expect(isLowStock({ qty: 2, reorder_qty: 5 })).toBe(true);
  });

  test("above the reorder level is not low", () => {
    expect(isLowStock({ qty: 6, reorder_qty: 5 })).toBe(false);
  });

  test("no reorder level set means never low", () => {
    expect(isLowStock({ qty: 1, reorder_qty: 0 })).toBe(false);
  });

  test("out of stock is its own state, not low stock", () => {
    expect(isLowStock({ qty: 0, reorder_qty: 5 })).toBe(false);
  });
});
