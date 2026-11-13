import {
  barcodeCheckDigit,
  barcodeValidationError,
  hasValidEan13CheckDigit,
  normalizeBarcode,
  parseScannedCode,
} from "./barcode";

describe("normalizeBarcode", () => {
  test("strips the scanner's own Enter keystroke and surrounding space", () => {
    expect(normalizeBarcode("  2000010000017\n")).toBe("2000010000017");
    expect(normalizeBarcode("\t2000010000017\r\n")).toBe("2000010000017");
  });

  test("drops separators a person copies off a printed label", () => {
    expect(normalizeBarcode("2000 0100 00017")).toBe("2000010000017");
  });

  test("keeps the characters CODE128 legitimately carries", () => {
    expect(normalizeBarcode("TEE-M_01.A")).toBe("TEE-M_01.A");
  });

  test("null and undefined collapse to an empty string", () => {
    expect(normalizeBarcode(null)).toBe("");
    expect(normalizeBarcode(undefined)).toBe("");
  });
});

describe("barcodeCheckDigit", () => {
  test("matches the GS1 worked example", () => {
    // 400638133393 -> check digit 1 (a standard GS1 reference value).
    expect(barcodeCheckDigit("400638133393")).toBe(1);
  });

  test("an all-zero body needs no correction", () => {
    expect(barcodeCheckDigit("000000000000")).toBe(0);
  });

  test("the digit always brings the weighted sum to a multiple of ten", () => {
    const body = "200001000001";
    const digit = barcodeCheckDigit(body);

    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      sum += i % 2 === 0 ? Number(body[i]) : Number(body[i]) * 3;
    }

    expect((sum + digit) % 10).toBe(0);
  });
});

describe("hasValidEan13CheckDigit", () => {
  test("accepts a correctly checked code", () => {
    const body = "200001000001";
    expect(hasValidEan13CheckDigit(body + barcodeCheckDigit(body))).toBe(true);
  });

  test("rejects a single mistyped digit", () => {
    expect(hasValidEan13CheckDigit("4006381333931")).toBe(true);
    expect(hasValidEan13CheckDigit("4006381333932")).toBe(false);
  });

  test("rejects anything that is not 13 digits", () => {
    expect(hasValidEan13CheckDigit("400638133393")).toBe(false);
    expect(hasValidEan13CheckDigit("40063813339311")).toBe(false);
    expect(hasValidEan13CheckDigit("ABCDEFGHIJKLM")).toBe(false);
  });
});

describe("barcodeValidationError", () => {
  test("an empty field is not an error — it means auto-generate", () => {
    expect(barcodeValidationError("", "CODE128")).toBeNull();
    expect(barcodeValidationError("", "EAN13")).toBeNull();
  });

  test("CODE128 accepts letters, digits and the usual separators", () => {
    expect(barcodeValidationError("TEE-BLACK-M", "CODE128")).toBeNull();
  });

  test("EAN13 demands exactly 13 digits", () => {
    expect(barcodeValidationError("12345", "EAN13")).toMatch(/13 digits/);
    expect(barcodeValidationError("TEE-BLACK-M", "EAN13")).toMatch(/13 digits/);
  });

  test("EAN13 rejects a bad check digit, which would print as a blank label", () => {
    expect(barcodeValidationError("4006381333932", "EAN13")).toMatch(/check digit/);
    expect(barcodeValidationError("4006381333931", "EAN13")).toBeNull();
  });

  test("rejects a code too long to print", () => {
    expect(barcodeValidationError("1".repeat(65), "CODE128")).toMatch(/64 characters/);
  });
});

describe("parseScannedCode", () => {
  test("a plain scan carries no quantity", () => {
    expect(parseScannedCode("2000010000017")).toEqual({
      code: "2000010000017",
      qty: null,
    });
  });

  test("a leading multiplier rings up several of the same item", () => {
    expect(parseScannedCode("5*2000010000017")).toEqual({
      code: "2000010000017",
      qty: 5,
    });
    expect(parseScannedCode("3x2000010000017")).toEqual({
      code: "2000010000017",
      qty: 3,
    });
    expect(parseScannedCode("2 X 2000010000017")).toEqual({
      code: "2000010000017",
      qty: 2,
    });
  });

  test("a code containing x in the middle is a code, not a quantity", () => {
    expect(parseScannedCode("TEEx500")).toEqual({ code: "TEEx500", qty: null });
  });

  test("a zero or negative multiplier is ignored rather than voiding the line", () => {
    expect(parseScannedCode("0*555")).toEqual({ code: "0555", qty: null });
  });

  test("decimal quantities survive, for anything sold by weight", () => {
    expect(parseScannedCode("1.5*555")).toEqual({ code: "555", qty: 1.5 });
  });
});
