import React, { useEffect, useState } from "react";
import { Box, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import type { DiscountType } from "../../../api/itemsApi";
import { normalizeDiscountType } from "./posLineDiscount";

interface Props {
  type: DiscountType | null | undefined;
  value: number | null | undefined;
  onChange: (type: DiscountType, value: number) => void;
  disabled?: boolean;
  /** Shown when hovering, e.g. "Max 20%". */
  hint?: string;
}

/**
 * Editable discount for one cart line: a number plus a % / Rs switch.
 *
 * The number is held locally while typing and committed on blur or Enter, not
 * on every keystroke. Committing per keystroke would clamp "2" to the ceiling
 * before the cashier finished typing "25", and re-price the cart — and re-run
 * the offer preview — on every digit.
 */
const PosLineDiscountInput: React.FC<Props> = ({
  type,
  value,
  onChange,
  disabled = false,
  hint,
}) => {
  const currentType = normalizeDiscountType(type);
  const [draft, setDraft] = useState(String(value ?? 0));

  // Follow changes made elsewhere (a clamp, a reloaded hold order) so the field
  // never shows a number that is not the one actually applied.
  useEffect(() => {
    setDraft(String(value ?? 0));
  }, [value]);

  const commit = (nextType: DiscountType = currentType) => {
    const parsed = Math.max(0, Number(draft) || 0);
    onChange(nextType, parsed);
  };

  return (
    <Tooltip title={hint ?? ""} disableHoverListener={!hint} placement="top">
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }}>
        <TextField
          size="small"
          type="number"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          inputProps={{
            min: 0,
            step: "0.01",
            "aria-label": "Line discount",
            style: { textAlign: "right" },
          }}
          sx={{ width: 76 }}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={currentType}
          disabled={disabled}
          onChange={(_, next: DiscountType | null) => {
            // Switching the unit re-applies the typed number in the new unit,
            // so 10 becomes 10% or Rs 10 per unit.
            if (next) commit(next);
          }}
          sx={{
            "& .MuiToggleButton-root": {
              px: 0.75,
              py: 0.25,
              fontSize: "0.7rem",
              fontWeight: 700,
              lineHeight: 1.4,
            },
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
  );
};

export default PosLineDiscountInput;
