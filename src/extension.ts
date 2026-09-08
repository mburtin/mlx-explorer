import * as vscode from "vscode";
import { openDataExplorer, openInApp, openInFolder, openRunPage, openSummaryPage } from "./commands";
import { applyProjectFix } from "./projectSettings";
import { ProjectsProvider } from "./projectsTree";
import { TOOLS } from "./modules";

interface ToolView {
  readonly provider: ProjectsProvider;
  readonly view: vscode.TreeView<vscode.Uri>;
}

async function moveSelection(
  toolViews: ReadonlyMap<string, ToolView>,
  args: { toolId: string; delta: number }
): Promise<void> {
  const entry = toolViews.get(args.toolId);
  if (!entry) {
    return;
  }

  const items = await entry.provider.getChildren();
  if (items.length === 0) {
    return;
  }

  const current = entry.view.selection[0];
  const currentIndex = current
    ? items.findIndex((uri) => uri.toString() === current.toString())
    : -1;
  const nextIndex = Math.min(Math.max(currentIndex + args.delta, 0), items.length - 1);

  await entry.view.reveal(items[nextIndex], { select: true, focus: true });
}

export function activate(context: vscode.ExtensionContext): void {
  const providers: ProjectsProvider[] = [];
  const toolViews = new Map<string, ToolView>();

  for (const tool of TOOLS) {
    const provider = new ProjectsProvider(tool);
    providers.push(provider);

    // createTreeView (rather than registerTreeDataProvider) gives us
    // onDidChangeSelection, which fires on click, Enter, and the arrow-key
    // handling registered below.
    const view = vscode.window.createTreeView(`mlx-explorer.${tool.id}`, {
      treeDataProvider: provider,
    });
    toolViews.set(tool.id, { provider, view });

    // An edited file can gain or lose the section that identifies it as a project:
    // we also listen to onDidChange
    const watcher = vscode.workspace.createFileSystemWatcher(tool.glob);
    context.subscriptions.push(
      view,
      view.onDidChangeSelection((e) => {
        const uri = e.selection[0];
        if (uri) {
          vscode.commands.executeCommand(tool.openCommand, uri);
        }
      }),
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
    vscode.commands.registerCommand("mlx-explorer.openInFolder", openInFolder),
    vscode.commands.registerCommand("mlx-explorer.applyProjectFix", applyProjectFix),
    vscode.commands.registerCommand("mlx-explorer.openData", openDataExplorer),
    vscode.commands.registerCommand(
      "mlx-explorer.moveSelection",
      (args: { toolId: string; delta: number }) => moveSelection(toolViews, args)
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(refreshAll)
  );
}

export function deactivate(): void {}
