/**
 * Split payment — one sale paid by more than one method (cash + card, say).
 *
 * The server requires at least two methods whose amounts add up exactly to
 * the sale total, and does not accept change inside a split. So in split mode
 * each line is the amount the shop KEEPS by that method, and there is no
 * change to give — the cashier types what goes into each method, not the note
 * the customer handed over.
 */

export interface PaymentSplitLine {
  id: string;
  method: string;
  amount: number;
  cheque_number?: string;
  bank_name?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function newSplitLine(method: string, amount = 0): PaymentSplitLine {
  return {
    id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    method,
    amount: round2(Math.max(0, amount)),
  };
}

export function splitsTotal(lines: PaymentSplitLine[]): number {
  return round2(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
}

/** Positive: still to be covered. Negative: more entered than the total. */
export function splitsRemaining(lines: PaymentSplitLine[], total: number): number {
  return round2(total - splitsTotal(lines));
}

/**
 * Why these splits cannot be saved, or null when they can.
 * The same rules the server applies, checked before the cashier presses Pay.
 */
export function splitsValidationError(lines: PaymentSplitLine[], total: number): string | null {
  const used = lines.filter((l) => (Number(l.amount) || 0) > 0);

  if (used.length < 2) {
    return "A split payment needs at least two methods with an amount.";
  }

  if (used.some((l) => !String(l.method || "").trim())) {
    return "Choose a payment method for every split line.";
  }

  const cheque = used.find(
    (l) => l.method === "Cheque" && (!l.cheque_number?.trim() || !l.bank_name?.trim())
  );
  if (cheque) {
    return "Enter the cheque number and bank for the cheque part of the payment.";
  }

  const remaining = splitsRemaining(used, total);
  if (Math.abs(remaining) > 0.01) {
    return remaining > 0
      ? `Rs ${remaining.toFixed(2)} still to be covered by the split.`
      : `The split is Rs ${Math.abs(remaining).toFixed(2)} more than the total.`;
  }

  return null;
}

/**
 * Put whatever is still owed onto one line — the convenience of "the rest on
 * card" without the cashier doing the subtraction.
 */
export function fillRemainingInto(
  lines: PaymentSplitLine[],
  id: string,
  total: number
): PaymentSplitLine[] {
  const others = splitsTotal(lines.filter((l) => l.id !== id));
  const rest = round2(Math.max(0, total - others));

  return lines.map((l) => (l.id === id ? { ...l, amount: rest } : l));
}

/** The shape the server's payment_splits field expects. Empty lines dropped. */
export function splitsToPayload(lines: PaymentSplitLine[]) {
  return lines
    .filter((l) => (Number(l.amount) || 0) > 0 && String(l.method || "").trim())
    .map((l) => ({
      payment_method: l.method,
      amount: round2(Number(l.amount) || 0),
      cheque_number: l.method === "Cheque" ? (l.cheque_number?.trim() || null) : null,
      bank_name: l.method === "Cheque" ? (l.bank_name?.trim() || null) : null,
    }));
}
