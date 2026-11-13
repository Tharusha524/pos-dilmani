import type { DiscountType, Item } from "../../../api/itemsApi";

/**
 * Discount arithmetic for one cart line.
 *
 * A deliberate mirror of the server's App\Support\LineDiscount. The running
 * total on screen must match what the server records to the cent — the
 * cashier collects cash against this total — so the two implementations are
 * kept identical and their test suites assert the same cases. Change one,
 * change both.
 *
 * An "amount" discount is per unit: on an item, "Rs 50 off" means each shirt.
 */

export function normalizeDiscountType(type: unknown): DiscountType {
  return type === "amount" ? "amount" : "percent";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lineGross(qty: number, unitPrice: number): number {
  return round2(Math.max(0, qty) * Math.max(0, unitPrice));
}

/** Money taken off a line. Never negative, never more than the line. */
export function lineDiscountAmount(
  qty: number,
  unitPrice: number,
  type: DiscountType,
  value: number
): number {
  const gross = lineGross(qty, unitPrice);
  const v = Math.max(0, Number(value) || 0);

  if (gross <= 0 || v <= 0) return 0;

  const amount =
    normalizeDiscountType(type) === "amount" ? v * Math.max(0, qty) : (gross * v) / 100;

  return round2(Math.min(gross, amount));
}

/**
 * The largest discount the item allows on this line, or null for no limit.
 *
 * Zero means no limit: every item defaults to 0, so treating it as "no
 * discount allowed" would block the default discount on every such item.
 */
export function maxLineDiscountAmount(
  qty: number,
  unitPrice: number,
  maxDiscount: number,
  maxDiscountType: DiscountType
): number | null {
  if (!(Number(maxDiscount) > 0)) return null;
  return lineDiscountAmount(qty, unitPrice, maxDiscountType, maxDiscount);
}

/**
 * The highest discount VALUE (in the line's own unit) that stays within the
 * item's ceiling. Used to clamp what the cashier types, so the server never
 * has to reject a sale the cashier has already quoted.
 */
export function maxDiscountValueFor(
  qty: number,
  unitPrice: number,
  type: DiscountType,
  maxDiscount: number,
  maxDiscountType: DiscountType
): number | null {
  const ceiling = maxLineDiscountAmount(qty, unitPrice, maxDiscount, maxDiscountType);
  if (ceiling === null) return null;

  const gross = lineGross(qty, unitPrice);
  if (gross <= 0) return 0;

  // Rounded DOWN, so a clamped value can never round up past the ceiling.
  const floor2 = (n: number) => Math.floor(n * 100 + 1e-9) / 100;

  return normalizeDiscountType(type) === "amount"
    ? floor2(ceiling / Math.max(qty, 1e-9))
    : floor2((ceiling / gross) * 100);
}

export interface LineDiscountFields {
  qty: number;
  unit_price: number;
  discount_type?: DiscountType | null;
  discount_value?: number | null;
}

/**
 * A line's discount amount and net total, from its own fields. Every place the
 * cart changes a line's quantity, price or discount routes through this, so a
 * discount can never be left stale against an old quantity.
 */
export function priceLine<T extends LineDiscountFields>(
  line: T
): T & { discount_amount: number; line_total: number } {
  const type = normalizeDiscountType(line.discount_type);
  const value = Math.max(0, Number(line.discount_value) || 0);
  const amount = lineDiscountAmount(line.qty, line.unit_price, type, value);

  return {
    ...line,
    discount_type: value > 0 ? type : (line.discount_type ?? null),
    discount_value: value,
    discount_amount: amount,
    line_total: round2(lineGross(line.qty, line.unit_price) - amount),
  };
}

/**
 * The discount a fresh cart line starts with: the item's own default, when item
 * discounts are switched on. Returns nothing when the item has no default, so
 * the line starts undiscounted rather than at an explicit 0%.
 */
export function defaultDiscountForItem(
  item: Pick<Item, "default_discount" | "default_discount_type">,
  allowItemDiscount: boolean
): { discount_type: DiscountType; discount_value: number } | null {
  const value = Number(item.default_discount ?? 0);
  if (!allowItemDiscount || !(value > 0)) return null;

  return {
    discount_type: normalizeDiscountType(item.default_discount_type),
    discount_value: value,
  };
}
