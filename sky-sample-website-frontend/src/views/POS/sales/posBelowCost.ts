import type { Item } from "../../../api/itemsApi";

/**
 * Below-cost detection for the cart.
 *
 * Mirrors the server's OrderTransactionService::assertNotBelowCost so the
 * cashier sees a problem the moment it appears, rather than when the sale is
 * refused at Pay. The server is still the authority; this only warns early.
 *
 * Items with no recorded purchase price are never flagged — there is nothing
 * for them to fall below.
 */

export interface CostCheckLine {
  key: string;
  item_id: number | null;
  item_number?: string | null;
  description: string;
  qty: number;
  line_total: number;
  line_direction?: string | null;
}

export interface BelowCostLine {
  key: string;
  label: string;
  netUnit: number;
  unitCost: number;
}

/** Half a cent, so a line priced exactly at cost is never flagged by rounding. */
const TOLERANCE = 0.005;

export function unitCostOf(item: Pick<Item, "purchase_price"> | undefined): number {
  return Math.max(0, Number(item?.purchase_price ?? 0));
}

export function findBelowCostLines(
  lines: CostCheckLine[],
  itemById: Map<number, Pick<Item, "purchase_price">>
): BelowCostLine[] {
  const out: BelowCostLine[] = [];

  for (const line of lines) {
    if (line.line_direction === "return") continue;

    const qty = Number(line.qty) || 0;
    const unitCost = unitCostOf(line.item_id != null ? itemById.get(line.item_id) : undefined);
    if (qty <= 0 || unitCost <= 0) continue;

    const netUnit = (Number(line.line_total) || 0) / qty;
    if (netUnit < unitCost - TOLERANCE) {
      out.push({
        key: line.key,
        label: line.item_number || line.description,
        netUnit: Math.round(netUnit * 100) / 100,
        unitCost,
      });
    }
  }

  return out;
}

/**
 * Whether a whole-bill discount takes the bill below what its goods cost.
 * Returns the two figures when it does, so the message can name them.
 */
export function billBelowCost(
  lines: CostCheckLine[],
  itemById: Map<number, Pick<Item, "purchase_price">>,
  billLevelDiscount: number
): { net: number; cost: number } | null {
  if (!(billLevelDiscount > 0)) return null;

  let net = 0;
  let cost = 0;

  for (const line of lines) {
    if (line.line_direction === "return") continue;

    net += Number(line.line_total) || 0;
    const unitCost = unitCostOf(line.item_id != null ? itemById.get(line.item_id) : undefined);
    cost += unitCost * (Number(line.qty) || 0);
  }

  if (cost <= 0) return null;

  const netAfter = Math.round((net - billLevelDiscount) * 100) / 100;
  const costRounded = Math.round(cost * 100) / 100;

  return netAfter < costRounded - TOLERANCE ? { net: netAfter, cost: costRounded } : null;
}
