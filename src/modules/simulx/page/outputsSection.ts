import { escapeHtml, stripe } from "../../../common/webview";
import { scanNamedEntries } from "../entries";
import { definitionLabel } from "../project";

export interface OutputDef {
  name: string;
  variable: string;
  start: string;
  interval: string;
  final: string;
}

/**
 * `[DEFINITION] OUTPUT:` declares one `'name' = {output=Var, {{start=, interval=, final=}}}`
 * entry per output. Only this regular-grid shape is handled; an entry using another shape
 * (e.g. explicit `times={...}`) is dropped rather than shown wrong.
 */
export function readOutputs(content: string): OutputDef[] {
  const output = definitionLabel(content, "OUTPUT");
  if (output === undefined) {
    return [];
  }

  const outputs: OutputDef[] = [];
  for (const entry of scanNamedEntries(output)) {
    const variable = /output\s*=\s*([^,}]+)/.exec(entry.body)?.[1]?.trim();
    const start = /start\s*=\s*([\d.eE+-]+)/.exec(entry.body)?.[1];
    const interval = /interval\s*=\s*([\d.eE+-]+)/.exec(entry.body)?.[1];
    const final = /final\s*=\s*([\d.eE+-]+)/.exec(entry.body)?.[1];
    if (variable !== undefined && start !== undefined && interval !== undefined && final !== undefined) {
      outputs.push({ name: entry.name, variable, start, interval, final });
    }
  }

  return outputs;
}

export function renderOutputs(outputs: OutputDef[]): string {
  if (outputs.length === 0) {
    return "";
  }

  const rows = outputs
    .map((o, i) => {
      const grid = `${o.start} → ${o.final} (step ${o.interval})`;
      return `<tr${stripe(i)}><td>${escapeHtml(o.name)}</td>` +
        `<td>${escapeHtml(o.variable)}</td><td>${escapeHtml(grid)}</td></tr>`;
    })
    .join("");

  return `<section class="card">
    <details open>
      <summary class="card-head"><span class="chevron">▶</span><h2>Outputs</h2></summary>
      <table><thead><tr><th>Output</th><th>Variable</th><th>Time grid</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </details>
  </section>`;
}
