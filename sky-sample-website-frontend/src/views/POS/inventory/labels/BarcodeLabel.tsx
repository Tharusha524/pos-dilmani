import React from "react";
import { Box, Typography } from "@mui/material";
import type { Item, BarcodeType } from "../../../../api/itemsApi";
import BarcodeImage from "../../../../components/barcode/BarcodeImage";
import type { LabelPriceMode, LabelTemplate } from "./labelTemplates";

interface Props {
  item: Item;
  template: LabelTemplate;
  priceMode: LabelPriceMode;
  /** Shop name printed small at the top. Omitted when the sticker is tiny. */
  shopName?: string | null;
  showShopName: boolean;
}

function formatRs(amount: number): string {
  return amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * One physical sticker.
 *
 * Everything is forced to black on white and to explicit mm dimensions
 * because this component is what the printer receives: theme colours would
 * print as grey bars that scanners struggle with, and any relative sizing
 * would make the sticker come out a different size than the roll it is on.
 */
const BarcodeLabel: React.FC<Props> = ({
  item,
  template,
  priceMode,
  shopName,
  showShopName,
}) => {
  const price =
    priceMode === "wholesale"
      ? Number(item.wholesale_price ?? 0) || Number(item.selling_price ?? 0)
      : Number(item.selling_price ?? 0);

  return (
    <Box
      className="barcode-label"
      sx={{
        width: `${template.widthMm}mm`,
        height: `${template.heightMm}mm`,
        boxSizing: "border-box",
        p: "1mm",
        bgcolor: "#ffffff",
        color: "#000000",
        border: "1px dashed #bbbbbb",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        overflow: "hidden",
        // Stops a long item name pushing the barcode off the sticker.
        "& > *": { maxWidth: "100%" },
      }}
    >
      {showShopName && shopName ? (
        <Typography
          sx={{
            fontSize: `${Math.max(5, template.nameFontPt - 1.5)}pt`,
            lineHeight: 1.1,
            fontWeight: 600,
            color: "#000000",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            width: "100%",
          }}
        >
          {shopName}
        </Typography>
      ) : null}

      <Typography
        sx={{
          fontSize: `${template.nameFontPt}pt`,
          lineHeight: 1.15,
          fontWeight: 700,
          color: "#000000",
          // Two lines then clip: enough for "Round Neck Black — M" to wrap
          // without ever growing tall enough to squeeze out the bars.
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          width: "100%",
        }}
      >
        {item.description}
      </Typography>

      {template.showItemNumber ? (
        <Typography
          sx={{
            fontSize: `${Math.max(5, template.nameFontPt - 2)}pt`,
            lineHeight: 1.1,
            color: "#000000",
            fontFamily: "monospace",
          }}
        >
          {item.item_number}
        </Typography>
      ) : null}

      {priceMode !== "none" ? (
        <Typography
          sx={{
            fontSize: `${template.priceFontPt}pt`,
            lineHeight: 1.2,
            fontWeight: 800,
            color: "#000000",
            whiteSpace: "nowrap",
          }}
        >
          Rs. {formatRs(price)}
        </Typography>
      ) : null}

      {template.showBarcode ? (
        <Box sx={{ mt: "0.5mm", lineHeight: 0, width: "100%" }}>
          <BarcodeImage
            value={item.barcode}
            type={(item.barcode_type ?? "CODE128") as BarcodeType}
            height={template.barHeight}
            barWidth={template.barWidth}
            showValue={template.showBarcodeText}
            fontSize={Math.max(8, template.nameFontPt + 1)}
            margin={0}
            emptyText="No barcode"
          />
        </Box>
      ) : null}
    </Box>
  );
};

export default BarcodeLabel;
