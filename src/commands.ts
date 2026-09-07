import * as vscode from "vscode";
import { showPanel, WebviewAssets } from "./common/webview";
import { renderRunPage, STYLESHEETS as MONOLIX_STYLESHEETS } from "./modules/monolix/page";
import { readRun } from "./modules/monolix/run";
import { renderSummaryPage, STYLESHEETS as SIMULX_STYLESHEETS } from "./modules/simulx/page";
import { readSummary } from "./modules/simulx/summary";

// Converts a module's stylesheet names into webview-safe resource URIs
function assetsFor(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  stylesheets: readonly string[]
): WebviewAssets {
  return {
    cspSource: webview.cspSource,
    styles: stylesheets.map((name) =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "styles", name)).toString()
    ),
  };
}

// Opens the run page for a project
export async function openRunPage(
  extensionUri: vscode.Uri,
  projectUri: vscode.Uri,
  activeTab?: string
): Promise<void> {
  const run = await readRun(projectUri);

  const panel = showPanel(projectUri.toString(), () =>
    vscode.window.createWebviewPanel(
      "mlx-explorer.run",
      run.name,
      // preserveFocus keeps keyboard focus on the sidebar tree so arrow-key
      // navigation between runs keeps working after one is opened.
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
      {
        enableFindWidget: true,
        enableCommandUris: [
          "mlx-explorer.openInApp",
          "mlx-explorer.openData",
          "mlx-explorer.applyProjectFix",
        ],
        // The stylesheets live in styles/: nothing else is reachable from the page.
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "styles")],
      }
    )
  );

  panel.webview.html = renderRunPage(
    run,
    assetsFor(panel.webview, extensionUri, MONOLIX_STYLESHEETS),
    activeTab
  );
}

// Opens the summary page for a Simulx project
export async function openSummaryPage(
  extensionUri: vscode.Uri,
  projectUri: vscode.Uri,
  activeTab?: string
): Promise<void> {
  const summary = await readSummary(projectUri);

  const panel = showPanel(projectUri.toString(), () =>
    vscode.window.createWebviewPanel(
      "mlx-explorer.summary",
      summary.name,
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
      {
        enableFindWidget: true,
        enableCommandUris: [
          "mlx-explorer.openInApp",
          "mlx-explorer.openData",
          "mlx-explorer.applyProjectFix",
        ],
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "styles")],
      }
    )
  );

  panel.webview.html = renderSummaryPage(
    summary,
    assetsFor(panel.webview, extensionUri, SIMULX_STYLESHEETS),
    activeTab
  );
}

// Command to open a csv file in the data explorer of Positron
export async function openDataExplorer(target: unknown): Promise<void> {
  await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(String(target)));
}

// Command to open a run in the mlxSuite apps
export async function openInApp(target: unknown): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(String(target)));
}
