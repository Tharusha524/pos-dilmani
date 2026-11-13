import React, { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Slider,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import SettingsPageShell from "../components/SettingsPageShell";
import SettingsToggleRow from "../components/SettingsToggleRow";
import ReceiptLivePreview from "../receipt/ReceiptLivePreview";
import {
  RECEIPT_FONT_FIELDS,
  RECEIPT_SPACING_FIELDS,
  RECEIPT_TOGGLE_GROUPS,
} from "../receiptSettingFields";
import {
  RECEIPT_CUSTOM_FIELD_POSITIONS,
  RECEIPT_LABEL_GROUPS,
  getReceiptSettings,
  resetReceiptSettings,
  updateReceiptSettings,
  type ReceiptCustomField,
  type ReceiptLabels,
  type ReceiptSettings as ReceiptSettingsType,
} from "../../../../api/Settings/receiptSettingsApi";
import { getCompanyPrintHeader } from "../../../../api/Settings/companySettingsApi";
import { getHardwareSettings } from "../../../../api/Settings/hardwareSettingsApi";
import { getFriendlyErrorMessage } from "../../../../utils/getFriendlyErrorMessage";
import { invalidatePosRuntimeSettings } from "../../../../utils/invalidatePosRuntimeSettings";

const MAX_CUSTOM_FIELDS = 12;

/** Human wording for each label key, so the editor does not show raw keys. */
const LABEL_CAPTIONS: Record<keyof ReceiptLabels, string> = {
  receipt_title: "Receipt title",
  sales_id: "Invoice number",
  date: "Date",
  location: "Branch",
  cashier: "Cashier",
  customer: "Customer",
  item_no: "Item code",
  description: "Description",
  qty: "Quantity",
  uom: "Unit",
  unit_price: "Unit price",
  total: "Line total",
  sub_total: "Subtotal",
  discount: "Discount",
  service_charge: "Delivery charge",
  card_charge: "Card fee",
  net_amount: "Total",
  payment: "Payment method",
  received: "Amount received",
  change: "Change",
  you_saved: "You saved",
  thank_you: "Thank-you message",
};

const ReceiptSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [form, setForm] = useState<ReceiptSettingsType | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["receipt-settings"],
    queryFn: getReceiptSettings,
  });

  const { data: printHeader } = useQuery({
    queryKey: ["company-print-header"],
    queryFn: getCompanyPrintHeader,
  });

  const { data: hardware } = useQuery({
    queryKey: ["hardware-settings"],
    queryFn: getHardwareSettings,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Nothing to save");
      const { id: _id, ...payload } = form;
      return updateReceiptSettings(payload);
    },
    onSuccess: (saved) => {
      setForm(saved);
      queryClient.setQueryData(["receipt-settings"], saved);
      // The receipt payload carries these settings, so anything holding a
      // cached receipt must refetch or it would print the old layout.
      invalidatePosRuntimeSettings(queryClient);
      enqueueSnackbar("Receipt settings saved", { variant: "success" });
    },
    onError: (err) => {
      enqueueSnackbar(getFriendlyErrorMessage(err, "Could not save receipt settings"), {
        variant: "error",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetReceiptSettings,
    onSuccess: (saved) => {
      setForm(saved);
      queryClient.setQueryData(["receipt-settings"], saved);
      invalidatePosRuntimeSettings(queryClient);
      enqueueSnackbar("Receipt settings reset to defaults", { variant: "success" });
    },
    onError: (err) => {
      enqueueSnackbar(getFriendlyErrorMessage(err, "Could not reset receipt settings"), {
        variant: "error",
      });
    },
  });

  const setField = <K extends keyof ReceiptSettingsType>(
    key: K,
    value: ReceiptSettingsType[K]
  ) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const setLabel = (key: keyof ReceiptLabels, value: string) =>
    setForm((prev) =>
      prev ? { ...prev, labels: { ...prev.labels, [key]: value } } : prev
    );

  const addCustomField = () =>
    setForm((prev) => {
      if (!prev || prev.custom_fields.length >= MAX_CUSTOM_FIELDS) return prev;

      const field: ReceiptCustomField = {
        // Local-only id; the backend reissues one on save if it is missing.
        id: `rcf_${Date.now()}_${prev.custom_fields.length}`,
        label: "",
        value: "",
        position: "footer",
        align: "center",
        font_size: 10,
        bold: false,
      };

      return { ...prev, custom_fields: [...prev.custom_fields, field] };
    });

  const updateCustomField = (id: string, patch: Partial<ReceiptCustomField>) =>
    setForm((prev) =>
      prev
        ? {
            ...prev,
            custom_fields: prev.custom_fields.map((f) =>
              f.id === id ? { ...f, ...patch } : f
            ),
          }
        : prev
    );

  const removeCustomField = (id: string) =>
    setForm((prev) =>
      prev
        ? { ...prev, custom_fields: prev.custom_fields.filter((f) => f.id !== id) }
        : prev
    );

  const customFieldsAtCap = useMemo(
    () => (form?.custom_fields.length ?? 0) >= MAX_CUSTOM_FIELDS,
    [form?.custom_fields.length]
  );

  if (isLoading || !form) {
    return (
      <SettingsPageShell
        title="Receipt"
        subtitle="Customise what the printed receipt shows"
        hideSave
        wide
      >
        {isError ? (
          <Alert severity="error">
            {getFriendlyErrorMessage(error, "Could not load receipt settings")}
          </Alert>
        ) : (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress />
          </Box>
        )}
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title="Receipt"
      subtitle="Customise what the printed receipt shows, and how it is worded"
      onSave={() => saveMutation.mutate()}
      isSaving={saveMutation.isPending}
      wide
    >
      <Grid container spacing={3}>
        {/* Controls */}
        <Grid item xs={12} lg={7}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Changes show in the preview immediately, and apply to printed
            receipts once you press Save.
          </Alert>

          {RECEIPT_TOGGLE_GROUPS.map((group, index) => (
            <Accordion key={group.title} defaultExpanded={index === 0} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>{group.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {group.description}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {group.fields.map((field) => (
                  <SettingsToggleRow
                    key={field.key}
                    title={field.title}
                    description={field.description}
                    checked={Boolean(form[field.key])}
                    onChange={(checked) => setField(field.key, checked)}
                  />
                ))}

                {group.title === "Footer" ? (
                  <Box sx={{ mt: 1 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Thank-you message"
                      value={form.thank_you_message}
                      onChange={(e) => setField("thank_you_message", e.target.value)}
                      disabled={!form.show_thank_you}
                      sx={{ mb: 1.5 }}
                    />
                    <TextField
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                      label="Footer note"
                      placeholder="e.g. Exchange within 7 days with this receipt."
                      value={form.footer_note}
                      onChange={(e) => setField("footer_note", e.target.value)}
                      disabled={!form.show_footer_note}
                    />
                  </Box>
                ) : null}
              </AccordionDetails>
            </Accordion>
          ))}

          {/* Sizes and receipt length */}
          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography sx={{ fontWeight: 700 }}>Text size &amp; receipt length</Typography>
                <Typography variant="caption" color="text.secondary">
                  Make the receipt easier to read, or shorter to save paper.
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {RECEIPT_FONT_FIELDS.map((field) => (
                <Box key={field.key} sx={{ mb: 2.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {field.label}
                    <Typography component="span" variant="caption" sx={{ ml: 1 }}>
                      {form[field.key]}px
                    </Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {field.helper}
                  </Typography>
                  <Slider
                    size="small"
                    min={field.min}
                    max={field.max}
                    value={Number(form[field.key])}
                    onChange={(_, value) =>
                      setField(field.key, (Array.isArray(value) ? value[0] : value) as never)
                    }
                    valueLabelDisplay="auto"
                  />
                </Box>
              ))}

              <Divider sx={{ my: 2 }} />

              {RECEIPT_SPACING_FIELDS.map((field) => (
                <Box key={field.key} sx={{ mb: 2.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {field.label}
                    <Typography component="span" variant="caption" sx={{ ml: 1 }}>
                      {form[field.key]}px
                    </Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {field.helper}
                  </Typography>
                  <Slider
                    size="small"
                    min={field.min}
                    max={field.max}
                    value={Number(form[field.key])}
                    onChange={(_, value) =>
                      setField(field.key, (Array.isArray(value) ? value[0] : value) as never)
                    }
                    valueLabelDisplay="auto"
                  />
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>

          {/* Editable captions */}
          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography sx={{ fontWeight: 700 }}>Wording</Typography>
                <Typography variant="caption" color="text.secondary">
                  Rename any caption on the receipt — useful for printing in
                  your own language.
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {RECEIPT_LABEL_GROUPS.map((group) => (
                <Box key={group.title} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    {group.title}
                  </Typography>
                  <Grid container spacing={1.5}>
                    {group.keys.map((key) => (
                      <Grid item xs={12} sm={6} key={key}>
                        <TextField
                          fullWidth
                          size="small"
                          label={LABEL_CAPTIONS[key]}
                          value={form.labels[key] ?? ""}
                          onChange={(e) => setLabel(key, e.target.value)}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>

          {/* Admin-added lines */}
          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography sx={{ fontWeight: 700 }}>
                  Your own lines ({form.custom_fields.length})
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Add extra lines anywhere on the receipt — a returns policy, a
                  promotion, a VAT note.
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {form.custom_fields.length === 0 ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  No extra lines yet.
                </Alert>
              ) : (
                form.custom_fields.map((field) => (
                  <Paper
                    key={field.id}
                    variant="outlined"
                    sx={{ p: 1.5, mb: 1.5, borderRadius: 1 }}
                  >
                    <Grid container spacing={1.5} alignItems="center">
                      <Grid item xs={12} sm={4}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Caption"
                          placeholder="e.g. Returns"
                          value={field.label}
                          onChange={(e) =>
                            updateCustomField(field.id, { label: e.target.value })
                          }
                        />
                      </Grid>
                      <Grid item xs={12} sm={5}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Text"
                          placeholder="e.g. Within 7 days with receipt"
                          value={field.value}
                          onChange={(e) =>
                            updateCustomField(field.id, { value: e.target.value })
                          }
                        />
                      </Grid>
                      <Grid item xs={10} sm={2}>
                        <TextField
                          fullWidth
                          select
                          size="small"
                          label="Align"
                          value={field.align}
                          onChange={(e) =>
                            updateCustomField(field.id, {
                              align: e.target.value as ReceiptCustomField["align"],
                            })
                          }
                        >
                          <MenuItem value="left">Left</MenuItem>
                          <MenuItem value="center">Centre</MenuItem>
                          <MenuItem value="right">Right</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid item xs={2} sm={1}>
                        <Tooltip title="Remove this line">
                          <IconButton
                            size="small"
                            onClick={() => removeCustomField(field.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          select
                          size="small"
                          label="Where on the receipt"
                          value={field.position}
                          onChange={(e) =>
                            updateCustomField(field.id, {
                              position: e.target
                                .value as ReceiptCustomField["position"],
                            })
                          }
                        >
                          {RECEIPT_CUSTOM_FIELD_POSITIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          label="Size (px)"
                          value={field.font_size}
                          onChange={(e) =>
                            updateCustomField(field.id, {
                              font_size: Number(e.target.value) || 10,
                            })
                          }
                          inputProps={{ min: 6, max: 20 }}
                        />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Switch
                            size="small"
                            checked={field.bold}
                            onChange={(e) =>
                              updateCustomField(field.id, { bold: e.target.checked })
                            }
                          />
                          <Typography variant="body2">Bold</Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Paper>
                ))
              )}

              <Button
                startIcon={<AddIcon />}
                onClick={addCustomField}
                disabled={customFieldsAtCap}
                variant="outlined"
                size="small"
              >
                Add a line
              </Button>
              {customFieldsAtCap ? (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
                  Limit of {MAX_CUSTOM_FIELDS} reached.
                </Typography>
              ) : null}
            </AccordionDetails>
          </Accordion>

          <Box sx={{ mt: 2 }}>
            <Button
              startIcon={<RestartAltIcon />}
              color="inherit"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? "Resetting…" : "Reset to defaults"}
            </Button>
          </Box>
        </Grid>

        {/* Preview */}
        <Grid item xs={12} lg={5}>
          <Box sx={{ position: { lg: "sticky" }, top: { lg: 16 } }}>
            <ReceiptLivePreview
              settings={form}
              header={printHeader}
              hardware={hardware}
            />
          </Box>
        </Grid>
      </Grid>
    </SettingsPageShell>
  );
};

export default ReceiptSettings;
