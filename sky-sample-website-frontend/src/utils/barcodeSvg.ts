import JsBarcode from "jsbarcode";
import { normalizeBarcode } from "./barcode";

export interface BarcodeSvgOptions {
  /** Bar height in px. */
  height?: number;
  /** Width of the narrowest bar. Below ~1.2 thermal printers start misreading. */
  width?: number;
  /** Print the human-readable digits under the bars. */
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
  format?: "CODE128" | "EAN13";
}

/**
 * Barcode as standalone SVG markup, for renderers that build an HTML string
 * rather than a React tree — the receipt and invoice printers.
 *
 * Returns null when the value cannot be encoded, so the caller can omit the
 * barcode block entirely instead of printing a broken one. A receipt must
 * still come out of the printer if its barcode cannot be drawn; losing the
 * sale over a cosmetic footer would be far worse.
 *
 * The SVG is built in a detached element and serialised, so nothing is ever
 * attached to the live document.
 */
export function buildBarcodeSvgMarkup(
  value: string | null | undefined,
  options: BarcodeSvgOptions = {}
): string | null {
  const code = normalizeBarcode(value);
  if (!code) return null;

  // Guard for non-browser contexts (tests, any future SSR): without a DOM
  // there is nothing for JsBarcode to draw into.
  if (typeof document === "undefined") return null;

  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    JsBarcode(svg, code, {
      format: options.format ?? "CODE128",
      height: options.height ?? 28,
      width: options.width ?? 1.3,
      displayValue: options.displayValue ?? false,
      fontSize: options.fontSize ?? 10,
      margin: options.margin ?? 0,
      // Always black on white: a receipt is printed, and a themed colour
      // would come out as grey bars that scanners struggle to read.
      lineColor: "#000000",
      background: "#ffffff",
    });

    return svg.outerHTML || null;
  } catch {
    // The value does not fit the symbology (e.g. letters sent as EAN13).
    return null;
  }
}
