import React from "react";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { PosSalesPriceMode } from "./posSalePricing";

interface PosSalesTypeToggleProps {
  value: PosSalesPriceMode;
  onChange: (mode: PosSalesPriceMode) => void;
  allowWholesale?: boolean;
  compact?: boolean;
}

const PosSalesTypeToggle: React.FC<PosSalesTypeToggleProps> = ({
  value,
  onChange,
  allowWholesale = true,
  compact = false,
}) => {
  if (!allowWholesale) {
    return (
      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
        Retail pricing
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      {!compact ? (
        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
          Price
        </Typography>
      ) : null}
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value}
        onChange={(_, next: PosSalesPriceMode | null) => {
          if (next) onChange(next);
        }}
        sx={{
          // Theme tokens, not fixed light-mode tints: this toggle sits in the
          // POS header, which is dark in dark mode, where the old pale blue
          // and green backgrounds washed out.
          bgcolor: "action.hover",
          borderRadius: 1,
          "& .MuiToggleButton-root": {
            textTransform: "none",
            fontWeight: 700,
            fontSize: "0.75rem",
            px: 1.5,
            py: 0.35,
            borderColor: "divider",
            color: "text.secondary",
            // Solid orange on white for the active mode. Which price list is
            // in use changes what every customer is charged, so it is worth
            // being the loudest thing in the header rather than a soft tint.
            "&.Mui-selected": {
              bgcolor: "#ed6c02",
              color: "#ffffff",
              borderColor: "#e65100",
              "&:hover": {
                bgcolor: "#e65100",
              },
              // MUI drops the border between adjacent selected/unselected
              // buttons, which leaves the orange block looking clipped.
              "& + .MuiToggleButton-root": {
                borderLeftColor: "#e65100",
              },
            },
          },
        }}
      >
        <ToggleButton value="Retail">Retail</ToggleButton>
        <ToggleButton value="Wholesale">Wholesale</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};

export default PosSalesTypeToggle;
