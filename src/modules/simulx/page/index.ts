import { escapeHtml, renderDocument, WebviewAssets } from "../../../common/webview";
import { TOOL } from "../project";
import { Summary } from "../summary";
import { renderModel } from "./modelTab";
import { renderOutputs } from "./outputsSection";
import { renderParameters } from "./parametersSection";
import { renderTreatments } from "./treatmentsSection";

export const STYLESHEETS = [
  "theme.css",
  "simulx-theme.css",
  "layout.css",
  "cards.css",
  "tables.css",
  "settings.css",
];

function renderOpenButton(projectUri: string): string {
  const href = `command:mlxSuite.openInApp?${encodeURIComponent(JSON.stringify([projectUri]))}`;
  return `<a class="btn-open" href="${escapeHtml(href)}">Open in ${escapeHtml(TOOL.label)}</a>`;
}

function renderEmptyState(): string {
  return `<section class="card empty-state">
    <div>No Simulation group defined in this project.</div>
  </section>`;
}

function renderTabState(summary: Summary): string {
  return '<input type="radio" name="tab" id="tab-results" class="tab-state" checked>' +
    (summary.model ? '<input type="radio" name="tab" id="tab-model" class="tab-state">' : "");
}

// Data is a link, not a panel. We use Positron DataExplorer to render it.
function renderNav(summary: Summary): string {
  const tabs = ['<label class="tab" for="tab-results">Summary</label>'];
  if (summary.model) {
    tabs.push('<label class="tab" for="tab-model">Model</label>');
  }
  if (summary.dataUri) {
    const args = encodeURIComponent(JSON.stringify([summary.dataUri]));
    tabs.push(`<a class="tab" href="${escapeHtml(`command:mlxSuite.openData?${args}`)}">Data</a>`);
  }
  return `<nav>${tabs.join("")}</nav>`;
}

export function renderSummaryPage(summary: Summary, assets: WebviewAssets): string {
  const summaryContent = summary.hasSimulation
    ? renderParameters(summary.parameterSets) +
      renderTreatments(summary.treatments) +
      renderOutputs(summary.outputs)
    : renderEmptyState();

  const panels =
    `<div class="panel" id="panel-results">${summaryContent}</div>` +
    (summary.model ? `<div class="panel" id="panel-model">${renderModel(summary.model)}</div>` : "");

  const body = `  ${renderTabState(summary)}
  <div class="brand-rule"></div>
  <header>
    <div class="title-row">
      <h1>${escapeHtml(summary.name)}</h1><span class="brand">${escapeHtml(TOOL.label)}</span>
      ${renderOpenButton(summary.projectUri)}
    </div>
    <div class="path">${escapeHtml(summary.path)}</div>
    ${renderNav(summary)}
  </header>
  <main>${panels}</main>`;

  return renderDocument(summary.name, assets, body);
}
