import { buildBarcodeSvgMarkup } from "./barcodeSvg";

describe("buildBarcodeSvgMarkup", () => {
  test("produces real SVG bars, not a decorative gradient", () => {
    const markup = buildBarcodeSvgMarkup("INV-001234");

    expect(markup).toBeTruthy();
    expect(markup).toContain("<svg");
    // Actual encoded bars are <rect> elements. A CSS gradient would have none,
    // which is exactly the bug this replaced: stripes that looked like a
    // barcode but encoded nothing, so a receipt could never be scanned back.
    expect(markup).toContain("<rect");
  });

  test("encodes different codes differently", () => {
    const a = buildBarcodeSvgMarkup("INV-001234");
    const b = buildBarcodeSvgMarkup("INV-009999");

    expect(a).not.toEqual(b);
  });

  test("renders in black on white so it survives printing", () => {
    const markup = buildBarcodeSvgMarkup("INV-001234") ?? "";

    expect(markup.toLowerCase()).toContain("#000000");
  });

  test("an empty code yields nothing, so the caller omits the block", () => {
    expect(buildBarcodeSvgMarkup("")).toBeNull();
    expect(buildBarcodeSvgMarkup(null)).toBeNull();
    expect(buildBarcodeSvgMarkup(undefined)).toBeNull();
  });

  test("an unencodable value returns null instead of throwing", () => {
    // Letters cannot be expressed in EAN-13. The receipt must still print, so
    // this has to fail softly rather than take the whole sale down.
    expect(buildBarcodeSvgMarkup("NOT-A-NUMBER", { format: "EAN13" })).toBeNull();
  });

  test("a valid EAN-13 encodes in EAN13 mode", () => {
    expect(buildBarcodeSvgMarkup("4006381333931", { format: "EAN13" })).toContain(
      "<rect"
    );
  });

  test("degrades to null where the digits cannot be measured", () => {
    // Drawing the human-readable digits requires measuring their width, which
    // JsBarcode does through a canvas 2D context. jsdom has none, so this path
    // returns null here while working normally in a real browser. The point of
    // the assertion is that the missing capability yields null rather than an
    // uncaught throw — the receipt still prints, just without the barcode.
    expect(buildBarcodeSvgMarkup("INV-001234", { displayValue: true })).toBeNull();
  });

  test("the receipt's own call path does not need a canvas", () => {
    // The receipt prints the digits as ordinary HTML beneath the bars instead
    // of baking them into the SVG, so its barcode never depends on canvas.
    expect(buildBarcodeSvgMarkup("INV-001234", { displayValue: false })).toContain(
      "<rect"
    );
  });
});
