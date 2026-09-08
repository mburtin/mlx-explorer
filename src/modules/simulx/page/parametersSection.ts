import { escapeHtml, numCell, stripe } from "../../../common/webview";
import { scanNamedEntries } from "../entries";
import { definitionLabel } from "../project";

export interface ParameterRow {
  name: string;
  value: string;
  omega: string;
}

export interface ParameterSet {
  name: string;
  rows: ParameterRow[];
}

/**
 * One line per parameter: `X_pop` holds the estimate, `omega_X` (`omega2_X` for a
 * variance) its variability - same grouping Monolix's Results tab uses, minus RSE
 * (Simulx values are fixed, not estimated).
 */
function buildRows(names: string[], values: string[]): ParameterRow[] {
  const rows: ParameterRow[] = [];
  const byName = new Map<string, ParameterRow>();
  const rowFor = (name: string) => {
    let row = byName.get(name);
    if (!row) {
      row = { name, value: "", omega: "" };
      byName.set(name, row);
      rows.push(row);
    }
    return row;
  };

  names.forEach((name, i) => {
    const omega = /^omega2?_(.+)$/.exec(name);
    const row = rowFor(omega ? omega[1] : name.replace(/_pop$/, ""));
    if (omega) {
      row.omega = values[i];
    } else {
      row.value = values[i];
    }
  });

  return rows;
}

/**
 * `[DEFINITION] POPULATION:` declares one ordered `parameters={...}` name list, then one
 * `'setName' = {{{values={...}}}}` per named set. A set whose value count doesn't match the
 * name count is dropped rather than shown misaligned.
 */
export function readParameters(content: string): ParameterSet[] {
  const population = definitionLabel(content, "POPULATION");
  if (population === undefined) {
    return [];
  }

  const names = /^parameters\s*=\s*\{([^{}]*)\}/m
    .exec(population)?.[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (names === undefined || names.length === 0) {
    return [];
  }

  const sets: ParameterSet[] = [];
  for (const entry of scanNamedEntries(population)) {
    const values = /values\s*=\s*\{([^{}]*)\}/
      .exec(entry.body)?.[1]
      .split(",")
      .map((value) => value.trim());
    if (values === undefined || values.length !== names.length) {
      continue;
    }
    sets.push({ name: entry.name, rows: buildRows(names, values) });
  }

  return sets;
}

export function renderParameters(sets: ParameterSet[]): string {
  if (sets.length === 0) {
    return "";
  }

  const tables = sets
    .map((set) => {
      const rows = set.rows
        .map((row, i) =>
          `<tr${stripe(i)}><td>${escapeHtml(row.name)}</td>` +
          `${numCell(row.value)}${numCell(row.omega)}</tr>`
        )
        .join("");
      // Only worth naming the set when there's more than one to tell apart.
      const caption = sets.length > 1 ? `<div class="note">${escapeHtml(set.name)}</div>` : "";
      return `${caption}<table><thead><tr><th>Parameter</th><th class="num">Value</th>` +
        `<th class="num">Omega</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");

  return `<section class="card">
    <details open>
      <summary class="card-head"><span class="chevron">▶</span><h2>Population parameters</h2></summary>
      ${tables}
    </details>
  </section>`;
}
