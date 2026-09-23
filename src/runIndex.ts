import * as path from "path";
import * as vscode from "vscode";
import { exists, readText, scanProjects, writeText } from "./common/files";
import { escapeHtml, renderDocument, stripe, WebviewAssets } from "./common/webview";
import { Tool, TOOLS } from "./modules";

// Simulx swaps the blue accent for its orange, as on its summary page
export function stylesheets(tool: Tool): string[] {
  const theme = tool.id === "simulx" ? ["theme.css", "simulx-theme.css"] : ["theme.css"];
  return [...theme, "layout.css", "cards.css", "tables.css"];
}

export interface RunIndex {
  // One block per tool id, each keyed on the project path
  readonly entries: Record<string, Record<string, string> | undefined>;
  readonly error?: string;
}

// Hand-written by the user, keyed on the project path relative to the workspace
export function runIndexUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder && vscode.Uri.joinPath(folder.uri, "mlx-runs.json");
}

export function runKey(projectUri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(projectUri, false);
}

export async function readRunIndex(): Promise<RunIndex> {
  const uri = runIndexUri();
  const text = uri && (await readText(uri));
  if (text === undefined) {
    return { entries: {} };
  }
  try {
    const entries = JSON.parse(text);
    if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
      return { entries: {}, error: "mlx-runs.json must be an object with a \"monolix\" and a \"simulx\" block." };
    }
    return { entries };
  } catch (error) {
    return { entries: {}, error: `mlx-runs.json is not valid JSON: ${(error as Error).message}` };
  }
}

export function renderRunIndexPage(
  tool: Tool,
  runs: readonly vscode.Uri[],
  index: RunIndex,
  assets: WebviewAssets
): string {
  const rows = runs
    .map((uri, i) => {
      const name = path.basename(uri.fsPath, tool.extension);
      const description = index.entries[tool.id]?.[runKey(uri)];
      const cell = typeof description === "string" && description !== ""
        ? `<td>${escapeHtml(description)}</td>`
        : '<td class="empty">—</td>';
      return `<tr${stripe(i)}><td title="${escapeHtml(runKey(uri))}">${escapeHtml(name)}</td>${cell}</tr>`;
    })
    .join("");

  const error = index.error
    ? `<section class="card empty-state"><div>${escapeHtml(index.error)}</div></section>`
    : "";
  const content = runs.length === 0
    ? `<section class="card empty-state"><div>No ${escapeHtml(tool.label)} project found.</div></section>`
    : `<section class="card">
      <div class="card-head"><h2>Descriptions</h2></div>
      <table>
        <thead><tr><th>Run</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;

  const title = `${tool.label} runs`;
  const body = `  <div class="brand-rule"></div>
  <header>
    <div class="title-row">
      <h1>Runs</h1><span class="brand">${escapeHtml(tool.label)}</span>
      <a class="btn-open" href="command:mlx-explorer.editRunIndex">Edit descriptions</a>
    </div>
  </header>
  <main><div class="panel" style="display: flex">${error}${content}</div></main>`;

  return renderDocument(title, assets, body);
}

// Opens mlx-runs.json, first creating it with an empty entry for every run found
export async function editRunIndex(): Promise<void> {
  const uri = runIndexUri();
  if (!uri) {
    vscode.window.showWarningMessage("Open a folder to describe its runs.");
    return;
  }

  if (!(await exists(uri))) {
    const entries: Record<string, Record<string, string>> = {};
    for (const tool of TOOLS) {
      entries[tool.id] = {};
      for (const project of await scanProjects(tool.glob, tool.identifies)) {
        entries[tool.id][runKey(project)] = "";
      }
    }
    await writeText(uri, JSON.stringify(entries, null, 2) + "\n");
  }

  await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside });
}
