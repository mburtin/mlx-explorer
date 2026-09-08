import * as path from "path";
import * as vscode from "vscode";
import { scanProjects } from "./common/files";
import { Tool } from "./modules";

// Build the project sidebar. One view per tool
export class ProjectsProvider implements vscode.TreeDataProvider<vscode.Uri> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly tool: Tool) {}

  refresh(): void {
    this.changed.fire();
  }

  getChildren(element?: vscode.Uri): Thenable<vscode.Uri[]> {
    return element ? Promise.resolve([]) : scanProjects(this.tool.glob, this.tool.identifies);
  }

  getTreeItem(uri: vscode.Uri): vscode.TreeItem {
    // resourceUri provides the theme icon and the tooltip (full path on hover).
    const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
    item.label = path.basename(uri.fsPath, this.tool.extension);
    item.contextValue = `${this.tool.id}Project`;
    return item;
  }
}
