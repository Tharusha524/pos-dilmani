import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  Box,
  Button,
  IconButton,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import CloseIcon from "@mui/icons-material/Close";
import type { DiscountType, Item } from "../../../api/itemsApi";
import { formatSaleRs } from "./saleFormUtils";
import { qtyInputPropsForUom, formatUomLabel } from "./posSaleUom";
import { priceLine } from "./posLineDiscount";
import { maxDiscountHint } from "./posLineDiscountHint";

interface Props {
  item: Item;
  qty: string;
  onQtyChange: (qty: string) => void;
  price: string;
  onPriceChange: (price: string) => void;
  discountType: DiscountType;
  onDiscountTypeChange: (type: DiscountType) => void;
  discountValue: string;
  onDiscountValueChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** Order Settings: may the cashier change the selling price? */
  allowEditPrice?: boolean;
  /** Item Settings: are item discounts switched on? */
  allowItemDiscount?: boolean;
  /** Order Settings: may an item be sold below its purchase price? */
  allowBelowCost?: boolean;
}

export interface PosScanQtyStepHandle {
  /** The till's F4 shortcut. */
  focusQty: () => void;
}

function selectAll(el: HTMLInputElement | null) {
  el?.focus();
  el?.select();
}

/**
 * The entry row between picking an item and billing it: selling price,
 * discount and quantity.
 *
 * Focus lands on Quantity, because most scans need nothing else — scan, type
 * a number (or not), Enter. Price and discount are there for when a cashier
 * needs them; Enter on either moves on to the next field, so the last key
 * before an item is added is always Enter on Quantity.
 *
 * The line total is previewed with the same arithmetic the cart and the
 * server use, and a price below cost is flagged here, before the item is
 * added, rather than when the whole sale is refused at Pay.
 */
const PosScanQtyStep = forwardRef<PosScanQtyStepHandle, Props>(function PosScanQtyStep(
  {
    item,
    qty,
    onQtyChange,
    price,
    onPriceChange,
    discountType,
    onDiscountTypeChange,
    discountValue,
    onDiscountValueChange,
    onConfirm,
    onCancel,
    allowEditPrice = true,
    allowItemDiscount = true,
    allowBelowCost = false,
  },
  ref
) {
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({ focusQty: () => selectAll(qtyRef.current) }), []);

  useEffect(() => {
    // A frame's delay lets the dropdown finish unmounting, so this focus call
    // lands after the one the closing list returns to the search box.
    const id = window.requestAnimationFrame(() => selectAll(qtyRef.current));
    return () => window.cancelAnimationFrame(id);
    // Re-runs per item, so scanning a second item refocuses the fresh field.
  }, [item.item_number]);

  const unitPrice = Math.max(0, Number(price) || 0);
  const parsedQty = Number(qty);
  const effectiveQty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;

  const priced = priceLine({
    qty: effectiveQty,
    unit_price: unitPrice,
    discount_type: discountType,
    discount_value: allowItemDiscount ? Number(discountValue) || 0 : 0,
  });
  const gross = Math.round(effectiveQty * unitPrice * 100) / 100;
  const netUnit = effectiveQty > 0 ? priced.line_total / effectiveQty : 0;
  const unitCost = Math.max(0, Number(item.purchase_price ?? 0));
  const belowCost = !allowBelowCost && unitCost > 0 && netUnit < unitCost - 0.005;

  // Keys shared by every field in the row.
  const commonKeys = (e: React.KeyboardEvent, next?: () => void) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter") {
      // Without this a scanner's Enter would submit the surrounding form.
      e.preventDefault();
      if (next) next();
      else onConfirm();
    }
  };

  const fieldSx = { "& input": { textAlign: "right", fontWeight: 700 } };

  return (
    <Paper
      elevation={4}
      sx={{
        mt: 1,
        p: { xs: 1.25, sm: 1.5 },
        borderRadius: 1.5,
        border: "2px solid",
        borderColor: belowCost ? "error.main" : "primary.main",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 170 }}>
          <Typography variant="body1" sx={{ fontWeight: 700 }} noWrap>
            {item.description}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {item.item_number}
            {item.barcode ? ` · ${item.barcode}` : ""}
            {item.uom ? ` · per ${formatUomLabel(item.uom)}` : ""}
          </Typography>
        </Box>

        <TextField
          inputRef={priceRef}
          size="small"
          type="number"
          label="Price"
          value={price}
          disabled={!allowEditPrice}
          onChange={(e) => onPriceChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) =>
            commonKeys(e, () =>
              allowItemDiscount ? selectAll(discountRef.current) : selectAll(qtyRef.current)
            )
          }
          inputProps={{ min: 0, step: "0.01" }}
          helperText={allowEditPrice ? " " : "Locked in settings"}
          sx={{ width: 110, ...fieldSx }}
        />

        {allowItemDiscount ? (
          <Tooltip title={maxDiscountHint(item) ?? ""} disableHoverListener={!maxDiscountHint(item)}>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
              <TextField
                inputRef={discountRef}
                size="small"
                type="number"
                label="Discount"
                value={discountValue}
                onChange={(e) => onDiscountValueChange(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => commonKeys(e, () => selectAll(qtyRef.current))}
                inputProps={{ min: 0, step: "0.01" }}
                helperText={priced.discount_amount > 0 ? `−${formatSaleRs(priced.discount_amount)}` : " "}
                FormHelperTextProps={{ sx: { color: "success.main", fontWeight: 700, m: 0, mt: 0.25 } }}
                sx={{ width: 90, ...fieldSx }}
              />
              <ToggleButtonGroup
                exclusive
                size="small"
                value={discountType}
                onChange={(_, next: DiscountType | null) => {
                  if (next) onDiscountTypeChange(next);
                }}
                sx={{
                  mt: 0.25,
                  "& .MuiToggleButton-root": { px: 0.75, py: 0.55, fontSize: "0.75rem", fontWeight: 700 },
                }}
              >
                <ToggleButton value="percent" aria-label="Percent">
                  %
                </ToggleButton>
                <ToggleButton value="amount" aria-label="Rupees per unit">
                  Rs
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Tooltip>
        ) : null}

        <TextField
          inputRef={qtyRef}
          size="small"
          type="number"
          label="Qty"
          value={qty}
          onChange={(e) => onQtyChange(e.target.value)}
          onKeyDown={(e) => commonKeys(e)}
          inputProps={{
            ...qtyInputPropsForUom(item.uom ?? "pcs"),
            style: { textAlign: "right", fontWeight: 700, fontSize: "1.1rem" },
          }}
          helperText=" "
          sx={{ width: 100 }}
        />

        <Box sx={{ minWidth: 105, textAlign: "right" }}>
          <Typography variant="caption" color="text.secondary" display="block">
            Line total
          </Typography>
          {priced.discount_amount > 0 ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", textDecoration: "line-through" }}
            >
              {formatSaleRs(gross)}
            </Typography>
          ) : null}
          <Typography
            variant="body1"
            sx={{ fontWeight: 800, color: belowCost ? "error.main" : undefined }}
          >
            {formatSaleRs(priced.line_total)}
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddShoppingCartIcon />}
          onClick={onConfirm}
          color={belowCost ? "error" : "primary"}
          sx={{ fontWeight: 700 }}
        >
          Add
        </Button>

        <Tooltip title="Cancel (Esc)">
          <IconButton onClick={onCancel} size="small">
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {belowCost ? (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.25, fontWeight: 700 }}>
          Below cost: Rs {netUnit.toFixed(2)} each against a cost of Rs {unitCost.toFixed(2)}.
          Lower the discount or raise the price.
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
          Enter adds the item. Enter on Price or Discount moves to the next field. Esc cancels.
        </Typography>
      )}
    </Paper>
  );
});

export default PosScanQtyStep;
