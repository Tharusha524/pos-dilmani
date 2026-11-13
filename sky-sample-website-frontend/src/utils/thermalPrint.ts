/**
 * Silent thermal receipt printing.
 *
 * Priority order:
 *  1. Tauri desktop shell  — invoke('print_receipt_escpos')
 *  2. QZ Tray              — silent, dialog-free, works with USB Windows printers
 *  3. Hidden iframe        — browser fallback (shows browser print dialog, no popup)
 *
 * QZ Tray (free, qz.io) must be running on the user's machine for path 2 to work.
 */

declare const qz: any;

// --- html2canvas render -------------------------------------------------------

/** Printable width of an 80mm roll on a TM-T82: 576 dots at 203 dpi. */
const HEAD_DOTS = 576;
/** The same width in millimetres, which is what the print driver works in. */
const ROLL_WIDTH_MM = 72;
/** Capture width; HEAD_DOTS / this is exactly 2, so no edge-blurring rescale. */
const CAPTURE_PX = 288;
/**
 * Anything darker than this becomes a burnt dot. Deliberately generous: a
 * glyph's anti-aliased edge must round to black rather than disappear, which
 * is what made bold headings and right-hand values ghost out before.
 */
const INK_THRESHOLD = 205;

/**
 * Rasterise the receipt for a thermal head.
 *
 * The receipt is rendered inside its own iframe document rather than a div on
 * this page: `html`/`body` rules in its stylesheet would otherwise restyle the
 * running app, and its print-oriented CSS would not apply to a bare div.
 */
export async function receiptHtmlToBase64(html: string): Promise<string> {
  const { default: html2canvas } = await import("html2canvas");

  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-9999px;top:0;width:${CAPTURE_PX}px;height:10px;border:none;`;
  document.body.appendChild(frame);

  try {
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();

    const body = doc.body;
    body.classList.add("rcpt-raster");
    doc.documentElement.classList.add("rcpt-raster");

    // Let fonts settle, or glyphs rasterise with fallback metrics.
    await new Promise<void>((resolve) => {
      if (doc.readyState === "complete") resolve();
      else frame.onload = () => resolve();
    });
    try {
      await doc.fonts.ready;
    } catch {
      /* older engines expose no font loading API */
    }

    // Grow the frame to the full receipt so nothing is cropped at capture.
    frame.style.height = `${body.scrollHeight + 8}px`;

    // Capture the receipt element itself and read its true laid-out width:
    // pinning the crop to a constant would shave off anything that ends up
    // marginally wider.
    const target = (body.querySelector(".rcpt") as HTMLElement) ?? body;
    const captureWidth = Math.max(CAPTURE_PX, Math.ceil(target.scrollWidth));

    const canvas = await html2canvas(target, {
      scale: HEAD_DOTS / captureWidth,
      width: captureWidth,
      windowWidth: captureWidth,
      backgroundColor: "#ffffff",
      useCORS: false,
      logging: false,
    });

    // Reduce to 1 bit here instead of leaving it to the printer: we choose the
    // threshold, so mid greys resolve to ink rather than being discarded.
    const ctx = canvas.getContext("2d")!;
    const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = frameData.data;
    for (let i = 0; i < px.length; i += 4) {
      const luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const v = luma < INK_THRESHOLD ? 0 : 255;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
    ctx.putImageData(frameData, 0, 0);

    return canvas.toDataURL("image/png").split(",")[1];
  } finally {
    if (document.body.contains(frame)) document.body.removeChild(frame);
  }
}

// --- QZ Tray -----------------------------------------------------------------

let _qzScriptLoaded = false;

function loadQzScript(): Promise<boolean> {
  if (_qzScriptLoaded || typeof window.qz !== "undefined") {
    _qzScriptLoaded = true;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src =
      "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.min.js";
    s.onload = () => {
      _qzScriptLoaded = true;
      resolve(true);
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

async function connectQz(): Promise<boolean> {
  const loaded = await loadQzScript();
  if (!loaded) return false;
  try {
    if (qz.websocket.isActive()) return true;
    await qz.websocket.connect({ retries: 1, delay: 0.5 });
    return true;
  } catch {
    return false;
  }
}

async function printViaQzTray(
  printerName: string,
  base64Png: string
): Promise<boolean> {
  const ok = await connectQz();
  if (!ok) return false;
  try {
    // Without an explicit page size the driver has to guess a DPI for a bare
    // PNG, lands on 96, and prints the 576px raster far wider than the roll —
    // which is what sheared the right-hand values off the paper. Stating the
    // roll width in millimetres and asking QZ to scale to it removes the guess.
    const cfg = qz.configs.create(printerName, {
      units: "mm",
      size: { width: ROLL_WIDTH_MM, height: null },
      margins: 0,
      scaleContent: true,
      rasterize: true,
      colorType: "blackwhite",
      interpolation: "nearest-neighbor",
    });
    await qz.print(cfg, [
      {
        type: "pixel",
        format: "image",
        flavor: "base64",
        data: base64Png,
      },
    ]);
    return true;
  } catch (err) {
    console.error("QZ Tray print error:", err);
    return false;
  }
}

// --- Hidden iframe fallback --------------------------------------------------

function printViaHiddenIframe(html: string): void {
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;border:none;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow!.focus();
  setTimeout(() => {
    frame.contentWindow!.print();
    const cleanup = () => {
      if (document.body.contains(frame)) document.body.removeChild(frame);
      frame.contentWindow?.removeEventListener("afterprint", cleanup);
    };
    frame.contentWindow?.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 60_000);
  }, 300);
}

// --- Main entry point --------------------------------------------------------

/**
 * Print a receipt HTML string to `printerName`.
 *
 * Returns immediately (fire-and-forget). The caller should set its own
 * "printed" state right away regardless of the path taken.
 */
export function printReceipt(html: string, printerName: string): void {
  // Path 1: Tauri desktop
  const isTauri = !!(window as any).__TAURI_INTERNALS__;
  if (isTauri) {
    receiptHtmlToBase64(html).then((base64) => {
      const invoke = (window as any).__TAURI_INTERNALS__?.invoke as
        | ((cmd: string, args: object) => Promise<void>)
        | undefined;
      if (!invoke) return;
      invoke("print_receipt_escpos", {
        printerName,
        imageBase64: base64,
        autoCut: true,
      }).catch((err: any) => alert(`Print failed: ${err}`));
    });
    return;
  }

  // Path 2: QZ Tray (silent, no browser dialog)
  receiptHtmlToBase64(html)
    .then((base64) => printViaQzTray(printerName, base64))
    .then((qzOk) => {
      if (!qzOk) {
        // Path 3: hidden iframe (shows browser dialog, but no popup)
        printViaHiddenIframe(html);
      }
    })
    .catch(() => printViaHiddenIframe(html));
}
