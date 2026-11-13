import React from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import VerticalAlignBottomIcon from "@mui/icons-material/VerticalAlignBottom";
import { POS_PAYMENT_OPTIONS } from "./posSaleConstants";
import {
  fillRemainingInto,
  newSplitLine,
  splitsRemaining,
  type PaymentSplitLine,
} from "./posPaymentSplits";
import { formatSaleRs } from "./saleFormUtils";

interface Props {
  lines: PaymentSplitLine[];
  onChange: (lines: PaymentSplitLine[]) => void;
  total: number;
}

/**
 * Paying one sale with more than one method — part cash, part card.
 *
 * Each line is what the shop KEEPS by that method, and the lines must add up
 * to the total exactly; the server allows no change inside a split. The
 * "fill" button puts whatever is still owed onto a line, so the common case —
 * some cash, the rest on card — is one number typed and one click.
 */
const PosSplitPaymentPanel: React.FC<Props> = ({ lines, onChange, total }) => {
  const remaining = splitsRemaining(lines, total);

  const update = (id: string, patch: Partial<PaymentSplitLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const usedMethods = new Set(lines.map((l) => l.method));
  const nextMethod =
    POS_PAYMENT_OPTIONS.find((o) => !usedMethods.has(o.value))?.value ?? "Cash";

  return (
    <Box>
      {lines.map((line) => (
        <Box key={line.id} sx={{ mb: 1 }}>
          <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
            <TextField
              select
              size="small"
              value={line.method}
              onChange={(e) => update(line.id, { method: e.target.value })}
              sx={{ width: 120, flexShrink: 0 }}
              inputProps={{ "aria-label": "Payment method" }}
            >
              {POS_PAYMENT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="number"
              value={line.amount || ""}
              placeholder="0.00"
              onChange={(e) =>
                update(line.id, { amount: Math.max(0, parseFloat(e.target.value) || 0) })
              }
              onFocus={(e) => e.target.select()}
              inputProps={{ min: 0, step: "0.01", style: { textAlign: "right" } }}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Tooltip title="Put the rest of the total here">
              <span>
                <IconButton
                  size="small"
                  onClick={() => onChange(fillRemainingInto(lines, line.id, total))}
                  disabled={remaining <= 0 && line.amount > 0}
                >
                  <VerticalAlignBottomIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Remove">
              <span>
                <IconButton
                  size="small"
                  onClick={() => onChange(lines.filter((l) => l.id !== line.id))}
                  disabled={lines.length <= 2}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          {line.method === "Cheque" ? (
            <Box sx={{ display: "flex", gap: 0.75, mt: 0.75 }}>
              <TextField
                size="small"
                label="Cheque no."
                value={line.cheque_number ?? ""}
                onChange={(e) => update(line.id, { cheque_number: e.target.value })}
                inputProps={{ maxLength: 50 }}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Bank"
                value={line.bank_name ?? ""}
                onChange={(e) => update(line.id, { bank_name: e.target.value })}
                sx={{ flex: 1 }}
              />
            </Box>
          ) : null}
        </Box>
      ))}

      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => onChange([...lines, newSplitLine(nextMethod, Math.max(0, remaining))])}
        disabled={lines.length >= POS_PAYMENT_OPTIONS.length}
      >
        Add method
      </Button>

      {Math.abs(remaining) > 0.01 ? (
        <Alert severity={remaining > 0 ? "warning" : "error"} sx={{ mt: 1, py: 0.25 }}>
          {remaining > 0
            ? `${formatSaleRs(remaining)} still to cover`
            : `${formatSaleRs(Math.abs(remaining))} more than the total`}
        </Alert>
      ) : (
        <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 1, fontWeight: 700 }}>
          Split covers the total exactly.
        </Typography>
      )}
    </Box>
  );
};

export default PosSplitPaymentPanel;
