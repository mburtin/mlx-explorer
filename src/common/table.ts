export interface Table {
  columns: string[];
  rows: string[][];
}

// MonolixSuite results files are plain CSV, without quoting
export function parseTable(csv: string): Table | undefined {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    return undefined;
  }
  return {
    columns: lines[0].split(","),
    rows: lines.slice(1).map((line) => line.split(",")),
  };
}

// Finds a column by prefix
export function columnIndex(columns: string[], wanted: string): number {
  return columns.findIndex((column) => column.toLowerCase().startsWith(wanted));
}

// MonolixSuite stores 15 digits; Round the fractional part only
export function formatFixed(raw: string, decimals = 2): string {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value)) {
    return raw;
  }
  
  const fixed = value.toFixed(decimals);
  if (value === 0 || Number(fixed) !== 0) {
    return fixed;
  }

  // Avoid to round a nonzero value to 0; adjust decimals to keep significant digits visible.
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  return value.toFixed(decimals - magnitude - 1);
}

/** A number split for display: the mantissa, and a power of ten when one is needed. */
export interface Formatted {
  text: string; // "0.00410", "1.24", "—"
  exponent?: string; // "-4": the caller draws the "× 10" and lifts this into a superscript
}

// Past these the fixed form stops reading: 0.00041 is four leading zeros to count, 123456
// is six digits nobody counts. Between them the plain number compares better by eye.
const SCI_LOW = -4;
const SCI_HIGH = 5;

// A blank source value reads as an em dash rather than an empty cell, like numCell does
export const EMPTY_CELL = "—";

// Rounds to `digits` significant results, to void ka = 0.0041 into "0.00"
export function formatSignificant(raw: string, digits = 3): Formatted {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value)) {
    return { text: EMPTY_CELL };
  }
  if (value === 0) {
    return { text: "0" };
  }

  // toExponential does the rounding and carries for us: 9.999e-5 at 3 digits comes back
  // as "1.00e-4", never "10.0e-5". Its exponent is therefore the one to judge the form on.
  const [mantissa, power] = value.toExponential(digits - 1).split("e");
  const exponent = Number(power);
  if (exponent <= SCI_LOW || exponent >= SCI_HIGH) {
    return { text: mantissa, exponent: String(exponent) };
  }

  // toPrecision is not usable here: it flips to exponential on its own once the value has
  // more than `digits` integer digits, turning 12345 into "1.23e+4".
  return { text: value.toFixed(Math.max(0, digits - 1 - exponent)) };
}
