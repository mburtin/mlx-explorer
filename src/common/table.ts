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
