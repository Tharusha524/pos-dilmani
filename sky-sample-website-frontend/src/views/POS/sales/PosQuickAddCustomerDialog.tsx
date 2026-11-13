import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCustomer, type Customer } from "../../../api/customersApi";
import { getFriendlyErrorMessage } from "../../../utils/getFriendlyErrorMessage";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The new customer, so the till can select them straight away. */
  onCreated: (customer: Customer) => void;
  /** Pre-fills Route. The API requires one; the branch is a sensible start. */
  defaultRoute?: string;
  /** Pre-fills Name from what the cashier was searching for. */
  initialName?: string;
}

/**
 * Add a customer without leaving the till.
 *
 * Asks only for what the API requires — first name, phone and route — plus an
 * optional birthday, since the till can then greet them on it. Anything more
 * is for the full customer page; a queue is forming while this is open.
 */
const PosQuickAddCustomerDialog: React.FC<Props> = ({
  open,
  onClose,
  onCreated,
  defaultRoute = "",
  initialName = "",
}) => {
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [route, setRoute] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setPhone("");
    setRoute(defaultRoute);
    setDob("");
    setError(null);
    const id = window.requestAnimationFrame(() => nameRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open, initialName, defaultRoute]);

  const mutation = useMutation({
    mutationFn: () =>
      createCustomer({
        first_name: name.trim(),
        contact_no: phone.trim(),
        route: route.trim(),
        date_of_birth: dob || null,
      }),
    onSuccess: (customer) => {
      // The till's customer list is cached; refresh it so the new customer
      // can be found again on the next sale.
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      onCreated(customer);
      onClose();
    },
    onError: (err) => {
      // The server's own reason — most often a phone number already on file
      // for another customer.
      setError(getFriendlyErrorMessage(err, "Could not add the customer"));
    },
  });

  const canSave =
    name.trim() !== "" && phone.trim() !== "" && route.trim() !== "" && !mutation.isPending;

  const submit = () => {
    if (canSave) mutation.mutate();
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Keeps the till's page-level Enter shortcut from firing underneath.
      e.stopPropagation();
      submit();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>New customer</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Grid container spacing={1.5} sx={{ mt: 0 }}>
          <Grid item xs={12}>
            <TextField
              inputRef={nameRef}
              fullWidth
              size="small"
              label="Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onEnter}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              label="Phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={onEnter}
              inputProps={{ inputMode: "tel" }}
            />
          </Grid>
          <Grid item xs={7}>
            <TextField
              fullWidth
              size="small"
              label="Route"
              required
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              onKeyDown={onEnter}
            />
          </Grid>
          <Grid item xs={5}>
            <TextField
              fullWidth
              size="small"
              label="Birthday"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          Add the rest of their details later from Customers.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!canSave}>
          {mutation.isPending ? "Adding…" : "Add & select"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PosQuickAddCustomerDialog;
