import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHoldOrders } from "../../../api/salesApi";
import useFullscreen from "../../../hooks/useFullscreen";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Paper,
  Popover,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import GridViewIcon from "@mui/icons-material/GridView";
import PaymentsIcon from "@mui/icons-material/Payments";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import PrintIcon from "@mui/icons-material/Print";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import ListAltIcon from "@mui/icons-material/ListAlt";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CakeIcon from "@mui/icons-material/Cake";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import { Link } from "react-router";
import PosScanSearchBox from "./PosScanSearchBox";
import PosScanQtyStep, { type PosScanQtyStepHandle } from "./PosScanQtyStep";
import { POS_SHORTCUT_LEGEND, usePosKeyboardShortcuts } from "./usePosKeyboardShortcuts";
import PosLineDiscountInput from "./PosLineDiscountInput";
import { maxDiscountHint } from "./posLineDiscountHint";
import PosCustomerSelectArea from "./PosCustomerSelectArea";
import PosSalesTypeToggle from "./PosSalesTypeToggle";
import PosHoldOrdersPanel from "./PosHoldOrdersPanel";
import PosSplitPaymentPanel from "./PosSplitPaymentPanel";
import PosCreditNotice from "./PosCreditNotice";
import { newSplitLine } from "./posPaymentSplits";
import { isBirthdayToday } from "./posCustomerInsights";
import { POS_PAYMENT_OPTIONS } from "./posSaleConstants";
import { usePosSale } from "./posSaleContext";
import { formatSaleRs, SALES_BASE } from "./saleFormUtils";
import { qtyInputPropsForUom } from "./posSaleUom";

/**
 * The scan-first checkout lane.
 *
 * Laid out for a cashier who is holding a garment, not browsing: the scan box
 * is the largest thing on the page and keeps focus, the cart grows downward
 * where it can be checked at a glance, and the total sits where it can be read
 * from the customer's side of the counter.
 *
 * It shares the whole cart, pricing, offer and tax session with the catalog
 * view through `usePosSale`, so the two are alternative ways into the same sale
 * rather than separate flows that could drift apart.
 */
const PosScanCheckoutPage: React.FC = () => {
  const s = usePosSale();

  const itemCount = s.lines.reduce((sum, line) => sum + Number(line.qty ?? 0), 0);

  const itemDiscountTotal =
    Math.round(
      s.lines.reduce((sum, line) => sum + Number(line.discount_amount ?? 0), 0) * 100
    ) / 100;

  /**
   * Fullscreen is requested on the whole document, not on this page's own
   * element, and the app chrome is hidden with CSS instead.
   *
   * Taking only this element fullscreen would have hidden every dialog on the
   * page — the customer picker, the camera scanner, the duplicate-code picker
   * and all snackbars render into document.body, which sits outside a
   * fullscreened child and would never be painted. Fullscreening the document
   * keeps them all inside it, and the overlay styling below does the actual
   * job of clearing the sidebar and header out of the way.
   */
  const { isFullscreen, isSupported: fullscreenSupported, toggle: toggleFullscreen } =
    useFullscreen();

  // Lets each cart row show its item's discount ceiling as a hint.
  const itemById = useMemo(
    () => new Map(s.catalogItems.map((item) => [item.id, item])),
    [s.catalogItems]
  );

  const selectedCustomer = useMemo(
    () => s.customers.find((c) => c.id === s.form.customer_id) ?? null,
    [s.customers, s.form.customer_id]
  );

  const [holdListAnchor, setHoldListAnchor] = useState<HTMLElement | null>(null);

  // Same query key as the hold-orders list, so the count shown on the button
  // comes from the one cached request rather than a second fetch.
  const { data: holdOrdersData } = useQuery({
    queryKey: ["sales", "hold-orders"],
    queryFn: () => getHoldOrders(),
  });
  const heldCount = holdOrdersData?.hold_orders?.length ?? 0;

  const qtyStepRef = useRef<PosScanQtyStepHandle>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  usePosKeyboardShortcuts({
    focusSearch: () => {
      if (s.pendingScanItem) s.cancelPendingScan();
      s.setScanInput("");
    },
    pay: () => {
      if (s.lines.length > 0 && !s.saleBusy) s.handleComplete();
    },
    quote: () => {
      if (s.lines.length > 0 && !s.saleBusy) s.handleQuote();
    },
    focusQty: () => qtyStepRef.current?.focusQty(),
    openCustomer: s.openCustomerPicker,
    focusAmount: () => {
      amountRef.current?.focus();
      amountRef.current?.select();
    },
    reprint: () => s.setReprintOpen(true),
    hold: () => {
      if (s.lines.length > 0 && !s.saleBusy) s.handleHold();
    },
    togglePriceMode: () => {
      if (!s.allowPriceSwitch) return;
      if (s.salesPriceMode === "Retail" && !s.allowWholesalePrice) return;
      s.handleSalesPriceModeChange(s.salesPriceMode === "Retail" ? "Wholesale" : "Retail");
    },
    toggleFullscreen: () => {
      if (fullscreenSupported) toggleFullscreen();
    },
    newBill: () => {
      if (s.lines.length === 0 || window.confirm("Start a new bill? The current cart will be cleared.")) {
        s.resetPosForNewSale();
      }
    },
    clearBill: () => {
      if (s.pendingScanItem || s.lines.length === 0) return;
      if (window.confirm("Clear the current bill?")) s.resetPosForNewSale();
    },
    removeLastLine: () => {
      const last = s.lines[s.lines.length - 1];
      if (last) s.setLineQty(last.key, 0);
    },
    quickDiscount: (percent) => {
      if (!s.allowOrderDiscount) return;
      const amount = Math.round(((s.linesSubTotal * percent) / 100) * 100) / 100;
      s.setForm((prev) => ({ ...prev, discount: amount }));
    },
  });

  const cartScrollRef = useRef<HTMLDivElement>(null);
  const lineCountRef = useRef(s.lines.length);

  /**
   * Keep the newest line in view.
   *
   * A long sale pushes new lines below the fold, so without this the cashier
   * scans a garment and sees nothing change — the one moment they need
   * confirmation that it registered.
   *
   * Only scrolls when a line is ADDED. Editing a quantity or removing a line
   * leaves the view where the cashier put it, rather than yanking it to the
   * bottom while they are working halfway up the list.
   */
  useEffect(() => {
    const grew = s.lines.length > lineCountRef.current;
    lineCountRef.current = s.lines.length;

    if (!grew) return;

    const box = cartScrollRef.current;
    if (!box) return;

    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [s.lines.length]);

  return (
    <Box
      sx={{
        width: "100%",
        minHeight: "100vh",
        bgcolor: "var(--surface-bg-alt)",
        pb: 4,
        // Lifted over the sidebar and header so the till owns the screen.
        // Below the modal layer, so dialogs and snackbars still land on top.
        ...(isFullscreen
          ? {
              position: "fixed",
              inset: 0,
              zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 2,
              height: "100vh",
              overflowY: "auto",
            }
          : {}),
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
          p: { xs: 0.75, sm: 1 },
        }}
      >
        <Button
          component={Link}
          to={SALES_BASE}
          startIcon={<ArrowBackIcon />}
          sx={{ textTransform: "none" }}
        >
          Back
        </Button>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1, minWidth: 180 }}>
          POS Checkout · {s.form.sales_id || "…"}
          {s.activeHoldSaleId ? (
            <Typography
              component="span"
              variant="body2"
              sx={{ ml: 1, color: "#ed6c02", fontWeight: 700 }}
            >
              (Hold)
            </Typography>
          ) : null}
        </Typography>

        {s.allowPriceSwitch ? (
          <PosSalesTypeToggle
            value={s.salesPriceMode}
            onChange={s.handleSalesPriceModeChange}
            allowWholesale={s.allowWholesalePrice}
            compact
          />
        ) : null}

        {/* Clear and Hold sit in the top bar with the other bill-level
            actions, leaving the payment panel to end on Pay. */}
        <Tooltip title="Clear the current bill (Esc)">
          <span>
            <Button
              variant="contained"
              color="error"
              startIcon={<ClearAllIcon />}
              onClick={() => {
                if (s.activeHoldSaleId) {
                  s.resetPosForNewSale();
                  return;
                }
                s.setLines([]);
              }}
              disabled={s.lines.length === 0 || s.saleBusy}
              sx={{ textTransform: "none" }}
            >
              Clear
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Park this bill and serve someone else (F8)">
          <span>
            <Button
              variant="contained"
              color="warning"
              startIcon={<PauseCircleOutlineIcon />}
              onClick={s.handleHold}
              disabled={s.saleBusy || s.lines.length === 0}
              sx={{ textTransform: "none" }}
            >
              Hold (F8)
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Bills on hold — resume one">
          <Button
            variant="contained"
            color="warning"
            onClick={(e) => setHoldListAnchor(e.currentTarget)}
            startIcon={
              <Badge badgeContent={heldCount} color="error" max={99}>
                <ListAltIcon />
              </Badge>
            }
            sx={{ textTransform: "none" }}
          >
            Hold orders
          </Button>
        </Tooltip>

        <Popover
          open={Boolean(holdListAnchor)}
          anchorEl={holdListAnchor}
          onClose={() => setHoldListAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { width: 380, maxWidth: "95vw", p: 1.5, maxHeight: "70vh" } } }}
        >
          <PosHoldOrdersPanel
            activeHoldSaleId={s.activeHoldSaleId}
            onResume={(sale) => {
              setHoldListAnchor(null);
              s.resumeHoldOrder(sale);
            }}
            itemImageByNumber={s.itemImageByNumber}
            onDeleted={(id) => {
              if (s.activeHoldSaleId === id) {
                s.resetPosForNewSale();
              }
            }}
          />
        </Popover>

        {fullscreenSupported ? (
          <Tooltip
            title={
              isFullscreen
                ? "Leave fullscreen (Esc)"
                : "Fill the screen — hides the menu and header"
            }
          >
            <Button
              variant="contained"
              startIcon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              onClick={toggleFullscreen}
              // MUI has no solid grey palette colour; "inherit" fills light grey
              // with dark text, so the grey is set directly to keep white text.
              sx={{
                textTransform: "none",
                bgcolor: "grey.700",
                color: "#ffffff",
                "&:hover": { bgcolor: "grey.800" },
              }}
            >
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </Button>
          </Tooltip>
        ) : null}

        <Tooltip title="Find an old bill and print it again (F7)">
          <Button
            variant="contained"
            color="primary"
            startIcon={<PrintIcon />}
            onClick={() => s.setReprintOpen(true)}
            sx={{ textTransform: "none" }}
          >
            Reprint
          </Button>
        </Tooltip>

        <Tooltip
          title={
            <Box sx={{ p: 0.5 }}>
              {POS_SHORTCUT_LEGEND.map((row) => (
                <Box key={row.keys} sx={{ display: "flex", gap: 1.5, justifyContent: "space-between" }}>
                  <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                    {row.keys}
                  </Box>
                  <span>{row.action}</span>
                </Box>
              ))}
            </Box>
          }
        >
          <IconButton aria-label="Keyboard shortcuts">
            <KeyboardIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Browse the product grid instead of scanning">
          <Button
            variant="contained"
            color="success"
            startIcon={<GridViewIcon />}
            onClick={() => s.setView("products")}
            sx={{ textTransform: "none" }}
          >
            Browse items
          </Button>
        </Tooltip>
      </Box>

      <Box sx={{ px: { xs: 0.75, sm: 1 } }}>
        <Paper
          sx={{
            p: { xs: 1.25, sm: 2 },
            borderRadius: 1.5,
            mb: 1.5,
            borderTop: "3px solid",
            borderColor: "primary.main",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 1,
              flexWrap: "wrap",
            }}
          >
            <QrCodeScannerIcon color="primary" />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Scan item
            </Typography>
            {s.scanBusy ? <CircularProgress size={16} /> : null}
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.secondary">
              Scan or type → pick the item → enter the quantity → Enter
            </Typography>
          </Box>

          <PosScanSearchBox
            value={s.scanInput}
            onChange={s.setScanInput}
            onSubmit={() => void s.handleScannedCode(s.scanInput)}
            results={s.scanResults}
            onPick={s.selectScanItem}
            onOpenCamera={() => s.setCameraScanOpen(true)}
            busy={s.scanBusy}
            refocusToken={s.scanRefocusToken}
            // The quantity step owns the keyboard while it is open, so the
            // search box must not pull focus back and swallow the digits.
            suspendFocus={Boolean(s.pendingScanItem)}
            onJumpToAmount={() => {
              amountRef.current?.focus();
              amountRef.current?.select();
            }}
          />

          {s.pendingScanItem ? (
            <PosScanQtyStep
              ref={qtyStepRef}
              item={s.pendingScanItem}
              qty={s.pendingScanQty}
              onQtyChange={s.setPendingScanQty}
              price={s.pendingScanPrice}
              onPriceChange={s.setPendingScanPrice}
              discountType={s.pendingScanDiscountType}
              onDiscountTypeChange={s.setPendingScanDiscountType}
              discountValue={s.pendingScanDiscountValue}
              onDiscountValueChange={s.setPendingScanDiscountValue}
              onConfirm={s.commitPendingScanItem}
              onCancel={s.cancelPendingScan}
              allowEditPrice={s.allowEditSellingPrice}
              allowItemDiscount={s.allowItemDiscount}
              allowBelowCost={s.allowSaleBelowCost}
            />
          ) : null}
        </Paper>

        <Box
          sx={{
            display: "flex",
            gap: 1.5,
            alignItems: "flex-start",
            flexDirection: { xs: "column", md: "row" },
          }}
        >
          {/* Cart */}
          <Paper sx={{ p: { xs: 1, sm: 1.5 }, borderRadius: 1.5, flex: 1, width: "100%" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 1,
                flexWrap: "wrap",
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Cart
              </Typography>
              <Chip
                size="small"
                label={`${s.lines.length} line${s.lines.length === 1 ? "" : "s"} · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                color={s.lines.length > 0 ? "primary" : "default"}
              />
            </Box>

            {s.lines.length === 0 ? (
              <Alert severity="info" sx={{ mt: 1 }}>
                Scan a barcode or type an item name above, then pick it from the
                list to add it here.
              </Alert>
            ) : (
              <TableContainer
                ref={cartScrollRef}
                sx={{
                  // The cart scrolls inside itself rather than growing the
                  // page, so the scan box above and the total beside it stay
                  // on screen no matter how long the sale runs.
                  maxHeight: { xs: 320, md: "calc(100vh - 340px)" },
                  overflowY: "auto",
                  // The sticky header defaults to the theme's page colour,
                  // which differs from this Paper — rows would show through
                  // the gap as they scroll under it.
                  "& .MuiTableCell-stickyHeader": {
                    bgcolor: "background.paper",
                    backgroundImage: "none",
                  },
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell align="right" sx={{ width: 110 }}>
                        Qty
                      </TableCell>
                      <TableCell align="right" sx={{ width: 110 }}>
                        Price
                      </TableCell>
                      {s.allowItemDiscount ? (
                        <TableCell align="right" sx={{ width: 170 }}>
                          Discount
                        </TableCell>
                      ) : null}
                      <TableCell align="right" sx={{ width: 120 }}>
                        Total
                      </TableCell>
                      <TableCell align="center" sx={{ width: 52 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {s.lines.map((line) => {
                      const qty = Number(line.qty ?? 0);
                      const unitPrice = Number(line.unit_price ?? 0);
                      const gross = Math.round(qty * unitPrice * 100) / 100;
                      const discountAmount = Number(line.discount_amount ?? 0);
                      const belowCost = s.belowCostKeys.has(line.key);

                      return (
                        <TableRow
                          key={line.key}
                          hover
                          sx={belowCost ? { bgcolor: "rgba(211, 47, 47, 0.10)" } : undefined}
                        >
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {line.description}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {line.item_number}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              type="number"
                              value={qty}
                              onChange={(e) =>
                                s.setLineQty(line.key, Number(e.target.value))
                              }
                              inputProps={{
                                ...qtyInputPropsForUom(s.lineUom(line)),
                                style: { textAlign: "right" },
                              }}
                              sx={{ width: 92 }}
                            />
                          </TableCell>
                          <TableCell align="right">{formatSaleRs(unitPrice)}</TableCell>
                          {s.allowItemDiscount ? (
                            <TableCell align="right">
                              <PosLineDiscountInput
                                type={line.discount_type}
                                value={line.discount_value}
                                onChange={(type, value) => s.setLineDiscount(line.key, type, value)}
                                hint={maxDiscountHint(itemById.get(line.item_id ?? -1))}
                              />
                              {discountAmount > 0 ? (
                                <Typography
                                  variant="caption"
                                  color="success.main"
                                  sx={{ display: "block", fontWeight: 700, mt: 0.25 }}
                                >
                                  −{formatSaleRs(discountAmount)}
                                </Typography>
                              ) : null}
                            </TableCell>
                          ) : null}
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {/* The real line total, net of its discount. This
                                used to print qty × price, which ignored any
                                discount and disagreed with the sale total. */}
                            {discountAmount > 0 ? (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", textDecoration: "line-through" }}
                              >
                                {formatSaleRs(gross)}
                              </Typography>
                            ) : null}
                            <Box component="span" sx={{ color: belowCost ? "error.main" : undefined }}>
                              {formatSaleRs(Number(line.line_total ?? gross))}
                            </Box>
                            {belowCost ? (
                              <Typography
                                variant="caption"
                                color="error"
                                sx={{ display: "block", fontWeight: 700, whiteSpace: "nowrap" }}
                              >
                                Below cost {formatSaleRs(s.unitCostFor(line.item_id))}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Remove line">
                              <IconButton
                                size="small"
                                onClick={() => s.setLineQty(line.key, 0)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>

          {/* Totals and the way out to payment */}
          <Paper
            sx={{
              p: { xs: 1.25, sm: 2 },
              borderRadius: 1.5,
              width: { xs: "100%", md: 340 },
              flexShrink: 0,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
                Customer
              </Typography>
              <Tooltip title="Add a new customer">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => s.setQuickAddCustomerOpen(true)}
                  sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
                >
                  <PersonAddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <PosCustomerSelectArea
              openSignal={s.customerOpenSignal}
              customers={s.customers}
              isLoading={s.loadingCustomers}
              selectedCustomerId={s.form.customer_id ?? null}
              selectedCustomerName={s.form.customer_name}
              onSelect={(customer) => {
                s.setForm((prev) => ({
                  ...prev,
                  customer_id: customer?.id ?? null,
                  customer_name: customer ? s.customerDisplayName(customer) : "",
                }));
                s.savePosSelectedCustomer(customer);
                // Picking a customer moves focus into the dialog, so pull it
                // back to the scan box for the next garment.
                s.setScanInput("");
              }}
            />

            {selectedCustomer && isBirthdayToday(selectedCustomer.date_of_birth) ? (
              <Chip
                icon={<CakeIcon />}
                color="secondary"
                label={`It's ${s.customerDisplayName(selectedCustomer)}'s birthday today!`}
                sx={{ mt: 1, maxWidth: "100%", fontWeight: 700 }}
              />
            ) : null}

            <Divider sx={{ my: 1.5 }} />


            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              PAYMENT METHOD
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75, mb: 1.5 }}>
              {POS_PAYMENT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  size="medium"
                  onClick={() => {
                    s.setSplitMode(false);
                    s.handlePaymentSelect(opt.value);
                  }}
                  color={!s.splitMode && s.paymentMethod === opt.value ? "primary" : "default"}
                  variant={!s.splitMode && s.paymentMethod === opt.value ? "filled" : "outlined"}
                />
              ))}
              <Chip
                label="Split"
                size="medium"
                icon={<CallSplitIcon />}
                onClick={() => {
                  if (s.splitMode) return;
                  // Starts as cash + card with the whole total on cash, so the
                  // cashier types the cash part and fills the rest onto card.
                  s.setPaymentSplits([newSplitLine("Cash", s.netAmount), newSplitLine("Card", 0)]);
                  s.setSplitMode(true);
                }}
                color={s.splitMode ? "primary" : "default"}
                variant={s.splitMode ? "filled" : "outlined"}
              />
            </Box>

            {s.splitMode ? (
              <Box sx={{ mb: 1.5 }}>
                <PosSplitPaymentPanel
                  lines={s.paymentSplits}
                  onChange={s.setPaymentSplits}
                  total={s.netAmount}
                />
              </Box>
            ) : null}

            <PosCreditNotice
              customer={selectedCustomer}
              creditAmount={
                s.splitMode
                  ? s.paymentSplits
                      .filter((l) => l.method === "Credit")
                      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
                  : s.paymentMethod === "Credit"
                    ? s.netAmount
                    : 0
              }
            />

            <Grid container spacing={1} sx={{ mb: 1.5 }}>
              {!s.splitMode ? (
              <Grid item xs={12}>
                <TextField
                  inputRef={amountRef}
                  fullWidth
                  size="small"
                  label="Amount received (F6)"
                  type="number"
                  // Credit is billed to the customer's account, so the figure is
                  // the full total and is not the cashier's to change.
                  value={s.paymentMethod === "Credit" ? s.netAmount : s.amountReceived}
                  onChange={(e) => s.setAmountReceived(parseFloat(e.target.value) || 0)}
                  disabled={s.paymentMethod === "Credit"}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    // Enter on the cash figure completes the sale, so the last
                    // step of a cash sale needs no mouse.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (s.lines.length > 0 && !s.saleBusy) s.handleComplete();
                    }
                  }}
                  inputProps={{ min: 0, step: "0.01", style: { textAlign: "right" } }}
                />
              </Grid>
              ) : null}
              <Grid item xs={s.allowDeliveryCharge ? 6 : 12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Manual discount"
                  type="number"
                  value={s.form.discount ?? 0}
                  onChange={(e) =>
                    s.setForm((prev) => ({
                      ...prev,
                      discount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  inputProps={{ min: 0, step: "0.01" }}
                />
              </Grid>
              {s.allowDeliveryCharge ? (
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Delivery cost"
                    type="number"
                    value={s.form.service_charge ?? 0}
                    onChange={(e) =>
                      s.setForm((prev) => ({
                        ...prev,
                        service_charge: parseFloat(e.target.value) || 0,
                      }))
                    }
                    inputProps={{ min: 0, step: "0.01" }}
                  />
                </Grid>
              ) : null}
            </Grid>

            {/* Totals sit at the bottom, right above Pay: they are the last thing
                the cashier reads before taking the money, so they belong where
                the eye finishes rather than above the payment fields. */}
            <Divider sx={{ mb: 1.5 }} />
            {/* With item discounts, show how the subtotal was reached: items at
                full price, less their discounts. The subtotal itself stays net,
                matching what the sale records and the receipt prints. */}
            {itemDiscountTotal > 0 ? (
              <>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Items
                  </Typography>
                  <Typography variant="body2">
                    {formatSaleRs(s.linesSubTotal + itemDiscountTotal)}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Item discounts
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    −{formatSaleRs(itemDiscountTotal)}
                  </Typography>
                </Box>
              </>
            ) : null}
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Subtotal
              </Typography>
              <Typography variant="body2">{formatSaleRs(s.linesSubTotal)}</Typography>
            </Box>

            {s.offerDiscount > 0 ? (
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Offer discount
                </Typography>
                <Typography variant="body2" color="success.main">
                  −{formatSaleRs(s.offerDiscount)}
                </Typography>
              </Box>
            ) : null}

            {Number(s.form.discount ?? 0) > 0 ? (
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Manual discount
                </Typography>
                <Typography variant="body2" color="success.main">
                  −{formatSaleRs(Number(s.form.discount ?? 0))}
                </Typography>
              </Box>
            ) : null}

            {Number(s.form.service_charge ?? 0) > 0 ? (
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Delivery cost
                </Typography>
                <Typography variant="body2">
                  {formatSaleRs(Number(s.form.service_charge ?? 0))}
                </Typography>
              </Box>
            ) : null}

            <Divider sx={{ my: 1 }} />

            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                mb: 1.5,
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Total
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                {formatSaleRs(s.netAmount)}
              </Typography>
            </Box>

            {/* Change is what the cashier reads while counting out the drawer,
                so it is the loudest thing here after the total rather than a
                quiet line among the others. */}
            {!s.splitMode && s.paymentMethod === "Cash" && s.changeDue > 0 ? (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  p: 1,
                  mb: 1.5,
                  borderRadius: 1,
                  bgcolor: "success.main",
                  color: "success.contrastText",
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  CHANGE
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  {formatSaleRs(s.changeDue)}
                </Typography>
              </Box>
            ) : null}

            {/* Short payment is flagged before the sale is taken, not after the
                drawer has already opened. */}
            {!s.splitMode &&
            s.paymentMethod === "Cash" &&
            s.amountReceived > 0 &&
            s.amountReceived < s.netAmount ? (
              <Alert severity="warning" sx={{ mb: 1.5, py: 0.25 }}>
                Short by {formatSaleRs(s.netAmount - s.amountReceived)}
              </Alert>
            ) : null}

                        {s.belowCostMessage ? (
              <Alert severity="error" sx={{ mb: 1.5, py: 0.25 }}>
                {s.belowCostMessage}
              </Alert>
            ) : null}

            <Button
              fullWidth
              size="large"
              variant="contained"
              startIcon={<PaymentsIcon />}
              disabled={s.lines.length === 0 || s.saleBusy}
              onClick={s.handleComplete}
              sx={{
                fontWeight: 800,
                py: 1.25,
                bgcolor: "#0b7a45",
                "&:hover": { bgcolor: "#09673b" },
              }}
            >
              {s.saleBusy
                ? "Working…"
                : s.activeHoldSaleId
                  ? "Complete sale"
                  : s.autoPrintEnabled
                    ? "Pay & print receipt (F2)"
                    : "Pay (F2)"}
            </Button>


            <Tooltip title="A priced estimate for the customer: no payment taken, no stock moved">
              <span>
                <Button
                  fullWidth
                  variant="outlined"
                  color="warning"
                  startIcon={<RequestQuoteIcon />}
                  onClick={s.handleQuote}
                  disabled={s.saleBusy || s.lines.length === 0 || Boolean(s.activeHoldSaleId)}
                  sx={{ mt: 1 }}
                >
                  Give quote (F3)
                </Button>
              </span>
            </Tooltip>

          </Paper>
        </Box>
      </Box>
    </Box>
  );
};

export default PosScanCheckoutPage;
