import React, { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import { POS_DIALOG_PAPER_SX, POS_PRIMARY_BUTTON_SX } from "../posDialogTheme";

export interface ChequePaymentDetails {
  bank_name: string;
  /**
   * The number printed on the cheque.
   *
   * Required, because it is the only thing that ties a bounced cheque back to
   * the sale it paid for — the bank name alone cannot identify which cheque
   * out of many from the same bank has failed.
   */
  cheque_number: string;
}

interface PosChequeBankDialogProps {
  open: boolean;
  initialBankName?: string;
  initialChequeNumber?: string;
  onClose: () => void;
  onConfirm: (details: ChequePaymentDetails) => void;
}

const PosChequeBankDialog: React.FC<PosChequeBankDialogProps> = ({
  open,
  initialBankName = "",
  initialChequeNumber = "",
  onClose,
  onConfirm,
}) => {
  const [bankName, setBankName] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");

  useEffect(() => {
    if (!open) return;
    setBankName(initialBankName);
    setChequeNumber(initialChequeNumber);
  }, [open, initialBankName, initialChequeNumber]);

  const canConfirm = Boolean(bankName.trim()) && Boolean(chequeNumber.trim());

  const handleConfirm = () => {
    if (!canConfirm) return;

    onConfirm({
      bank_name: bankName.trim(),
      // Capped to match the column, so a mistyped long string is trimmed here
      // rather than rejected by the server after the cashier has moved on.
      cheque_number: chequeNumber.trim().slice(0, 50),
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth sx={POS_DIALOG_PAPER_SX}>
      <DialogTitle sx={{ fontWeight: 700, color: "var(--pallet-blue)" }}>
        Cheque / bank details
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Enter the bank and the cheque number for this payment. Both appear on
          the receipt and are kept with the sale.
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              autoFocus
              label="Cheque number"
              margin="dense"
              value={chequeNumber}
              onChange={(e) => setChequeNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirm) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              inputProps={{ maxLength: 50 }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Bank"
              margin="dense"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirm) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!canConfirm}
          sx={{ ...POS_PRIMARY_BUTTON_SX, textTransform: "none" }}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PosChequeBankDialog;
