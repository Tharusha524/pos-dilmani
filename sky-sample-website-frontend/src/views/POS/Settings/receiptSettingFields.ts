import type { ReceiptSettings } from "../../../api/Settings/receiptSettingsApi";

/** Boolean keys of ReceiptSettings — the toggles the editor renders. */
export type ReceiptToggleKey = {
  [K in keyof ReceiptSettings]: ReceiptSettings[K] extends boolean ? K : never;
}[keyof ReceiptSettings];

export interface ReceiptToggleField {
  key: ReceiptToggleKey;
  title: string;
  description: string;
}

/**
 * Toggles grouped the way the receipt reads top to bottom, so the editor walks
 * the user down the printout rather than through an alphabetical list.
 */
export const RECEIPT_TOGGLE_GROUPS: {
  title: string;
  description: string;
  fields: ReceiptToggleField[];
}[] = [
  {
    title: "Shop header",
    description: "What appears at the very top of the receipt.",
    fields: [
      { key: "show_logo", title: "Logo", description: "Print the company logo above the shop name." },
      { key: "show_shop_name", title: "Shop name", description: "Print the company name." },
      { key: "show_address", title: "Address", description: "Print the shop address line." },
      { key: "show_phone", title: "Phone number", description: "Print the contact phone number." },
      { key: "show_email", title: "Email address", description: "Print the contact email address." },
      { key: "show_tax_id", title: "Tax / registration number", description: "Print the tax and registration numbers." },
    ],
  },
  {
    title: "Invoice details",
    description: "The reference lines under the title.",
    fields: [
      { key: "show_invoice_id", title: "Invoice number", description: "Print the invoice number. Keep this on if you reprint or return against receipts." },
      { key: "show_date_time", title: "Date and time", description: "Print when the sale was made." },
      { key: "show_branch_name", title: "Branch", description: "Print which branch the sale was made at." },
      { key: "show_customer_name", title: "Customer name", description: "Print the customer the sale is billed to." },
    ],
  },
  {
    title: "Items",
    description: "What each line of the sale shows.",
    fields: [
      { key: "show_item_number", title: "Item code", description: "Print each item's code under its name." },
      { key: "show_item_uom", title: "Unit of measure", description: "Print the unit (pcs, kg) beside the item name." },
      { key: "show_unit_price", title: "Unit price", description: "Print the per-unit price. With this off, the line shows the quantity and the line total only." },
      { key: "show_discount_column", title: "Discounts", description: "Print each item's discount under it, and the discount line in the totals." },
    ],
  },
  {
    title: "Totals and payment",
    description: "The money lines at the bottom.",
    fields: [
      { key: "show_payment_method", title: "Payment method", description: "Print how the customer paid." },
      { key: "show_amount_received", title: "Amount received", description: "Print the cash handed over." },
      { key: "show_change", title: "Change given", description: "Print the change due back." },
      { key: "show_you_saved", title: "“You saved” line", description: "Print the total discount again as a goodwill line." },
    ],
  },
  {
    title: "Footer",
    description: "The closing lines and the scannable code.",
    fields: [
      { key: "show_thank_you", title: "Thank-you message", description: "Print a closing message you can word below." },
      { key: "show_footer_note", title: "Footer note", description: "Print a longer note, such as a returns policy." },
      { key: "show_barcode", title: "Receipt barcode", description: "Print a scannable barcode of the invoice number, so this receipt can be scanned back for a return or reprint." },
    ],
  },
];

export interface ReceiptSizeField {
  key: keyof Pick<
    ReceiptSettings,
    | "font_header"
    | "font_invoice_info"
    | "font_items"
    | "font_totals"
    | "font_footer"
    | "row_spacing"
    | "section_spacing"
  >;
  label: string;
  helper: string;
  min: number;
  max: number;
}

export const RECEIPT_FONT_FIELDS: ReceiptSizeField[] = [
  { key: "font_header", label: "Shop name size", helper: "Size of the shop name at the top.", min: 8, max: 28 },
  { key: "font_invoice_info", label: "Invoice details size", helper: "Size of the date, branch and customer lines.", min: 7, max: 20 },
  { key: "font_items", label: "Item name size", helper: "Size of each item's name.", min: 7, max: 20 },
  { key: "font_totals", label: "Totals size", helper: "Size of the subtotal, total and payment lines.", min: 8, max: 24 },
  { key: "font_footer", label: "Footer size", helper: "Size of the thank-you and footer lines.", min: 6, max: 18 },
];

export const RECEIPT_SPACING_FIELDS: ReceiptSizeField[] = [
  {
    key: "row_spacing",
    label: "Space around each item",
    helper: "Lower this to fit more items on less paper.",
    min: 0,
    max: 24,
  },
  {
    key: "section_spacing",
    label: "Space between sections",
    helper: "Lower this to shorten the whole receipt.",
    min: 0,
    max: 32,
  },
];
