import * as path from "path";
import * as vscode from "vscode";
import { exists, readText, scanProjects } from "./common/files";
import { showPanel, WebviewAssets } from "./common/webview";
import { runFolder, Tool, toolFor } from "./modules";
import { renderRunPage, STYLESHEETS as MONOLIX_STYLESHEETS } from "./modules/monolix/page";
import { readRun, Run } from "./modules/monolix/run";
import { renderSummaryPage, STYLESHEETS as SIMULX_STYLESHEETS } from "./modules/simulx/page";
import { readSummary, Summary } from "./modules/simulx/summary";
import {
  readRunIndex,
  renderRunIndexPage,
  runIndexUri,
  stylesheets as runIndexStylesheets,
  syncRunIndex,
} from "./runIndex";

// List UIR commands
const COMMAND_URIS = [
  "mlx-explorer.openInApp",
  "mlx-explorer.openData",
  "mlx-explorer.applyProjectFix",
  "mlx-explorer.exportTable",
  "mlx-explorer.editModel",
];

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

  const panel = showPanel("mlx-explorer.run", () =>
    vscode.window.createWebviewPanel(
      "mlx-explorer.run",
      run.name,
      // preserveFocus keeps keyboard focus on the sidebar tree so arrow-key
      // navigation between runs keeps working after one is opened.
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
      {
        enableFindWidget: true,
        enableCommandUris: COMMAND_URIS,
        // The stylesheets live in styles/: nothing else is reachable from the page.
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "styles")],
      }
    )
  );

  showRun(panel, extensionUri, projectUri, run, activeTab);
}

function showRun(
  panel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
  projectUri: vscode.Uri,
  run: Run,
  activeTab?: string
): void {
  panel.title = run.name;
  panel.webview.html = renderRunPage(
    run,
    assetsFor(panel.webview, extensionUri, MONOLIX_STYLESHEETS),
    activeTab
  );
  watchModel(panel, run.model?.uri, async () =>
    showRun(panel, extensionUri, projectUri, await readRun(projectUri), "model")
  );
}

// Opens the summary page for a Simulx project
export async function openSummaryPage(
  extensionUri: vscode.Uri,
  projectUri: vscode.Uri,
  activeTab?: string
): Promise<void> {
  const summary = await readSummary(projectUri);

  const panel = showPanel("mlx-explorer.summary", () =>
    vscode.window.createWebviewPanel(
      "mlx-explorer.summary",
      summary.name,
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
      {
        enableFindWidget: true,
        enableCommandUris: COMMAND_URIS,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "styles")],
      }
    )
  );

  showSummary(panel, extensionUri, projectUri, summary, activeTab);
}

function showSummary(
  panel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
  projectUri: vscode.Uri,
  summary: Summary,
  activeTab?: string
): void {
  panel.title = summary.name;
  panel.webview.html = renderSummaryPage(
    summary,
    assetsFor(panel.webview, extensionUri, SIMULX_STYLESHEETS),
    activeTab
  );
  watchModel(panel, summary.model?.uri, async () =>
    showSummary(panel, extensionUri, projectUri, await readSummary(projectUri), "model")
  );
}

// Opens the page listing a tool's runs with the descriptions from mlx-runs.json
export async function openRunIndexPage(extensionUri: vscode.Uri, tool: Tool): Promise<void> {
  const panel = showPanel("mlx-explorer.runIndex", () =>
    vscode.window.createWebviewPanel(
      "mlx-explorer.runIndex",
      `${tool.label} runs`,
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
      {
        enableFindWidget: true,
        enableCommandUris: ["mlx-explorer.editRunIndex"],
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "styles")],
      }
    )
  );

  const render = async () => {
    const [runs, index] = await Promise.all([
      scanProjects(tool.glob, tool.identifies),
      readRunIndex(),
    ]);
    const synced = await syncRunIndex(tool, runs, index);
    panel.title = `${tool.label} runs`;
    panel.webview.html = renderRunIndexPage(
      tool,
      runs,
      synced,
      assetsFor(panel.webview, extensionUri, runIndexStylesheets(tool))
    );
  };
  await render();
  watchModel(panel, runIndexUri()?.toString(), render);
}

// A panel's model watcher, replaced on every render: the panel may now show another project
const modelWatchers = new WeakMap<vscode.WebviewPanel, vscode.Disposable | undefined>();

// Re-renders the panel when its model file changes, saved from Positron or from the app.
// The page has no script to report its open tab, so it comes back on the Model tab.
function watchModel(
  panel: vscode.WebviewPanel,
  modelUri: string | undefined,
  rerender: () => Promise<void>
): void {
  if (!modelWatchers.has(panel)) {
    panel.onDidDispose(() => modelWatchers.get(panel)?.dispose());
  }
  modelWatchers.get(panel)?.dispose();
  modelWatchers.set(panel, undefined);
  if (modelUri === undefined) {
    return;
  }

  const uri = vscode.Uri.parse(modelUri);
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.joinPath(uri, ".."), path.basename(uri.path))
  );
  watcher.onDidChange(rerender);
  watcher.onDidCreate(rerender);
  modelWatchers.set(panel, watcher);
}

// Command to open a csv file in the data explorer of Positron
export async function openDataExplorer(target: unknown): Promise<void> {
  await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(String(target)));
}

// Command to open a run in the mlxSuite apps
export async function openInApp(target: unknown): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(String(target)));
}

// Command to reveal a run's results folder (predictions, charts, ...) in the OS file explorer
export async function openInFolder(target: unknown): Promise<void> {
  const projectUri = vscode.Uri.parse(String(target));
  const tool = toolFor(projectUri);
  const results = tool === undefined
    ? undefined
    : runFolder(projectUri, await readText(projectUri), tool).uri;

  if (results !== undefined && (await exists(results))) {
    // Opens the folder itself, rather than just selecting it in its parent.
    await vscode.env.openExternal(results);
  } else {
    // Not run yet, or the results were moved: fall back to revealing the project file.
    await vscode.commands.executeCommand("revealFileInOS", projectUri);
  }
}

// Command to open a model file beside the page, as Mlxtran: model files are plain .txt
export async function editModel(target: unknown): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(String(target)));
  await vscode.languages.setTextDocumentLanguage(document, "mlxtran");
  await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
}
