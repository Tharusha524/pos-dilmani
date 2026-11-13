import React, { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import JsBarcode from "jsbarcode";
import type { BarcodeType } from "../../api/itemsApi";
import { normalizeBarcode } from "../../utils/barcode";

interface Props {
  value: string | null | undefined;
  type?: BarcodeType;
  /** Bar height in px. Labels use ~30–40; the receipt footer uses ~28. */
  height?: number;
  /** Width of the narrowest bar. Below 1 many thermal printers misread. */
  barWidth?: number;
  /** Show the human-readable digits under the bars. */
  showValue?: boolean;
  fontSize?: number;
  margin?: number;
  /** Message shown when there is no code or it cannot be encoded. */
  emptyText?: string;
}

/**
 * Renders a real, scannable barcode as inline SVG.
 *
 * SVG rather than canvas because labels and receipts get printed: canvas
 * rasterises at screen resolution and the bars come out fuzzy enough that
 * cheap scanners fail on them, while SVG prints at the printer's own DPI.
 *
 * An unencodable value renders as a short notice instead of throwing, so one
 * bad code in a print queue never blanks the whole sheet.
 */
const BarcodeImage: React.FC<Props> = ({
  value,
  type = "CODE128",
  height = 36,
  barWidth = 1.4,
  showValue = true,
  fontSize = 11,
  margin = 2,
  emptyText = "No barcode",
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);
  const code = normalizeBarcode(value);

  useEffect(() => {
    if (!code || !svgRef.current) {
      setFailed(false);
      return;
    }

    try {
      JsBarcode(svgRef.current, code, {
        format: type === "EAN13" ? "EAN13" : "CODE128",
        height,
        width: barWidth,
        displayValue: showValue,
        fontSize,
        margin,
        // Black on white regardless of theme: a barcode is read by contrast,
        // and a dark-mode barcode is unscannable on a printed label.
        lineColor: "#000000",
        background: "#ffffff",
      });
      setFailed(false);
    } catch {
      // JsBarcode throws on values the symbology cannot encode — e.g. a
      // 12-digit code sent as EAN13. Fall through to the notice below.
      setFailed(true);
    }
  }, [code, type, height, barWidth, showValue, fontSize, margin]);

  if (!code || failed) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
        {failed ? `Cannot encode "${code}" as ${type}` : emptyText}
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: "inline-block",
        bgcolor: "#ffffff",
        px: 0.5,
        borderRadius: 0.5,
        lineHeight: 0,
      }}
    >
      <svg ref={svgRef} style={{ maxWidth: "100%", height: "auto", display: "block" }} />
    </Box>
  );
};

export default BarcodeImage;
