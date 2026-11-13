import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import PrintIcon from "@mui/icons-material/Print";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { getItems, type Item } from "../../../../api/itemsApi";
import { getCompanyPrintHeader } from "../../../../api/Settings/companySettingsApi";
import PageTitle from "../../../../components/PageTitle";
import BarcodeLabel from "./BarcodeLabel";
import {
  DEFAULT_TEMPLATE_KEY,
  LABEL_PRICE_MODES,
  LABEL_TEMPLATES,
  findTemplate,
  type LabelPriceMode,
} from "./labelTemplates";

interface QueueLine {
  /** Keyed by item_number, not row id: a product has one row per branch and
   *  the label describes the product, so branches must not queue twice. */
  itemNumber: string;
  item: Item;
  copies: number;
}

const MAX_COPIES_PER_LINE = 500;

/**
 * The label setup is remembered per browser, not per company.
 *
 * Which size roll is loaded is a property of the printer sitting at this
 * counter, so two terminals in the same shop can legitimately differ — a
 * company-wide default would force one of them to re-pick on every visit.
 * Reads and writes are guarded because storage throws in private windows.
 */
const LABEL_SETUP_KEY = "barcode_label_setup";

interface StoredLabelSetup {
  templateKey?: string;
  customWidth?: string;
  customHeight?: string;
  priceMode?: LabelPriceMode;
  showShopName?: boolean;
}

function loadLabelSetup(): StoredLabelSetup {
  try {
    const raw = window.localStorage.getItem(LABEL_SETUP_KEY);
    return raw ? (JSON.parse(raw) as StoredLabelSetup) : {};
  } catch {
    return {};
  }
}

function saveLabelSetup(setup: StoredLabelSetup): void {
  try {
    window.localStorage.setItem(LABEL_SETUP_KEY, JSON.stringify(setup));
  } catch {
    // Storage unavailable or full — the page still works, it just will not
    // remember the choice.
  }
}

/**
 * Print isolation.
 *
 * The app shell (sidebar, app bar, this whole form) must not reach the paper:
 * the printer is loaded with a roll of stickers, and anything else on the page
 * would consume them. Hiding by `visibility` rather than `display` keeps the
 * labels' own layout boxes intact, so their mm sizes still measure correctly
 * while printing.
 */
const PRINT_CSS = `
  @media print {
    @page { margin: 4mm; }
    body * { visibility: hidden !important; }
    #barcode-label-print-area,
    #barcode-label-print-area * { visibility: visible !important; }
    #barcode-label-print-area {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
    }
    #barcode-label-print-area .barcode-label {
      border: none !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`;

const BarcodeLabelsPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [searchParams] = useSearchParams();

  const [queue, setQueue] = useState<QueueLine[]>([]);
  const [pendingItem, setPendingItem] = useState<Item | null>(null);
  const [pendingCopies, setPendingCopies] = useState("1");
  const storedSetup = useMemo(loadLabelSetup, []);
  const [templateKey, setTemplateKey] = useState(
    storedSetup.templateKey ?? DEFAULT_TEMPLATE_KEY
  );
  const [customWidth, setCustomWidth] = useState(storedSetup.customWidth ?? "50");
  const [customHeight, setCustomHeight] = useState(storedSetup.customHeight ?? "30");
  const [priceMode, setPriceMode] = useState<LabelPriceMode>(
    storedSetup.priceMode ?? "selling"
  );
  const [showShopName, setShowShopName] = useState(storedSetup.showShopName ?? false);

  useEffect(() => {
    saveLabelSetup({ templateKey, customWidth, customHeight, priceMode, showShopName });
  }, [templateKey, customWidth, customHeight, priceMode, showShopName]);

  const { data: itemsResponse, isLoading } = useQuery({
    queryKey: ["items", "barcode-labels"],
    queryFn: () => getItems(undefined, "all"),
  });

  const { data: printHeader } = useQuery({
    queryKey: ["company-print-header"],
    queryFn: getCompanyPrintHeader,
  });

  /**
   * One entry per product rather than per branch row, so the picker does not
   * list the same shirt once for every branch that stocks it.
   */
  const products = useMemo(() => {
    const byItemNumber = new Map<string, Item>();
    for (const item of itemsResponse?.items ?? []) {
      if (!byItemNumber.has(item.item_number)) {
        byItemNumber.set(item.item_number, item);
      }
    }
    return Array.from(byItemNumber.values()).sort((a, b) =>
      a.description.localeCompare(b.description)
    );
  }, [itemsResponse]);

  /**
   * Seed the queue from the items list ("Print labels for selected") or from an
   * item form ("Print label"), so arriving here already has work queued instead
   * of making the user re-pick what they just selected.
   */
  useEffect(() => {
    if (products.length === 0 || queue.length > 0) return;

    const requested = (searchParams.get("items") ?? searchParams.get("item") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (requested.length === 0) return;

    const seeded: QueueLine[] = [];
    for (const itemNumber of requested) {
      const match = products.find((p) => p.item_number === itemNumber);
      if (match) {
        seeded.push({ itemNumber: match.item_number, item: match, copies: 1 });
      }
    }

    if (seeded.length > 0) setQueue(seeded);
    // Seeds once, on the first load with a populated catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const template = useMemo(() => {
    const base = findTemplate(templateKey);
    if (base.key !== "custom") return base;

    return {
      ...base,
      widthMm: Math.min(200, Math.max(20, Number(customWidth) || base.widthMm)),
      heightMm: Math.min(200, Math.max(12, Number(customHeight) || base.heightMm)),
    };
  }, [templateKey, customWidth, customHeight]);

  const totalLabels = queue.reduce((sum, line) => sum + line.copies, 0);
  const missingBarcode = queue.filter((line) => !line.item.barcode);

  const addToQueue = () => {
    if (!pendingItem) return;

    const copies = Math.min(
      MAX_COPIES_PER_LINE,
      Math.max(1, Math.floor(Number(pendingCopies) || 1))
    );

    setQueue((prev) => {
      // Same product added twice: raise the copy count rather than creating a
      // second row the user would then have to reconcile by eye.
      const existing = prev.findIndex((l) => l.itemNumber === pendingItem.item_number);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = {
          ...next[existing],
          copies: Math.min(MAX_COPIES_PER_LINE, next[existing].copies + copies),
        };
        return next;
      }
      return [...prev, { itemNumber: pendingItem.item_number, item: pendingItem, copies }];
    });

    setPendingItem(null);
    setPendingCopies("1");
  };

  const setCopies = (itemNumber: string, raw: string) => {
    const copies = Math.min(
      MAX_COPIES_PER_LINE,
      Math.max(1, Math.floor(Number(raw) || 1))
    );
    setQueue((prev) =>
      prev.map((l) => (l.itemNumber === itemNumber ? { ...l, copies } : l))
    );
  };

  const removeLine = (itemNumber: string) =>
    setQueue((prev) => prev.filter((l) => l.itemNumber !== itemNumber));

  const handlePrint = () => {
    if (totalLabels === 0) {
      enqueueSnackbar("Add at least one item to the queue first", { variant: "info" });
      return;
    }

    if (template.showBarcode && missingBarcode.length === queue.length) {
      enqueueSnackbar(
        "None of the queued items have a barcode. Open the item and generate one.",
        { variant: "warning" }
      );
      return;
    }

    window.print();
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <style>{PRINT_CSS}</style>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
          flexWrap: "wrap",
        }}
      >
        <Button
          component={Link}
          to="/inventory"
          startIcon={<ArrowBackIcon />}
          sx={{ textTransform: "none" }}
        >
          Back
        </Button>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <PageTitle
            title="Barcode Labels"
            subtitle="Print barcode stickers for your items"
          />
        </Box>
        <Chip
          icon={<QrCode2Icon />}
          label={`${totalLabels} label${totalLabels === 1 ? "" : "s"} queued`}
          color={totalLabels > 0 ? "primary" : "default"}
          sx={{ fontWeight: 700 }}
        />
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          disabled={totalLabels === 0}
        >
          Print
        </Button>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                1. Add items
              </Typography>
              <Grid container spacing={1.5} alignItems="flex-start">
                <Grid item xs={12} sm={7}>
                  <Autocomplete
                    size="small"
                    options={products}
                    loading={isLoading}
                    value={pendingItem}
                    onChange={(_, value) => setPendingItem(value)}
                    getOptionLabel={(option) =>
                      `${option.description} (${option.item_number})`
                    }
                    isOptionEqualToValue={(a, b) => a.item_number === b.item_number}
                    renderOption={(props, option) => (
                      <li {...props} key={option.item_number}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {option.description}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {option.item_number}
                            {option.barcode ? ` · ${option.barcode}` : " · no barcode yet"}
                          </Typography>
                        </Box>
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Item"
                        placeholder="Search by name or item number"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Copies"
                    value={pendingCopies}
                    onChange={(e) => setPendingCopies(e.target.value)}
                    inputProps={{ min: 1, max: MAX_COPIES_PER_LINE }}
                  />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={addToQueue}
                    disabled={!pendingItem}
                    sx={{ height: 40 }}
                  >
                    Add
                  </Button>
                </Grid>
              </Grid>

              {queue.length > 0 ? (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell>Barcode</TableCell>
                        <TableCell align="right" sx={{ width: 110 }}>
                          Copies
                        </TableCell>
                        <TableCell align="center" sx={{ width: 56 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {queue.map((line) => (
                        <TableRow key={line.itemNumber} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {line.item.description}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {line.itemNumber}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ fontFamily: "monospace" }}>
                            {line.item.barcode ?? (
                              <Typography
                                variant="caption"
                                color="warning.main"
                                sx={{ fontStyle: "italic" }}
                              >
                                not set
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              type="number"
                              value={line.copies}
                              onChange={(e) => setCopies(line.itemNumber, e.target.value)}
                              inputProps={{
                                min: 1,
                                max: MAX_COPIES_PER_LINE,
                                style: { textAlign: "right" },
                              }}
                              sx={{ width: 90 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Remove">
                              <IconButton
                                size="small"
                                onClick={() => removeLine(line.itemNumber)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Pick an item above, or select items in the Items list and use the
                  barcode button there.
                </Alert>
              )}

              {template.showBarcode && missingBarcode.length > 0 ? (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {missingBarcode.length} queued item
                  {missingBarcode.length === 1 ? " has" : "s have"} no barcode yet —{" "}
                  {missingBarcode.length === 1 ? "its" : "their"} label will print
                  without bars. Open the item and press Generate to fix it.
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                2. Label setup
              </Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    select
                    size="small"
                    label="Label size"
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value)}
                    helperText={findTemplate(templateKey).description}
                  >
                    {LABEL_TEMPLATES.map((t) => (
                      <MenuItem key={t.key} value={t.key}>
                        {t.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                {templateKey === "custom" ? (
                  <>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label="Width (mm)"
                        value={customWidth}
                        onChange={(e) => setCustomWidth(e.target.value)}
                        inputProps={{ min: 20, max: 200 }}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label="Height (mm)"
                        value={customHeight}
                        onChange={(e) => setCustomHeight(e.target.value)}
                        inputProps={{ min: 12, max: 200 }}
                      />
                    </Grid>
                  </>
                ) : null}

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    select
                    size="small"
                    label="Price shown"
                    value={priceMode}
                    onChange={(e) => setPriceMode(e.target.value as LabelPriceMode)}
                  >
                    {LABEL_PRICE_MODES.map((m) => (
                      <MenuItem key={m.value} value={m.value}>
                        {m.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    select
                    size="small"
                    label="Shop name on label"
                    value={showShopName ? "yes" : "no"}
                    onChange={(e) => setShowShopName(e.target.value === "yes")}
                    helperText={
                      template.heightMm < 25
                        ? "Small stickers have little room — leaving this off keeps the name readable."
                        : " "
                    }
                  >
                    <MenuItem value="no">Hide</MenuItem>
                    <MenuItem value="yes">Show</MenuItem>
                  </TextField>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary">
                Load your label roll, then press Print. Set the printer's paper size
                to {template.widthMm} × {template.heightMm} mm and scaling to 100% —
                any other scaling changes the bar widths and can make the code
                unreadable.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {queue.length > 0 ? (
        <>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>
            3. Preview
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              bgcolor: "#ffffff",
              display: "inline-block",
              maxWidth: "100%",
            }}
          >
            <Box
              id="barcode-label-print-area"
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: "2mm",
                alignItems: "flex-start",
              }}
            >
              {queue.flatMap((line) =>
                Array.from({ length: line.copies }).map((_, copy) => (
                  <BarcodeLabel
                    key={`${line.itemNumber}-${copy}`}
                    item={line.item}
                    template={template}
                    priceMode={priceMode}
                    shopName={printHeader?.company_name}
                    showShopName={showShopName}
                  />
                ))
              )}
            </Box>
          </Paper>
        </>
      ) : null}
    </Box>
  );
};

export default BarcodeLabelsPage;
