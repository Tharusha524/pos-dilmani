import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import type { Item } from "../../../api/itemsApi";
import { formatSaleRs } from "./saleFormUtils";

interface Props {
  open: boolean;
  code: string;
  matches: Item[];
  onClose: () => void;
  onPick: (item: Item) => void;
}

/**
 * Shown when one scanned code maps to more than one product.
 *
 * This is the deliberate alternative to guessing. It should be rare once every
 * product has its own generated barcode, and when it does appear it usually
 * means two items were given the same manufacturer code by hand — so the list
 * shows each candidate's code fields, to make the duplication visible and
 * fixable rather than just worked around.
 */
const PosBarcodeMatchDialog: React.FC<Props> = ({
  open,
  code,
  matches,
  onClose,
  onPick,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Which item is this?</DialogTitle>
    <DialogContent>
      <Alert severity="warning" sx={{ mb: 2 }}>
        <Typography variant="body2">
          {matches.length} items share the code{" "}
          <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
            {code}
          </Box>
          . Pick the right one — then give them separate barcodes so this stops
          happening.
        </Typography>
      </Alert>

      <List disablePadding>
        {matches.map((item) => (
          <ListItemButton
            key={item.item_number}
            onClick={() => onPick(item)}
            sx={{ borderBottom: "1px solid", borderColor: "divider" }}
          >
            <ListItemText
              primary={
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {item.description}
                </Typography>
              }
              secondary={
                <Typography variant="caption" color="text.secondary">
                  {item.item_number}
                  {item.barcode ? ` · barcode ${item.barcode}` : ""}
                  {item.sku ? ` · SKU ${item.sku}` : ""}
                  {item.item_code ? ` · code ${item.item_code}` : ""}
                </Typography>
              }
            />
            <Typography variant="body2" sx={{ fontWeight: 700, ml: 2 }}>
              {formatSaleRs(Number(item.selling_price ?? 0))}
            </Typography>
          </ListItemButton>
        ))}
      </List>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel scan</Button>
    </DialogActions>
  </Dialog>
);

export default PosBarcodeMatchDialog;
