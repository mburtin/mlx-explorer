import * as path from "path";
import * as vscode from "vscode";
import { readText, scanProjects } from "./common/files";
import { Tool } from "./modules";
import { alertText, readSettings } from "./projectSettings";
import {
  ARCHIVE_GROUP,
  isArchived,
  moveRunToGroup,
  readRunIndex,
  RunSection,
  runKey,
  RunSections,
  sectionsFor,
} from "./runIndex";

export interface GroupNode {
  readonly kind: "group";
  readonly label: string;
  readonly section: RunSection["kind"];
  // Name of the group in mlx-runs.json, for the kind "group"
  readonly group?: string;
  readonly count: number;
}

export interface RunNode {
  readonly kind: "run";
  readonly uri: vscode.Uri;
  // The group the run is listed in; undefined for a run listed without a section
  readonly parent?: GroupNode;
}

export type TreeNode = GroupNode | RunNode;

export function isRunNode(node: TreeNode): node is RunNode {
  return node.kind === "run";
}

function sectionNode(section: RunSection): GroupNode {
  return {
    kind: "group",
    label: section.name,
    section: section.kind,
    group: section.group,
    count: section.runs.length,
  };
}

// The group a drop lands in: the group itself, or the group holding the run it is dropped on
function destinationOf(node: TreeNode): { group?: string; archive: boolean } {
  if (node.kind === "group") {
    return { group: node.group, archive: node.section === "archive" };
  }
  return { group: node.parent?.group, archive: node.parent?.section === "archive" };
}

const TREE_MIME = "application/vnd.code.tree.";

// Build the project sidebar. One view per tool, split into the groups of mlx-runs.json.
// Dragging a run onto a group moves it there.
export class ProjectsProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.TreeDragAndDropController<TreeNode>
{
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  readonly dragMimeTypes: readonly string[];
  readonly dropMimeTypes: readonly string[];

  private snapshot?: Promise<RunSections>;

  constructor(private readonly tool: Tool) {
    const mime = `${TREE_MIME}${tool.id}`;
    this.dragMimeTypes = [mime];
    this.dropMimeTypes = [mime];
  }

  refresh(): void {
    this.snapshot = undefined;
    this.changed.fire();
  }

  private scan(): Promise<RunSections> {
    this.snapshot ??= (async () => {
      const [runs, index] = await Promise.all([
        scanProjects(this.tool.glob, this.tool.identifies),
        readRunIndex(),
      ]);
      return sectionsFor(this.tool, runs, index);
    })();
    return this.snapshot;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    const { grouped, sections } = await this.scan();
    if (element === undefined) {
      if (grouped) {
        return sections.map((section) => sectionNode(section));
      }
      // No group declared: the runs stay a flat list, with the archive below it
      const ungrouped = sections.find((section) => section.kind === "ungrouped");
      const runs = (ungrouped?.runs ?? []).map((uri) => ({ kind: "run" as const, uri }));
      const archived = sections
        .filter((section) => section.kind === "archive")
        .map((section) => sectionNode(section));
      return [...runs, ...archived];
    }
    if (element.kind === "run") {
      return [];
    }

    const section = sections.find(
      (candidate) => candidate.kind === element.section && candidate.group === element.group
    );
    return (section?.runs ?? []).map((uri) => ({ kind: "run" as const, uri, parent: element }));
  }

  // Every run in display order, for the up/down keyboard navigation
  async runNodes(): Promise<RunNode[]> {
    const { sections } = await this.scan();
    return sections.flatMap((section) => {
      const parent = sectionNode(section);
      return section.runs.map((uri) => ({ kind: "run" as const, uri, parent }));
    });
  }

  // Run nodes remember their group, so revealing one expands the right ancestors
  getParent(element: TreeNode): GroupNode | undefined {
    return element.kind === "run" ? element.parent : undefined;
  }

  async getTreeItem(element: TreeNode): Promise<vscode.TreeItem> {
    if (element.kind === "group") {
      const icon =
        element.section === "archive" ? "archive"
          : element.section === "ungrouped" ? "list-unordered"
            : "folder";
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = element.group === undefined ? element.section : `group:${element.group}`;
      item.contextValue = `${this.tool.id}Group`;
      item.description = String(element.count);
      item.iconPath = new vscode.ThemeIcon(icon);
      return item;
    }

    // resourceUri provides the theme icon and the tooltip (full path on hover).
    const item = new vscode.TreeItem(element.uri, vscode.TreeItemCollapsibleState.None);
    item.label = path.basename(element.uri.fsPath, this.tool.extension);
    item.contextValue = `${this.tool.id}Project`;
    // Without an explicit id, VS Code derives one from the label
    item.id = element.uri.toString();

    // Flags the runs whose files sit outside the run: the fix is offered on the run page.
    const alert = alertText(await readSettings(element.uri, await readText(element.uri), this.tool));
    if (alert !== undefined) {
      item.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("problemsWarningIcon.foreground")
      );
      item.tooltip = `${element.uri.fsPath}\n${alert}`;
    }
    return item;
  }

  handleDrag(source: readonly TreeNode[], dataTransfer: vscode.DataTransfer): void {
    const keys = source.filter(isRunNode).map((node) => runKey(node.uri));
    if (keys.length > 0) {
      dataTransfer.set(this.dragMimeTypes[0], new vscode.DataTransferItem(keys));
    }
  }

  async handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const value = dataTransfer.get(this.dropMimeTypes[0])?.value as unknown;
    const keys = Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : [];
    if (keys.length === 0) {
      return;
    }

    // Dropped on the view's background: the runs leave every group
    const destination = target === undefined ? undefined : destinationOf(target);
    if (destination?.archive) {
      vscode.window.showWarningMessage(`Runs under an ${ARCHIVE_GROUP.toLowerCase()} folder stay in the ${ARCHIVE_GROUP} group.`);
      return;
    }

    for (const key of keys) {
      if (isArchived(key)) {
        vscode.window.showWarningMessage(`"${key}" is archived: it stays in the ${ARCHIVE_GROUP} group.`);
        continue;
      }
      const moved = await moveRunToGroup(this.tool, key, destination?.group);
      if (moved.error !== undefined) {
        vscode.window.showErrorMessage(moved.error);
        break;
      }
    }
    this.refresh();
  }
}
