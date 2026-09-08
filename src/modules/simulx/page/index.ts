import { escapeHtml, renderDocument, WebviewAssets } from "../../../common/webview";
import { TOOL } from "../project";
import { Summary } from "../summary";
import { renderModel } from "./modelTab";
import { renderOutputs } from "./outputsSection";
import { renderParameters } from "./parametersSection";
import { renderTreatments } from "./treatmentsSection";
import { renderSettings } from "../../../projectSettings";

export const STYLESHEETS = [
  "theme.css",
  "simulx-theme.css",
  "layout.css",
  "cards.css",
  "tables.css",
  "settings.css",
];

function renderOpenButton(projectUri: string): string {
  const href = `command:mlx-explorer.openInApp?${encodeURIComponent(JSON.stringify([projectUri]))}`;
  return `<a class="btn-open" href="${escapeHtml(href)}">Open in ${escapeHtml(TOOL.label)}</a>`;
}

function renderEmptyState(): string {
  return `<section class="card empty-state">
    <div>No Simulation group defined in this project.</div>
  </section>`;
}

function renderTabState(summary: Summary, active: string): string {
  const radio = (id: string) =>
    `<input type="radio" name="tab" id="tab-${id}" class="tab-state"` +
    `${active === id ? " checked" : ""}>`;
  return radio("results") + (summary.model ? radio("model") : "") + radio("settings");
}

// Data is a link, not a panel. We use Positron DataExplorer to render it.
function renderNav(summary: Summary): string {
  const tabs = ['<label class="tab" for="tab-results">Summary</label>'];
  if (summary.dataUri) {
    // Command uris carry JSON arguments, so the dataset URI need to be a string
    const args = encodeURIComponent(JSON.stringify([summary.dataUri]));
    tabs.push(
      `<a class="tab" href="${escapeHtml(`command:mlx-explorer.openData?${args}`)}">Data</a>`
    );
  }
  if (summary.model) {
    tabs.push('<label class="tab" for="tab-model">Model</label>');
  }
  tabs.push('<label class="tab" for="tab-settings">Settings</label>');
  return `<nav>${tabs.join("")}</nav>`;
}

export function renderSummaryPage(
  summary: Summary,
  assets: WebviewAssets,
  active = "results"
): string {
  const summaryContent = summary.hasSimulation
    ? renderParameters(summary.parameterSets) +
      renderTreatments(summary.treatments) +
      renderOutputs(summary.outputs)
    : renderEmptyState();

  const panels =
    `<div class="panel" id="panel-results">${summaryContent}</div>` +
    (summary.model ? `<div class="panel" id="panel-model">${renderModel(summary.model)}</div>` : "") +
    `<div class="panel" id="panel-settings">${renderSettings(summary.settings)}</div>`;

  const body = `  ${renderTabState(summary, active)}
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
