import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import type { Item } from "../../../api/itemsApi";
import { formatSaleRs } from "./saleFormUtils";
import { isLowStock } from "./posCheckoutLookups";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Fires on Enter and on camera detections. Resolves, never adds. */
  onSubmit: () => void;
  results: Item[];
  /** The one way an item reaches the cart. */
  onPick: (item: Item) => void;
  onOpenCamera?: () => void;
  busy?: boolean;
  /** Bump after any cart action to pull focus back here. */
  refocusToken?: unknown;
  /** Stop reclaiming focus while another step owns the keyboard. */
  suspendFocus?: boolean;
  /** End on an empty box jumps to the amount-received field. */
  onJumpToAmount?: () => void;
}

/**
 * Combined search and scan box for the checkout lane.
 *
 * One field serves both inputs because they are the same question asked two
 * ways. A barcode scanner is just a keyboard that types fast and presses
 * Enter, so a scan fills this box exactly as typing does — and the matching
 * item appears in the list below either way.
 *
 * Nothing is added automatically, by design. At a counter a cashier can
 * easily scan the wrong garment, and an item billed without being seen is
 * only noticed at the total. So the list is a confirmation step: scan or
 * type, look, then add.
 */
const PosScanSearchBox: React.FC<Props> = ({
  value,
  onChange,
  onSubmit,
  results,
  onPick,
  onOpenCamera,
  busy = false,
  refocusToken,
  suspendFocus = false,
  onJumpToAmount,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [highlight, setHighlight] = useState(0);

  // Reclaim focus after cart actions and dialogs. A frame's delay lets the
  // control that just closed finish returning focus, so this lands last.
  useEffect(() => {
    if (busy || suspendFocus) return;

    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(id);
  }, [refocusToken, busy, suspendFocus]);

  // A new search is a new list, so the keyboard selection goes back to the
  // top rather than pointing at whatever sat at that index before.
  useEffect(() => {
    setHighlight(0);
  }, [value]);

  /**
   * Keep the highlighted row visible.
   *
   * The list is taller than its scroll box, so without this the selection
   * walks off the bottom and the arrow keys look like they do nothing at all.
   * `nearest` scrolls only as far as needed, which keeps the list steady
   * instead of jumping the selection to the middle on every keypress.
   */
  useEffect(() => {
    rowRefs.current.length = results.length;
    rowRefs.current[highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight, results.length]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (results.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      // Held off the TextField so the caret does not jump to either end of
      // the typed text while the cashier is walking the list.
      event.preventDefault();

      const step = event.key === "ArrowDown" ? 1 : -1;
      // Wraps at both ends: with a short list it is quicker to press Up once
      // to reach the last row than to hold Down through everything above it.
      setHighlight((prev) => (prev + step + results.length) % results.length);
      return;
    }

    if (event.key === "Home" && results.length > 0) {
      event.preventDefault();
      setHighlight(0);
      return;
    }

    if (event.key === "End" && results.length > 0) {
      event.preventDefault();
      setHighlight(results.length - 1);
      return;
    }

    if (event.key === "Escape") {
      onChange("");
      return;
    }

    // End on an EMPTY box means "done scanning, take the money" — the same
    // key the Pallegama till uses. With text in the box, End keeps its normal
    // meaning of moving the cursor to the end of the line.
    if (event.key === "End" && !value.trim() && onJumpToAmount) {
      event.preventDefault();
      onJumpToAmount();
      return;
    }

    if (event.key === "Enter") {
      // A scanner's Enter would otherwise submit the surrounding form and
      // navigate away mid-sale.
      event.preventDefault();

      // Exactly one match is unambiguous and already on screen, so Enter
      // takes it — that is what makes scanning fast. With several matches
      // Enter takes the highlighted row, so the cashier is still choosing.
      if (results.length === 1) {
        onPick(results[0]);
        return;
      }

      if (results.length > 1 && results[highlight]) {
        onPick(results[highlight]);
        return;
      }

      // Nothing matched locally — let the page try the server.
      onSubmit();
    }
  };

  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      <TextField
        inputRef={inputRef}
        fullWidth
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Scan a barcode, or type an item name or code"
        autoComplete="off"
        inputProps={{ autoCorrect: "off", autoCapitalize: "off", spellCheck: false }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <QrCodeScannerIcon color="primary" />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {busy ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
              {onOpenCamera ? (
                <Tooltip title="Scan with the camera instead">
                  <IconButton size="small" onClick={onOpenCamera}>
                    <PhotoCameraIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
            </InputAdornment>
          ),
          sx: {
            fontSize: "1.1rem",
            fontWeight: 600,
            fontFamily: "monospace",
            bgcolor: "background.paper",
          },
        }}
      />

      {value.trim() && results.length > 0 && !suspendFocus ? (
        <Paper
          elevation={8}
          sx={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            mt: 0.5,
            // Above the cart table, which would otherwise cover the list.
            zIndex: (theme) => theme.zIndex.modal,
            maxHeight: 340,
            overflowY: "auto",
            borderRadius: 1.5,
          }}
        >
          <List dense disablePadding>
            {results.map((item, index) => (
              <ListItemButton
                key={item.item_number}
                ref={(node: HTMLDivElement | null) => {
                  rowRefs.current[index] = node;
                }}
                selected={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => onPick(item)}
                sx={{
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  gap: 1,
                  // MUI's default `selected` tint is too faint to spot at a
                  // glance on a busy counter, so the active row gets a solid
                  // left bar as well.
                  borderLeft: "4px solid",
                  borderLeftColor:
                    index === highlight ? "primary.main" : "transparent",
                  "&.Mui-selected": {
                    bgcolor: "action.selected",
                  },
                  "&.Mui-selected:hover": {
                    bgcolor: "action.selected",
                  },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                    {item.description}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {item.item_number}
                    {item.barcode ? ` · ${item.barcode}` : ""}
                  </Typography>
                </Box>

                {typeof item.qty === "number" ? (
                  <Chip
                    size="small"
                    // Low stock is the item's own reorder level, so the cashier
                    // can mention it while the customer is still at the counter.
                    // Out of stock is red; stock is never blocked here because
                    // the cart applies the shop's negative-inventory setting.
                    label={
                      item.qty <= 0
                        ? "Out of stock"
                        : isLowStock(item)
                          ? `Low · ${item.qty} left`
                          : `${item.qty} left`
                    }
                    color={item.qty <= 0 ? "error" : isLowStock(item) ? "warning" : "default"}
                    variant={item.qty > 0 && isLowStock(item) ? "filled" : "outlined"}
                  />
                ) : null}

                <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {formatSaleRs(Number(item.selling_price ?? 0))}
                </Typography>

                <AddShoppingCartIcon fontSize="small" color="action" />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      ) : null}

      {value.trim() && results.length === 0 && !busy && !suspendFocus ? (
        <Paper
          elevation={8}
          sx={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            mt: 0.5,
            zIndex: (theme) => theme.zIndex.modal,
            p: 1.5,
            borderRadius: 1.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No item matches “{value.trim()}”. Press Enter to search the other
            branches.
          </Typography>
        </Paper>
      ) : null}
    </Box>
  );
};

export default PosScanSearchBox;
