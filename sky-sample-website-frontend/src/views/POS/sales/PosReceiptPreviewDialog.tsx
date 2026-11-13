import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import type { SaleReceiptApiPayload } from "../../../api/salesApi";
import { buildSaleReceiptHtmlFromApi } from "./saleReceiptPrint";
import { printReceipt } from "../../../utils/thermalPrint";

const PosReceiptPreviewDialog: React.FC<Props> = ({
  receipt,
  onClose,
  autoPrint = false,
  label,
}) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [printed, setPrinted] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const open = receipt !== null;

  const html = useMemo(() => (receipt ? buildSaleReceiptHtmlFromApi(receipt) : ""), [receipt]);
  const isThermal = receipt?.print_options.printing_paper_size === "80mm";
  const isQuotation = Boolean(receipt?.sale.is_quotation);
  const printerName =
    (receipt?.hardware_settings as any)?.thermal_printer_name ?? "EPSON TM-T82 Receipt";

  useEffect(() => {
    if (open) {
      setPrinted(false);
      setFrameReady(false);
    }
  }, [open, receipt]);

  const print = useCallback(() => {
    if (!html) return;
    printReceipt(html, printerName);
    setPrinted(true);
  }, [html, printerName]);

  // Auto-print once the preview iframe has loaded.
  useEffect(() => {
    if (open && autoPrint && frameReady && !printed) {
      print();
    }
  }, [open, autoPrint, frameReady, printed, print]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (!printed) print();
        else onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        frameRef.current?.contentWindow?.scrollBy({
          top: e.key === "ArrowDown" ? 80 : -80,
          behavior: "smooth",
        });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, printed, print, onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        <Typography component="span" variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
          {label ?? (isQuotation ? "Quotation" : "Sale complete")}
        </Typography>
        {receipt ? (
          <Chip size="small" label={receipt.sale.sales_id} sx={{ fontFamily: "monospace" }} />
        ) : null}
      </DialogTitle>

      <DialogContent sx={{ bgcolor: "#f3f3f3", display: "flex", justifyContent: "center", py: 2 }}>
        {open ? (
          <Box
            component="iframe"
            ref={frameRef}
            title="Receipt preview"
            srcDoc={html}
            onLoad={() => setFrameReady(true)}
            sx={{
              // 72mm at 96dpi — the exact roll width, so the preview shows the
              // receipt edge to edge with no dead margin beside it.
              width: isThermal ? 272 : "100%",
              height: "62vh",
              border: "none",
              bgcolor: "#ffffff",
              boxShadow: 2,
            }}
          />
        ) : null}
      </DialogContent>

      <Box sx={{ px: 3, pt: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          {printed
            ? "Printed. Press Enter for the next customer."
            : "Press Enter to print, then Enter again for the next customer."}
        </Typography>
      </Box>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          variant={printed ? "outlined" : "contained"}
          startIcon={<PrintIcon />}
          onClick={print}
          disabled={!frameReady}
        >
          {printed ? "Print again" : "Print"}
        </Button>
        <Button
          variant={printed ? "contained" : "outlined"}
          color="success"
          startIcon={<AddShoppingCartIcon />}
          onClick={onClose}
        >
          Next customer
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PosReceiptPreviewDialog;
