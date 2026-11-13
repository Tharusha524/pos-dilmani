import type { Customer } from "../../../api/customersApi";

/**
 * What a customer's account looks like if this sale goes on credit.
 *
 * net_balance is what they already owe (positive = owes the shop). A credit
 * limit of zero means no limit is set, not "no credit allowed" — every
 * customer defaults to 0, so the other reading would block credit for all of
 * them.
 */
export interface CreditPosition {
  owesNow: number;
  limit: number | null;
  /** Credit still available before this sale, or null when there is no limit. */
  available: number | null;
  /** What they would owe after this sale is put on credit. */
  owesAfter: number;
  /** How far this sale would take them past their limit (0 when within it). */
  overLimitBy: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function creditPosition(
  customer: Pick<Customer, "net_balance" | "credit_limit"> | null | undefined,
  saleAmount: number
): CreditPosition | null {
  if (!customer) return null;

  const owesNow = round2(Math.max(0, Number(customer.net_balance) || 0));
  const rawLimit = Number(customer.credit_limit) || 0;
  const limit = rawLimit > 0 ? round2(rawLimit) : null;
  const owesAfter = round2(owesNow + Math.max(0, saleAmount));

  return {
    owesNow,
    limit,
    available: limit === null ? null : round2(Math.max(0, limit - owesNow)),
    owesAfter,
    overLimitBy: limit === null ? 0 : round2(Math.max(0, owesAfter - limit)),
  };
}

/**
 * Whether today is the customer's birthday.
 *
 * The month and day are read straight from the "YYYY-MM-DD" string rather
 * than through new Date(), which parses a bare date as UTC midnight — in Sri
 * Lanka (UTC+5:30) that is fine, but anywhere west of UTC it would land on the
 * previous day and flag the wrong date.
 */
export function isBirthdayToday(
  dateOfBirth: string | null | undefined,
  today: Date = new Date()
): boolean {
  const match = String(dateOfBirth ?? "").match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!match) return false;

  const month = Number(match[1]);
  const day = Number(match[2]);

  // 29 February birthdays are celebrated on 28 February in non-leap years,
  // so the chip still appears for them once a year.
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (month === 2 && day === 29 && !isLeap(today.getFullYear())) {
    return today.getMonth() + 1 === 2 && today.getDate() === 28;
  }

  return today.getMonth() + 1 === month && today.getDate() === day;
}
