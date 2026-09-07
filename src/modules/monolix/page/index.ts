import { escapeHtml, renderDocument, WebviewAssets } from "../../../common/webview";
import { Run } from "../run";
import { TOOL } from "../project";
import { renderModel } from "./modelTab";
import { renderResults } from "./resultsTab";

/** 
 * Define stylesheets needed by the page. A module declares its own list: 
 * theme, layout, cards and tables are the shared look, matrix is the only one specific
 */
export const STYLESHEETS = [
  "theme.css",
  "layout.css",
  "cards.css",
  "tables.css",
  "matrix.css",
];

function renderOpenButton(projectUri: string): string {
  // Command-uri link: the CSP here forbids scripts
  const href = `command:mlxSuite.openInApp?${encodeURIComponent(JSON.stringify([projectUri]))}`;
  return `<a class="btn-open" href="${escapeHtml(href)}">Open in ${escapeHtml(TOOL.label)}</a>`;
}

function renderTabState(run: Run): string {
  return '<input type="radio" name="tab" id="tab-results" class="tab-state" checked>' +
    (run.model ? '<input type="radio" name="tab" id="tab-model" class="tab-state">' : "");
}

// Data section is a link, not a panel. We used Positron data explorer
function renderNav(run: Run): string {
  const tabs = ['<label class="tab" for="tab-results">Results</label>'];
  if (run.model) {
    tabs.push('<label class="tab" for="tab-model">Model</label>');
  }
  if (run.dataUri) {
    // Command uris carry JSON arguments, so the dataset URI need to be a string
    const args = encodeURIComponent(JSON.stringify([run.dataUri]));
    tabs.push(`<a class="tab" href="${escapeHtml(`command:mlxSuite.openData?${args}`)}">Data</a>`);
  }
  return `<nav>${tabs.join("")}</nav>`;
}

export function renderRunPage(run: Run, assets: WebviewAssets): string {
  const panels =
    `<div class="panel" id="panel-results">${renderResults(run.results, run.resultsPath)}</div>` +
    (run.model ? `<div class="panel" id="panel-model">${renderModel(run.model)}</div>` : "");

  const body = `  ${renderTabState(run)}
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
