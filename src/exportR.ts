import * as path from "path";
import * as vscode from "vscode";
import { ExportColumn, ExportTable } from "./common/svgTable";

/**
 * Turns a table into R that rebuilds it as a data.frame, ready to paste into a script.
 */

// Check that the name will be accepted by R
function rSafe(text: string): string {
  const name = text.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (name === "") {
    return "value";
  }
  return /^\d/.test(name) ? `x${name}` : name;
}

// `cmax_plasma` + the parameters card -> `cmax_plasma_parameters`
function variableName(table: ExportTable, projectUri: vscode.Uri, section: string): string {
  const run = rSafe(path.basename(projectUri.fsPath, path.extname(projectUri.fsPath)));
  // Simulx puts every parameter set on one card, so a fixed word would let a second copy
  // silently overwrite the first in the script. The table's title is the set's own name.
  if (section === "simulxParameters") {
    return `${run}_${rSafe(table.title)}`;
  }
  return `${run}_${section === "criteria" ? "criteria" : "parameters"}`;
}

// A column header as an R-safe name
function rName(column: ExportColumn): string {
  return rSafe(
    `${column.group ?? ""} ${column.header}`
      .replace(/ω/g, "omega")
      .toLowerCase()
      .replace(/\(%\)/g, "pct")
  );
}

function uniqueNames(columns: ExportColumn[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((column) => {
    const name = rName(column);
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

function rVector(values: string[], numeric: boolean): string {
  if (!numeric) {
    const quoted = values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    return `c(${quoted.join(", ")})`;
  }
  // A blank cell is a missing value, not a zero
  const numbers = values.map((v) =>
    v.trim() === "" || !Number.isFinite(Number(v)) ? "NA_real_" : v.trim()
  );
  return `c(${numbers.join(", ")})`;
}

export function rCode(table: ExportTable, projectUri: vscode.Uri, section: string): string {
  const variable = variableName(table, projectUri, section);
  const project = path.basename(projectUri.fsPath, path.extname(projectUri.fsPath));
  const names = uniqueNames(table.columns);
  // Aligned, because this is code meant to live in a script rather than scroll past.
  const pad = names.reduce((most, name) => Math.max(most, name.length), 0);

  const assignments = table.columns.map((column, index) => {
    const values = table.rows.map((row) => row[index] ?? "");
    const numeric = column.format.kind !== "symbol" && column.format.kind !== "text";
    return `  ${names[index].padEnd(pad)} = ${rVector(values, numeric)},`;
  });

  // No timestamp: these scripts live in git repositories, and a date would make the output
  // non-deterministic - re-copying the same table would show up as a diff.
  return [
    `# ${table.title} — ${project} (mlx Explorer)`,
    `${variable} <- data.frame(`,
    ...assignments,
    `  stringsAsFactors = FALSE`,
    `)`,
  ].join("\n");
}
