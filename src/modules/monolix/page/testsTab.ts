import * as vscode from "vscode";
import { readTable } from "../../../common/files";
import { formatSignificant, Table } from "../../../common/table";
import { escapeHtml, infoIcon, stripe } from "../../../common/webview";

// Below this, a test rejects its null hypothesis
const SIGNIFICANCE = 0.05;

export interface TestGroup {
  title: string;
  hint: string;
  table: Table;
}

// The residuals' normality and symmetry tests share their columns, so they share a card.
// Each hint shows on the title's info icon: what the test checks, and what its p-value
// means for the model.
const TESTS = [
  {
    title: "Individual parameters vs covariates",
    files: ["correlationIndividualParametersCovariates.txt"],
    hint: "Tests the effect of each covariate already in the model.\n" +
      "A non-significant p-value suggests removing the covariate.",
  },
  {
    title: "Random effects vs covariates",
    files: ["correlationRandomEffectsCovariates.txt"],
    hint: "Tests whether a covariate explains part of a parameter's variability.\n" +
      "A significant p-value suggests adding the covariate to the model.",
  },
  {
    title: "Correlation between random effects",
    files: ["correlationRandomEffects.txt"],
    hint: "Tests the correlation between the random effects of two parameters.\n" +
      "A non-significant p-value suggests they are not correlated.",
  },
  {
    title: "Distribution of individual parameters",
    files: ["normalityIndividualParameters.txt"],
    hint: "Tests whether each parameter follows its distribution (e.g. lognormal).\n" +
      "A significant p-value suggests choosing another distribution.",
  },
  {
    title: "Distribution of random effects",
    files: ["normalityRandomEffects.txt"],
    hint: "Tests whether the random effects (η) are normally distributed.\n" +
      "A significant p-value suggests they are not normal.",
  },
  {
    title: "Distribution of residuals",
    files: ["normalityResiduals.txt", "symmetryResiduals.txt"],
    hint: "Tests whether the residuals are normal and symmetric.\n" +
      "A significant p-value suggests a misspecified error model.",
  },
  {
    title: "Fixed effects (Wald test)",
    files: ["fixedEffects.txt"],
    hint: "Tests whether each covariate effect (β) differs from 0.\n" +
      "A non-significant p-value suggests removing the covariate.",
  },
];

const HEADERS: Record<string, string> = {
  parameter: "Parameter",
  eta: "Random effect",
  eta1: "Random effect",
  eta2: "Random effect",
  covariate: "Covariate",
  level: "Level",
  residuals: "Residual",
  statistics: "Statistic",
  "p-value": "p-value",
  test: "Test",
};

const NUMERIC = ["coeff", "statistics", "p-value"];

// Reads the Tests folder, one group per card; undefined when Monolix wrote no test
export async function readTests(results: vscode.Uri): Promise<TestGroup[] | undefined> {
  const groups: TestGroup[] = [];
  for (const test of TESTS) {
    const tables = await Promise.all(
      test.files.map((file) => readTable(vscode.Uri.joinPath(results, "Tests", file)))
    );
    const found = tables.filter((table): table is Table => table !== undefined);
    if (found.length > 0) {
      groups.push({
        title: test.title,
        hint: test.hint,
        table: { columns: found[0].columns, rows: found.flatMap((table) => table.rows) },
      });
    }
  }
  return groups.length > 0 ? groups : undefined;
}

// Three significant figures; a value Monolix writes as text (<2.2e-16) is shown as written
function formatStat(raw: string): string {
  if (!Number.isFinite(Number(raw))) {
    return raw;
  }
  const { text, exponent } = formatSignificant(raw);
  return exponent === undefined ? text : `${text}e${exponent}`;
}

function cell(raw: string, key: string): string {
  const value = raw.trim();
  if (!NUMERIC.includes(key)) {
    return `<td>${escapeHtml(value)}</td>`;
  }
  const empty = value === "" ? " empty" : "";
  const sig = key === "p-value" && value !== "" && Number(value.replace(/^</, "")) < SIGNIFICANCE
    ? " sig"
    : "";
  return `<td class="num${empty}${sig}" title="${escapeHtml(value)}">${escapeHtml(formatStat(value))}</td>`;
}

function renderTest(group: TestGroup): string {
  // fixedEffects.txt suffixes its columns with the FIM method: statistics(sa)
  const keys = group.table.columns.map((column) => column.trim().replace(/\(.*\)$/, ""));
  const head = keys
    .map((key, index) => {
      const label = escapeHtml(HEADERS[key] ?? group.table.columns[index]);
      if (key === "p-value") {
        return `<th class="num" title="In bold below ${SIGNIFICANCE}">${label}</th>`;
      }
      return NUMERIC.includes(key) ? `<th class="num">${label}</th>` : `<th>${label}</th>`;
    })
    .join("");
  const body = group.table.rows
    .map((row, index) =>
      `<tr${stripe(index)}>${keys.map((key, column) => cell(row[column] ?? "", key)).join("")}</tr>`
    )
    .join("");

  return `<section class="card">
    <details open>
      <summary class="card-head"><span class="chevron">&#9654;</span><h2>${escapeHtml(group.title)}</h2>${infoIcon(group.hint)}</summary>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </details>
  </section>`;
}

// Renders the whole Tests tab: one card per test
export function renderTests(groups: TestGroup[]): string {
  return groups.map(renderTest).join("");
}
