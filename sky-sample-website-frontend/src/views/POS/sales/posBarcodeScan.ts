import type { Item } from "../../../api/itemsApi";
import { normalizeBarcode } from "../../../utils/barcode";

/**
 * Find the item a scanned code refers to, within the catalog already loaded
 * in the browser.
 *
 * Fields are tried most-specific first — barcode, then SKU, then the two item
 * codes, then the item number — so a genuine barcode is never beaten by a
 * loose match on some other field.
 *
 * Crucially this returns ALL products that matched, and the caller decides
 * what to do when there is more than one. It never picks a "best" candidate:
 * the POS search box can afford a best guess because a human is reading the
 * results, but a scan happens in a fraction of a second with the cashier
 * already reaching for the next garment. Guessing there means the wrong item
 * is silently billed, and the stock count for both items goes wrong.
 */
export function matchScannedCodeInCatalog(code: string, items: Item[]): Item[] {
  const needle = normalizeBarcode(code).toLowerCase();
  if (!needle) return [];

  const fields: ((item: Item) => string | null | undefined)[] = [
    (i) => i.barcode,
    (i) => i.sku,
    (i) => i.item_code,
    (i) => i.supplier_item_code,
    (i) => i.item_number,
  ];

  for (const read of fields) {
    const hits = items.filter(
      (item) => normalizeBarcode(read(item)).toLowerCase() === needle
    );

    if (hits.length > 0) {
      return dedupeByItemNumber(hits);
    }
  }

  return [];
}

/**
 * Collapse a product's per-branch rows into one entry.
 *
 * An item has one row per branch, all sharing an item_number and a barcode.
 * Those are the same shirt, not competing matches — without this, a shop with
 * three branches would be asked to "pick one" on every single scan.
 */
export function dedupeByItemNumber(items: Item[]): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];

  for (const item of items) {
    if (!seen.has(item.item_number)) {
      seen.add(item.item_number);
      out.push(item);
    }
  }

  return out;
}

/**
 * Whether two scans should be treated as the same physical swipe.
 *
 * Handheld scanners occasionally fire twice for one pass of the beam, and a
 * cashier resting a garment on the glass can trigger a continuous repeat. Both
 * would silently double-bill. A scan of the same code inside this window is
 * therefore ignored — deliberately short, because scanning two identical
 * shirts back to back is normal and must still count as two.
 */
export const DUPLICATE_SCAN_WINDOW_MS = 400;

export function isDuplicateScan(
  code: string,
  lastCode: string | null,
  lastScanAt: number | null,
  now: number = Date.now()
): boolean {
  if (!lastCode || lastScanAt === null) return false;

  return (
    normalizeBarcode(code) === normalizeBarcode(lastCode) &&
    now - lastScanAt < DUPLICATE_SCAN_WINDOW_MS
  );
}

/**
 * Items matching what the cashier is typing, for the suggestions dropdown.
 *
 * Unlike {@link matchScannedCodeInCatalog} this matches partially and across
 * the item name, because a person typing "black" has not finished the word and
 * may not know any code at all. An exact code match is still floated to the
 * top, so a hand-typed full barcode lands first in the list.
 */
export function searchCatalogItems(
  query: string,
  items: Item[],
  limit = 20
): Item[] {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return [];

  const fields = (item: Item): string[] =>
    [
      item.barcode,
      item.item_number,
      item.sku,
      item.item_code,
      item.supplier_item_code,
      item.description,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

  const exact: Item[] = [];
  const partial: Item[] = [];

  for (const item of items) {
    const values = fields(item);

    if (values.some((value) => value === needle)) {
      exact.push(item);
    } else if (values.some((value) => value.includes(needle))) {
      partial.push(item);
    }
  }

  // Branch rows of one product are the same shirt, so they are collapsed here
  // too — otherwise a three-branch shop sees every suggestion three times.
  return dedupeByItemNumber([...exact, ...partial]).slice(0, limit);
}
