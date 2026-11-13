import type { CompanyPrintHeader } from "../../../api/Settings/companySettingsApi";
import type {
  HardwareSettings,
  LetterheadMargin,
  PrintingPaperSize,
  SalesReceiptStyle,
} from "../../../api/Settings/hardwareSettingsApi";
import type {
  SaleReceiptApiPayload,
  SaleReceiptLabels,
  SaleReceiptLine,
} from "../../../api/salesApi";
import { buildReceiptSoftwareFooterHtml } from "../../../utils/receiptSoftwareFooter";
import { buildBarcodeSvgMarkup } from "../../../utils/barcodeSvg";
import type {
  ReceiptCustomField,
  ReceiptCustomFieldPosition,
  ReceiptSettings,
} from "../../../api/Settings/receiptSettingsApi";
import { formatSaleRs } from "./saleFormUtils";

export type { SaleReceiptApiPayload, SaleReceiptLabels, SaleReceiptLine };

export interface SaleReceiptData {
  sales_id: string;
  sale_date: string;
  customer_name?: string | null;
  customer_code?: string | null;
  customer_contact_no?: string | null;
  customer_route?: string | null;
  location: string;
  payment_method: string;
  sub_total: number;
  discount: number;
  service_charge?: number;
  card_payment_charge?: number;
  net_amount: number;
  amount_received?: number | null;
  bank_name?: string | null;
  cheque_number?: string | null;
  lines: SaleReceiptLine[];
  show_barcode?: boolean;
  barcode_value?: string | null;
  discount_label?: string | null;
  /** Present only for a split payment: each method and what it covered. */
  payment_splits?: {
    payment_method: string;
    amount: number;
    bank_name?: string | null;
    cheque_number?: string | null;
  }[];
  is_quotation?: boolean;
  is_hold?: boolean;
  is_return?: boolean;
  is_exchange?: boolean;
  /** Customer's total outstanding balance across all past bills. */
  outstanding_balance?: number | null;
}

export interface SaleReceiptPrintOptions {
  printing_paper_size?: PrintingPaperSize;
  sales_receipt_printout_style?: SalesReceiptStyle;
  letterhead_top_margin_cm?: LetterheadMargin;
  logo_url?: string | null;
  allow_logo_on_sales_receipt?: boolean;
}

const DEFAULT_LABELS: SaleReceiptLabels = {
  receipt_title: "TAX INVOICE",
  sales_id: "Invoice No",
  date: "Date",
  location: "Branch",
  cashier: "Cashier",
  customer: "Bill To",
  item_no: "SKU",
  description: "Description",
  qty: "Qty",
  uom: "UOM",
  unit_price: "Rate",
  total: "Amount",
  sub_total: "Subtotal",
  discount: "Discount",
  service_charge: "Delivery charge",
  card_charge: "Card fee",
  net_amount: "Total due",
  payment: "Payment",
  received: "Paid",
  change: "Change",
  you_saved: "You saved",
  thank_you: "Thank you for your business",
};

const INK = "#111111";
const MUTED = "#444444";

/**
 * The admin-added lines sitting at one point in the receipt.
 *
 * Returns "" when there are none, so each insertion point costs nothing when
 * unused. A field with only a value prints the value alone — the label is a
 * caption, not a requirement.
 */
function buildCustomFieldsHtml(
  fields: ReceiptCustomField[] | undefined,
  position: ReceiptCustomFieldPosition
): string {
  if (!fields || fields.length === 0) return "";

  const html = fields
    .filter((field) => field.position === position && (field.label || field.value))
    .map((field) => {
      const text = field.label && field.value
        ? `${field.label}: ${field.value}`
        : field.label || field.value;

      return `<div class="rcpt-custom" style="text-align:${field.align};font-size:${field.font_size}px;font-weight:${field.bold ? 700 : 400};">${escape(text)}</div>`;
    })
    .join("");

  return html;
}

/** Letterhead top gap is for pre-printed A4/A5/Letter stock — not 80mm thermal rolls. */
function resolveReceiptTopMargin(
  paperSize: PrintingPaperSize | undefined,
  margin: LetterheadMargin
): string {
  if ((paperSize ?? "a4") === "80mm" || margin === "none") {
    return "0";
  }
  return `${margin}cm`;
}

export function buildSaleReceiptHtmlFromApi(payload: SaleReceiptApiPayload): string {
  const header: CompanyPrintHeader = {
    company_name: payload.header.company_name,
    address_line: payload.header.address_line ?? "",
    phone: payload.header.phone ?? "",
    email: payload.header.email ?? "",
    tax_id: payload.header.tax_id ?? null,
    registration_number: payload.header.registration_number ?? null,
    logo_url:
      payload.print_options.allow_logo_on_sales_receipt !== false
        ? payload.print_options.logo_url ?? payload.header.logo_url ?? null
        : null,
  };

  return buildSaleReceiptHtml(header, payload.sale, {
    labels: payload.labels,
    hardware: payload.hardware_settings,
    receipt: payload.receipt_settings,
    options: {
      printing_paper_size: payload.print_options.printing_paper_size as PrintingPaperSize,
      sales_receipt_printout_style: payload.print_options
        .sales_receipt_printout_style as SalesReceiptStyle,
      letterhead_top_margin_cm: payload.print_options.letterhead_top_margin_cm as LetterheadMargin,
      logo_url: payload.print_options.logo_url,
      allow_logo_on_sales_receipt: payload.print_options.allow_logo_on_sales_receipt,
    },
  });
}

export function printSaleReceiptFromApi(payload: SaleReceiptApiPayload): void {
  const html = buildSaleReceiptHtmlFromApi(payload);
  const isThermal = payload.print_options.printing_paper_size === "80mm";
  openPrintWindow(html, `Invoice ${payload.sale.sales_id}`, isThermal);
}

function buildSaleReceiptHtml(
  header: CompanyPrintHeader,
  sale: SaleReceiptData,
  extras?: {
    labels?: Partial<SaleReceiptLabels>;
    options?: SaleReceiptPrintOptions;
    hardware?: HardwareSettings;
    receipt?: ReceiptSettings;
  }
): string {
  const hw = extras?.hardware;
  const rs = extras?.receipt;
  const labels = { ...DEFAULT_LABELS, ...extras?.labels };
  const options: SaleReceiptPrintOptions = {
    printing_paper_size: hw?.printing_paper_size ?? extras?.options?.printing_paper_size ?? "80mm",
    sales_receipt_printout_style:
      hw?.sales_receipt_printout_style ?? extras?.options?.sales_receipt_printout_style ?? "style_4",
    letterhead_top_margin_cm:
      hw?.letterhead_top_margin_cm ?? extras?.options?.letterhead_top_margin_cm ?? "none",
    logo_url:
      hw && !hw.allow_logo_on_sales_receipt
        ? null
        : (extras?.options?.logo_url ??
          (hw?.printing_paper_size === "80mm" ? hw.logo_80mm_url : hw?.logo_a4_a5_url) ??
          header.logo_url),
    allow_logo_on_sales_receipt:
      hw?.allow_logo_on_sales_receipt ?? extras?.options?.allow_logo_on_sales_receipt ?? true,
  };

  let saleData = { ...sale };
  if (hw) {
    if (!hw.allow_customer_details_on_sales_receipt) {
      saleData = { ...saleData, customer_name: null };
    }
    if (!hw.allow_discount_on_sales_receipt) {
      saleData = { ...saleData, discount: 0, discount_label: null };
    } else if (!saleData.discount_label) {
      saleData = { ...saleData, discount_label: hw.customize_label_for_discount || "Discount" };
    }
    // Two switches reach the same block: the hardware page's long-standing
    // toggle and the receipt editor's. Either turning it off wins, so a shop
    // that hid the barcode in one place does not see it reappear because of
    // the other.
    const barcodeAllowed =
      hw.show_barcode_on_sales_receipt && (rs ? rs.show_barcode : true);

    saleData = barcodeAllowed
      ? { ...saleData, show_barcode: true, barcode_value: saleData.sales_id }
      : { ...saleData, show_barcode: false };
  }

  const resolvedHeader: CompanyPrintHeader = {
    ...header,
    logo_url: options.allow_logo_on_sales_receipt ? options.logo_url ?? header.logo_url : null,
  };

  const style = options.sales_receipt_printout_style ?? "style_4";
  const isThermal = (options.printing_paper_size ?? "a4") === "80mm";
  if (isThermal) {
    return buildThermalReceiptDocument(resolvedHeader, saleData, labels, options, rs);
  }
  return buildA4ReceiptDocument(resolvedHeader, saleData, labels, style, options);
}

export function printSaleReceipt(
  header: CompanyPrintHeader,
  sale: SaleReceiptData,
  extras?: {
    labels?: Partial<SaleReceiptLabels>;
    options?: SaleReceiptPrintOptions;
    hardware?: HardwareSettings;
    receipt?: ReceiptSettings;
  }
): void {
  const html = buildSaleReceiptHtml(header, sale, extras);
  const isThermal =
    (extras?.hardware?.printing_paper_size ?? extras?.options?.printing_paper_size ?? "a4") ===
    "80mm";
  openPrintWindow(html, `Invoice ${sale.sales_id}`, isThermal);
}

function buildThermalReceiptDocument(
  header: CompanyPrintHeader,
  sale: SaleReceiptData,
  labels: SaleReceiptLabels,
  options: SaleReceiptPrintOptions,
  rs?: ReceiptSettings
): string {
  const show = (key: keyof ReceiptSettings): boolean =>
    rs ? Boolean(rs[key]) : true;

  const isHold      = Boolean(sale.is_hold);
  const isReturn    = Boolean(sale.is_return);
  const isQuotation = Boolean(sale.is_quotation);

  const change =
    !isHold && sale.amount_received != null
      ? Math.max(0, sale.amount_received - sale.net_amount)
      : null;
  const discountLabel = sale.discount_label ?? labels.discount;
  const showDiscount =
    show("show_discount_column") && (sale.discount > 0 || sale.discount_label != null);

  const margin = options.letterhead_top_margin_cm ?? "none";
  const marginTop = resolveReceiptTopMargin(options.printing_paper_size, margin);

  // ── Header ──────────────────────────────────────────────────────────────────
  const logoHtml =
    show("show_logo") && header.logo_url
      ? `<img class="rcpt-logo" src="${escape(header.logo_url)}" alt="" />`
      : "";

  const phoneLine = show("show_phone") && header.phone
    ? `<div class="rcpt-sub">Tel: ${escape(header.phone)}</div>` : "";
  const emailLine = show("show_email") && header.email
    ? `<div class="rcpt-sub">${escape(header.email)}</div>` : "";
  const taxLine = show("show_tax_id") && (header.tax_id || header.registration_number)
    ? `<div class="rcpt-sub rcpt-tax">${[
        header.tax_id ? `Tax: ${escape(header.tax_id)}` : "",
        header.registration_number ? `Reg: ${escape(header.registration_number)}` : "",
      ].filter(Boolean).join(" · ")}</div>` : "";

  // ── Dynamic title + Bill No label ───────────────────────────────────────────
  const titleText = isReturn    ? "SALES RETURN"
                  : isQuotation ? "PRICE QUOTATION"
                  : isHold      ? "HOLD ORDER"
                  : "SALES RECEIPT";

  const billNoLabel = isReturn    ? "Return No"
                    : isQuotation ? "Quotation No"
                    : isHold      ? "Hold No"
                    : "Bill No";

  const billNoHtml = show("show_invoice_id")
    ? `<div class="rcpt-inv-no">${billNoLabel}: ${escape(sale.sales_id)}</div>` : "";

  const currencyLine = `<div class="rcpt-currency">All amounts in LKR</div>`;

  // ── Info rows — payment in meta block (split = one row per method) ──────────
  const splits = (sale.payment_splits ?? []).filter((s) => Number(s.amount) > 0);

  const paymentInfoRows = !isQuotation
    ? splits.length > 0
      ? splits.flatMap((s) => [
          `<div class="rcpt-row"><span>${escape(s.payment_method)}${s.cheque_number ? ` #${escape(s.cheque_number)}` : ""}</span><span>LKR ${formatSaleRs(Number(s.amount))}</span></div>`,
          s.bank_name ? `<div class="rcpt-row rcpt-row-note"><span>&nbsp;&nbsp;Bank</span><span>${escape(s.bank_name)}</span></div>` : "",
        ]).filter(Boolean).join("")
      : [
          show("show_payment_method")
            ? `<div class="rcpt-row"><span>${escape(labels.payment)}</span><span>${escape(sale.payment_method)}</span></div>` : "",
          sale.bank_name
            ? `<div class="rcpt-row rcpt-row-note"><span>Bank</span><span>${escape(sale.bank_name)}</span></div>` : "",
          sale.cheque_number
            ? `<div class="rcpt-row rcpt-row-note"><span>Cheque #</span><span>${escape(sale.cheque_number)}</span></div>` : "",
        ].filter(Boolean).join("")
    : "";

  const infoRows = [
    show("show_date_time")
      ? `<div class="rcpt-row"><span>${escape(labels.date)}</span><span>${escape(sale.sale_date)}</span></div>` : "",
    show("show_branch_name")
      ? `<div class="rcpt-row"><span>${escape(labels.location)}</span><span>${escape(sale.location)}</span></div>` : "",
    paymentInfoRows,
  ].filter(Boolean).join("");

  // ── Customer section ─────────────────────────────────────────────────────────
  const customerRows = [
    sale.customer_name    ? `<div class="rcpt-row"><span>Customer</span><span>${escape(sale.customer_name)}</span></div>` : "",
    sale.customer_code    ? `<div class="rcpt-row rcpt-row-note"><span>Customer ID</span><span>${escape(sale.customer_code)}</span></div>` : "",
    sale.customer_contact_no ? `<div class="rcpt-row rcpt-row-note"><span>Phone</span><span>${escape(sale.customer_contact_no)}</span></div>` : "",
    sale.customer_route   ? `<div class="rcpt-row rcpt-row-note"><span>Route</span><span>${escape(sale.customer_route)}</span></div>` : "",
  ].filter(Boolean).join("");

  const customerSection = show("show_customer_name") && customerRows
    ? `<div class="rcpt-rule"></div>
       <div class="rcpt-section-title">Customer Information</div>
       ${customerRows}` : "";

  // ── Item rows ────────────────────────────────────────────────────────────────
  const itemRows = sale.lines.map((line) => {
    const lineDiscount = Number(line.discount_amount ?? 0);
    const showLineDiscount = lineDiscount > 0 && show("show_discount_column");
    const grossAmt = showLineDiscount
      ? Math.round((line.line_total + lineDiscount) * 100) / 100
      : line.line_total;
    const uom = show("show_item_uom") && line.uom ? ` ${escape(line.uom)}` : " Pcs";
    const qtyDetail = show("show_unit_price")
      ? `${line.qty}${uom} x LKR ${formatSaleRs(line.unit_price)}`
      : `${escape(labels.qty)}: ${line.qty}`;
    const discountRow = showLineDiscount
      ? `<tr><td class="rcpt-disc-cell" colspan="3">– Discount: ${formatSaleRs(lineDiscount)}</td></tr>` : "";
    return `
      <tr class="rcpt-item-name-row">
        <td class="rcpt-item-name-cell" colspan="2">${escape(line.description)}</td>
        <td class="rcpt-item-amt-cell">LKR ${formatSaleRs(grossAmt)}</td>
      </tr>
      <tr class="rcpt-item-detail-row">
        <td colspan="3" class="rcpt-item-detail-cell">${qtyDetail}</td>
      </tr>
      ${discountRow}`;
  }).join("");

  // ── Totals ───────────────────────────────────────────────────────────────────
  const subtotalRow = `<div class="rcpt-row rcpt-row-sub"><span>${escape(labels.sub_total)}</span><span>LKR ${formatSaleRs(sale.sub_total)}</span></div>`;
  const discountRow = showDiscount
    ? `<div class="rcpt-row"><span>${escape(discountLabel)}</span><span>– LKR ${formatSaleRs(sale.discount)}</span></div>` : "";
  const serviceRow = (sale.service_charge ?? 0) > 0
    ? `<div class="rcpt-row"><span>${escape(labels.service_charge)}</span><span>LKR ${formatSaleRs(sale.service_charge!)}</span></div>` : "";
  const cardRow = (sale.card_payment_charge ?? 0) > 0
    ? `<div class="rcpt-row"><span>${escape(labels.card_charge)}</span><span>LKR ${formatSaleRs(sale.card_payment_charge!)}</span></div>` : "";

  // Dynamic TOTAL label
  const totalLabel = isHold   ? "AMOUNT DUE"
                   : sale.discount > 0 ? "BALANCE"
                   : "TOTAL";

  const totalRow = `
    <div class="rcpt-rule"></div>
    <div class="rcpt-row rcpt-row-grand">
      <span>${totalLabel}</span>
      <span>LKR ${formatSaleRs(sale.net_amount)}</span>
    </div>`;

  // Received / Change — only on completed (non-hold, non-quote) sales
  const receivedRows = !isHold && !isQuotation ? [
    show("show_amount_received") && sale.amount_received != null
      ? `<div class="rcpt-row"><span>${escape(labels.received)}</span><span>LKR ${formatSaleRs(sale.amount_received)}</span></div>` : "",
    show("show_change") && change != null
      ? `<div class="rcpt-row"><span>${escape(labels.change)}</span><span>LKR ${formatSaleRs(change)}</span></div>` : "",
    sale.outstanding_balance != null && sale.outstanding_balance > 0.001
      ? `<div class="rcpt-row rcpt-row-note"><span>Outstanding balance</span><span>LKR ${formatSaleRs(sale.outstanding_balance)}</span></div>` : "",
  ].filter(Boolean).join("") : "";

  // ── Barcode ──────────────────────────────────────────────────────────────────
  const receiptBarcodeSvg = sale.show_barcode && sale.barcode_value
    ? buildBarcodeSvgMarkup(sale.barcode_value, { height: 34, width: 1.4 }) : null;
  const barcodeHtml = receiptBarcodeSvg
    ? `<div class="rcpt-barcode">
        <div class="rcpt-barcode-bars">${receiptBarcodeSvg}</div>
        <div class="rcpt-barcode-no">${escape(sale.barcode_value ?? "")}</div>
      </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=80mm" />
  <title>${escape(sale.sales_id)}</title>
  <style>${buildThermalReceiptStyles(marginTop, rs)}</style>
</head>
<body>
  <div class="rcpt">

    ${logoHtml}
    ${show("show_shop_name") ? `<div class="rcpt-store">${escape(header.company_name)}</div>` : ""}
    ${show("show_address") && header.address_line ? `<div class="rcpt-sub">${escape(header.address_line)}</div>` : ""}
    ${phoneLine}${emailLine}${taxLine}
    ${buildCustomFieldsHtml(rs?.custom_fields, "after_header")}

    <div class="rcpt-rule"></div>

    <div class="rcpt-title">${titleText}</div>
    ${billNoHtml}
    ${currencyLine}
    ${buildCustomFieldsHtml(rs?.custom_fields, "after_invoice")}

    <div class="rcpt-rule"></div>

    <div class="rcpt-info">${infoRows}</div>

    ${customerSection}

    <div class="rcpt-rule"></div>

    <table class="rcpt-items-table">
      <thead>
        <tr class="rcpt-col-headers">
          <th class="rcpt-col-item">ITEM</th>
          <th class="rcpt-col-qty">QTY</th>
          <th class="rcpt-col-amt">AMOUNT</th>
        </tr>
      </thead>
      <tbody>${itemRows || `<tr><td colspan="3" class="rcpt-empty">No items</td></tr>`}</tbody>
    </table>

    <div class="rcpt-rule"></div>
    ${buildCustomFieldsHtml(rs?.custom_fields, "after_items")}

    <div class="rcpt-totals">
      ${subtotalRow}
      ${discountRow}${serviceRow}${cardRow}
      ${totalRow}
      ${receivedRows}
    </div>

    ${buildCustomFieldsHtml(rs?.custom_fields, "after_payment")}

    <div class="rcpt-rule"></div>

    ${show("show_thank_you") ? `<div class="rcpt-thanks">${escape(rs?.thank_you_message || labels.thank_you)}</div>` : ""}
    ${show("show_footer_note") && rs?.footer_note ? `<div class="rcpt-foot-note">${escape(rs.footer_note)}</div>` : ""}
    ${buildCustomFieldsHtml(rs?.custom_fields, "footer")}
    ${barcodeHtml}
    ${buildReceiptSoftwareFooterHtml("rcpt-software")}
    <div class="rcpt-foot">Printed: ${escape(new Date().toLocaleString("en-GB", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }))}</div>

  </div>
</body>
</html>`;
}

function buildThermalReceiptStyles(marginTop: string, rs?: ReceiptSettings): string {
  // The sizes the shop chose, or the values the receipt has always used.
  const fontHeader = rs?.font_header ?? 14;
  const fontInvoiceInfo = rs?.font_invoice_info ?? 11;
  const fontItems = rs?.font_items ?? 11;
  const fontTotals = rs?.font_totals ?? 12;
  const fontFooter = rs?.font_footer ?? 10;

  // Receipt length. Trimming the gap above each item row and around each block
  // is what actually shortens the printout, which matters on an 80mm roll where
  // a 30-line sale otherwise runs to a wasteful length.
  const rowSpacing = rs?.row_spacing ?? 6;
  const sectionSpacing = rs?.section_spacing ?? 8;

  return `
    /* 80mm roll, but the TM-T82 only images 72mm (576 dots @ 203dpi).
       Laying out at 80mm clips the right-aligned values off the page. */
    @page { size: 72mm auto; margin: 0; }
    /* A thermal head burns a dot or it does not — there is no grey. Any mid
       tone is thrown away when the image is reduced to 1 bit, so every rule
       below states pure black unconditionally, not only under @media print:
       the QZ Tray path rasterises the on-screen view, where print rules never
       apply. */
    * { box-sizing: border-box; margin: 0; padding: 0; color: #000; }
    /* html fills whatever it is shown in; body holds the true 72mm roll width
       and centres inside it. Pinning both to 72mm left the receipt hard against
       the left edge of the wider preview frame, reading as a cut right side. */
    html {
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    body {
      width: 72mm;
      max-width: 72mm;
      margin: 0 auto;
      padding: 0;
      padding-top: ${marginTop};
      background: #fff;
      color: #000;
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: ${fontItems}px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .rcpt {
      width: 100%;
      padding: 2mm 2mm 6mm;
    }
    .rcpt-logo {
      display: block;
      max-width: 40mm;
      max-height: 16mm;
      margin: 0 auto 2mm;
      object-fit: contain;
    }
    .rcpt-store {
      text-align: center;
      font-size: ${fontHeader}px;
      font-weight: 800;
      text-transform: uppercase;
      line-height: 1.25;
      word-wrap: break-word;
      margin-bottom: 1mm;
    }
    .rcpt-sub {
      text-align: center;
      font-size: 10px;
      color: #000;
      margin-top: 1px;
      line-height: 1.35;
      word-wrap: break-word;
    }
    .rcpt-tax { font-size: 9px; }
    .rcpt-rule {
      border: none;
      border-top: 1px solid #000;
      margin: ${sectionSpacing}px 0;
    }
    .rcpt-custom {
      margin-top: ${Math.max(2, Math.round(rowSpacing / 2))}px;
      line-height: 1.35;
      word-wrap: break-word;
    }
    .rcpt-title {
      text-align: center;
      font-size: ${fontHeader - 1}px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 1mm;
    }
    .rcpt-inv-no {
      text-align: center;
      font-size: ${fontInvoiceInfo}px;
      font-weight: 700;
      margin-bottom: 1mm;
    }
    .rcpt-currency {
      text-align: center;
      font-size: 10px;
      color: #000;
    }
    .rcpt-info { font-size: ${fontInvoiceInfo}px; margin-bottom: 1mm; }
    .rcpt-section-title {
      font-size: ${fontInvoiceInfo}px;
      font-weight: 700;
      margin: 1mm 0;
    }
    .rcpt-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 2mm;
      padding: ${rowSpacing / 2}px 0;
    }
    .rcpt-row span:first-child { color: #000; flex-shrink: 0; }
    .rcpt-row span:last-child { font-weight: 600; text-align: right; word-break: break-word; }
    .rcpt-row-sub span:first-child { font-weight: 400; }
    .rcpt-row-sub span:last-child { font-weight: 600; }
    .rcpt-row-grand {
      font-size: ${fontTotals + 3}px;
      font-weight: 800;
      padding: 1mm 0;
    }
    .rcpt-row-grand span:last-child { font-weight: 800; }
    .rcpt-row-note { font-size: 10px; }
    .rcpt-totals { font-size: ${fontTotals}px; }

    /* Item table */
    .rcpt-items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${fontItems}px;
    }
    .rcpt-col-headers th {
      font-weight: 700;
      font-size: ${fontItems - 1}px;
      border-bottom: 1px solid #000;
      padding: 1mm 0;
    }
    .rcpt-col-item { text-align: left; width: 55%; }
    .rcpt-col-qty  { text-align: center; width: 15%; }
    .rcpt-col-amt  { text-align: right; width: 30%; }
    .rcpt-item-name-row td { padding-top: ${rowSpacing}px; }
    .rcpt-item-name-cell {
      font-weight: 700;
      font-size: ${fontItems}px;
      word-wrap: break-word;
    }
    .rcpt-item-amt-cell {
      text-align: right;
      font-weight: 700;
      white-space: nowrap;
    }
    .rcpt-item-detail-row td { padding-bottom: ${rowSpacing}px; border-bottom: 1px solid #000; }
    .rcpt-item-detail-cell {
      font-size: ${Math.max(9, fontItems - 1)}px;
      color: #000;
    }
    .rcpt-disc-cell {
      font-size: ${Math.max(9, fontItems - 1)}px;
      color: #000;
      font-style: italic;
      padding-bottom: ${rowSpacing}px;
      border-bottom: 1px solid #000;
    }
    tbody tr:last-child td { border-bottom: none; }
    .rcpt-empty {
      text-align: center;
      color: #000;
      padding: 3mm 0;
    }

    .rcpt-foot-note {
      text-align: center;
      font-size: ${fontFooter}px;
      margin-top: ${sectionSpacing}px;
      line-height: 1.35;
      word-wrap: break-word;
    }
    .rcpt-thanks {
      text-align: center;
      font-size: ${fontFooter + 1}px;
      font-weight: 700;
      margin: ${sectionSpacing}px 0 2px;
    }
    .rcpt-software {
      text-align: center;
      font-size: 9px;
      color: #000;
      margin-top: 2mm;
      font-weight: 600;
      line-height: 1.4;
    }
    .rcpt-foot {
      text-align: center;
      font-size: ${Math.max(8, fontFooter - 1)}px;
      color: #000;
      margin-top: 1mm;
    }
    .rcpt-barcode { margin-top: 3mm; text-align: center; }
    .rcpt-barcode-bars { width: 90%; max-width: 60mm; margin: 0 auto; line-height: 0; }
    .rcpt-barcode-bars svg { width: 100%; height: auto; display: block; }
    .rcpt-barcode-no {
      font-family: "Courier New", Courier, monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      margin-top: 1mm;
    }
    @media print {
      html, body { width: 72mm; max-width: 72mm; padding: 0; padding-top: ${marginTop}; }
      .rcpt { padding: 2mm 2mm 4mm; }
    }
    /* Raster path: the capture runs at exactly 288px so it doubles to the
       head's 576 dots with no fractional scaling to blur the glyph edges.
       html must be widened with body — left at 72mm (272px) it clips the
       last ~16px of every row off the right edge. */
    html.rcpt-raster,
    body.rcpt-raster,
    body.rcpt-raster > .rcpt {
      width: 288px;
      max-width: 288px;
      padding-top: 0;
    }
    /* Fixed layout keeps the declared column widths authoritative: an amount
       that cannot wrap would otherwise stretch the table past the capture
       width and lose its right-hand digits. */
    .rcpt-items-table { table-layout: fixed; }
    .rcpt-item-amt-cell { white-space: normal; word-break: break-word; }
  `;
}

function buildA4ReceiptDocument(
  header: CompanyPrintHeader,
  sale: SaleReceiptData,
  labels: SaleReceiptLabels,
  style: SalesReceiptStyle,
  options: SaleReceiptPrintOptions
): string {  const change =
    sale.amount_received != null ? Math.max(0, sale.amount_received - sale.net_amount) : null;
  const showUom = sale.lines.some((l) => l.uom);
  const discountLabel = sale.discount_label ?? labels.discount;
  const showDiscount = sale.discount > 0 || sale.discount_label != null;

  const contactParts = [header.phone, header.email].filter(Boolean);
  const taxParts = [
    header.tax_id ? `Tax ID: ${header.tax_id}` : "",
    header.registration_number ? `Reg: ${header.registration_number}` : "",
  ].filter(Boolean);

  const logoHtml = header.logo_url
    ? `<img class="inv-logo" src="${escape(header.logo_url)}" alt="" />`
    : `<div class="inv-logo-placeholder">${escape(header.company_name.charAt(0))}</div>`;

  const lineRows = sale.lines
    .map(
      (line, i) => `
      <tr>
        <td class="col-num">${i + 1}</td>
        <td class="col-sku">${escape(line.item_number ?? "—")}</td>
        <td class="col-desc">
          <span class="line-name">${escape(line.description)}</span>
          ${showUom && line.uom ? `<span class="line-uom">${escape(line.uom)}</span>` : ""}
        </td>
        ${showUom ? `<td class="col-uom col-uom-cell">${escape(line.uom ?? "—")}</td>` : ""}
        <td class="col-qty">${line.qty}</td>
        <td class="col-rate">${formatSaleRs(line.unit_price)}</td>
        <td class="col-amt">${formatSaleRs(line.line_total)}</td>
      </tr>`
    )
    .join("");

  const invoiceBarcodeSvg =
    sale.show_barcode && sale.barcode_value
      ? buildBarcodeSvgMarkup(sale.barcode_value, { height: 26, width: 1.2 })
      : null;

  const barcodeHtml = invoiceBarcodeSvg
    ? `<div class="inv-barcode">
          <div class="inv-barcode-bars">${invoiceBarcodeSvg}</div>
          <span class="inv-barcode-text">${escape(sale.barcode_value ?? "")}</span>
        </div>`
    : "";

  const totalRows = [
    `<div class="inv-total-row"><span>${escape(labels.sub_total)}</span><span>${formatSaleRs(sale.sub_total)}</span></div>`,
    showDiscount
      ? `<div class="inv-total-row inv-total-discount"><span>${escape(discountLabel)}</span><span>− ${formatSaleRs(sale.discount)}</span></div>`
      : "",
    (sale.service_charge ?? 0) > 0
      ? `<div class="inv-total-row"><span>${escape(labels.service_charge)}</span><span>${formatSaleRs(sale.service_charge!)}</span></div>`
      : "",
    (sale.card_payment_charge ?? 0) > 0
      ? `<div class="inv-total-row"><span>${escape(labels.card_charge)}</span><span>${formatSaleRs(sale.card_payment_charge!)}</span></div>`
      : "",
    `<div class="inv-total-row inv-total-grand"><span>${escape(labels.net_amount)}</span><span>${formatSaleRs(sale.net_amount)}</span></div>`,
    sale.amount_received != null
      ? `<div class="inv-total-row"><span>${escape(labels.received)}</span><span>${formatSaleRs(sale.amount_received)}</span></div>`
      : "",
    change != null && change > 0
      ? `<div class="inv-total-row"><span>${escape(labels.change)}</span><span>${formatSaleRs(change)}</span></div>`
      : "",
    sale.cheque_number
      ? `<div class="inv-total-row inv-total-note"><span>Cheque</span><span>${escape(sale.cheque_number)}${sale.bank_name ? ` · ${escape(sale.bank_name)}` : ""}</span></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const customerName = sale.customer_name ? escape(sale.customer_name) : "Walk-in customer";
  const itemCount = sale.lines.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escape(sale.sales_id)}</title>
  <style>${buildA4ReceiptStyles(options, style)}</style>
</head>
<body class="inv-body inv-${style} inv-a4">
  <article class="inv-sheet">
    <div class="inv-accent-bar" aria-hidden="true"></div>

    <header class="inv-header">
      <div class="inv-brand">
        ${logoHtml}
        <div class="inv-brand-text">
          <h1>${escape(header.company_name)}</h1>
          ${header.address_line ? `<p class="inv-address">${escape(header.address_line)}</p>` : ""}
          ${contactParts.length ? `<p class="inv-contact">${contactParts.map(escape).join(" · ")}</p>` : ""}
          ${taxParts.length ? `<p class="inv-tax">${taxParts.map(escape).join(" · ")}</p>` : ""}
        </div>
      </div>
      <div class="inv-invoice-box">
        <p class="inv-doc-type">${escape(labels.receipt_title)}</p>
        <p class="inv-doc-id">${escape(sale.sales_id)}</p>
        <dl class="inv-invoice-mini">
          <div><dt>${escape(labels.date)}</dt><dd>${escape(sale.sale_date)}</dd></div>
          <div><dt>${escape(labels.payment)}</dt><dd>${escape(sale.payment_method)}</dd></div>
        </dl>
        ${barcodeHtml}
      </div>
    </header>

    <section class="inv-details-grid">
      <div class="inv-detail-card">
        <h2 class="inv-card-title">${escape(labels.customer)}</h2>
        <p class="inv-card-value">${customerName}</p>
        <p class="inv-card-sub"><span>${escape(labels.location)}:</span> ${escape(sale.location)}</p>
      </div>
      <div class="inv-detail-card inv-detail-summary">
        <h2 class="inv-card-title">Summary</h2>
        <dl class="inv-summary-list">
          <div><dt>${escape(labels.sales_id)}</dt><dd>${escape(sale.sales_id)}</dd></div>
          <div><dt>Items</dt><dd>${itemCount}</dd></div>
          <div><dt>${escape(labels.net_amount)}</dt><dd class="inv-summary-total">${formatSaleRs(sale.net_amount)}</dd></div>
        </dl>
      </div>
    </section>

    <div class="inv-table-wrap">
      <table class="inv-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-sku">${escape(labels.item_no)}</th>
            <th>${escape(labels.description)}</th>
            ${showUom ? `<th class="col-uom-cell">${escape(labels.uom)}</th>` : ""}
            <th class="th-right col-qty">${escape(labels.qty)}</th>
            <th class="th-right col-rate">${escape(labels.unit_price)}</th>
            <th class="th-right col-amt">${escape(labels.total)}</th>
          </tr>
        </thead>
        <tbody>${lineRows || `<tr><td colspan="${showUom ? 7 : 6}" class="inv-empty">No items</td></tr>`}</tbody>
      </table>
    </div>

    <div class="inv-bottom">
      <div class="inv-bottom-left">
        <p class="inv-terms-title">Payment &amp; notes</p>
        <p class="inv-terms-text">
          ${escape(labels.payment)}: <strong>${escape(sale.payment_method)}</strong>
          ${sale.cheque_number ? `<br/>Cheque: ${escape(sale.cheque_number)}${sale.bank_name ? ` (${escape(sale.bank_name)})` : ""}` : ""}
        </p>
        <p class="inv-thanks">${escape(labels.thank_you)}</p>
      </div>
      <div class="inv-totals-panel">
        <div class="inv-totals-head">Amount summary</div>
        <div class="inv-totals-body">
          ${totalRows}
        </div>
      </div>
    </div>

    <footer class="inv-footer-pro">
      <span>${escape(header.company_name)}</span>
      <span class="inv-footer-dot">·</span>
      <span>${escape(new Date().toLocaleString())}</span>
    </footer>
    ${buildReceiptSoftwareFooterHtml("inv-software-foot")}
  </article>
</body>
</html>`;
}

function buildA4ReceiptStyles(options: SaleReceiptPrintOptions, _style: SalesReceiptStyle): string {
  const paper = options.printing_paper_size ?? "a4";
  const margin = options.letterhead_top_margin_cm ?? "none";
  const marginTop = resolveReceiptTopMargin(options.printing_paper_size, margin);
  const pageSize = paper === "a5" ? "A5" : paper === "letter" ? "letter" : "A4";

  const sans = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const serif = 'Georgia, "Times New Roman", Times, serif';
  const mono = '"Consolas", "Courier New", Courier, monospace';

  return `
    @page { size: ${pageSize}; margin: 12mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body.inv-body {
      margin: 0;
      padding: 12px;
      padding-top: ${marginTop === "0" ? "12px" : `calc(12px + ${marginTop})`};
      font-family: ${sans};
      font-size: 13px;
      line-height: 1.5;
      color: ${INK};
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .inv-sheet {
      max-width: 720px;
      width: 100%;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e8e8e8;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    .inv-accent-bar { height: 4px; background: ${INK}; }
    .inv-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 24px 28px 20px;
      border-bottom: 1px solid #e8e8e8;
    }
    .inv-brand { display: flex; gap: 14px; align-items: flex-start; flex: 1; min-width: 0; }
    .inv-logo { width: 64px; height: 64px; object-fit: contain; flex-shrink: 0; }
    .inv-logo-placeholder {
      width: 64px; height: 64px; border: 2px solid ${INK};
      display: flex; align-items: center; justify-content: center;
      font-family: ${serif}; font-size: 22px; font-weight: 700; flex-shrink: 0;
    }
    .inv-brand-text h1 {
      font-family: ${serif}; font-size: 22px; font-weight: 700;
      letter-spacing: 0.01em; line-height: 1.2; margin-bottom: 6px; color: ${INK};
    }
    .inv-brand-text p { font-size: 11.5px; color: ${MUTED}; line-height: 1.45; margin-top: 2px; }
    .inv-invoice-box {
      flex-shrink: 0; min-width: 200px; text-align: right;
      padding: 12px 16px; border: 1px solid ${INK}; background: #fafafa;
    }
    .inv-doc-type {
      font-size: 9px; font-weight: 700; letter-spacing: 0.16em;
      text-transform: uppercase; color: ${MUTED};
    }
    .inv-doc-id {
      margin: 4px 0 8px; font-size: 20px; font-weight: 700;
      font-family: ${mono}; letter-spacing: 0.03em; color: ${INK};
    }
    .inv-invoice-mini { font-size: 10px; color: ${MUTED}; }
    .inv-invoice-mini div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 3px; }
    .inv-invoice-mini dt { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 8px; }
    .inv-invoice-mini dd { color: ${INK}; font-weight: 600; }
    .inv-barcode { margin-top: 10px; text-align: right; }
    .inv-barcode-bars { width: 130px; margin-left: auto; line-height: 0; }
    .inv-barcode-bars svg { width: 100%; height: auto; display: block; }
    .inv-barcode-text { display: block; margin-top: 3px; font-size: 9px; font-family: ${mono}; letter-spacing: 0.06em; }
    .inv-details-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
      padding: 20px 28px; background: #ffffff; border-bottom: 1px solid #e8e8e8;
    }
    .inv-detail-card { border: 1px solid #e8e8e8; padding: 14px 16px; background: #ffffff; }
    .inv-card-title {
      font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
      color: ${MUTED}; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e8e8e8;
    }
    .inv-card-value { font-size: 15px; font-weight: 600; color: ${INK}; margin-bottom: 4px; }
    .inv-card-sub { font-size: 11px; color: ${MUTED}; }
    .inv-card-sub span { font-weight: 600; }
    .inv-summary-list { font-size: 11px; }
    .inv-summary-list div {
      display: flex; justify-content: space-between; gap: 12px;
      padding: 4px 0; border-bottom: 1px dotted #e8e8e8;
    }
    .inv-summary-list div:last-child { border-bottom: none; }
    .inv-summary-list dt { color: ${MUTED}; font-weight: 500; }
    .inv-summary-list dd { color: ${INK}; font-weight: 600; text-align: right; }
    .inv-summary-total { font-size: 14px !important; font-weight: 700 !important; }
    .inv-table-wrap { padding: 16px 28px 8px; }
    .inv-table {
      width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e8e8e8;
    }
    .inv-table thead th {
      background: #f5f5f5; color: ${INK}; font-size: 9px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.07em;
      padding: 10px 8px; text-align: left; border-bottom: 2px solid ${INK};
    }
    .inv-table thead th.th-right { text-align: right; }
    .inv-table tbody td {
      padding: 10px 8px; border-bottom: 1px solid #eeeeee; vertical-align: top; color: ${INK};
    }
    .inv-table tbody tr:last-child td { border-bottom: none; }
    .col-num { width: 28px; text-align: center; color: ${MUTED}; font-size: 10px; }
    .col-sku { font-family: ${mono}; font-size: 10px; color: ${MUTED}; max-width: 80px; word-break: break-all; }
    .col-desc { font-weight: 500; }
    .line-name { display: block; }
    .line-uom { display: none; }
    .col-uom-cell { text-transform: lowercase; color: ${MUTED}; font-size: 10px; }
    .col-qty, .col-rate, .col-amt { text-align: right; white-space: nowrap; }
    .col-amt { font-weight: 700; }
    .inv-empty { text-align: center; color: ${MUTED}; padding: 16px !important; }
    .inv-bottom {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 20px; padding: 12px 28px 20px; flex-wrap: wrap;
    }
    .inv-bottom-left { flex: 1; min-width: 180px; }
    .inv-terms-title {
      font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
      text-transform: uppercase; color: ${MUTED}; margin-bottom: 6px;
    }
    .inv-terms-text { font-size: 11px; color: ${MUTED}; line-height: 1.55; margin-bottom: 12px; }
    .inv-terms-text strong { color: ${INK}; }
    .inv-thanks { font-size: 12px; font-weight: 600; font-style: italic; color: ${INK}; margin-top: 8px; }
    .inv-totals-panel { width: 100%; max-width: 300px; border: 2px solid ${INK}; flex-shrink: 0; }
    .inv-totals-head {
      background: ${INK}; color: #ffffff; font-size: 9px; font-weight: 700;
      letter-spacing: 0.12em; text-transform: uppercase; padding: 8px 14px;
    }
    .inv-totals-body { padding: 10px 14px 12px; background: #ffffff; }
    .inv-total-row {
      display: flex; justify-content: space-between; gap: 16px;
      padding: 5px 0; font-size: 12px; color: ${MUTED}; border-bottom: 1px dotted #e8e8e8;
    }
    .inv-total-row:last-child { border-bottom: none; }
    .inv-total-row span:last-child { font-weight: 600; color: ${INK}; text-align: right; min-width: 90px; }
    .inv-total-grand {
      margin-top: 4px; padding-top: 10px; border-top: 2px solid ${INK};
      font-size: 13px; color: ${INK};
    }
    .inv-total-grand span:first-child { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .inv-total-grand span:last-child { font-size: 18px; font-weight: 800; font-family: ${mono}; }
    .inv-total-note { font-size: 10px; }
    .inv-footer-pro {
      display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 6px;
      padding: 10px 16px; border-top: 1px solid #e8e8e8; background: #fafafa;
      font-size: 9px; color: ${MUTED}; letter-spacing: 0.02em;
    }
    .inv-footer-dot { opacity: 0.5; }
    .inv-software-foot {
      text-align: center;
      padding: 8px 16px 14px;
      font-size: 9px;
      color: ${MUTED};
      border-top: 1px dashed #e0e0e0;
      background: #fafafa;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    @media print {
      body.inv-body { padding: 0; padding-top: ${marginTop}; background: #fff; }
      .inv-sheet { box-shadow: none; border: none; }
      .inv-totals-head { background: #000 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .inv-accent-bar { background: #000 !important; }
    }
  `;
}

function openPrintWindow(html: string, title: string, isThermal = false): void {
  const win = window.open("", "_blank", isThermal ? "width=360,height=720" : "width=920,height=800");
  if (!win) {
    alert("Please allow pop-ups to print this invoice.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = title;
  win.focus();
  setTimeout(() => {
    win.print();
  }, 500);
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
