/**
 * The Settings tab: where a project keeps the files the user brought into it. MonolixSuite
 * can gather them inside the run - `ModelFile/`, `DataFile/`, `ExternalFiles/` - which is
 * what makes a run portable: move the folder and every reference still resolves. A project
 * that instead points at files scattered across the disk breaks as soon as it is shared,
 * and the Model and Data tabs vanish with them.
 *
 * The tab only reports; the Fix button behind it is the one thing here that writes.
 */

import * as path from "path";
import * as vscode from "vscode";
import { exists, readText, resolveProjectPath, writeText } from "./common/files";
import { replaceFileValue, setGlobalSetting } from "./common/mlxtran";
import { escapeHtml } from "./common/webview";
import { DeclaredFile, Tool, TOOLS } from "./modules";

/** MonolixSuite's own flag for this layout: set, the app keeps it on the next save. */
const FLAG = "userFilesNextToProject";

/** The tab the page opens on after a fix, so the run page comes back where it was left. */
const SETTINGS_TAB = "settings";

type State =
  /** Already inside the run, at the expected place. */
  | "placed"
  /** Elsewhere on disk, and copying it in is what Fix does. */
  | "misplaced"
  /** Declared but not on disk: there is nothing to copy. */
  | "missing"
  /** Another file already holds the name inside the run: never overwritten. */
  | "conflict";

interface Checked {
  file: DeclaredFile;
  state: State;
  source: vscode.Uri;
  target: vscode.Uri;
}

/** What the tab shows, read off disk once, before any HTML exists. */
export interface Settings {
  /** Command arguments travel as JSON, so the Fix button carries a string. */
  projectUri: string;
  /** Folder the run exports to, relative to the project folder. */
  runName: string;
  /** How many files the project points at at all. */
  declared: number;
  /** How many files Fix would gather. Zero leaves the button inert. */
  fixable: number;
  /** Files the project cannot reach, which Fix cannot help with. */
  unreachable: number;
}

/** Where the file would sit once gathered, and how it stands against that today. */
async function check(
  projectUri: vscode.Uri,
  runUri: vscode.Uri,
  file: DeclaredFile
): Promise<Checked> {
  const source = resolveProjectPath(projectUri, file.declared);
  const target = vscode.Uri.joinPath(runUri, file.folder, path.basename(file.declared));

  const state: State =
    source.fsPath === target.fsPath
      ? "placed"
      : !(await exists(source))
        ? "missing"
        : (await exists(target))
          ? "conflict"
          : "misplaced";

  return { file, state, source, target };
}

/** Every file the project points at, checked against the run it belongs to. */
async function checkAll(
  projectUri: vscode.Uri,
  content: string | undefined,
  tool: Tool
): Promise<{ runName: string; checked: Checked[] }> {
  const name = path.basename(projectUri.fsPath, tool.extension);
  if (content === undefined) {
    return { runName: name, checked: [] };
  }

  // Same folder the run exports to: without an exportpath, the suite uses the project name.
  const runName = tool.exportPath(content) || name;
  const runUri = resolveProjectPath(projectUri, runName);
  const checked = await Promise.all(
    tool.userFiles(content).map((file) => check(projectUri, runUri, file))
  );

  return { runName, checked };
}

/** The tab's slice of the page, gathered alongside the other tabs when the page is built. */
export async function readSettings(
  projectUri: vscode.Uri,
  content: string | undefined,
  tool: Tool
): Promise<Settings> {
  const { runName, checked } = await checkAll(projectUri, content, tool);

  return {
    projectUri: projectUri.toString(),
    runName,
    declared: checked.length,
    fixable: checked.filter((one) => one.state === "misplaced").length,
    unreachable: checked.filter((one) => one.state === "missing" || one.state === "conflict")
      .length,
  };
}

function plural(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

/** Whether the parameter needs acting on, and why. */
function renderStatus(settings: Settings): string {
  if (settings.declared === 0) {
    return '<p class="setting-status">This project points at no model or data file.</p>';
  }

  if (settings.fixable > 0) {
    const stuck = settings.unreachable > 0
      ? ` ${plural(settings.unreachable)} cannot be reached and will be left alone.`
      : "";
    const text = `${plural(settings.fixable)} sit outside ${settings.runName}.${stuck}`;
    return `<p class="setting-status todo">${escapeHtml(text)}</p>`;
  }

  const text = settings.unreachable > 0
    ? `${plural(settings.unreachable)} cannot be reached on disk. Repoint them in the application.`
    : `Everything this project points at is already in ${settings.runName}.`;
  return `<p class="setting-status">${escapeHtml(text)}</p>`;
}

/**
 * The action. A command uri, because the CSP here forbids scripts - the same channel the
 * Data tab and the open button use. With nothing to gather it renders as a span: inert,
 * but the row keeps its shape.
 */
function renderControl(settings: Settings): string {
  if (settings.fixable === 0) {
    return '<div class="setting-control"><span class="btn-fix disabled">Fix</span></div>';
  }

  const args = encodeURIComponent(JSON.stringify([settings.projectUri]));
  const href = `command:mlxSuite.applyProjectFix?${args}`;
  return `<div class="setting-control">` +
    `<a class="btn-fix" href="${escapeHtml(href)}">Fix</a></div>`;
}

/** The tab's one parameter, in a card like the other tabs. */
export function renderSettings(settings: Settings): string {
  return `<section class="card">
    <div class="card-head"><h2>Settings</h2><span class="note">${escapeHtml(settings.runName)}</span></div>
    <div class="setting">
      <div class="setting-text">
        <div class="setting-name">Include external files</div>
        <p class="setting-desc">Copy and include in the run the model and/or dataset.</p>
        ${renderStatus(settings)}
      </div>
      ${renderControl(settings)}
    </div>
  </section>`;
}

/** The path to write into the project: relative to the project folder, forward slashes. */
function declaredPath(projectUri: vscode.Uri, target: vscode.Uri): string {
  return path
    .relative(path.dirname(projectUri.fsPath), target.fsPath)
    .split(path.sep)
    .join("/");
}

/**
 * Copies the misplaced files in and repoints the project at their new home. The originals
 * stay where they are: this gathers a copy into the run, it does not move the user's files
 * out from under whatever else reads them.
 */
async function gather(
  projectUri: vscode.Uri,
  content: string,
  misplaced: Checked[]
): Promise<string> {
  let updated = content;

  for (const { file, source, target } of misplaced) {
    // ".." resolves to the folder holding the target. Recursive, and a no-op when it exists.
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(target, ".."));
    await vscode.workspace.fs.copy(source, target);
    updated = replaceFileValue(updated, file.declared, declaredPath(projectUri, target));
  }

  return setGlobalSetting(updated, FLAG, "true");
}

/**
 * Gathers the files the tab listed as outside the run, then reopens the page on the
 * Settings tab so it re-reads from disk and stays where the user was.
 */
export async function applyProjectFix(target: unknown): Promise<void> {
  const projectUri = vscode.Uri.parse(String(target));
  const tool = TOOLS.find((candidate) => projectUri.fsPath.endsWith(candidate.extension));
  const content = tool === undefined ? undefined : await readText(projectUri);
  if (tool === undefined || content === undefined) {
    await vscode.window.showErrorMessage(
      `Cannot read ${path.basename(projectUri.fsPath)} as a MonolixSuite project.`
    );
    return;
  }

  // Checked again rather than trusted from the page: the disk may have moved under it.
  const { runName, checked } = await checkAll(projectUri, content, tool);
  const misplaced = checked.filter((one) => one.state === "misplaced");
  if (misplaced.length === 0) {
    await vscode.commands.executeCommand(tool.openCommand, projectUri, SETTINGS_TAB);
    return;
  }

  try {
    await writeText(projectUri, await gather(projectUri, content, misplaced));
  } catch (error) {
    await vscode.window.showErrorMessage(`Could not gather the files: ${error}`);
    return;
  }

  await vscode.commands.executeCommand(tool.openCommand, projectUri, SETTINGS_TAB);
  await vscode.window.showInformationMessage(
    `Copied ${plural(misplaced.length)} into ${runName}.`
  );
}
