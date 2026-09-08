import * as vscode from "vscode";
import { readTable, readText } from "../../../common/files";
import { columnIndex, formatFixed, Table } from "../../../common/table";
import { escapeHtml, numCell, stripe } from "../../../common/webview";

// Above this threshold the parameter estimate is imprecise
const RSE_WARNING = 20;

// Above this, two estimates barely separate: the model is over-parameterised
const CORR_WARNING = 0.9;

export interface ResultsData {
  parameters: ParameterView;
  criteria?: Table;
  correlation?: CorrelationMatrix;
}

interface ParameterRow {
  name: string;
  value: string;
  rse: string;
  iiv: string; // CV (%) conversion of the random effect
  iivRse: string;
  iivValue: string; // Raw value of the random effect (in variance)
}

interface ParameterView {
  hasIiv: boolean;
  hasRse: boolean;
  rows: ParameterRow[];
}

interface CorrelationMatrix {
  names: string[];
  values: number[][];
}


// Builds one row per parameter, merging its estimate (X_pop) and its variability
function buildParameterView(table: Table): ParameterView {
  const nameAt = Math.max(columnIndex(table.columns, "parameter"), 0);
  const valueAt = columnIndex(table.columns, "value");
  const cvAt = columnIndex(table.columns, "cv");
  const rseAt = columnIndex(table.columns, "rse");
  const at = (row: string[], index: number) => (index < 0 ? "" : (row[index] ?? "").trim());

  const rows: ParameterRow[] = [];
  const byName = new Map<string, ParameterRow>();
  const rowFor = (name: string) => {
    let row = byName.get(name);
    if (!row) {
      row = { name, value: "", rse: "", iiv: "", iivRse: "", iivValue: "" };
      byName.set(name, row);
      rows.push(row);
    }
    return row;
  };

  for (const raw of table.rows) {
    const name = at(raw, nameAt);
    const omega = /^omega2?_(.+)$/.exec(name);
    const row = rowFor(omega ? omega[1] : name.replace(/_pop$/, ""));
    if (omega) {
      row.iiv = at(raw, cvAt);
      row.iivRse = at(raw, rseAt);
      row.iivValue = at(raw, valueAt);
    } else {
      row.value = at(raw, valueAt);
      row.rse = at(raw, rseAt);
    }
  }

  return {
    // Don't show a column that is empty for every row
    hasIiv: rows.some((row) => row.iiv !== "" || row.iivValue !== ""),
    hasRse: rows.some((row) => row.rse !== "" || row.iivRse !== ""),
    rows,
  };
}

// Parses a correlationEstimates{Lin,SA}.txt CSV into a matrix, keeping the lower triangle
function parseCorrelation(csv: string): CorrelationMatrix | undefined {
  const cells = csv
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(",").map((value) => value.trim()));
  if (cells.length < 2) {
    return undefined;
  }

  const header = Number.isFinite(Number(cells[0][1])) ? undefined : cells.shift();
  const named = !Number.isFinite(Number(cells[0][0]));
  const names = header ? header.filter((name) => name !== "") : cells.map((row) => row[0]);

  const values = cells.map((row, index) =>
    (named ? row.slice(1) : row).map(Number).slice(0, index + 1)
  );

  // Reject a truncated or unexpected file instead of rendering a half-empty matrix
  const complete = values.every(
    (row, index) => row.length === index + 1 && row.every((value) => Number.isFinite(value))
  );
  if (!complete || names.length !== values.length || names.some((name) => name === "")) {
    return undefined;
  }

  return { names, values };
}

// Reads the correlation matrix file matching the run's estimation method
async function readCorrelation(
  results: vscode.Uri,
  parameters: Table
): Promise<CorrelationMatrix | undefined> {
  const rse = parameters.columns.find((column) => column.toLowerCase().startsWith("rse"));
  const files = ["correlationEstimatesLin.txt", "correlationEstimatesSA.txt"];
  if (rse?.toLowerCase().endsWith("sa")) {
    files.reverse();
  }

  for (const file of files) {
    const text = await readText(vscode.Uri.joinPath(results, "FisherInformation", file));
    const matrix = text === undefined ? undefined : parseCorrelation(text);
    if (matrix) {
      return matrix;
    }
  }
  return undefined;
}

// Reads all results needed for the results tab
export async function readResults(results: vscode.Uri): Promise<ResultsData | undefined> {
  const parameters = await readTable(vscode.Uri.joinPath(results, "populationParameters.txt"));
  if (parameters === undefined) {
    return undefined;
  }

  return {
    parameters: buildParameterView(parameters),
    criteria: await readTable(vscode.Uri.joinPath(results, "LogLikelihood", "logLikelihood.txt")),
    correlation: await readCorrelation(results, parameters),
  };
}

// Returns a CSS class flagging an RSE above the warning threshold
function warnClass(rse: string): string {
  return rse !== "" && Number(rse) > RSE_WARNING ? " warn" : "";
}

// Renders the likelihood / model selection criteria card
function renderCriteria(criteria: Table): string {
  const rows = criteria.rows.filter(([name]) => name !== "standardError");
  if (rows.length === 0) {
    return "";
  }
  const stats = rows
    .map(
      ([name, value]) => `<div class="stat">
        <div class="stat-label">${escapeHtml(name)}</div>
        <div class="stat-value" title="${escapeHtml(value ?? "")}">${escapeHtml(formatFixed(value ?? ""))}</div>
      </div>`
    )
    .join("");

  return `<section class="card">
    <details open>
      <summary class="card-head"><span class="chevron">▶</span><h2>Likelihood</h2></summary>
      <div class="stats">${stats}</div>
    </details>
  </section>`;
}

// Renders an IIV cell holding both the CV% and raw omega readings; CSS shows
// only the one the toggle selects.
function iivCell(cv: string, rawValue: string): string {
  const cvEmpty = cv === "" ? " empty" : "";
  const rawEmpty = rawValue === "" ? " empty" : "";
  const cvText = cv === "" ? "—" : formatFixed(cv);
  const rawText = rawValue === "" ? "—" : formatFixed(rawValue);
  return `<td class="num split">` +
    `<span class="iiv-cv${cvEmpty}" title="${escapeHtml(cv)}">${escapeHtml(cvText)}</span>` +
    `<span class="iiv-raw${rawEmpty}" title="${escapeHtml(rawValue)}">${escapeHtml(rawText)}</span>` +
    `</td>`;
}

// Renders the model parameters table (values, RSE, IIV)
function renderParameters(view: ParameterView): string {
  // Carries both column labels (CV% / omega) so the same toggle rules pick the
  // matching one, just like the cells carry both values.
  const iivHead =
    '<th class="num split">IIV (<span class="iiv-cv">CV%</span>' +
    '<span class="iiv-raw">&sigma;</span>)</th>';

  const head =
    "<th>Parameter</th><th class=\"num\">Value</th>" +
    (view.hasRse ? '<th class="num">RSE (%)</th>' : "") +
    (view.hasIiv ? iivHead : "") +
    (view.hasIiv && view.hasRse ? '<th class="num">RSE (%)</th>' : "");

  const body = view.rows
    .map((row, index) =>
      `<tr${stripe(index)}><td>${escapeHtml(row.name)}</td>${numCell(row.value)}` +
      (view.hasRse ? numCell(row.rse, warnClass(row.rse)) : "") +
      (view.hasIiv ? iivCell(row.iiv, row.iivValue) : "") +
      (view.hasIiv && view.hasRse ? numCell(row.iivRse, warnClass(row.iivRse)) : "") +
      "</tr>"
    )
    .join("");

  // Without a FIM, Monolix produces neither standard errors nor likelihood
  const note = view.hasRse ? "" : '<span class="note">FIM not estimated for this run</span>';

  // No script-src is allowed, so the switch is a checkbox: :has() in the CSS
  // reads its state and shows the matching span. It sits outside <summary> so a
  // click on it doesn't also fire the details' native open/close toggle.
  const toggle = view.hasIiv
    ? `<label class="cv-switch" title="Toggle the IIV column between CV (%) and the raw omega value">
        <input type="checkbox" class="cv-toggle" checked>
        <span class="cv-switch-slider"></span>
        <span class="cv-switch-label">CV (%)</span>
      </label>`
    : "";

  return `<section class="card">
    <details open>
      <summary class="card-head"><span class="chevron">▶</span><h2>Model parameters</h2>${note}</summary>
      ${toggle}
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </details>
  </section>`;
}

// Computes a cell's background opacity from |r|
function corrAlpha(value: number): string {
  return (Math.abs(value) ** 0.75 * 0.95).toFixed(3);
}

// Renders one correlation matrix cell.
function corrCell(value: number, rowName: string, colName: string): string {
  const alpha = corrAlpha(value);
  // Past this saturation the label flips to stay readable.
  const strong = Number(alpha) >= 0.6 ? " strong" : "";
  const flag = rowName !== colName && Math.abs(value) >= CORR_WARNING ? " flag" : "";
  const title = `corr(${rowName}, ${colName}) = ${value.toFixed(4)}`;
  return `<td class="corr ${value < 0 ? "neg" : "pos"}${strong}${flag}" style="--a:${alpha}" title="${escapeHtml(title)}">${value.toFixed(2)}</td>`;
}

// Renders the correlation matrix as a table: lower triangle, diagonal included,
// names labeling the rows and the columns
function renderMatrix(matrix: CorrelationMatrix): string {
  const rows = matrix.names
    .map((name, row) => {
      const cells = matrix.values[row]
        .map((value, column) => corrCell(value, name, matrix.names[column]))
        .join("");
      return `<tr><td class="row-label" title="${escapeHtml(name)}">${escapeHtml(name)}</td>${cells}</tr>`;
    })
    .join("");

  const longest = matrix.names.reduce((most, name) => Math.max(most, name.length), 0);
  const height = `height:${(longest * 0.4 + 1).toFixed(1)}em`;
  const labels = matrix.names
    .map(
      (name) =>
        `<td class="col-label" style="${height}"><div style="${height}"><span>${escapeHtml(name)}</span></div></td>`
    )
    .join("");

  return `<table class="corr">
      <tbody>${rows}<tr><td class="row-label"></td>${labels}</tr></tbody>
    </table>`;
}

// Renders the correlation matrix card
function renderCorrelation(matrix: CorrelationMatrix): string {
  return `<section class="card">
    <details open>
      <summary class="card-head"><span class="chevron">&#9654;</span><h2>Correlation matrix</h2></summary>
      <div class="corr-scroll">${renderMatrix(matrix)}</div>
    </details>
  </section>`;
}

// Renders the whole Results tab: the empty state, or the run's cards
export function renderResults(data: ResultsData | undefined, resultsPath: string): string {
  if (data === undefined) {
    return `<section class="card empty-state">
    <div>This project has not been run yet.</div>
    <div class="path">populationParameters.txt not found in ${escapeHtml(resultsPath)}</div>
  </section>`;
  }

  return `${data.criteria ? renderCriteria(data.criteria) : ""}` +
    `${renderParameters(data.parameters)}` +
    `${data.correlation ? renderCorrelation(data.correlation) : ""}`;
}
