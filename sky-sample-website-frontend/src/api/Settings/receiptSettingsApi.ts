import axios from "axios";

/** Where an admin-added line is printed on the receipt. */
export type ReceiptCustomFieldPosition =
  | "after_header"
  | "after_invoice"
  | "after_items"
  | "after_payment"
  | "footer";

export interface ReceiptCustomField {
  id: string;
  label: string;
  value: string;
  position: ReceiptCustomFieldPosition;
  align: "left" | "center" | "right";
  font_size: number;
  bold: boolean;
}

/**
 * Every caption the receipt prints.
 *
 * Always arrives complete from the backend — the shop's overrides merged over
 * the built-in defaults — so nothing downstream needs to know the default
 * wording or guard for a missing key.
 */
export interface ReceiptLabels {
  receipt_title: string;
  sales_id: string;
  date: string;
  location: string;
  cashier: string;
  customer: string;
  item_no: string;
  description: string;
  qty: string;
  uom: string;
  unit_price: string;
  total: string;
  sub_total: string;
  discount: string;
  service_charge: string;
  card_charge: string;
  net_amount: string;
  payment: string;
  received: string;
  change: string;
  you_saved: string;
  thank_you: string;
}

export interface ReceiptSettings {
  id: number;

  show_logo: boolean;
  show_shop_name: boolean;
  show_address: boolean;
  show_phone: boolean;
  show_email: boolean;
  show_tax_id: boolean;

  show_invoice_id: boolean;
  show_date_time: boolean;
  show_cashier: boolean;
  show_branch_name: boolean;
  show_customer_name: boolean;

  show_item_number: boolean;
  show_item_uom: boolean;
  show_unit_price: boolean;
  show_discount_column: boolean;

  show_payment_method: boolean;
  show_amount_received: boolean;
  show_change: boolean;
  show_you_saved: boolean;

  show_thank_you: boolean;
  thank_you_message: string;
  show_footer_note: boolean;
  footer_note: string;
  show_barcode: boolean;

  labels: ReceiptLabels;

  font_header: number;
  font_invoice_info: number;
  font_items: number;
  font_totals: number;
  font_footer: number;

  /** Gap above each item row, in px. Lower = shorter receipt, less paper. */
  row_spacing: number;
  /** Gap around each block, in px. */
  section_spacing: number;

  custom_fields: ReceiptCustomField[];
}

export type ReceiptSettingsPayload = Partial<Omit<ReceiptSettings, "id">>;

export async function getReceiptSettings(): Promise<ReceiptSettings> {
  const res = await axios.get("/api/settings/receipt");
  return res.data.data;
}

export async function updateReceiptSettings(
  payload: ReceiptSettingsPayload
): Promise<ReceiptSettings> {
  const res = await axios.put("/api/settings/receipt", payload);
  return res.data.data;
}

export async function resetReceiptSettings(): Promise<ReceiptSettings> {
  const res = await axios.post("/api/settings/receipt/reset");
  return res.data.data;
}

export const RECEIPT_CUSTOM_FIELD_POSITIONS: {
  value: ReceiptCustomFieldPosition;
  label: string;
}[] = [
  { value: "after_header", label: "After the shop header" },
  { value: "after_invoice", label: "After the invoice details" },
  { value: "after_items", label: "After the items table" },
  { value: "after_payment", label: "After the payment lines" },
  { value: "footer", label: "In the footer" },
];

/**
 * Labels grouped the way the receipt reads top to bottom, so the editor can
 * present them in the order they appear on paper rather than alphabetically.
 */
export const RECEIPT_LABEL_GROUPS: {
  title: string;
  keys: (keyof ReceiptLabels)[];
}[] = [
  { title: "Title & invoice details", keys: ["receipt_title", "sales_id", "date", "location", "cashier", "customer"] },
  { title: "Items table", keys: ["item_no", "description", "qty", "uom", "unit_price", "total"] },
  { title: "Totals", keys: ["sub_total", "discount", "service_charge", "card_charge", "net_amount", "you_saved"] },
  { title: "Payment", keys: ["payment", "received", "change"] },
];
