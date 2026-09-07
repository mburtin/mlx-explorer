import * as vscode from "vscode";
import { showPanel, WebviewAssets } from "./common/webview";
import { renderRunPage, STYLESHEETS } from "./modules/monolix/page";
import { readRun } from "./modules/monolix/run";

// Converts the module's stylesheet names into webview-safe resource URIs
function assetsFor(webview: vscode.Webview, extensionUri: vscode.Uri): WebviewAssets {
  return {
    cspSource: webview.cspSource,
    styles: STYLESHEETS.map((name) =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "styles", name)).toString()
    ),
  };
}

// Opens the run page for a project
export async function openRunPage(
  extensionUri: vscode.Uri,
  projectUri: vscode.Uri
): Promise<void> {
  const run = await readRun(projectUri);

  const panel = showPanel(projectUri.toString(), () =>
    vscode.window.createWebviewPanel("mlxSuite.run", run.name, vscode.ViewColumn.Active, {
      enableFindWidget: true,
      enableCommandUris: ["mlxSuite.openInApp", "mlxSuite.openData"],
      // The stylesheets live in styles/: nothing else is reachable from the page.
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "styles")],
    })
  );

  panel.webview.html = renderRunPage(run, assetsFor(panel.webview, extensionUri));
}

// Command to open a csv file in the data explorer of Positron
export async function openDataExplorer(target: unknown): Promise<void> {
  await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(String(target)));
}

// Command to open a run in the mlxSuite apps
export async function openInApp(target: unknown): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(String(target)));
}
