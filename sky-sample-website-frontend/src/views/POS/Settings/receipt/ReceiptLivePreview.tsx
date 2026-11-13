import React, { useMemo } from "react";
import { Box, Paper, Typography } from "@mui/material";
import type { CompanyPrintHeader } from "../../../../api/Settings/companySettingsApi";
import type { ReceiptSettings } from "../../../../api/Settings/receiptSettingsApi";
import { buildSaleReceiptHtmlFromApi } from "../../sales/saleReceiptPrint";
import type { SaleReceiptApiPayload } from "../../../../api/salesApi";
import type { HardwareSettings } from "../../../../api/Settings/hardwareSettingsApi";

interface Props {
  settings: ReceiptSettings;
  header: CompanyPrintHeader | undefined;
  hardware: HardwareSettings | undefined;
}

/**
 * A sample sale, used only to fill the preview.
 *
 * Chosen to exercise the parts that are easy to get wrong: a long item name
 * that must wrap, a multi-unit line, a discount so the discount and "you
 * saved" lines appear, and cash received so change shows.
 */
const SAMPLE_LINES = [
  {
    item_number: "TEE-BLK-M",
    description: "Round Neck Black — M",
    qty: 2,
    unit_price: 1850,
    line_total: 3700,
    uom: "pcs",
  },
  {
    item_number: "TEE-WHT-L",
    description: "Printed Graphic Tee White — L",
    qty: 1,
    unit_price: 2250,
    line_total: 2250,
    uom: "pcs",
  },
];

const SAMPLE_SUB_TOTAL = 5950;
const SAMPLE_DISCOUNT = 450;
const SAMPLE_NET = SAMPLE_SUB_TOTAL - SAMPLE_DISCOUNT;

/**
 * Renders the real receipt, not a lookalike.
 *
 * The preview runs the printed receipt's own builder inside an iframe, so what
 * is shown here is produced by the same code that reaches the printer. A
 * separately coded preview would drift from the output — and the one thing a
 * receipt editor must get right is showing what will actually print.
 *
 * `srcDoc` isolates the receipt's stylesheet, which targets `html` and `body`
 * directly and would otherwise restyle this settings page.
 */
const ReceiptLivePreview: React.FC<Props> = ({ settings, header, hardware }) => {
  const html = useMemo(() => {
    if (!header || !hardware) return null;

    const payload: SaleReceiptApiPayload = {
      sale: {
        sales_id: "INV-00123",
        sale_date: new Date().toLocaleString(),
        location: "Main Location",
        payment_method: "Cash",
        customer_name: "Walk-in",
        sub_total: SAMPLE_SUB_TOTAL,
        discount: SAMPLE_DISCOUNT,
        net_amount: SAMPLE_NET,
        amount_received: 6000,
        lines: SAMPLE_LINES,
        show_barcode: settings.show_barcode,
        barcode_value: "INV-00123",
        discount_label: settings.labels.discount,
      },
      header: { ...header },
      // The preview is always of the 80mm roll: that is what a cashier prints,
      // and the A4 invoice is a separate document with its own layout.
      hardware_settings: { ...hardware, printing_paper_size: "80mm" },
      print_options: {
        printing_paper_size: "80mm",
        sales_receipt_printout_style: hardware.sales_receipt_printout_style,
        letterhead_top_margin_cm: "none",
        allow_auto_print: hardware.allow_auto_print,
        allow_dual_language_print: hardware.allow_dual_language_print,
        logo_url: hardware.logo_80mm_url ?? header.logo_url ?? null,
        allow_logo_on_sales_receipt: hardware.allow_logo_on_sales_receipt,
      },
      labels: settings.labels,
      receipt_settings: settings,
    };

    return buildSaleReceiptHtmlFromApi(payload);
  }, [settings, header, hardware]);

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Live preview
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        A sample sale on an 80 mm roll, rendered by the same code that prints.
      </Typography>

      <Paper
        variant="outlined"
        sx={{
          p: 1,
          bgcolor: "#f3f3f3",
          display: "flex",
          justifyContent: "center",
          borderRadius: 1,
        }}
      >
        {html ? (
          <Box
            component="iframe"
            title="Receipt preview"
            srcDoc={html}
            sx={{
              width: 320,
              height: 640,
              border: "none",
              bgcolor: "#ffffff",
              boxShadow: 2,
              borderRadius: 0.5,
            }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ p: 4 }}>
            Loading preview…
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default ReceiptLivePreview;
