import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import { useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import {
  getSaleReceipt,
  getSales,
  type Sale,
  type SaleReceiptApiPayload,
} from "../../../api/salesApi";
import { getFriendlyErrorMessage } from "../../../utils/getFriendlyErrorMessage";
import { formatSaleRs } from "./saleFormUtils";
import { billNumberMatches } from "./posCheckoutLookups";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Hands the fetched receipt back to be shown in the receipt preview. */
  onSelect: (receipt: SaleReceiptApiPayload) => void;
}

/** Today in the PC's own time zone — toISOString() would give UTC's date. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Find an old bill and print it again.
 *
 * Scan the barcode on the customer's receipt — it encodes the bill number — or
 * type the number, or pick from a date range. A number not found in the range
 * is looked up across all dates, so an old receipt does not need its date
 * worked out first.
 */
const PosReprintDialog: React.FC<Props> = ({ open, onClose, onSelect }) => {
  const { enqueueSnackbar } = useSnackbar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [billNo, setBillNo] = useState("");
  const [fromDate, setFromDate] = useState(localToday);
  const [toDate, setToDate] = useState(localToday);
  const [searchAllDates, setSearchAllDates] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setBillNo("");
    setSearchAllDates(false);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["sales", "reprint", searchAllDates ? "all" : `${fromDate}..${toDate}`],
    queryFn: () =>
      searchAllDates
        ? getSales()
        : getSales(undefined, undefined, fromDate, toDate),
    enabled: open,
  });

  // Held orders are drafts with no receipt to reprint.
  const sales = useMemo(
    () => (data?.sales ?? []).filter((s: Sale) => s.order_status !== "hold"),
    [data]
  );

  const visible = useMemo(() => {
    const q = billNo.trim();
    if (!q) return sales;
    return sales.filter(
      (s: Sale) => billNumberMatches(s.sales_id, q) || s.sales_id.toUpperCase().includes(q.toUpperCase())
    );
  }, [sales, billNo]);

  const pick = async (sale: Sale) => {
    setLoadingId(sale.id);
    try {
      onSelect(await getSaleReceipt(sale.id));
    } catch (err) {
      enqueueSnackbar(getFriendlyErrorMessage(err, "Could not load that receipt"), {
        variant: "error",
      });
    } finally {
      setLoadingId(null);
    }
  };

  const submitBillNo = () => {
    const q = billNo.trim();
    if (!q) return;

    const exact = sales.find((s: Sale) => billNumberMatches(s.sales_id, q));
    if (exact) {
      void pick(exact);
      return;
    }

    // Not in the chosen dates — widen to every date rather than making the
    // cashier guess when the bill was issued.
    if (!searchAllDates) {
      setSearchAllDates(true);
      return;
    }

    enqueueSnackbar(`No bill found for "${q}".`, { variant: "warning" });
  };

  // Once the all-dates list arrives, take the exact match automatically.
  useEffect(() => {
    if (!searchAllDates || isFetching) return;
    const q = billNo.trim();
    if (!q) return;

    const exact = sales.find((s: Sale) => billNumberMatches(s.sales_id, q));
    if (exact) void pick(exact);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchAllDates, isFetching, sales]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Reprint a receipt</DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2, mt: 0.5 }}>
          <TextField
            inputRef={inputRef}
            label="Bill number — scan or type"
            size="small"
            value={billNo}
            onChange={(e) => setBillNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                submitBillNo();
              }
            }}
            placeholder="SAL-0087 or 87"
            sx={{ flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <QrCodeScannerIcon color="primary" fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="From"
            type="date"
            size="small"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setSearchAllDates(false);
            }}
            InputLabelProps={{ shrink: true }}
            disabled={searchAllDates}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setSearchAllDates(false);
            }}
            InputLabelProps={{ shrink: true }}
            disabled={searchAllDates}
          />
        </Stack>

        {searchAllDates ? (
          <Alert
            severity="info"
            sx={{ mb: 1.5 }}
            action={
              <Button size="small" onClick={() => setSearchAllDates(false)}>
                Back to dates
              </Button>
            }
          >
            Searching all dates.
          </Alert>
        ) : null}

        {isFetching ? <LinearProgress sx={{ mb: 1 }} /> : null}

        <TableContainer sx={{ maxHeight: 380 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Bill</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.length === 0 && !isFetching ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: "text.secondary" }}>
                    {billNo.trim()
                      ? "No bill with that number in these dates. Press Enter to search all dates."
                      : "No bills in these dates."}
                  </TableCell>
                </TableRow>
              ) : (
                visible.slice(0, 200).map((sale: Sale) => (
                  <TableRow key={sale.id} hover sx={{ cursor: "pointer" }} onClick={() => void pick(sale)}>
                    <TableCell sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                      {sale.sales_id}
                      {sale.order_status === "quotation" ? (
                        <Chip size="small" label="Quote" color="warning" sx={{ ml: 1 }} />
                      ) : null}
                    </TableCell>
                    <TableCell>{sale.sale_date}</TableCell>
                    <TableCell>{sale.customer_name || "Walk-in"}</TableCell>
                    <TableCell align="right">{formatSaleRs(Number(sale.net_amount ?? 0))}</TableCell>
                    <TableCell align="right">
                      <Button size="small" disabled={loadingId === sale.id}>
                        {loadingId === sale.id ? "Loading…" : "Reprint"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {visible.length > 200 ? (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Showing the newest 200 of {visible.length}. Narrow the dates or type a bill number.
            </Typography>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PosReprintDialog;
