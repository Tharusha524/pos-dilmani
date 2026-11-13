import type { Item } from "../../../api/itemsApi";
import {
  DUPLICATE_SCAN_WINDOW_MS,
  dedupeByItemNumber,
  isDuplicateScan,
  matchScannedCodeInCatalog,
  searchCatalogItems,
} from "./posBarcodeScan";

function item(partial: Partial<Item> & { item_number: string }): Item {
  return {
    id: Math.random(),
    description: `Item ${partial.item_number}`,
    category: null,
    sub_category: null,
    product_type: null,
    location: "Main Location",
    selling_price: 100,
    is_active: true,
    status: "Active",
    ...partial,
  } as Item;
}

describe("matchScannedCodeInCatalog", () => {
  test("matches on barcode", () => {
    const items = [
      item({ item_number: "A1", barcode: "2000010000017" }),
      item({ item_number: "A2", barcode: "2000010000024" }),
    ];

    const hits = matchScannedCodeInCatalog("2000010000024", items);

    expect(hits).toHaveLength(1);
    expect(hits[0].item_number).toBe("A2");
  });

  test("ignores the whitespace a scanner appends to a code", () => {
    const items = [item({ item_number: "A1", barcode: "2000010000017" })];

    expect(matchScannedCodeInCatalog(" 2000010000017\n", items)).toHaveLength(1);
    expect(matchScannedCodeInCatalog("2000 0100 00017", items)).toHaveLength(1);
  });

  test("hyphens are content, not noise, so they are not stripped", () => {
    // CODE128 codes legitimately contain hyphens ("TEE-BLACK-M"), so a hyphen
    // cannot be treated as a separator — stripping it would make "TEE-M" and
    // "TEEM" collide. A hyphenated version of a numeric code is therefore a
    // different code, not the same one typed differently.
    const items = [item({ item_number: "A1", barcode: "2000010000017" })];

    expect(matchScannedCodeInCatalog("2000-0100-00017", items)).toEqual([]);

    const hyphenated = [item({ item_number: "A2", barcode: "TEE-BLACK-M" })];
    expect(matchScannedCodeInCatalog("TEE-BLACK-M", hyphenated)).toHaveLength(1);
  });

  test("barcode wins over another item's sku holding the same value", () => {
    const items = [
      item({ item_number: "SKU-HOLDER", sku: "555" }),
      item({ item_number: "BARCODE-HOLDER", barcode: "555" }),
    ];

    const hits = matchScannedCodeInCatalog("555", items);

    expect(hits).toHaveLength(1);
    expect(hits[0].item_number).toBe("BARCODE-HOLDER");
  });

  test("falls through to sku, item codes, then item number", () => {
    const items = [
      item({ item_number: "A1", sku: "SKU1" }),
      item({ item_number: "A2", item_code: "IC2" }),
      item({ item_number: "A3", supplier_item_code: "SUP3" }),
      item({ item_number: "PLAIN" }),
    ];

    expect(matchScannedCodeInCatalog("SKU1", items)[0].item_number).toBe("A1");
    expect(matchScannedCodeInCatalog("IC2", items)[0].item_number).toBe("A2");
    expect(matchScannedCodeInCatalog("SUP3", items)[0].item_number).toBe("A3");
    expect(matchScannedCodeInCatalog("PLAIN", items)[0].item_number).toBe("PLAIN");
  });

  test("never guesses: an unknown code matches nothing", () => {
    const items = [item({ item_number: "A1", barcode: "2000010000017" })];

    expect(matchScannedCodeInCatalog("9999999999999", items)).toEqual([]);
  });

  test("an empty or separator-only scan matches nothing", () => {
    const items = [item({ item_number: "A1", barcode: "2000010000017" })];

    expect(matchScannedCodeInCatalog("", items)).toEqual([]);
    expect(matchScannedCodeInCatalog("   \n", items)).toEqual([]);
  });

  test("one branch row per product, so a scan is not falsely ambiguous", () => {
    const items = [
      item({ item_number: "TEE-M", barcode: "555", location: "Main Location" }),
      item({ item_number: "TEE-M", barcode: "555", location: "Branch 2" }),
      item({ item_number: "TEE-M", barcode: "555", location: "Branch 3" }),
    ];

    expect(matchScannedCodeInCatalog("555", items)).toHaveLength(1);
  });

  test("two different products on one code stay ambiguous", () => {
    const items = [
      item({ item_number: "TEE-S", barcode: "555" }),
      item({ item_number: "TEE-M", barcode: "555" }),
    ];

    expect(matchScannedCodeInCatalog("555", items)).toHaveLength(2);
  });
});

describe("dedupeByItemNumber", () => {
  test("keeps the first row of each product, in order", () => {
    const rows = [
      item({ item_number: "B", location: "Main Location" }),
      item({ item_number: "A" }),
      item({ item_number: "B", location: "Branch 2" }),
    ];

    const out = dedupeByItemNumber(rows);

    expect(out.map((i) => i.item_number)).toEqual(["B", "A"]);
    expect(out[0].location).toBe("Main Location");
  });
});

describe("isDuplicateScan", () => {
  test("a scanner firing twice for one swipe is suppressed", () => {
    expect(isDuplicateScan("555", "555", 1_000, 1_000 + 50)).toBe(true);
  });

  test("scanning two identical shirts in a row still counts twice", () => {
    expect(
      isDuplicateScan("555", "555", 1_000, 1_000 + DUPLICATE_SCAN_WINDOW_MS + 1)
    ).toBe(false);
  });

  test("a different code is never a duplicate", () => {
    expect(isDuplicateScan("556", "555", 1_000, 1_000 + 50)).toBe(false);
  });

  test("the first scan of a session is never a duplicate", () => {
    expect(isDuplicateScan("555", null, null, 1_000)).toBe(false);
  });
});

describe("searchCatalogItems", () => {
  const catalog = [
    item({ item_number: "TEE-BLK-S", description: "Round Neck Black — S", barcode: "2000010000017" }),
    item({ item_number: "TEE-BLK-M", description: "Round Neck Black — M", barcode: "2000010000024" }),
    item({ item_number: "TEE-WHT-L", description: "Printed Graphic White — L", barcode: "2000010000031", sku: "PGW-L" }),
  ];

  test("matches part of an item name as it is typed", () => {
    const hits = searchCatalogItems("black", catalog);

    expect(hits).toHaveLength(2);
    expect(hits.map((i) => i.item_number)).toEqual(["TEE-BLK-S", "TEE-BLK-M"]);
  });

  test("matching is case insensitive", () => {
    expect(searchCatalogItems("BLACK", catalog)).toHaveLength(2);
    expect(searchCatalogItems("Round Neck", catalog)).toHaveLength(2);
  });

  test("matches part of a code", () => {
    expect(searchCatalogItems("TEE-", catalog)).toHaveLength(3);
    expect(searchCatalogItems("WHT", catalog)).toHaveLength(1);
  });

  test("matches sku", () => {
    expect(searchCatalogItems("PGW", catalog)[0].item_number).toBe("TEE-WHT-L");
  });

  test("an exact code is floated above partial matches", () => {
    // "2000010000031" is item 3's full barcode. Items 1 and 2 share the
    // "200001000003" prefix in no way, so build a case where both kinds exist.
    const withOverlap = [
      item({ item_number: "PARTIAL", description: "Code 5551234" }),
      item({ item_number: "EXACT", barcode: "555" }),
    ];

    expect(searchCatalogItems("555", withOverlap)[0].item_number).toBe("EXACT");
  });

  test("an empty query suggests nothing", () => {
    expect(searchCatalogItems("", catalog)).toEqual([]);
    expect(searchCatalogItems("   ", catalog)).toEqual([]);
  });

  test("branch rows of one product appear once", () => {
    const multiBranch = [
      item({ item_number: "TEE-M", description: "Tee M", location: "Main Location" }),
      item({ item_number: "TEE-M", description: "Tee M", location: "Branch 2" }),
    ];

    expect(searchCatalogItems("tee", multiBranch)).toHaveLength(1);
  });

  test("the list is capped so the dropdown stays usable", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      item({ item_number: `TEE-${i}`, description: `Tee ${i}` })
    );

    expect(searchCatalogItems("tee", many)).toHaveLength(20);
    expect(searchCatalogItems("tee", many, 5)).toHaveLength(5);
  });
});
