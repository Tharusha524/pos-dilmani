import type { Item } from "../../../api/itemsApi";

/**
 * Whether a typed or scanned bill number refers to this sale.
 *
 * Accepts the full "SAL-0087", and also a bare "87" or "0087", since a cashier
 * reading a number off a crumpled receipt rarely types the prefix. Only a pure
 * number is matched loosely, so another document type's "XYZ-87" can never
 * pull up bill SAL-0087.
 */
export function billNumberMatches(salesId: string, query: string): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return false;
  if (salesId.toUpperCase() === q) return true;

  const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");
  const qDigits = digits(q);

  return /^\d+$/.test(q) && qDigits !== "" && digits(salesId) === qDigits;
}

/** At or below the item's own reorder level, with some stock still left. */
export function isLowStock(item: Pick<Item, "qty" | "reorder_qty">): boolean {
  const qty = Number(item.qty ?? 0);
  const reorder = Number(item.reorder_qty ?? 0);
  return reorder > 0 && qty > 0 && qty <= reorder;
}
