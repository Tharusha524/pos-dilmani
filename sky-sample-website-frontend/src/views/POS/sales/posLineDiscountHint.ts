import type { Item } from "../../../api/itemsApi";
import { normalizeDiscountType } from "./posLineDiscount";

/**
 * A short "Max 20%" / "Max Rs 100 per unit" hint for a cart line, or
 * undefined when the item sets no ceiling. Shown on hover so the cashier knows
 * the limit before typing a value that will be cut down to it.
 */
export function maxDiscountHint(
  item: Pick<Item, "max_discount" | "max_discount_type"> | undefined
): string | undefined {
  const max = Number(item?.max_discount ?? 0);
  if (!item || !(max > 0)) return undefined;

  return normalizeDiscountType(item.max_discount_type) === "amount"
    ? `Max Rs ${max.toFixed(2)} per unit`
    : `Max ${max}%`;
}
