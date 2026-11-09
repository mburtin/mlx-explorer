/**
 * Renaming a run touches more than its project file: MonolixSuite names the run folder,
 * the sidecar files and the copy in `.Internals` after the project, and the project itself
 * points at paths inside that folder. They are all renamed together, then the run's entry
 * in mlx-runs.json follows.
 */

import * as path from "path";
import * as vscode from "vscode";
import { exists, readText, writeText } from "./common/files";
import { quotedValue, replaceFolderPath, replaceQuotedValue } from "./common/mlxtran";
import { runFolder, Tool, toolFor } from "./modules";
import { RunNode } from "./projectsTree";
import { renameRunKey, runKey } from "./runIndex";

// Monolix keeps its sidecar next to the project, Simulx stores it inside the run folder
const SIDECAR_SUFFIXES = [".mlxproperties", ".smlxproperties"];

interface Move {
  readonly from: vscode.Uri;
  readonly to: vscode.Uri;
}

interface Sidecar {
  readonly uri: vscode.Uri;
  readonly suffix: string;
}

interface RenamePlan {
  readonly moves: Move[];
  // True when the run folder carries the project's name and has to move with it
  readonly renamesFolder: boolean;
  readonly newProjectUri: vscode.Uri;
  readonly oldRunUri: vscode.Uri;
  readonly newRunUri: vscode.Uri;
  // The renamed .Internals copy, when the run has one
  readonly copyUri?: vscode.Uri;
}

// A case-only rename is how a name is fixed on macOS and Windows
const CASE_INSENSITIVE = process.platform === "darwin" || process.platform === "win32";

function samePath(a: vscode.Uri, b: vscode.Uri): boolean {
  return CASE_INSENSITIVE
    ? a.fsPath.toLowerCase() === b.fsPath.toLowerCase()
    : a.fsPath === b.fsPath;
}

// Renames one entry. A case-only rename goes through a temporary name: on a
// case-insensitive disk the target already exists, as it is the same entry.
async function move(from: vscode.Uri, to: vscode.Uri): Promise<void> {
  if (from.fsPath === to.fsPath) {
    return;
  }
  if (!samePath(from, to)) {
    await vscode.workspace.fs.rename(from, to, { overwrite: false });
    return;
  }

  const temp = vscode.Uri.joinPath(
    from,
    "..",
    `.mlx-rename-${Date.now()}-${path.basename(from.fsPath)}`
  );
  await vscode.workspace.fs.rename(from, temp, { overwrite: false });
  await vscode.workspace.fs.rename(temp, to, { overwrite: false });
}

function validate(value: string, current: string): string | undefined {
  const name = value.trim();
  if (name === "" || name === "." || name === "..") {
    return "Enter a name for the run.";
  }
  if (/[\\/:*?"<>|']/.test(name)) {
    return "A run name cannot contain \\ / : * ? \" < > | or '.";
  }
  if (name === current) {
    return "The run already has this name.";
  }
  return undefined;
}

async function sidecars(dir: vscode.Uri, base: string): Promise<Sidecar[]> {
  const found: Sidecar[] = [];
  for (const suffix of SIDECAR_SUFFIXES) {
    const uri = vscode.Uri.joinPath(dir, `${base}${suffix}`);
    if (await exists(uri)) {
      found.push({ uri, suffix });
    }
  }
  return found;
}

async function askName(oldBase: string, tool: Tool): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({
    title: `Rename ${tool.label} run`,
    prompt: "New name for the project file and its run folder",
    value: oldBase,
    valueSelection: [0, oldBase.length],
    validateInput: (value) => validate(value, oldBase),
  });
  return name?.trim();
}

// Every file and folder the rename moves, in the order they have to be renamed
async function plan(
  projectUri: vscode.Uri,
  content: string,
  tool: Tool,
  oldBase: string,
  newBase: string
): Promise<RenamePlan> {
  const projectDir = vscode.Uri.joinPath(projectUri, "..");
  const newProjectUri = vscode.Uri.joinPath(projectDir, `${newBase}${tool.extension}`);
  const { uri: oldRunUri } = runFolder(projectUri, content, tool);
  // The run folder follows the project's name unless exportpath points elsewhere. A
  // folder holding the project itself is left alone: moving it would move the project too.
  const holdsProject = projectDir.fsPath.startsWith(`${oldRunUri.fsPath}${path.sep}`);
  const renamesFolder =
    !holdsProject && oldRunUri.fsPath !== projectDir.fsPath &&
    path.basename(oldRunUri.fsPath) === oldBase;
  const newRunUri = renamesFolder ? vscode.Uri.joinPath(oldRunUri, "..", newBase) : oldRunUri;

  const moves: Move[] = [{ from: projectUri, to: newProjectUri }];

  const folders: [vscode.Uri, vscode.Uri][] = [[projectDir, projectDir]];
  if (oldRunUri.fsPath !== projectDir.fsPath) {
    // Everything inside the run folder is renamed in place: the folder moves last
    folders.push([oldRunUri, oldRunUri]);
  }
  for (const [fromDir, toDir] of folders) {
    for (const sidecar of await sidecars(fromDir, oldBase)) {
      moves.push({
        from: sidecar.uri,
        to: vscode.Uri.joinPath(toDir, `${newBase}${sidecar.suffix}`),
      });
    }
  }

  const oldCopy = vscode.Uri.joinPath(oldRunUri, ".Internals", `${oldBase}${tool.extension}`);
  const hasCopy = await exists(oldCopy);
  if (hasCopy) {
    moves.push({
      from: oldCopy,
      to: vscode.Uri.joinPath(oldRunUri, ".Internals", `${newBase}${tool.extension}`),
    });
  }

  const movesFolder = renamesFolder && (await exists(oldRunUri));
  if (movesFolder) {
    moves.push({ from: oldRunUri, to: newRunUri });
  }

  const copyUri = hasCopy
    ? vscode.Uri.joinPath(
      movesFolder ? newRunUri : oldRunUri,
      ".Internals",
      `${newBase}${tool.extension}`
    )
    : undefined;

  return { moves, renamesFolder, newProjectUri, oldRunUri, newRunUri, copyUri };
}

// The exportpath value with its last segment renamed, keeping its prefix and separators
function renamedExportPath(value: string, oldBase: string, newBase: string): string {
  const escaped = oldBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(
    new RegExp(`(^|[/\\\\])${escaped}([/\\\\]*)$`),
    (_match, prefix: string, trailing: string) => `${prefix}${newBase}${trailing}`
  );
}

function repointExportPath(
  content: string,
  exportValue: string | undefined,
  oldBase: string,
  newBase: string
): string {
  if (exportValue === undefined) {
    return content;
  }
  const renamed = renamedExportPath(exportValue, oldBase, newBase);
  return renamed === exportValue
    ? content
    : replaceQuotedValue(content, "exportpath", renamed);
}

// Rewrites the paths the project and its .Internals copy hold for the renamed folder
async function rewrite(
  projectUri: vscode.Uri,
  content: string,
  oldBase: string,
  newBase: string,
  oldRunUri: vscode.Uri,
  newRunUri: vscode.Uri,
  copyUri: vscode.Uri | undefined
): Promise<void> {
  const projectDir = vscode.Uri.joinPath(projectUri, "..");
  // Paths are relative to the project file, except when the project writes absolute ones
  const updated = replaceFolderPath(
    replaceFolderPath(
      repointExportPath(content, quotedValue(content, "exportpath"), oldBase, newBase),
      path.relative(projectDir.fsPath, oldRunUri.fsPath),
      path.relative(projectDir.fsPath, newRunUri.fsPath)
    ),
    oldRunUri.fsPath,
    newRunUri.fsPath
  );
  if (updated !== content) {
    await writeText(projectUri, updated);
  }

  const copy = copyUri === undefined ? undefined : await readText(copyUri);
  if (copyUri === undefined || copy === undefined) {
    return;
  }
  // The copy sits in .Internals: its relative paths survive the folder rename, but an
  // absolute exportpath or file path still names the old folder
  const copyDir = vscode.Uri.joinPath(copyUri, "..");
  const synced = replaceFolderPath(
    replaceFolderPath(
      repointExportPath(copy, quotedValue(copy, "exportpath"), oldBase, newBase),
      path.relative(copyDir.fsPath, oldRunUri.fsPath),
      path.relative(copyDir.fsPath, newRunUri.fsPath)
    ),
    oldRunUri.fsPath,
    newRunUri.fsPath
  );
  if (synced !== copy) {
    await writeText(copyUri, synced);
  }
}

export async function renameRun(node: RunNode): Promise<void> {
  const projectUri = node.uri;
  const tool = toolFor(projectUri);
  const content = tool === undefined ? undefined : await readText(projectUri);
  if (tool === undefined || content === undefined) {
    vscode.window.showErrorMessage(
      `Cannot read ${path.basename(projectUri.fsPath)} as a MonolixSuite project.`
    );
    return;
  }

  const oldBase = path.basename(projectUri.fsPath, tool.extension);
  const newBase = await askName(oldBase, tool);
  if (newBase === undefined || newBase === oldBase) {
    return;
  }

  const rename = await plan(projectUri, content, tool, oldBase, newBase);
  for (const { from, to } of rename.moves) {
    if (!samePath(from, to) && (await exists(to))) {
      vscode.window.showErrorMessage(
        `Cannot rename the run to "${newBase}": "${path.basename(to.fsPath)}" already exists.`
      );
      return;
    }
  }

  try {
    for (const { from, to } of rename.moves) {
      await move(from, to);
    }
    if (rename.renamesFolder) {
      await rewrite(
        rename.newProjectUri,
        content,
        oldBase,
        newBase,
        rename.oldRunUri,
        rename.newRunUri,
        rename.copyUri
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Could not rename the run: ${error}`);
    return;
  }

  try {
    await renameRunKey(runKey(projectUri), runKey(rename.newProjectUri));
  } catch (error) {
    vscode.window.showWarningMessage(
      `Renamed the run, but its entry in mlx-runs.json could not be updated: ${error}`
    );
    return;
  }

  vscode.window.showInformationMessage(`Renamed "${oldBase}" to "${newBase}".`);
}
