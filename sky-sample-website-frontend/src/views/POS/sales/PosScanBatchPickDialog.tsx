import React, { useRef } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import type { Item, ItemBatch } from "../../../api/itemsApi";
import { formatExpiryDate, formatItemQty } from "../inventory/itemInventoryUtils";
import { formatSaleRs } from "./saleFormUtils";

/** One stock the cashier can sell from: the main (unbatched) stock or a batch. */
export type ScanStockOption =
  | { kind: "main"; qty: number; unitPrice: number; expiryDate: string | null }
  | { kind: "batch"; batch: ItemBatch; qty: number; unitPrice: number; expiryDate: string | null };

export interface PosScanBatchPickDialogProps {
  open: boolean;
  item: Item | null;
  options: ScanStockOption[];
  loading?: boolean;
  /** Qty being sold, so a stock smaller than it can be shown as not enough. */
  saleQty: number;
  allowNegativeInventory?: boolean;
  onPick: (option: ScanStockOption) => void;
  onClose: () => void;
}

/**
 * Asked right after a scan when an item is held in more than one stock (main
 * stock and/or batches), so the cashier chooses which one is being sold.
 *
 * Keyboard first, like the till: 1-9 picks a row, ↑/↓ moves, Enter picks the
 * highlighted row, Esc cancels.
 */
const PosScanBatchPickDialog: React.FC<PosScanBatchPickDialogProps> = ({
  open,
  item,
  options,
  loading = false,
  saleQty,
  allowNegativeInventory = false,
  onPick,
  onClose,
}) => {
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isShort = (o: ScanStockOption) => !allowNegativeInventory && o.qty < saleQty;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Keys typed here belong to the popup, never to the sale screen shortcuts.
    e.stopPropagation();
    if (loading || options.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const current = optionRefs.current.findIndex((el) => el === document.activeElement);
      const next =
        e.key === "ArrowDown"
          ? current < 0
            ? 0
            : Math.min(options.length - 1, current + 1)
          : current < 0
            ? 0
            : Math.max(0, current - 1);
      optionRefs.current[next]?.focus();
      return;
    }

    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      e.preventDefault();
      const option = options[n - 1];
      if (!isShort(option)) onPick(option);
    }
  };

  const firstPickable = options.findIndex((o) => !isShort(o));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth onKeyDown={handleKeyDown}>
      <DialogTitle sx={{ pb: 0.5 }}>
        Pick the stock to sell
        {item ? (
          <Typography variant="body2" color="text.secondary">
            {item.description} · Qty {formatItemQty(saleQty, item.uom)}
          </Typography>
        ) : null}
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={26} />
          </Box>
        ) : (
          <List dense disablePadding>
            {options.map((o, i) => {
              const short = isShort(o);
              const name = o.kind === "main" ? "Main stock" : `Batch ${o.batch.batch_number}`;
              const details = [
                `In stock: ${formatItemQty(o.qty, item?.uom)}`,
                o.expiryDate ? `Exp ${formatExpiryDate(o.expiryDate)}` : null,
                short ? "Not enough stock" : null,
              ]
                .filter(Boolean)
                .join("  ·  ");
              return (
                <ListItemButton
                  key={o.kind === "main" ? "main" : o.batch.id}
                  autoFocus={i === firstPickable}
                  disabled={short}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  onClick={() => onPick(o)}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    mb: 1,
                    "&.Mui-focusVisible, &:focus": {
                      backgroundColor: "action.selected",
                      borderColor: "primary.main",
                    },
                  }}
                >
                  <ListItemText
                    primary={`${i + 1}.  ${name}  —  ${formatSaleRs(o.unitPrice)}`}
                    secondary={details}
                    primaryTypographyProps={{ fontWeight: 700 }}
                    secondaryTypographyProps={{ color: short ? "error" : "text.secondary" }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
        <Typography variant="caption" color="text.secondary">
          Press 1–{Math.max(1, options.length)} or use ↑ ↓ and Enter.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PosScanBatchPickDialog;
