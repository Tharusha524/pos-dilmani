import type { Dispatch, SetStateAction } from "react";
import type { Item, ItemCategory } from "../../../api/itemsApi";
import type { Sale, SalePayload } from "../../../api/salesApi";
import type { Customer } from "../../../api/customersApi";
import type { OfferPreviewResult } from "../../../api/offersApi";
import type { SaleOfferEngineState } from "./useSaleOfferEngine";
import type { SalesPosApplicableOffer } from "../../../api/salesApi";
import type { SaleLineDraft } from "./SaleLineItemsSection";
import type { PosPaymentMethod } from "./posSaleConstants";
import type { PosCategoryTab } from "./posSaleCatalogFilter";
import type { PosSubCategoryTab } from "./PosSubCategoryTabs";
import type { PosSalesPriceMode } from "./posSalePricing";
import type { ChequePaymentDetails } from "./PosChequeBankDialog";

/** "scan" is the barcode-first cashier lane; "products" is the tap-to-browse
 *  catalog grid. Both feed the same cart and the same "checkout" step. */
export type PosSaleView = "products" | "checkout" | "scan";

export interface PosSaleSession {
  view: PosSaleView;
  setView: Dispatch<SetStateAction<PosSaleView>>;
  form: SalePayload;
  setForm: Dispatch<SetStateAction<SalePayload>>;
  lines: SaleLineDraft[];
  setLines: Dispatch<SetStateAction<SaleLineDraft[]>>;
  categoryTab: PosCategoryTab;
  subCategoryTab: PosSubCategoryTab;
  catalogSearch: string;
  setCatalogSearch: Dispatch<SetStateAction<string>>;
  paymentMethod: PosPaymentMethod;
  amountReceived: number;
  setAmountReceived: Dispatch<SetStateAction<number>>;
  chequeDetails: ChequePaymentDetails | null;
  setChequeDialogOpen: Dispatch<SetStateAction<boolean>>;
  offerDiscount: number;
  setOfferDiscount: Dispatch<SetStateAction<number>>;
  offerPreview: OfferPreviewResult | null;
  setOfferPreview: Dispatch<SetStateAction<OfferPreviewResult | null>>;
  offerUpdating: boolean;
  offerEngine: SaleOfferEngineState;
  selectedOffer: SalesPosApplicableOffer | null;
  activeHoldSaleId: number | null;
  itemBranch: string;
  catalogScopeLabel: string;
  categories: ItemCategory[];
  loadingCategories: boolean;
  loadingItems: boolean;
  filteredItems: Item[];
  catalogItems: Item[];
  customers: Customer[];
  loadingCustomers: boolean;
  applicableOffers: SalesPosApplicableOffer[];
  allowPriceSwitch: boolean;
  allowWholesalePrice: boolean;
  allowEditSellingPrice: boolean;
  salesPriceMode: PosSalesPriceMode;
  showBothPricesOnCards: boolean;
  showOffers: boolean;
  allowDeliveryCharge: boolean;
  visibleSubCategories: { id: number; name: string }[];
  activeCategoryName: string;
  categoryTabLabel: string;
  parsedCatalogSearch: { term: string; qty: number | null };
  productOfferMap: ReturnType<
    typeof import("./posProductOffers").productOffersByItemNumber
  >;
  linesSubTotal: number;
  netAmount: number;
  changeDue: number;
  vatBreakdown: ReturnType<typeof import("./posSaleTax").calculateSaleVat>;
  saleBusy: boolean;
  offerNeedsPromo: boolean;
  itemImageByNumber: Map<string, string>;
  lineImageUrl: (itemNumber?: string | null) => string | null;
  lineUom: (line: SaleLineDraft) => string;
  handleSalesPriceModeChange: (mode: PosSalesPriceMode) => void;
  handleCategoryTabChange: (tab: PosCategoryTab) => void;
  setSubCategoryTab: Dispatch<SetStateAction<PosSubCategoryTab>>;
  addItemToCart: (displayItem: Item, addQty?: number) => void;
  addMainItemToCart: (displayItem: Item, addQty?: number) => void;
  openBatchPicker: (displayItem: Item, addQty?: number) => void;
  removeFromCart: (displayItem: Item) => void;
  cartQtyForItem: (itemId: number) => number;
  handleCatalogSearchSubmit: () => void;
  /** Resolve a scanned code. Shows the item for confirmation rather than
   *  adding it — nothing reaches the cart unseen. */
  handleScannedCode: (raw: string) => Promise<void>;
  /** Live suggestions for what is typed or scanned into the search box. */
  scanResults: Item[];
  /** Step one: hold the picked item and open the quantity step. */
  selectScanItem: (item: Item) => void;
  /** The item awaiting a quantity, or null when the scan box is idle. */
  pendingScanItem: Item | null;
  pendingScanQty: string;
  setPendingScanQty: Dispatch<SetStateAction<string>>;
  /** Selling price in the entry row; editable when price editing is allowed. */
  pendingScanPrice: string;
  setPendingScanPrice: Dispatch<SetStateAction<string>>;
  pendingScanDiscountType: "percent" | "amount";
  setPendingScanDiscountType: Dispatch<SetStateAction<"percent" | "amount">>;
  pendingScanDiscountValue: string;
  setPendingScanDiscountValue: Dispatch<SetStateAction<string>>;
  /** True when Order Settings allow selling below cost. */
  allowSaleBelowCost: boolean;
  /** Order Settings: whether a whole-bill discount may be given. */
  allowOrderDiscount: boolean;
  /** Step two: bill the held item at the confirmed quantity. */
  commitPendingScanItem: () => void;
  cancelPendingScan: () => void;
  scanBusy: boolean;
  /** Bumped after every cart action so the scan field reclaims focus. */
  scanRefocusToken: number;
  scanInput: string;
  setScanInput: Dispatch<SetStateAction<string>>;
  cameraScanOpen: boolean;
  setCameraScanOpen: Dispatch<SetStateAction<boolean>>;
  setLineQty: (key: string, rawQty: number) => void;
  setLineUnitPrice: (key: string, rawPrice: number) => void;
  /** Change a line's discount; clamped to the item's maximum. */
  setLineDiscount: (key: string, type: "percent" | "amount", rawValue: number) => void;
  /** Whether item discounts are switched on in item settings. */
  allowItemDiscount: boolean;
  updateLineQty: (key: string, delta: number) => void;
  handlePaymentSelect: (method: PosPaymentMethod) => void;
  handleComplete: () => void;
  handleHold: () => void;
  resetPosForNewSale: () => void;
  resumeHoldOrder: (sale: Sale) => void;
  savePosSelectedCustomer: (customer: Customer | null) => void;
  customerDisplayName: (customer: Customer) => string;
  goToCheckout: () => void;
  /** Whether completing a sale also sends the receipt to the printer, so the
   *  Pay button can say what it will actually do. */
  autoPrintEnabled: boolean;
  /** Save the cart as a quotation: no payment, no stock movement. */
  handleQuote: () => void;
  setReprintOpen: Dispatch<SetStateAction<boolean>>;
  setQuickAddCustomerOpen: Dispatch<SetStateAction<boolean>>;
  customerOpenSignal: number;
  /** Opens the customer picker — the F5 shortcut. */
  openCustomerPicker: () => void;
  /** Pay with two or more methods instead of one. */
  splitMode: boolean;
  setSplitMode: Dispatch<SetStateAction<boolean>>;
  paymentSplits: import("./posPaymentSplits").PaymentSplitLine[];
  setPaymentSplits: Dispatch<SetStateAction<import("./posPaymentSplits").PaymentSplitLine[]>>;
  /** Keys of cart lines priced below cost (empty when selling below cost is allowed). */
  belowCostKeys: Set<string>;
  /** Why Pay would be refused for selling below cost, or null. */
  belowCostMessage: string | null;
  /** An item's purchase price, for the "below cost" note under a line. */
  unitCostFor: (itemId: number | null | undefined) => number;
}
