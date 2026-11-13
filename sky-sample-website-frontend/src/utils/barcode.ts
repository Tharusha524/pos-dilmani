import type { BarcodeType } from "../api/itemsApi";

/**
 * Strip what a scanner or a person adds around a code.
 *
 * Handheld scanners append their own Enter/Tab keystroke, and codes typed
 * from a damaged label often arrive with spaces or dashes copied off the
 * printed digits. Normalising both ends means a scan and a hand-entry of the
 * same label resolve to the same item.
 */
export function normalizeBarcode(code: string | null | undefined): string {
  return String(code ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "");
}

/**
 * GS1 mod-10 check digit over a 12-digit body: digits are weighted 1 and 3
 * alternately from the left, and the check digit rounds the weighted sum up
 * to the next multiple of ten.
 */
export function barcodeCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[i]) || 0;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function hasValidEan13CheckDigit(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return String(barcodeCheckDigit(code.slice(0, 12))) === code[12];
}

/**
 * Why a code cannot be printed in the chosen symbology, or null when it can.
 *
 * Validated before printing rather than after, because an invalid EAN-13
 * renders as a blank space on the label — a whole sheet of unusable stickers
 * with no error anywhere.
 */
export function barcodeValidationError(
  code: string,
  type: BarcodeType
): string | null {
  const value = normalizeBarcode(code);
  if (!value) return null;

  if (value.length > 64) {
    return "Barcode cannot be longer than 64 characters.";
  }

  if (type === "EAN13") {
    if (!/^\d{13}$/.test(value)) {
      return "An EAN-13 barcode must be exactly 13 digits.";
    }
    if (!hasValidEan13CheckDigit(value)) {
      return "That EAN-13 barcode has an invalid check digit.";
    }
  }

  return null;
}

/**
 * Pull a quantity prefix out of a scan, so a cashier can ring up five of the
 * same shirt without scanning it five times: "5*CODE" or "5xCODE".
 *
 * Only a leading multiplier counts. A code containing "x" in the middle is a
 * code, not a quantity.
 */
export function parseScannedCode(raw: string): { code: string; qty: number | null } {
  const text = String(raw ?? "").trim();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*[*xX]\s*(.+)$/);

  if (match) {
    const qty = Number(match[1]);
    const code = normalizeBarcode(match[2]);
    if (code && Number.isFinite(qty) && qty > 0) {
      return { code, qty };
    }
  }

  return { code: normalizeBarcode(text), qty: null };
}
