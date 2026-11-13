/**
 * Label sizes are declared in millimetres, not pixels.
 *
 * A label is a physical sticker on a roll or sheet, so the only size that
 * matters is the one that comes out of the printer. Pixel sizes drift with
 * zoom level and screen DPI, and a label that looks right on screen then
 * prints 20% too wide and shears off the barcode. Browsers honour `mm` in
 * print CSS, so declaring mm once keeps the preview and the print identical.
 */
export interface LabelTemplate {
  key: string;
  label: string;
  /** Sticker width in mm. */
  widthMm: number;
  /** Sticker height in mm. */
  heightMm: number;
  /** Bar height in px — scaled by the browser into the mm box. */
  barHeight: number;
  /** Narrowest bar width. Below ~1.2 cheap thermal scanners start misreading. */
  barWidth: number;
  priceFontPt: number;
  nameFontPt: number;
  showBarcode: boolean;
  /** Human-readable digits under the bars. Dropped on tiny stickers. */
  showBarcodeText: boolean;
  showItemNumber: boolean;
  description: string;
}

export const LABEL_TEMPLATES: LabelTemplate[] = [
  {
    key: "sticker-50x25",
    label: "Garment Sticker 50 × 25 mm",
    widthMm: 50,
    heightMm: 25,
    barHeight: 26,
    barWidth: 1.3,
    priceFontPt: 9,
    nameFontPt: 6.5,
    showBarcode: true,
    // 25mm tall leaves no room for both bars and digits at a legible size;
    // the bars are what gets scanned, so the digits go.
    showBarcodeText: false,
    showItemNumber: false,
    description: "Standard roll sticker — fits a garment tag or poly bag",
  },
  {
    key: "tag-standard",
    label: "Price Tag 60 × 40 mm",
    widthMm: 60,
    heightMm: 40,
    barHeight: 34,
    barWidth: 1.4,
    priceFontPt: 13,
    nameFontPt: 8,
    showBarcode: true,
    showBarcodeText: true,
    showItemNumber: true,
    description: "Roomier tag with the code printed under the bars",
  },
  {
    key: "tag-large",
    label: "Large Tag 80 × 50 mm",
    widthMm: 80,
    heightMm: 50,
    barHeight: 40,
    barWidth: 1.6,
    priceFontPt: 17,
    nameFontPt: 10,
    showBarcode: true,
    showBarcodeText: true,
    showItemNumber: true,
    description: "Big price, easy to read on a rail or shelf",
  },
  {
    key: "shelf-strip",
    label: "Shelf Strip 80 × 26 mm",
    widthMm: 80,
    heightMm: 26,
    barHeight: 20,
    barWidth: 1.2,
    priceFontPt: 14,
    nameFontPt: 7.5,
    showBarcode: true,
    showBarcodeText: false,
    showItemNumber: false,
    description: "Long and low, for shelf edges",
  },
  {
    key: "price-only",
    label: "Price Only 40 × 25 mm",
    widthMm: 40,
    heightMm: 25,
    barHeight: 0,
    barWidth: 1,
    priceFontPt: 14,
    nameFontPt: 7,
    showBarcode: false,
    showBarcodeText: false,
    showItemNumber: false,
    description: "No barcode — for items sold by name at the till",
  },
  {
    key: "custom",
    label: "Custom size",
    widthMm: 50,
    heightMm: 30,
    barHeight: 28,
    barWidth: 1.3,
    priceFontPt: 10,
    nameFontPt: 7,
    showBarcode: true,
    showBarcodeText: true,
    showItemNumber: false,
    description: "Set your own width and height in mm",
  },
];

export const DEFAULT_TEMPLATE_KEY = "sticker-50x25";

export function findTemplate(key: string): LabelTemplate {
  return (
    LABEL_TEMPLATES.find((t) => t.key === key) ??
    LABEL_TEMPLATES.find((t) => t.key === DEFAULT_TEMPLATE_KEY) ??
    LABEL_TEMPLATES[0]
  );
}

/** Which price the label should print. */
export type LabelPriceMode = "selling" | "wholesale" | "none";

export const LABEL_PRICE_MODES: { value: LabelPriceMode; label: string }[] = [
  { value: "selling", label: "Retail price" },
  { value: "wholesale", label: "Wholesale price" },
  { value: "none", label: "No price" },
];
