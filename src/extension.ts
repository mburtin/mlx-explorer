import * as vscode from "vscode";
import {
  editModel,
  openDataExplorer,
  openInApp,
  openInFolder,
  openRunIndexPage,
  openRunPage,
  openSummaryPage,
} from "./commands";
import { ExportOptions } from "./common/exportLink";
import { exportTable } from "./exportTable";
import { applyProjectFix } from "./projectSettings";
import { isRunNode, ProjectsProvider, TreeNode } from "./projectsTree";
import { createGroup, editRunIndex } from "./runIndex";
import { TOOLS } from "./modules";

interface ToolView {
  readonly provider: ProjectsProvider;
  readonly view: vscode.TreeView<TreeNode>;
}

async function moveSelection(
  toolViews: ReadonlyMap<string, ToolView>,
  args: { toolId: string; delta: number }
): Promise<void> {
  const entry = toolViews.get(args.toolId);
  if (!entry) {
    return;
  }

  const items = await entry.provider.runNodes();
  if (items.length === 0) {
    return;
  }

  const current = entry.view.selection[0];
  const currentIndex =
    current !== undefined && isRunNode(current)
      ? items.findIndex((node) => node.uri.toString() === current.uri.toString())
      : -1;
  const nextIndex = Math.min(Math.max(currentIndex + args.delta, 0), items.length - 1);

  await entry.view.reveal(items[nextIndex], { select: true, focus: true, expand: true });
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
      dragAndDropController: provider,
      canSelectMany: true,
    });
    toolViews.set(tool.id, { provider, view });

    // An edited file can gain or lose the section that identifies it as a project:
    // we also listen to onDidChange
    const watcher = vscode.workspace.createFileSystemWatcher(tool.glob);
    context.subscriptions.push(
      view,
      view.onDidChangeSelection((e) => {
        // A multi-selection is for dragging runs to a group: only a single run opens
        const node = e.selection.length === 1 ? e.selection[0] : undefined;
        if (node !== undefined && isRunNode(node)) {
          vscode.commands.executeCommand(tool.openCommand, node.uri);
        }
      }),
      vscode.commands.registerCommand(`mlx-explorer.${tool.id}.showRunIndex`, () =>
        openRunIndexPage(context.extensionUri, tool)
      ),
      vscode.commands.registerCommand(
        `mlx-explorer.${tool.id}.createGroup`,
        async (node?: TreeNode) => {
          await createGroup(tool, node?.kind === "group" ? node.group : undefined);
          provider.refresh();
        }
      ),
      watcher,
      watcher.onDidCreate(() => provider.refresh()),
      watcher.onDidDelete(() => provider.refresh()),
      watcher.onDidChange(() => provider.refresh())
    );
  }

  // Refresh all project lists so every view stays up to date
  const refreshAll = () => providers.forEach((provider) => provider.refresh());

  // Groups and descriptions are hand-edited too: keep both trees in step with the file
  const runIndexWatcher = vscode.workspace.createFileSystemWatcher("**/mlx-runs.json");

  context.subscriptions.push(
    vscode.commands.registerCommand("mlx-explorer.refreshProjects", refreshAll),
    runIndexWatcher,
    runIndexWatcher.onDidCreate(refreshAll),
    runIndexWatcher.onDidChange(refreshAll),
    runIndexWatcher.onDidDelete(refreshAll),
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
    vscode.commands.registerCommand("mlx-explorer.editModel", editModel),
    vscode.commands.registerCommand("mlx-explorer.editRunIndex", editRunIndex),
    vscode.commands.registerCommand(
      "mlx-explorer.exportTable",
      (projectUri: string, section: string, setName?: string | null, options?: ExportOptions) =>
        exportTable(context.extensionUri, projectUri, section, setName ?? undefined, options)
    ),
    vscode.commands.registerCommand(
      "mlx-explorer.moveSelection",
      (args: { toolId: string; delta: number }) => moveSelection(toolViews, args)
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(refreshAll)
  );
}

export function deactivate(): void {}
