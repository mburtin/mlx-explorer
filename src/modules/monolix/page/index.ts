import { escapeHtml, renderDocument, WebviewAssets } from "../../../common/webview";
import { Run } from "../run";
import { TOOL } from "../project";
import { renderModel } from "./modelTab";
import { renderResults } from "./resultsTab";
import { renderSettings } from "../../../projectSettings";

/** 
 * Define stylesheets needed by the page. A module declares its own list: 
 * theme, layout, cards and tables are the shared look, matrix is the only one specific
 */
export const STYLESHEETS = [
  "theme.css",
  "layout.css",
  "cards.css",
  "tables.css",
  "settings.css",
  "matrix.css",
];

function renderOpenButton(projectUri: string): string {
  // Command-uri link: the CSP here forbids scripts
  const href = `command:mlx-explorer.openInApp?${encodeURIComponent(JSON.stringify([projectUri]))}`;
  return `<a class="btn-open" href="${escapeHtml(href)}">Open in ${escapeHtml(TOOL.label)}</a>`;
}

function renderTabState(run: Run, active: string): string {
  const radio = (id: string) =>
    `<input type="radio" name="tab" id="tab-${id}" class="tab-state"` +
    `${active === id ? " checked" : ""}>`;
  return radio("results") + (run.model ? radio("model") : "") + radio("settings");
}

// Data section is a link, not a panel. We used Positron data explorer
function renderNav(run: Run): string {
  const tabs = ['<label class="tab" for="tab-results">Results</label>'];
  if (run.dataUri) {
    // Command uris carry JSON arguments, so the dataset URI need to be a string
    const args = encodeURIComponent(JSON.stringify([run.dataUri]));
    tabs.push(
      `<a class="tab" href="${escapeHtml(`command:mlx-explorer.openData?${args}`)}">Data</a>`
    );
  }
  if (run.model) {
    tabs.push('<label class="tab" for="tab-model">Model</label>');
  }
  tabs.push('<label class="tab" for="tab-settings">Settings</label>');
  return `<nav>${tabs.join("")}</nav>`;
}

export function renderRunPage(run: Run, assets: WebviewAssets, active = "results"): string {
  const panels =
    `<div class="panel" id="panel-results">${renderResults(run.results, run.resultsPath)}</div>` +
    (run.model ? `<div class="panel" id="panel-model">${renderModel(run.model)}</div>` : "") +
    `<div class="panel" id="panel-settings">${renderSettings(run.settings)}</div>`;

  const body = `  ${renderTabState(run, active)}
  <div class="brand-rule"></div>
  <header>
    <div class="title-row">
      <h1>${escapeHtml(run.name)}</h1><span class="brand">${escapeHtml(TOOL.label)}</span>
      ${renderOpenButton(run.projectUri)}
    </div>
    <div class="path">${escapeHtml(run.resultsPath)}</div>
    ${renderNav(run)}
  </header>
  <main>${panels}</main>`;

  return renderDocument(run.name, assets, body);
}
