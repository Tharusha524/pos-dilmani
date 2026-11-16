import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import {
  completeHoldOrder,
  createSale,
  getNextSalesId,
  getSale,
  getSalesPosContext,
  updateSale,
  type OrderStatus,
  type Sale,
  type SalePayload,
  type SaleReceiptApiPayload,
} from "../../../api/salesApi";
import {
  getItems,
  getItemInventoryBreakdown,
  getItemCategoriesByLocation,
  type DiscountType,
  type Item,
  type ItemBatch,
} from "../../../api/itemsApi";
import { getCustomers } from "../../../api/customersApi";
import { getApplicableOffers, type OfferPreviewResult } from "../../../api/offersApi";
import { getHardwareSettings } from "../../../api/Settings/hardwareSettingsApi";
import { getFriendlyErrorMessage } from "../../../utils/getFriendlyErrorMessage";
import { invalidatePosQueries } from "../../../utils/invalidatePosQueries";
import type { SaleLineDraft } from "./SaleLineItemsSection";
import { linesFromSale, linesToPayload } from "./SaleLineItemsSection";
import { emptySaleForm, formatSaleRs, SALES_BASE } from "./saleFormUtils";
import { DEFAULT_TRANSACTION_TYPE, TRANSACTION_TYPE_RETURN } from "./saleConstants";
import {
  canIncreaseCartQty,
  canSetCartQty,
  filterPosSaleCatalogItems,
  isInventoryTrackedItem,
} from "./posSaleInventory";
import {
  availableStockForCartItem,
  cartQtyForItem,
  mergePosCatalogAcrossBranches,
  resolveCartItemForSale,
  resolveSaleLocationFromLines,
} from "./posSaleCatalogMerge";
import { readPosSelectedCustomer, savePosSelectedCustomer } from "./posCustomerSelection";
import { customerDisplayName } from "./PosCustomerSelectArea";
import { useBranchLocations } from "../../../hooks/useBranchLocations";
import { downloadSaleReceiptImageFromApi } from "./saleReceiptImageDownload";
import PosChequeBankDialog, { type ChequePaymentDetails } from "./PosChequeBankDialog";
import PosSaleBatchSelectDialog from "./PosSaleBatchSelectDialog";
import PosScanBatchPickDialog, { type ScanStockOption } from "./PosScanBatchPickDialog";
import {
  availableBatchesAtBranch,
  maxQtyForCartLine,
  normalizeBranchLocation,
  unitPriceForBatchSale,
} from "./posSaleBatchUtils";
import type { PosPaymentMethod } from "./posSaleConstants";
import {
  applySalesTypeToLines,
  getPosItemUnitPrice,
  isWholesaleSalesType,
  pricingModeFromSalesType,
  type PosSalesPriceMode,
} from "./posSalePricing";
import { calculateSaleVat, grandTotalWithVat } from "./posSaleTax";
import {
  filterOffersForPricingMode,
  productOffersByItemNumber,
} from "./posProductOffers";
import { useSaleOfferEngine } from "./useSaleOfferEngine";
import { resolveItemImageUrl } from "../../../utils/resolveStorageUrl";
import {
  formatUomLabel,
  parsePosCatalogSearch,
  qtyStepForUom,
  parseSaleLineQty,
  roundSaleQty,
} from "./posSaleUom";
import { isItemExpired, isBatchExpired } from "../inventory/itemInventoryUtils";
import { PosSaleContext } from "./posSaleContext";
import type { PosSaleSession, PosSaleView } from "./posSaleSessionTypes";
import PosProductSelectPage from "./PosProductSelectPage";
import PosSaleCheckoutPage from "./PosSaleCheckoutPage";
import PosScanCheckoutPage from "./PosScanCheckoutPage";
import PosBarcodeMatchDialog from "./PosBarcodeMatchDialog";
import PosReceiptPreviewDialog from "./PosReceiptPreviewDialog";
import PosReprintDialog from "./PosReprintDialog";
import PosQuickAddCustomerDialog from "./PosQuickAddCustomerDialog";
import CameraBarcodeScanDialog from "./CameraBarcodeScanDialog";
import {
  isDuplicateScan,
  matchScannedCodeInCatalog,
  searchCatalogItems,
} from "./posBarcodeScan";
import { parseScannedCode } from "../../../utils/barcode";
import { billBelowCost, findBelowCostLines } from "./posBelowCost";
import {
  splitsToPayload,
  splitsValidationError,
  type PaymentSplitLine,
} from "./posPaymentSplits";
import {
  defaultDiscountForItem,
  maxDiscountValueFor,
  normalizeDiscountType,
  priceLine,
} from "./posLineDiscount";
import { lookupItemByBarcode } from "../../../api/itemsApi";
import { printSaleReceiptFromApi } from "./saleReceiptPrint";
import {
  filterPosCatalogItems,
  subCategoriesForPosTab,
  type PosCategoryTab,
} from "./posSaleCatalogFilter";
import type { PosSubCategoryTab } from "./PosSubCategoryTabs";

/**
 * Price/discount the cashier changed on the scan entry row. Each field is set
 * only when it differs from the default, so an untouched row leaves the line
 * at the picked batch's own price.
 */
interface ScanLineOverrides {
  unitPrice?: number;
  discount?: { type: "percent" | "amount"; value: number };
}

/** Main stock is dated by the item's own expiry (expired main stock is moved into a batch). */
function isMainStockExpired(item: Item): boolean {
  if (!item.expiry_date) return false;
  return item.expiry_date.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function newLineKey(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function itemToLine(
  item: Item,
  salesType: PosSalesPriceMode,
  qty = 1,
  batch?: ItemBatch | null,
  allowItemDiscount = true
): SaleLineDraft {
  const price = unitPriceForBatchSale(item, salesType, batch);
  const q = roundSaleQty(qty);
  // A new line starts with the discount set on the item itself. It used to
  // start at full price, so a discount configured on the item never applied.
  const discount = defaultDiscountForItem(item, allowItemDiscount);
  const priced = priceLine({
    qty: q,
    unit_price: price,
    discount_type: discount?.discount_type ?? null,
    discount_value: discount?.discount_value ?? 0,
  });
  return {
    key: newLineKey(),
    item_id: item.id,
    item_number: item.item_number,
    description: item.description,
    qty: q,
    unit_price: price,
    discount_type: priced.discount_type,
    discount_value: priced.discount_value,
    discount_amount: priced.discount_amount,
    line_total: priced.line_total,
    batch_id: batch?.batch_number ?? null,
    item_batch_id: batch?.id ?? null,
    batch_stock_qty: batch?.qty ?? item.qty ?? undefined,
    batch_expiry_date: batch?.expiry_date ?? null,
    batch_selling_price: batch?.selling_price ?? item.selling_price ?? null,
    purchase_price: batch?.purchase_price ?? null,
  };
}

interface PosSaleFormPageProps {
  /**
   * Which view the sale opens on. The scan lane and the catalog grid are two
   * doors into the same session, so the route picks the door rather than each
   * being a separate page with its own copy of the cart.
   */
  initialView?: PosSaleView;
}

const PosSaleFormPage: React.FC<PosSaleFormPageProps> = ({
  initialView = "products",
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [form, setForm] = useState<SalePayload>(emptySaleForm());
  const [lines, setLines] = useState<SaleLineDraft[]>([]);
  const [categoryTab, setCategoryTab] = useState<PosCategoryTab>("all");
  const [subCategoryTab, setSubCategoryTab] = useState<PosSubCategoryTab>("all");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("Cash");
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [chequeDetails, setChequeDetails] = useState<ChequePaymentDetails | null>(null);
  const [chequeDialogOpen, setChequeDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchDialogItem, setBatchDialogItem] = useState<Item | null>(null);
  const [batchDialogQty, setBatchDialogQty] = useState(1);
  const [batchDialogBatches, setBatchDialogBatches] = useState<ItemBatch[]>([]);
  const [batchDialogVariants, setBatchDialogVariants] = useState<Item[]>([]);
  const [batchDialogLoading, setBatchDialogLoading] = useState(false);
  // Scan popup: which stock (main or a batch) the scanned item is sold from.
  const [stockPick, setStockPick] = useState<{
    saleItem: Item;
    qty: number;
    overrides: ScanLineOverrides | null;
  } | null>(null);
  const [stockPickOptions, setStockPickOptions] = useState<ScanStockOption[]>([]);
  const [stockPickLoading, setStockPickLoading] = useState(false);
  const [offerDiscount, setOfferDiscount] = useState(0);
  const [offerPreview, setOfferPreview] = useState<OfferPreviewResult | null>(null);
  const [activeHoldSaleId, setActiveHoldSaleId] = useState<number | null>(null);
  const [view, setView] = useState<PosSaleView>(initialView);
  const [scanInput, setScanInput] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanRefocusToken, setScanRefocusToken] = useState(0);
  const [cameraScanOpen, setCameraScanOpen] = useState(false);
  const [pendingScanItem, setPendingScanItem] = useState<Item | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<SaleReceiptApiPayload | null>(null);
  const [reprintOpen, setReprintOpen] = useState(false);
  const [quickAddCustomerOpen, setQuickAddCustomerOpen] = useState(false);
  const [customerOpenSignal, setCustomerOpenSignal] = useState(0);
  const [splitMode, setSplitMode] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitLine[]>([]);
  const [pendingScanQty, setPendingScanQty] = useState("1");
  const [pendingScanPrice, setPendingScanPrice] = useState("0");
  const [pendingScanDiscountType, setPendingScanDiscountType] = useState<DiscountType>("percent");
  const [pendingScanDiscountValue, setPendingScanDiscountValue] = useState("0");
  const [barcodeMatches, setBarcodeMatches] = useState<Item[]>([]);
  const [barcodeMatchCode, setBarcodeMatchCode] = useState("");
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const [searchParams] = useSearchParams();

  const { defaultLocation, locations, manageMultiple } = useBranchLocations([], {
    branchesOnly: true,
  });
  /** Sale is recorded at this branch; catalog loads from all branches. */
  const itemBranch = form.location ?? defaultLocation;
  const catalogLocation = "all";

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["item-categories", "pos-sale", catalogLocation],
    queryFn: () => getItemCategoriesByLocation(catalogLocation),
  });

  const { data: itemsData, isLoading: loadingItems } = useQuery({
    queryKey: ["items", "pos-sale", catalogLocation],
    queryFn: () => getItems(undefined, catalogLocation, { forPosSale: true }),
  });

  const rawCatalogItems = useMemo(
    () => filterPosSaleCatalogItems(itemsData?.items ?? []),
    [itemsData?.items]
  );

  const { displayItems: catalogItems, variantsByItemNumber } = useMemo(
    () => mergePosCatalogAcrossBranches(rawCatalogItems, itemBranch),
    [rawCatalogItems, itemBranch]
  );

  const catalogScopeLabel =
    manageMultiple && locations.length > 1
      ? `All branches (${locations.length})`
      : "All locations";

  const { data: customersData, isLoading: loadingCustomers } = useQuery({
    queryKey: ["customers", "pos", "all"],
    queryFn: () => getCustomers("all"),
  });

  useEffect(() => {
    if (!form.location) {
      setForm((prev) => ({ ...prev, location: defaultLocation }));
    }
  }, [defaultLocation, form.location]);
  const customers = customersData?.customers ?? [];

  useEffect(() => {
    if (customers.length === 0) return;
    const paramId = searchParams.get("customerId");
    const stored = readPosSelectedCustomer();
    const idToApply =
      paramId != null && paramId !== ""
        ? Number(paramId)
        : stored?.id != null
          ? stored.id
          : null;
    if (idToApply == null || Number.isNaN(idToApply)) {
      if (stored?.id == null) return;
      setForm((prev) => ({ ...prev, customer_id: null, customer_name: "" }));
      return;
    }
    const c = customers.find((x) => x.id === idToApply);
    if (c) {
      setForm((prev) => ({
        ...prev,
        customer_id: c.id,
        customer_name: customerDisplayName(c),
      }));
      savePosSelectedCustomer(c);
    }
  }, [customers, searchParams]);

  const { data: hardwareSettings } = useQuery({
    queryKey: ["hardware-settings"],
    queryFn: getHardwareSettings,
  });

  const { data: posContext } = useQuery({
    queryKey: ["sales-pos-context"],
    queryFn: getSalesPosContext,
  });
  const { data: applicableOffersList } = useQuery({
    queryKey: ["offers-applicable", form.sale_date],
    queryFn: () => getApplicableOffers(form.sale_date),
    enabled: posContext?.order_settings?.allow_offer !== false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const allApplicableOffers =
    applicableOffersList ?? posContext?.applicable_offers ?? [];
  const salePricingMode = pricingModeFromSalesType(form.sales_type);
  const applicableOffers = useMemo(
    () => filterOffersForPricingMode(allApplicableOffers, salePricingMode),
    [allApplicableOffers, salePricingMode]
  );
  const allowOffers = posContext?.order_settings?.allow_offer !== false;

  const allowWholesalePrice = itemsData?.item_settings?.allow_wholesale_price !== false;
  /** Same switch that shows the discount fields on the item form. */
  const allowItemDiscount = itemsData?.item_settings?.allow_item_discount !== false;
  const salesPriceMode: PosSalesPriceMode = isWholesaleSalesType(form.sales_type)
    ? "Wholesale"
    : "Retail";
  const orderSettings = posContext?.order_settings;
  const allowNegativeInventory = orderSettings?.allow_sales_negative_inventory === true;
  const allowPriceSwitch = orderSettings?.allow_switching_wholesale_retail_prices !== false;
  const allowEditSellingPrice = orderSettings?.allow_edit_selling_price !== false;
  /** Off by default: a sale may not price goods below their purchase price. */
  const allowSaleBelowCost = orderSettings?.allow_sale_below_cost === true;
  const showBothPricesOnCards =
    orderSettings?.allow_view_wholesale_retail_prices_by_clicking !== false;
  const allowDeliveryCharge = orderSettings?.allow_service_charge !== false;
  const allowBatchPicker = orderSettings?.allow_batch_id_popup !== false;
  const productOfferMap = useMemo(
    () => productOffersByItemNumber(applicableOffers),
    [applicableOffers]
  );

  const itemImageByNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of rawCatalogItems) {
      const url = resolveItemImageUrl(item);
      if (url && item.item_number) {
        map.set(item.item_number.trim().toLowerCase(), url);
      }
    }
    return map;
  }, [rawCatalogItems]);

  const lineImageUrl = (itemNumber?: string | null) => {
    if (!itemNumber?.trim()) return null;
    return itemImageByNumber.get(itemNumber.trim().toLowerCase()) ?? null;
  };

  const itemUomById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of rawCatalogItems) {
      if (item.uom) map.set(item.id, item.uom);
    }
    return map;
  }, [rawCatalogItems]);

  const lineUom = (line: SaleLineDraft) =>
    (line.item_id != null ? itemUomById.get(line.item_id) : null) ?? "pcs";

  const parsedCatalogSearch = useMemo(
    () => parsePosCatalogSearch(catalogSearch),
    [catalogSearch]
  );

  const showOffers = allowOffers;

  const handleOfferChange = useCallback(
    (patch: { offer_id?: number | null; offer_promo_code?: string | null }) => {
      setForm((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const offerEngine = useSaleOfferEngine({
    allowOffers: showOffers,
    applicableOffers,
    offerId: form.offer_id,
    offerPromoCode: form.offer_promo_code,
    saleDate: form.sale_date ?? "",
    pricingMode: salePricingMode,
    lines,
    onOfferChange: handleOfferChange,
    onOfferDiscountChange: setOfferDiscount,
    onOfferPreviewChange: setOfferPreview,
  });

  const handleSalesPriceModeChange = (mode: PosSalesPriceMode) => {
    setForm((prev) => ({
      ...prev,
      sales_type: mode,
      pricing_mode: pricingModeFromSalesType(mode),
    }));
    setLines((prev) => applySalesTypeToLines(prev, catalogItems, mode));
  };

  const selectedOffer = offerEngine.selectedOffer;
  const offerNeedsPromo = Boolean(selectedOffer?.requires_promo_code);

  useEffect(() => {
    if (
      form.offer_id != null &&
      !applicableOffers.some((offer) => offer.id === form.offer_id)
    ) {
      setForm((prev) => ({ ...prev, offer_id: null, offer_promo_code: null }));
      setOfferDiscount(0);
      setOfferPreview(null);
    }
  }, [applicableOffers, form.offer_id]);

  useEffect(() => {
    const holdIdParam = searchParams.get("holdId");
    if (holdIdParam) return;
    getNextSalesId()
      .then((id) => setForm((prev) => ({ ...prev, sales_id: id })))
      .catch(() => {});
  }, [searchParams]);

  useEffect(() => {
    const holdIdParam = searchParams.get("holdId");
    if (!holdIdParam) return;
    const holdId = Number(holdIdParam);
    if (Number.isNaN(holdId)) return;

    getSale(holdId)
      .then((sale) => {
        if (sale.order_status !== "hold") {
          enqueueSnackbar("This sale is not on hold", { variant: "warning" });
          return;
        }
        setActiveHoldSaleId(sale.id);
        setForm({
          ...emptySaleForm(),
          transaction_type: sale.transaction_type,
          sales_type: sale.sales_type,
          pricing_mode: sale.pricing_mode,
          location: sale.location,
          sale_date: sale.sale_date,
          sales_id: sale.sales_id,
          customer_id: sale.customer_id,
          customer_name: sale.customer_name ?? "",
          sub_total: sale.sub_total,
          discount: sale.discount,
          service_charge: sale.service_charge ?? 0,
          net_amount: sale.net_amount,
          offer_id: sale.offer_id ?? null,
          offer_promo_code: sale.offer_promo_code ?? null,
          payment_method: sale.payment_method ?? "Cash",
          notes: sale.notes ?? "",
        });
        setLines(linesFromSale(sale.items));
        const method = (sale.payment_method as PosPaymentMethod) || "Cash";
        setPaymentMethod(method);
        setAmountReceived(sale.amount_received ?? sale.net_amount);
        setChequeDetails(null);
        // Stay in the lane the cashier is working in: the scan till resumes
        // in place (fullscreen intact), the classic flow goes to its payment
        // step as it always has.
        setView(initialView === "scan" ? "scan" : "checkout");
        enqueueSnackbar(`Loaded hold order ${sale.sales_id}`, { variant: "info" });
      })
      .catch((err: unknown) => {
        enqueueSnackbar(getFriendlyErrorMessage(err, "Could not load hold order"), {
          variant: "error",
        });
      });
  }, [searchParams, enqueueSnackbar]);

  const linesSubTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (l.line_total || 0), 0),
    [lines]
  );

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      sub_total: Math.round(linesSubTotal * 100) / 100,
    }));
  }, [linesSubTotal]);

  const taxSettings = posContext?.tax_settings;
  const productOfferPricesApplied =
    Boolean(form.offer_id) &&
    selectedOffer?.discount_type === "product" &&
    offerDiscount > 0 &&
    offerPreview?.sub_total != null;
  const effectiveCatalogTotal = productOfferPricesApplied
    ? offerPreview!.sub_total
    : linesSubTotal;
  const taxableAmount = useMemo(() => {
    const disc = Number(form.discount) || 0;
    if (productOfferPricesApplied) {
      return Math.max(0, effectiveCatalogTotal - disc);
    }
    return Math.max(0, linesSubTotal - disc - offerDiscount);
  }, [
    productOfferPricesApplied,
    effectiveCatalogTotal,
    linesSubTotal,
    form.discount,
    offerDiscount,
  ]);

  const vatBreakdown = useMemo(
    () =>
      calculateSaleVat(
        taxableAmount,
        taxSettings,
        catalogItems,
        lines.map((l) => l.item_id).filter((id): id is number => id != null)
      ),
    [taxableAmount, taxSettings, catalogItems, lines]
  );

  const deliveryCharge = allowDeliveryCharge ? Number(form.service_charge) || 0 : 0;

  const netAmount = useMemo(
    () => grandTotalWithVat(taxableAmount, vatBreakdown.vatAmount) + deliveryCharge,
    [taxableAmount, vatBreakdown.vatAmount, deliveryCharge]
  );

  const itemCostById = useMemo(
    () => new Map(rawCatalogItems.map((item) => [item.id, item])),
    [rawCatalogItems]
  );

  /** Lines a discount or price has taken below cost — shown in red. */
  const belowCostLines = useMemo(
    () => (allowSaleBelowCost ? [] : findBelowCostLines(lines, itemCostById)),
    [allowSaleBelowCost, lines, itemCostById]
  );

  /**
   * Why this sale would be refused for selling below cost, or null.
   * Mirrors the server's check so the cashier hears it before pressing Pay.
   */
  const belowCostMessage = useMemo(() => {
    if (allowSaleBelowCost) return null;

    const first = belowCostLines[0];
    if (first) {
      const more = belowCostLines.length > 1 ? ` (+${belowCostLines.length - 1} more)` : "";
      return `${first.label} is below cost: Rs ${first.netUnit.toFixed(2)} against a cost of Rs ${first.unitCost.toFixed(2)}${more}.`;
    }

    const billDiscount =
      (Number(form.discount) || 0) +
      (selectedOffer?.discount_type === "order" ? offerDiscount : 0);
    const bill = billBelowCost(lines, itemCostById, billDiscount);
    return bill
      ? `This discount takes the bill below cost: Rs ${bill.net.toFixed(2)} against a cost of Rs ${bill.cost.toFixed(2)}.`
      : null;
  }, [
    allowSaleBelowCost,
    belowCostLines,
    form.discount,
    selectedOffer,
    offerDiscount,
    lines,
    itemCostById,
  ]);

  const changeDue = useMemo(() => {
    if (paymentMethod === "Credit") return 0;
    return Math.max(0, (amountReceived || 0) - netAmount);
  }, [amountReceived, netAmount, paymentMethod]);

  useEffect(() => {
    setCatalogSearch("");
    setSubCategoryTab("all");
  }, [categoryTab]);

  const visibleSubCategories = useMemo(
    () => subCategoriesForPosTab(categoryTab, categories),
    [categoryTab, categories]
  );

  const handleCategoryTabChange = (tab: PosCategoryTab) => {
    setCategoryTab(tab);
    setSubCategoryTab("all");
  };

  useEffect(() => {
    if (allowWholesalePrice) return;
    setForm((prev) => {
      if (!isWholesaleSalesType(prev.sales_type)) return prev;
      return {
        ...prev,
        sales_type: "Retail",
        pricing_mode: "retail",
        offer_id: null,
        offer_promo_code: null,
      };
    });
    setLines((prev) => applySalesTypeToLines(prev, catalogItems, "Retail"));
  }, [allowWholesalePrice, catalogItems]);

  const filteredItems = useMemo(
    () =>
      filterPosCatalogItems(
        catalogItems,
        categoryTab,
        categories,
        parsedCatalogSearch.term,
        subCategoryTab
      ),
    [catalogItems, categoryTab, categories, parsedCatalogSearch.term, subCategoryTab]
  );

  const addItemToCartDirect = (
    saleItem: Item,
    addQty: number,
    batch: ItemBatch | null,
    /** Set when "Main stock" was picked: the unbatched qty, which caps the line. */
    mainOnlyQty?: number
  ): boolean => {
    const mainOnly = !batch && mainOnlyQty != null;
    if (batch && isBatchExpired(batch)) {
      enqueueSnackbar(`Batch ${batch.batch_number} is expired and cannot be sold.`, {
        variant: "error",
      });
      return false;
    }
    if (!batch && (mainOnly ? isMainStockExpired(saleItem) : isItemExpired(saleItem))) {
      enqueueSnackbar(`${saleItem.item_number} is expired. Write off from Inventory.`, {
        variant: "error",
      });
      return false;
    }
    const availableQty =
      batch != null
        ? batch.qty
        : mainOnly
          ? mainOnlyQty
          : availableStockForCartItem(saleItem);
    const qtyToAdd = roundSaleQty(addQty);
    const batchId = batch?.id ?? null;

    if (
      availableQty <= 0 &&
      isInventoryTrackedItem(saleItem) &&
      !allowNegativeInventory
    ) {
      enqueueSnackbar("This item is out of stock at all branches.", {
        variant: "warning",
      });
      return false;
    }

    const existing = lines.find(
      (l) =>
        l.item_id === saleItem.id &&
        (l.item_batch_id ?? null) === batchId
    );
    const nextQty = existing ? existing.qty + qtyToAdd : qtyToAdd;
    if (!canSetCartQty(saleItem, nextQty, availableQty, allowNegativeInventory)) {
      const scope = batch
        ? `in batch ${batch.batch_number}`
        : mainOnly
          ? "in main stock"
          : `at ${saleItem.location}`;
      enqueueSnackbar(
        `Only ${Math.max(0, availableQty).toFixed(2)} ${formatUomLabel(saleItem.uom)} available ${scope}.`,
        { variant: "warning" }
      );
      return false;
    }
    // A main-stock pick marks the line so the server sells it only from
    // unbatched stock, and remembers the unbatched qty as the line's cap.
    const mainOnlyFields = mainOnly
      ? { main_stock_only: true, batch_stock_qty: mainOnlyQty }
      : {};
    if (existing) {
      setLines((prev) =>
        prev.map((l) => {
          if (l.key !== existing.key) return l;
          return priceLine({ ...l, ...mainOnlyFields, qty: roundSaleQty(l.qty + qtyToAdd) });
        })
      );
    } else {
      setLines((prev) => [
        ...prev,
        {
          ...itemToLine(saleItem, salesPriceMode, qtyToAdd, batch, allowItemDiscount),
          ...mainOnlyFields,
        },
      ]);
    }
    return true;
  };

  const addBatchesToCart = (
    saleItem: Item,
    selections: Array<{ batch: ItemBatch; qty: number }>,
    unbatchedQty?: number
  ) => {
    if (selections.length === 0 && (!unbatchedQty || unbatchedQty <= 0)) return;

    let nextLines = [...lines];
    let added = 0;
    let skipped = 0;

    if (unbatchedQty && unbatchedQty > 0) {
      const roundedUnbatchedQty = roundSaleQty(unbatchedQty);
      const availableQty = availableStockForCartItem(saleItem);
      const existingUnbatched = nextLines.find(
        (l) => l.item_id === saleItem.id && (l.item_batch_id ?? null) == null
      );
      const nextQty = existingUnbatched
        ? existingUnbatched.qty + roundedUnbatchedQty
        : roundedUnbatchedQty;
      if (!canSetCartQty(saleItem, nextQty, availableQty, allowNegativeInventory)) {
        enqueueSnackbar(
          `Unbatched: only ${Math.max(0, availableQty).toFixed(2)} ${formatUomLabel(saleItem.uom)} available.`,
          { variant: "warning" }
        );
        skipped += 1;
      } else if (existingUnbatched) {
        nextLines = nextLines.map((l) => {
          if (l.key !== existingUnbatched.key) return l;
          return priceLine({ ...l, qty: roundSaleQty(l.qty + roundedUnbatchedQty) });
        });
        added += 1;
      } else {
        nextLines = [...nextLines, itemToLine(saleItem, salesPriceMode, roundedUnbatchedQty, null, allowItemDiscount)];
        added += 1;
      }
    }

    for (const { batch, qty } of selections) {
      if (isBatchExpired(batch)) {
        skipped += 1;
        continue;
      }
      const qtyToAdd = roundSaleQty(qty);
      if (qtyToAdd <= 0) {
        skipped += 1;
        continue;
      }
      const batchId = batch.id;
      const existing = nextLines.find(
        (l) => l.item_id === saleItem.id && (l.item_batch_id ?? null) === batchId
      );
      const nextQty = existing ? existing.qty + qtyToAdd : qtyToAdd;
      if (!canSetCartQty(saleItem, nextQty, batch.qty, allowNegativeInventory)) {
        enqueueSnackbar(
          `Batch ${batch.batch_number}: only ${Math.max(0, batch.qty).toFixed(2)} ${formatUomLabel(saleItem.uom)} available.`,
          { variant: "warning" }
        );
        skipped += 1;
        continue;
      }
      if (existing) {
        nextLines = nextLines.map((l) => {
          if (l.key !== existing.key) return l;
          return priceLine({ ...l, qty: roundSaleQty(l.qty + qtyToAdd) });
        });
      } else {
        nextLines = [...nextLines, itemToLine(saleItem, salesPriceMode, qtyToAdd, batch, allowItemDiscount)];
      }
      added += 1;
    }

    if (added === 0) {
      if (skipped > 0) {
        enqueueSnackbar("No batches were added — check qty and stock.", { variant: "warning" });
      }
      return;
    }

    setLines(nextLines);
    enqueueSnackbar(
      `Added ${added} row${added === 1 ? "" : "s"} to cart${skipped > 0 ? ` (${skipped} skipped)` : ""}.`,
      { variant: skipped > 0 ? "warning" : "success" }
    );
  };

  /** Apply the scan row's changed price/discount to the line the item landed on. */
  const applyScanOverrides = (
    itemNumber: string,
    batchId: number | null,
    overrides: ScanLineOverrides | null | undefined
  ) => {
    if (!overrides || (overrides.unitPrice == null && !overrides.discount)) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.item_number !== itemNumber || (l.item_batch_id ?? null) !== batchId) return l;
        const discount = overrides.discount;
        return priceLine({
          ...l,
          ...(overrides.unitPrice != null ? { unit_price: overrides.unitPrice } : {}),
          ...(discount
            ? {
                discount_type: discount.value > 0 ? discount.type : null,
                discount_value: discount.value,
              }
            : {}),
        });
      })
    );
  };

  /** The cashier picked a stock in the scan popup: add the item from it. */
  const addFromStockOption = (
    saleItem: Item,
    qty: number,
    option: ScanStockOption,
    overrides: ScanLineOverrides | null
  ) => {
    const added =
      option.kind === "batch"
        ? addItemToCartDirect(saleItem, qty, option.batch)
        : addItemToCartDirect(saleItem, qty, null, option.qty);
    if (added) {
      applyScanOverrides(
        saleItem.item_number,
        option.kind === "batch" ? option.batch.id : null,
        overrides
      );
    }
  };

  const closeStockPick = () => {
    setStockPick(null);
    setStockPickOptions([]);
    setScanRefocusToken((t) => t + 1);
  };

  /**
   * Item held in main stock and batches: ask which one is sold. With a single
   * sellable stock it is used straight away, so the popup only appears when
   * there is a real choice to make.
   */
  const startStockPick = (
    saleItem: Item,
    qty: number,
    overrides: ScanLineOverrides | null
  ) => {
    setStockPick({ saleItem, qty, overrides });
    setStockPickOptions([]);
    setStockPickLoading(true);

    void (async () => {
      try {
        const breakdown = await getItemInventoryBreakdown(saleItem.id);
        const fresh = breakdown.item ?? saleItem;
        const branch = normalizeBranchLocation(saleItem.location);
        // Every batch at this branch counts against main stock, expired or not:
        // main stock is whatever is not in a batch.
        const branchBatches = breakdown.batches.filter(
          (b) =>
            (b.item_id == null || b.item_id === saleItem.id) &&
            normalizeBranchLocation(b.location ?? branch) === branch &&
            b.qty > 0
        );
        const batchTotal = branchBatches.reduce((sum, b) => sum + b.qty, 0);
        const mainQty = Math.round(Math.max(0, Number(fresh.qty ?? 0) - batchTotal) * 100) / 100;

        const options: ScanStockOption[] = [];
        if (mainQty > 0 && !isMainStockExpired(fresh)) {
          options.push({
            kind: "main",
            qty: mainQty,
            unitPrice: unitPriceForBatchSale(saleItem, salesPriceMode, null),
            expiryDate: fresh.expiry_date ?? null,
          });
        }
        for (const batch of availableBatchesAtBranch(branchBatches, branch)) {
          options.push({
            kind: "batch",
            batch,
            qty: batch.qty,
            unitPrice: unitPriceForBatchSale(saleItem, salesPriceMode, batch),
            expiryDate: batch.expiry_date,
          });
        }

        if (options.length <= 1) {
          setStockPick(null);
          setStockPickOptions([]);
          if (options.length === 1) {
            addFromStockOption(saleItem, qty, options[0], overrides);
          } else {
            // Nothing sellable: the normal path gives the right message
            // (out of stock / expired) or allows a negative sale.
            if (addItemToCartDirect(saleItem, qty, null)) {
              applyScanOverrides(saleItem.item_number, null, overrides);
            }
          }
          setScanRefocusToken((t) => t + 1);
          return;
        }
        setStockPickOptions(options);
      } catch (err) {
        enqueueSnackbar(getFriendlyErrorMessage(err), { variant: "error" });
        closeStockPick();
      } finally {
        setStockPickLoading(false);
      }
    })();
  };

  const addMainItemToCart = (
    displayItem: Item,
    addQty = 1,
    overrides: ScanLineOverrides | null = null
  ) => {
    const saleItem = resolveCartItemForSale(
      displayItem,
      variantsByItemNumber,
      itemBranch
    );
    if (allowBatchPicker && saleItem.has_batches && isInventoryTrackedItem(saleItem)) {
      startStockPick(saleItem, roundSaleQty(addQty), overrides);
      return;
    }
    if (saleItem.has_expired_stock || isItemExpired(saleItem)) {
      if (saleItem.has_batches) {
        enqueueSnackbar(
          saleItem.has_expired_stock
            ? `${saleItem.item_number}: write off expired stock or pick a valid batch.`
            : `${saleItem.item_number} is expired — pick a valid batch.`,
          { variant: "warning" }
        );
        openBatchPicker(displayItem, addQty);
        return;
      }
      enqueueSnackbar(
        `${saleItem.item_number} is expired at ${saleItem.location || "this branch"}. Write off stock from Inventory Dashboard.`,
        { variant: "error" }
      );
      return;
    }
    if (addItemToCartDirect(saleItem, roundSaleQty(addQty), null)) {
      applyScanOverrides(saleItem.item_number, null, overrides);
    }
  };

  const openBatchPicker =(displayItem: Item, addQty = 1) => {
    const saleItem = resolveCartItemForSale(
      displayItem,
      variantsByItemNumber,
      itemBranch
    );
    if (isItemExpired(saleItem) && !saleItem.has_batches) {
      enqueueSnackbar(
        `${displayItem.item_number} is expired. Write off stock from Inventory Dashboard.`,
        { variant: "error" }
      );
      return;
    }
    const qtyToAdd = roundSaleQty(addQty);
    const itemKey = (saleItem.item_number || String(saleItem.id)).trim().toLowerCase();
    const variants = variantsByItemNumber.get(itemKey) ?? [saleItem];

    if (!isInventoryTrackedItem(saleItem)) {
      enqueueSnackbar("Inventory details are not available for this item.", {
        variant: "info",
      });
      return;
    }

    setBatchDialogItem(saleItem);
    setBatchDialogQty(qtyToAdd);
    setBatchDialogVariants(variants);
    setBatchDialogBatches([]);
    setBatchDialogOpen(true);

    void (async () => {
      setBatchDialogLoading(true);
      try {
        const { batches } = await getItemInventoryBreakdown(saleItem.id);
        const available = availableBatchesAtBranch(batches, saleItem.location);
        setBatchDialogBatches(available);
      } catch (err) {
        enqueueSnackbar(getFriendlyErrorMessage(err), { variant: "error" });
      } finally {
        setBatchDialogLoading(false);
      }
    })();
  };

  /** Single-click / search: add main product only (no batch dialog). */
  const addItemToCart = addMainItemToCart;

  const handleCatalogSearchSubmit = () => {
    const { term, qty } = parsedCatalogSearch;
    if (!term.trim()) return;

    const candidates = filterPosCatalogItems(
      catalogItems,
      categoryTab,
      categories,
      term,
      subCategoryTab
    );
    const termLower = term.toLowerCase();
    const match =
      // Barcode first: an exact barcode is the strongest possible signal, and
      // without this a code could lose to a loose match on another field.
      candidates.find((i) => (i.barcode ?? "").toLowerCase() === termLower) ??
      candidates.find((i) => i.item_number.toLowerCase() === termLower) ??
      candidates.find((i) => (i.item_code ?? "").toLowerCase() === termLower) ??
      candidates.find((i) => (i.sku ?? "").toLowerCase() === termLower) ??
      // Only a single remaining candidate may be taken implicitly. Falling
      // back to "the first of several" would quietly bill the wrong product
      // whenever a typed term matched more than one item.
      (candidates.length === 1 ? candidates[0] : undefined);

    if (!match) {
      enqueueSnackbar(
        candidates.length > 1
          ? `${candidates.length} products match "${term}" — pick one from the grid.`
          : "No product found for that search.",
        { variant: "warning" }
      );
      return;
    }

    addItemToCart(match, qty ?? 1);
    setCatalogSearch("");
  };

  /**
   * Suggestions for whatever is currently in the scan/search box.
   *
   * Recomputed as the cashier types so the dropdown tracks each keystroke.
   * A scan arrives as one burst of keystrokes, so this fills in for it too —
   * the scanned item simply appears in the list like any other result.
   */
  const parsedScanInput = useMemo(() => parseScannedCode(scanInput), [scanInput]);

  const scanResults = useMemo(
    // Searched on the code alone: a leading "5*" is a quantity, not part of
    // what the cashier is looking for, so including it would match nothing.
    () => searchCatalogItems(parsedScanInput.code, catalogItems),
    [parsedScanInput.code, catalogItems]
  );

  /**
   * Put the chosen item in the cart.
   *
   * Reaching the cart always goes through here — from a dropdown click, a
   * keyboard pick, or Enter on a scan — so an item can never be billed
   * without the cashier having seen it on screen first.
   */
  /**
   * Step one of adding an item: hold it, and ask for the quantity.
   *
   * Nothing reaches the cart here. Picking an item opens a quantity step
   * instead, so the cashier confirms both what is being sold and how many
   * before it is billed — the common case of "three of the same shirt" is
   * then one scan and a number, rather than one scan per garment.
   */
  const selectScanItem = useCallback(
    (chosen: Item) => {
      setPendingScanItem(chosen);
      // A quantity typed into the box ("5*CODE") carries through, so that
      // shorthand still works; otherwise start at one.
      setPendingScanQty(String(parsedScanInput.qty ?? 1));
      // The entry row starts at the price the cart would use and the item's
      // own default discount, so pressing Enter straight through changes
      // nothing — the fields are there only for when the cashier needs them.
      setPendingScanPrice(String(getPosItemUnitPrice(chosen, salesPriceMode) ?? 0));
      const discount = defaultDiscountForItem(chosen, allowItemDiscount);
      setPendingScanDiscountType(discount?.discount_type ?? "percent");
      setPendingScanDiscountValue(String(discount?.discount_value ?? 0));
      setScanInput("");
    },
    [parsedScanInput.qty, salesPriceMode, allowItemDiscount]
  );

  /**
   * Step two: price, discount and quantity confirmed, so the item is billed.
   *
   * The item goes in through the normal add path (stock checks, merging into
   * an existing line), then the entered price and discount are applied to the
   * line it landed on — through priceLine, the same arithmetic as everywhere
   * else, with the discount clamped to the item's maximum.
   */
  const commitPendingScanItem = useCallback(() => {
    if (!pendingScanItem) return;

    const qty = Number(pendingScanQty);
    // A blank or nonsense quantity means one, not zero — a zero-quantity line
    // would silently add nothing and look like the scan failed.
    const addQty = Number.isFinite(qty) && qty > 0 ? qty : 1;

    const typedPrice = Math.max(0, Math.round((Number(pendingScanPrice) || 0) * 100) / 100);
    const catalogPrice = Number(getPosItemUnitPrice(pendingScanItem, salesPriceMode) ?? 0);
    const priceChanged = allowEditSellingPrice && Math.abs(typedPrice - catalogPrice) > 0.004;
    const unitPrice = priceChanged ? typedPrice : catalogPrice;

    let discountValue = allowItemDiscount
      ? Math.max(0, Math.round((Number(pendingScanDiscountValue) || 0) * 100) / 100)
      : 0;
    if (pendingScanDiscountType === "percent") discountValue = Math.min(100, discountValue);

    const ceiling = maxDiscountValueFor(
      addQty,
      unitPrice,
      pendingScanDiscountType,
      Number(pendingScanItem.max_discount ?? 0),
      normalizeDiscountType(pendingScanItem.max_discount_type)
    );
    if (ceiling !== null && discountValue > ceiling) {
      enqueueSnackbar(
        `Maximum discount for ${pendingScanItem.description} is ${
          pendingScanDiscountType === "amount" ? formatSaleRs(ceiling) + " per unit" : ceiling + "%"
        }.`,
        { variant: "warning" }
      );
      discountValue = ceiling;
    }

    // Refuse before the item is added, rather than adding it and then
    // refusing the whole sale at Pay.
    if (!allowSaleBelowCost) {
      const cost = Math.max(0, Number(pendingScanItem.purchase_price ?? 0));
      const net = priceLine({
        qty: addQty,
        unit_price: unitPrice,
        discount_type: pendingScanDiscountType,
        discount_value: discountValue,
      });
      if (cost > 0 && net.line_total / addQty < cost - 0.005) {
        enqueueSnackbar(
          `${pendingScanItem.description} would sell below cost: Rs ${(net.line_total / addQty).toFixed(2)} against a cost of Rs ${cost.toFixed(2)}.`,
          { variant: "error" }
        );
        return;
      }
    }

    // Only what the cashier actually changed is carried over, and applied to
    // the line the item lands on — which may be a batch picked in the popup.
    const defaultDiscount = defaultDiscountForItem(pendingScanItem, allowItemDiscount);
    const discountChanged =
      discountValue !== (defaultDiscount?.discount_value ?? 0) ||
      (discountValue > 0 && pendingScanDiscountType !== (defaultDiscount?.discount_type ?? "percent"));
    const overrides: ScanLineOverrides | null =
      priceChanged || discountChanged
        ? {
            ...(priceChanged ? { unitPrice } : {}),
            ...(discountChanged
              ? { discount: { type: pendingScanDiscountType, value: discountValue } }
              : {}),
          }
        : null;

    addItemToCart(pendingScanItem, addQty, overrides);

    setPendingScanItem(null);
    setPendingScanQty("1");
    setScanRefocusToken((t) => t + 1);
  }, [
    pendingScanItem,
    pendingScanQty,
    pendingScanPrice,
    pendingScanDiscountType,
    pendingScanDiscountValue,
    salesPriceMode,
    allowEditSellingPrice,
    allowItemDiscount,
    allowSaleBelowCost,
    addItemToCart,
    enqueueSnackbar,
  ]);

  const cancelPendingScan = useCallback(() => {
    setPendingScanItem(null);
    setPendingScanQty("1");
    setScanRefocusToken((t) => t + 1);
  }, []);

  /**
   * Handle Enter in the scan/search box, and codes from the camera.
   *
   * Deliberately does NOT add anything on its own. A scanned code resolves to
   * its item and shows it in the list for the cashier to confirm, because at a
   * counter the wrong garment under the beam is easy to miss and a silently
   * billed item is only noticed at the total.
   *
   * The one case that does fall through to the server is a code that matches
   * nothing loaded in the browser — items outside the current branch scope.
   */
  const handleScannedCode = useCallback(
    async (raw: string) => {
      const { code } = parseScannedCode(raw);
      if (!code) return;

      // A scanner can fire twice for one pass of the beam, and a garment left
      // on the glass repeats continuously. Ignoring the repeat keeps the list
      // from flickering while the cashier is reading it.
      if (
        isDuplicateScan(
          code,
          lastScanRef.current?.code ?? null,
          lastScanRef.current?.at ?? null
        )
      ) {
        return;
      }
      lastScanRef.current = { code, at: Date.now() };

      // Already visible in the dropdown — nothing more to fetch or say.
      if (matchScannedCodeInCatalog(code, catalogItems).length > 0) {
        return;
      }
      if (searchCatalogItems(code, catalogItems).length > 0) {
        return;
      }

      setScanBusy(true);
      try {
        const result = await lookupItemByBarcode(code, catalogLocation);

        if (result.items.length > 0) {
          // Found outside the loaded catalog: show it for confirmation the
          // same way a local match is shown.
          setBarcodeMatchCode(code);
          setBarcodeMatches(result.items);
        } else {
          enqueueSnackbar(`No item found for "${code}".`, { variant: "warning" });
        }
      } catch (err) {
        enqueueSnackbar(
          getFriendlyErrorMessage(err, `No item found for "${code}".`),
          { variant: "warning" }
        );
      } finally {
        setScanBusy(false);
        setScanRefocusToken((t) => t + 1);
      }
    },
    [catalogItems, catalogLocation, enqueueSnackbar]
  );

  const setLineQty = (key: string, rawQty: number) => {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const qty = parseSaleLineQty(rawQty);
    if (qty == null) {
      setLines((prev) => prev.filter((l) => l.key !== key));
      return;
    }
    const catalogItem = rawCatalogItems.find((i) => i.id === line.item_id);
    if (catalogItem) {
      const availableQty = maxQtyForCartLine(
        line,
        lines,
        availableStockForCartItem(catalogItem)
      );
      if (!canSetCartQty(catalogItem, qty, availableQty, allowNegativeInventory)) {
        const scope = line.batch_id ? `in batch ${line.batch_id}` : "available";
        enqueueSnackbar(
          `Only ${Math.max(0, availableQty).toFixed(2)} ${formatUomLabel(catalogItem.uom)} ${scope}.`,
          { variant: "warning" }
        );
        return;
      }
    }
    setLines((prev) =>
      prev.map((l) => {
          if (l.key !== key) return l;
          return priceLine({ ...l, qty });
        })
    );
  };

  const updateLineQty = (key: string, delta: number) => {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const uom = lineUom(line);
    const step = qtyStepForUom(uom);
    const signedDelta = delta > 0 ? step : -step;
    const catalogItem = rawCatalogItems.find((i) => i.id === line.item_id);
    if (catalogItem && signedDelta > 0) {
      const availableQty = maxQtyForCartLine(
        line,
        lines,
        availableStockForCartItem(catalogItem)
      );
      if (!canIncreaseCartQty(catalogItem, line.qty, step, availableQty, allowNegativeInventory)) {
        const scope = line.batch_id ? `in batch ${line.batch_id}` : "available";
        enqueueSnackbar(
          `Only ${Math.max(0, availableQty).toFixed(2)} ${formatUomLabel(catalogItem.uom)} ${scope}.`,
          { variant: "warning" }
        );
        return;
      }
    }
    const nextQty = line.qty + signedDelta;
    if (nextQty <= 0) {
      setLines((prev) => prev.filter((l) => l.key !== key));
      return;
    }
    setLineQty(key, nextQty);
  };

  /**
   * Change one line's discount.
   *
   * Clamped to the item's maximum here, at the point of entry, so the server
   * — which rejects anything over the maximum — never refuses a sale the
   * cashier has already quoted. The cashier is told when a value is cut.
   */
  const setLineDiscount = (key: string, type: DiscountType, rawValue: number) => {
    const line = lines.find((l) => l.key === key);
    if (!line) return;

    const catalogItem = rawCatalogItems.find((i) => i.id === line.item_id);
    let value = Math.max(0, Math.round((Number(rawValue) || 0) * 100) / 100);

    if (catalogItem) {
      const ceiling = maxDiscountValueFor(
        line.qty,
        line.unit_price,
        type,
        Number(catalogItem.max_discount ?? 0),
        normalizeDiscountType(catalogItem.max_discount_type)
      );

      if (ceiling !== null && value > ceiling) {
        enqueueSnackbar(
          `Maximum discount for ${line.description} is ${
            type === "amount" ? formatSaleRs(ceiling) + " per unit" : ceiling + "%"
          }.`,
          { variant: "warning" }
        );
        value = ceiling;
      }
    }

    // A percent value above 100 is never meaningful.
    if (type === "percent") value = Math.min(100, value);

    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? priceLine({ ...l, discount_type: type, discount_value: value }) : l
      )
    );
  };

  const setLineUnitPrice = (key: string, rawPrice: number) => {
    const unitPrice = Math.max(0, Math.round(rawPrice * 100) / 100);
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        return priceLine({ ...l, unit_price: unitPrice });
      })
    );
  };

  const removeFromCart = (displayItem: Item) => {
    const saleItem = resolveCartItemForSale(
      displayItem,
      variantsByItemNumber,
      itemBranch
    );
    const itemLines = lines.filter((l) => l.item_id === saleItem.id);
    if (itemLines.length === 0) return;

    const mainLine = itemLines.find((l) => l.item_batch_id == null);
    const target = mainLine ?? itemLines[itemLines.length - 1];
    updateLineQty(target.key, -1);
  };

  const finishSaleWithReceipt = async (receipt?: Parameters<typeof printSaleReceiptFromApi>[0]) => {
    invalidatePosQueries(queryClient);
    const autoPrint =
      hardwareSettings?.allow_auto_print ?? receipt?.print_options.allow_auto_print ?? true;

    // The scan lane is a till: the receipt is shown on screen (Enter prints,
    // Enter again starts the next customer) and the lane clears itself for
    // the next sale. It does not download a PNG of every receipt — that suits
    // the back office, but at a counter it fills the Downloads folder.
    if (initialView === "scan") {
      setActiveHoldSaleId(null);
      resetPosForNewSale();
      if (receipt) {
        setReceiptPreview(receipt);
      } else {
        enqueueSnackbar("Sale completed", { variant: "success" });
        setScanRefocusToken((t) => t + 1);
      }
      return;
    }

    if (receipt) {
      if (autoPrint) {
        printSaleReceiptFromApi(receipt);
      }
      try {
        await downloadSaleReceiptImageFromApi(receipt);
        enqueueSnackbar("Sale completed — receipt PNG downloaded", { variant: "success" });
      } catch (imgErr) {
        const imgMsg = imgErr instanceof Error ? imgErr.message : "Receipt image download failed";
        enqueueSnackbar(`Sale completed — ${imgMsg}`, { variant: "warning" });
      }
    } else {
      enqueueSnackbar("Sale completed", { variant: "success" });
    }
    setActiveHoldSaleId(null);
    navigate(SALES_BASE);
  };

  const saveMutation = useMutation({
    mutationFn: createSale,
    onSuccess: async ({ receipt }) => {
      await finishSaleWithReceipt(receipt);
    },
    onError: (err: unknown) => {
      enqueueSnackbar(getFriendlyErrorMessage(err, "Failed to complete sale"), {
        variant: "error",
      });
    },
  });

  const completeHoldMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SalePayload }) =>
      completeHoldOrder(id, payload),
    onSuccess: async ({ receipt }) => {
      await finishSaleWithReceipt(receipt);
    },
    onError: (err: unknown) => {
      enqueueSnackbar(getFriendlyErrorMessage(err, "Failed to complete hold order"), {
        variant: "error",
      });
    },
  });

  const resetPosForNewSale = () => {
    setActiveHoldSaleId(null);
    setSplitMode(false);
    setPaymentSplits([]);
    setLines([]);
    setPaymentMethod("Cash");
    setAmountReceived(0);
    setChequeDetails(null);
    setOfferDiscount(0);
    setOfferPreview(null);
    setView(initialView);
    setForm((prev) => ({
      ...emptySaleForm(),
      location: prev.location ?? defaultLocation,
      customer_id: prev.customer_id ?? null,
      customer_name: prev.customer_name ?? "",
    }));
    getNextSalesId()
      .then((id) => setForm((prev) => ({ ...prev, sales_id: id })))
      .catch(() => {});
  };

  const holdMutation = useMutation({
    mutationFn: createSale,
    onSuccess: () => {
      invalidatePosQueries(queryClient);
      enqueueSnackbar("Order placed on hold", { variant: "success" });
      resetPosForNewSale();
    },
    onError: (err: unknown) => {
      enqueueSnackbar(getFriendlyErrorMessage(err, "Failed to hold order"), {
        variant: "error",
      });
    },
  });

  const updateHoldMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SalePayload }) =>
      updateSale(id, payload),
    onSuccess: () => {
      invalidatePosQueries(queryClient);
      enqueueSnackbar("Hold order updated", { variant: "success" });
      resetPosForNewSale();
    },
    onError: (err: unknown) => {
      enqueueSnackbar(getFriendlyErrorMessage(err, "Failed to update hold order"), {
        variant: "error",
      });
    },
  });

  const resumeHoldOrder = (sale: Sale) => {
    setActiveHoldSaleId(sale.id);
    setForm({
      ...emptySaleForm(),
      transaction_type: sale.transaction_type,
      sales_type: sale.sales_type,
      pricing_mode: sale.pricing_mode,
      location: sale.location,
      sale_date: sale.sale_date,
      sales_id: sale.sales_id,
      customer_id: sale.customer_id,
      customer_name: sale.customer_name ?? "",
      sub_total: sale.sub_total,
      discount: sale.discount,
      service_charge: sale.service_charge ?? 0,
      net_amount: sale.net_amount,
      offer_id: sale.offer_id ?? null,
      offer_promo_code: sale.offer_promo_code ?? null,
      payment_method: sale.payment_method ?? "Cash",
      notes: sale.notes ?? "",
    });
    setLines(linesFromSale(sale.items));
    const method = (sale.payment_method as PosPaymentMethod) || "Cash";
    setPaymentMethod(method);
    setAmountReceived(sale.amount_received ?? sale.net_amount);
      setChequeDetails(null);
    setView(initialView === "scan" ? "scan" : "checkout");
    enqueueSnackbar(`Loaded hold order ${sale.sales_id}`, { variant: "info" });
  };

  const goToCheckout = () => {
    if (lines.length === 0) {
      enqueueSnackbar("Add at least one product first", { variant: "warning" });
      return;
    }
    setView("checkout");
  };

  const saleBusy =
    saveMutation.isPending ||
    holdMutation.isPending ||
    updateHoldMutation.isPending ||
    completeHoldMutation.isPending;

  const buildSalePayload = (orderStatus: OrderStatus): SalePayload => {
    const stockLocation = resolveSaleLocationFromLines(
      lines.map((l) => l.item_id).filter((id): id is number => id != null),
      rawCatalogItems,
      itemBranch
    );

    return {
      ...form,
      order_status: orderStatus,
      transaction_type:
        activeHoldSaleId && form.transaction_type === TRANSACTION_TYPE_RETURN
          ? TRANSACTION_TYPE_RETURN
          : DEFAULT_TRANSACTION_TYPE,
      sales_type: salesPriceMode,
      pricing_mode: pricingModeFromSalesType(salesPriceMode),
      location: stockLocation,
      sub_total: linesSubTotal,
      net_amount: netAmount,
      discount: Number(form.discount) || 0,
      service_charge: deliveryCharge,
      vat_amount: vatBreakdown.vatAmount,
      vat_rate_id: vatBreakdown.vatRateId,
      offer_id: form.offer_id ?? null,
      offer_applied: Boolean(form.offer_id),
      offer_promo_code: form.offer_promo_code?.trim()
        ? form.offer_promo_code.trim().toUpperCase()
        : null,
      payment_method: splitMode ? "Split" : paymentMethod,
      // A split records exactly the total — the server rejects change inside
      // a split, so there is no "received" figure beyond it.
      amount_received: splitMode || paymentMethod === "Credit" ? netAmount : amountReceived,
      ...(splitMode ? { payment_splits: splitsToPayload(paymentSplits) } : {}),
      bank_id: null,
      // Only sent for cheque payments: a stale value left over from a cheque
      // the cashier started and then switched away from would otherwise be
      // saved against a cash sale.
      cheque_number:
        paymentMethod === "Cheque" ? (chequeDetails?.cheque_number ?? null) : null,
      bank_name: paymentMethod === "Cheque" ? (chequeDetails?.bank_name ?? null) : null,
      items: linesToPayload(lines),
      notes:
        paymentMethod === "Cheque" && chequeDetails
          ? `Cheque payment - ${chequeDetails.bank_name} #${chequeDetails.cheque_number}`
          : form.notes,
      };
  };


  const handlePaymentSelect = (method: PosPaymentMethod) => {
    setPaymentMethod(method);
    if (method === "Cheque") {
      setChequeDialogOpen(true);
    } else {
      setChequeDetails(null);
      if (method === "Cash") {
        setAmountReceived(netAmount);
      }
    }
  };

  /**
   * Save the cart as a quotation — a priced estimate for the customer.
   *
   * Nothing is paid and no stock moves (the server skips both for a
   * quotation). It still goes through the below-cost check, because a
   * quotation is a price the shop has promised.
   */
  const handleQuote = () => {
    if (lines.length === 0) {
      enqueueSnackbar("Add at least one item", { variant: "warning" });
      return;
    }
    if (activeHoldSaleId) {
      enqueueSnackbar("Finish or clear the held order before giving a quote.", {
        variant: "warning",
      });
      return;
    }
    if (belowCostMessage) {
      enqueueSnackbar(belowCostMessage, { variant: "error" });
      return;
    }

    const payload = buildSalePayload("quotation");
    // A quotation records no payment of any kind.
    saveMutation.mutate({
      ...payload,
      payment_method: "Cash",
      amount_received: null,
      payment_splits: undefined,
      cheque_number: null,
      bank_name: null,
    });
  };

  const handleComplete = () => {
    if (lines.length === 0) {
      enqueueSnackbar("Add at least one item", { variant: "warning" });
      return;
    }
    if (belowCostMessage) {
      enqueueSnackbar(belowCostMessage, { variant: "error" });
      return;
    }
    if (splitMode) {
      const splitError = splitsValidationError(paymentSplits, netAmount);
      if (splitError) {
        enqueueSnackbar(splitError, { variant: "warning" });
        return;
      }
      if (
        paymentSplits.some((l) => l.method === "Credit" && Number(l.amount) > 0) &&
        !form.customer_id
      ) {
        enqueueSnackbar("Select a customer for the credit part of the payment", {
          variant: "warning",
        });
        return;
      }
    } else {
      if (paymentMethod === "Cheque" && !chequeDetails) {
        setChequeDialogOpen(true);
        enqueueSnackbar("Enter cheque bank details", { variant: "warning" });
        return;
      }
      if (paymentMethod !== "Credit" && amountReceived < netAmount) {
        enqueueSnackbar("Amount received is less than net amount", { variant: "warning" });
        return;
      }
      if (paymentMethod === "Credit" && !form.customer_id) {
        enqueueSnackbar("Select a customer for credit sales", { variant: "warning" });
        return;
      }
    }
    if (offerNeedsPromo && !String(form.offer_promo_code ?? "").trim()) {
      enqueueSnackbar("Enter the promo code for this offer", { variant: "warning" });
      return;
    }

    const payload = buildSalePayload("completed");
    if (activeHoldSaleId) {
      completeHoldMutation.mutate({ id: activeHoldSaleId, payload });
      return;
    }
    saveMutation.mutate(payload);
  };

  const handleHold = () => {
    if (lines.length === 0) {
      enqueueSnackbar("Add at least one item", { variant: "warning" });
      return;
    }
    if (offerNeedsPromo && !String(form.offer_promo_code ?? "").trim()) {
      enqueueSnackbar("Enter the promo code for this offer", { variant: "warning" });
      return;
    }

    const payload = buildSalePayload("hold");
    if (activeHoldSaleId) {
      updateHoldMutation.mutate({ id: activeHoldSaleId, payload });
      return;
    }
    holdMutation.mutate(payload);
  };

  const activeCategoryName =
    categoryTab === "all"
      ? "All"
      : categoryTab === "favourite"
        ? "Favourite"
        : categories.find((c) => c.id === categoryTab)?.name ?? "Category";

  const activeSubName =
    subCategoryTab === "all"
      ? null
      : visibleSubCategories.find((s) => s.id === subCategoryTab)?.name ?? null;

  const categoryTabLabel = activeSubName
    ? `${activeCategoryName} › ${activeSubName}`
    : activeCategoryName;

  const session: PosSaleSession = {
    view,
    setView,
    form,
    setForm,
    lines,
    setLines,
    categoryTab,
    subCategoryTab,
    catalogSearch,
    setCatalogSearch,
    paymentMethod,
    amountReceived,
    setAmountReceived,
    chequeDetails,
    setChequeDialogOpen,
    offerDiscount,
    setOfferDiscount,
    offerPreview,
    setOfferPreview,
    offerUpdating: offerEngine.isFetching,
    offerEngine,
    selectedOffer: selectedOffer ?? null,
    activeHoldSaleId,
    itemBranch,
    catalogScopeLabel,
    categories,
    loadingCategories,
    loadingItems,
    filteredItems,
    catalogItems,
    customers,
    loadingCustomers,
    applicableOffers,
    allowPriceSwitch,
    allowWholesalePrice,
    allowEditSellingPrice,
    salesPriceMode,
    showBothPricesOnCards,
    showOffers,
    allowDeliveryCharge,
    visibleSubCategories,
    activeCategoryName,
    categoryTabLabel,
    parsedCatalogSearch,
    productOfferMap,
    linesSubTotal,
    netAmount,
    changeDue,
    vatBreakdown,
    saleBusy,
    offerNeedsPromo,
    itemImageByNumber,
    lineImageUrl,
    lineUom,
    handleSalesPriceModeChange,
    handleCategoryTabChange,
    setSubCategoryTab,
    addItemToCart,
    addMainItemToCart,
    openBatchPicker,
    removeFromCart,
    cartQtyForItem: (itemId: number) => cartQtyForItem(lines, itemId),
    handleCatalogSearchSubmit,
    setLineQty,
    setLineUnitPrice,
    setLineDiscount,
    allowItemDiscount,
    updateLineQty,
    handlePaymentSelect,
    handleComplete,
    handleHold,
    resetPosForNewSale,
    resumeHoldOrder,
    savePosSelectedCustomer,
    customerDisplayName,
    goToCheckout,
    autoPrintEnabled: hardwareSettings?.allow_auto_print ?? true,
    handleQuote,
    setReprintOpen,
    setQuickAddCustomerOpen,
    customerOpenSignal,
    openCustomerPicker: () => setCustomerOpenSignal((n) => n + 1),
    splitMode,
    setSplitMode,
    paymentSplits,
    setPaymentSplits,
    belowCostKeys: new Set(belowCostLines.map((l) => l.key)),
    belowCostMessage,
    unitCostFor: (itemId: number | null | undefined) =>
      itemId == null ? 0 : Math.max(0, Number(itemCostById.get(itemId)?.purchase_price ?? 0)),
    handleScannedCode,
    scanResults,
    selectScanItem,
    pendingScanItem,
    pendingScanQty,
    setPendingScanQty,
    pendingScanPrice,
    setPendingScanPrice,
    pendingScanDiscountType,
    setPendingScanDiscountType,
    pendingScanDiscountValue,
    setPendingScanDiscountValue,
    allowSaleBelowCost,
    allowOrderDiscount: orderSettings?.allow_order_discount !== false,
    commitPendingScanItem,
    cancelPendingScan,
    scanBusy,
    scanRefocusToken,
    scanInput,
    setScanInput,
    cameraScanOpen,
    setCameraScanOpen,
  };

  return (
    <PosSaleContext.Provider value={session}>
      {view === "scan" ? (
        <PosScanCheckoutPage />
      ) : view === "products" ? (
        <PosProductSelectPage />
      ) : (
        <PosSaleCheckoutPage />
      )}
      <PosReceiptPreviewDialog
        receipt={receiptPreview}
        autoPrint={hardwareSettings?.allow_auto_print ?? false}
        onClose={() => {
          setReceiptPreview(null);
          setScanRefocusToken((t) => t + 1);
        }}
      />
      <PosReprintDialog
        open={reprintOpen}
        onClose={() => {
          setReprintOpen(false);
          setScanRefocusToken((t) => t + 1);
        }}
        onSelect={(receipt) => {
          setReprintOpen(false);
          setReceiptPreview(receipt);
        }}
      />
      <PosQuickAddCustomerDialog
        open={quickAddCustomerOpen}
        defaultRoute={itemBranch}
        onClose={() => {
          setQuickAddCustomerOpen(false);
          setScanRefocusToken((t) => t + 1);
        }}
        onCreated={(customer) => {
          setForm((prev) => ({
            ...prev,
            customer_id: customer.id,
            customer_name: customerDisplayName(customer),
          }));
          savePosSelectedCustomer(customer);
          enqueueSnackbar(`${customerDisplayName(customer)} added and selected`, {
            variant: "success",
          });
        }}
      />
      <PosBarcodeMatchDialog
        open={barcodeMatches.length > 0}
        code={barcodeMatchCode}
        matches={barcodeMatches}
        onClose={() => {
          setBarcodeMatches([]);
          setScanRefocusToken((t) => t + 1);
        }}
        onPick={(item) => {
          setBarcodeMatches([]);
          selectScanItem(item);
        }}
      />
      <CameraBarcodeScanDialog
        open={cameraScanOpen}
        onClose={() => {
          setCameraScanOpen(false);
          setScanRefocusToken((t) => t + 1);
        }}
        onDetected={(code) => {
          setCameraScanOpen(false);
          void handleScannedCode(code);
        }}
      />
      <PosChequeBankDialog
        open={chequeDialogOpen}
        onClose={() => setChequeDialogOpen(false)}
        initialBankName={chequeDetails?.bank_name}
        initialChequeNumber={chequeDetails?.cheque_number}
        onConfirm={(d) => {
          setChequeDetails(d);
          setAmountReceived(netAmount);
        }}
      />
      <PosScanBatchPickDialog
        open={stockPick != null}
        item={stockPick?.saleItem ?? null}
        options={stockPickOptions}
        loading={stockPickLoading}
        saleQty={stockPick?.qty ?? 1}
        allowNegativeInventory={allowNegativeInventory}
        onPick={(option) => {
          if (stockPick) {
            addFromStockOption(stockPick.saleItem, stockPick.qty, option, stockPick.overrides);
          }
          closeStockPick();
        }}
        onClose={closeStockPick}
      />
      <PosSaleBatchSelectDialog
        open={batchDialogOpen}
        item={batchDialogItem}
        variants={batchDialogVariants}
        batches={batchDialogBatches}
        loading={batchDialogLoading}
        defaultQty={batchDialogQty}
        salesType={salesPriceMode}
        allowNegativeInventory={allowNegativeInventory}
        allowBatchSelection={allowBatchPicker}
        applicableOffers={applicableOffers}
        onClose={() => setBatchDialogOpen(false)}
        onSelectBatch={(batch, qty) => {
          if (batchDialogItem) {
            addItemToCartDirect(batchDialogItem, qty, batch);
          }
          setBatchDialogOpen(false);
        }}
        onSelectBatches={(selections, unbatchedQty) => {
          if (batchDialogItem) {
            addBatchesToCart(batchDialogItem, selections, unbatchedQty);
          }
          setBatchDialogOpen(false);
        }}
        onSelectMainProduct={(qty) => {
          if (batchDialogItem) {
            addItemToCartDirect(batchDialogItem, qty, null);
          }
          setBatchDialogOpen(false);
        }}
        onSelectAutoFefo={(qty) => {
          if (batchDialogItem) {
            addItemToCartDirect(batchDialogItem, qty, null);
          }
          setBatchDialogOpen(false);
        }}
      />
    </PosSaleContext.Provider>
  );
};

export default PosSaleFormPage;
