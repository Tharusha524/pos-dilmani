import axios from "axios";

export interface ItemSettings {
  id: number;
  allow_auto_number: boolean;
  allow_item_discount: boolean;
  allow_wholesale_price: boolean;
  allow_upload_item_image: boolean;
  allow_variant_in_add_item: boolean;
  allow_quick_add_item_in_sales_screen: boolean;
  allow_favorite_items_on_sales_screen: boolean;
  allow_editing_purchase_price_in_inventory_dashboard: boolean;
  allow_total_price_entry_on_sales_screen: boolean;
  /** Ask for a PIN before an item's existing barcode may be replaced. */
  require_barcode_change_pin: boolean;
  /** Read-only: whether a PIN has been set. The PIN itself never leaves the
   *  server, so it cannot be read out of the browser by the staff it limits. */
  barcode_change_pin_set?: boolean;
  uom_options?: string[];
}

export type ItemSettingsPayload = Partial<Omit<ItemSettings, "id" | "barcode_change_pin_set">> & {
  /** Write-only. An empty string clears the PIN. */
  barcode_change_pin?: string;
};

export interface BarcodePinCheckResult {
  valid: boolean;
}

/** Ask the server whether `pin` may change an existing barcode. */
export async function verifyBarcodePin(pin: string): Promise<BarcodePinCheckResult> {
  const res = await axios.post("/api/settings/item/verify-barcode-pin", { pin });
  return res.data.data;
}

export async function getItemSettings(): Promise<ItemSettings> {
  const res = await axios.get("/api/settings/item");
  return res.data.data;
}

export async function updateItemSettings(
  payload: ItemSettingsPayload
): Promise<ItemSettings> {
  const res = await axios.put("/api/settings/item", payload);
  return res.data.data;
}
