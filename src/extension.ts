import * as vscode from "vscode";
import { openDataExplorer, openInApp, openRunPage, openSummaryPage } from "./commands";
import { applyProjectFix } from "./projectSettings";
import { ProjectsProvider } from "./projectsTree";
import { TOOLS } from "./modules";

export function activate(context: vscode.ExtensionContext): void {
  const providers: ProjectsProvider[] = [];

  for (const tool of TOOLS) {
    const provider = new ProjectsProvider(tool);
    providers.push(provider);

    // An edited file can gain or lose the section that identifies it as a project:
    // we also listen to onDidChange
    const watcher = vscode.workspace.createFileSystemWatcher(tool.glob);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider(`mlx-explorer.${tool.id}`, provider),
      watcher,
      watcher.onDidCreate(() => provider.refresh()),
      watcher.onDidDelete(() => provider.refresh()),
      watcher.onDidChange(() => provider.refresh())
    );
  }

  // Refresh all project lists so every view stays up to date
  const refreshAll = () => providers.forEach((provider) => provider.refresh());

  context.subscriptions.push(
    vscode.commands.registerCommand("mlx-explorer.refreshProjects", refreshAll),
    vscode.commands.registerCommand(
      "mlx-explorer.openRun",
      (projectUri: vscode.Uri, activeTab?: string) =>
        openRunPage(context.extensionUri, projectUri, activeTab)
    ),
    vscode.commands.registerCommand(
      "mlx-explorer.openSummary",
      (projectUri: vscode.Uri, activeTab?: string) =>
        openSummaryPage(context.extensionUri, projectUri, activeTab)
    ),
    vscode.commands.registerCommand("mlx-explorer.openInApp", openInApp),
    vscode.commands.registerCommand("mlx-explorer.applyProjectFix", applyProjectFix),
    vscode.commands.registerCommand("mlx-explorer.openData", openDataExplorer),
    vscode.workspace.onDidChangeWorkspaceFolders(refreshAll)
  );
}

export function deactivate(): void {}
