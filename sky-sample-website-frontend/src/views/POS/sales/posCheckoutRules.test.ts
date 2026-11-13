import { billBelowCost, findBelowCostLines } from "./posBelowCost";
import {
  fillRemainingInto,
  newSplitLine,
  splitsRemaining,
  splitsToPayload,
  splitsTotal,
  splitsValidationError,
} from "./posPaymentSplits";
import { creditPosition, isBirthdayToday } from "./posCustomerInsights";

const costs = new Map([
  [1, { purchase_price: 800 }],
  [2, { purchase_price: 0 }],
]);

function line(partial: Partial<Parameters<typeof findBelowCostLines>[0][number]>) {
  return {
    key: "k",
    item_id: 1,
    item_number: "TEE",
    description: "Tee",
    qty: 1,
    line_total: 1000,
    ...partial,
  };
}

describe("findBelowCostLines (mirrors server assertNotBelowCost)", () => {
  test("a line priced above cost is fine", () => {
    expect(findBelowCostLines([line({ line_total: 1000 })], costs)).toEqual([]);
  });

  test("a line at exactly cost is fine", () => {
    expect(findBelowCostLines([line({ line_total: 800 })], costs)).toEqual([]);
  });

  test("a discount that takes a line below cost is flagged", () => {
    const hits = findBelowCostLines([line({ qty: 2, line_total: 1500 })], costs);

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ label: "TEE", netUnit: 750, unitCost: 800 });
  });

  test("an item with no recorded cost is never flagged", () => {
    expect(findBelowCostLines([line({ item_id: 2, line_total: 1 })], costs)).toEqual([]);
  });

  test("return lines are skipped — they give money back", () => {
    expect(
      findBelowCostLines([line({ line_total: 1, line_direction: "return" })], costs)
    ).toEqual([]);
  });
});

describe("billBelowCost", () => {
  test("no bill discount, no bill check", () => {
    expect(billBelowCost([line({ line_total: 1000 })], costs, 0)).toBeNull();
  });

  test("a bill discount that stays above cost is fine", () => {
    expect(billBelowCost([line({ line_total: 1000 })], costs, 200)).toBeNull();
  });

  test("a bill discount that goes below cost is flagged", () => {
    expect(billBelowCost([line({ line_total: 1000 })], costs, 250)).toEqual({
      net: 750,
      cost: 800,
    });
  });
});

describe("payment splits (mirror the server's rules)", () => {
  const cash = { ...newSplitLine("Cash", 1000), id: "a" };
  const card = { ...newSplitLine("Card", 500), id: "b" };

  test("totals and remaining", () => {
    expect(splitsTotal([cash, card])).toBe(1500);
    expect(splitsRemaining([cash, card], 2000)).toBe(500);
    expect(splitsRemaining([cash, card], 1200)).toBe(-300);
  });

  test("valid when two methods add up exactly", () => {
    expect(splitsValidationError([cash, card], 1500)).toBeNull();
  });

  test("needs at least two methods with an amount", () => {
    expect(splitsValidationError([cash], 1000)).toMatch(/at least two/);
    expect(splitsValidationError([cash, { ...card, amount: 0 }], 1000)).toMatch(/at least two/);
  });

  test("rejects a short or over split, saying which", () => {
    expect(splitsValidationError([cash, card], 2000)).toMatch(/still to be covered/);
    expect(splitsValidationError([cash, card], 1200)).toMatch(/more than the total/);
  });

  test("a cheque part needs its number and bank", () => {
    const cheque = { ...newSplitLine("Cheque", 500), id: "c" };

    expect(splitsValidationError([cash, cheque], 1500)).toMatch(/cheque number/);
    expect(
      splitsValidationError(
        [cash, { ...cheque, cheque_number: "123456", bank_name: "BOC" }],
        1500
      )
    ).toBeNull();
  });

  test("fill remaining puts the rest of the total on one line", () => {
    const filled = fillRemainingInto([cash, { ...card, amount: 0 }], "b", 1800);

    expect(filled.find((l) => l.id === "b")!.amount).toBe(800);
  });

  test("fill remaining never goes negative", () => {
    const filled = fillRemainingInto([cash, { ...card, amount: 0 }], "b", 600);

    expect(filled.find((l) => l.id === "b")!.amount).toBe(0);
  });

  test("payload drops empty lines and strips cheque fields from other methods", () => {
    const payload = splitsToPayload([
      { ...cash, cheque_number: "stale" },
      card,
      { ...newSplitLine("Credit", 0), id: "d" },
    ]);

    expect(payload).toEqual([
      { payment_method: "Cash", amount: 1000, cheque_number: null, bank_name: null },
      { payment_method: "Card", amount: 500, cheque_number: null, bank_name: null },
    ]);
  });
});

describe("creditPosition", () => {
  test("no customer, nothing to show", () => {
    expect(creditPosition(null, 1000)).toBeNull();
  });

  test("a zero limit means no limit", () => {
    const p = creditPosition({ net_balance: 5000, credit_limit: 0 }, 1000)!;

    expect(p.limit).toBeNull();
    expect(p.available).toBeNull();
    expect(p.overLimitBy).toBe(0);
    expect(p.owesAfter).toBe(6000);
  });

  test("within the limit", () => {
    const p = creditPosition({ net_balance: 2000, credit_limit: 10000 }, 3000)!;

    expect(p.available).toBe(8000);
    expect(p.owesAfter).toBe(5000);
    expect(p.overLimitBy).toBe(0);
  });

  test("past the limit reports by how much", () => {
    const p = creditPosition({ net_balance: 9000, credit_limit: 10000 }, 3000)!;

    expect(p.available).toBe(1000);
    expect(p.overLimitBy).toBe(2000);
  });

  test("a customer in credit (negative balance) owes nothing", () => {
    expect(creditPosition({ net_balance: -500, credit_limit: 0 }, 100)!.owesNow).toBe(0);
  });
});

describe("isBirthdayToday", () => {
  const today = new Date(2026, 10, 13); // 13 November 2026

  test("matches month and day, ignoring the year", () => {
    expect(isBirthdayToday("1990-11-13", today)).toBe(true);
    expect(isBirthdayToday("1990-11-14", today)).toBe(false);
  });

  test("tolerates a timestamp after the date", () => {
    expect(isBirthdayToday("1990-11-13T00:00:00Z", today)).toBe(true);
  });

  test("no date or a malformed date is never a birthday", () => {
    expect(isBirthdayToday(null, today)).toBe(false);
    expect(isBirthdayToday("13/11/1990", today)).toBe(false);
  });

  test("29 February is celebrated on 28 February in a non-leap year", () => {
    expect(isBirthdayToday("2000-02-29", new Date(2027, 1, 28))).toBe(true);
    expect(isBirthdayToday("2000-02-29", new Date(2028, 1, 29))).toBe(true);
    expect(isBirthdayToday("2000-02-29", new Date(2028, 1, 28))).toBe(false);
  });
});
