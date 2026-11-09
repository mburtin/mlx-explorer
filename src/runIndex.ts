import * as path from "path";
import * as vscode from "vscode";
import { readText, scanProjects, writeText } from "./common/files";
import { escapeHtml, renderDocument, stripe, WebviewAssets } from "./common/webview";
import { Tool, TOOLS } from "./modules";

// Simulx swaps the blue accent for its orange, as on its summary page
export function stylesheets(tool: Tool): string[] {
  const theme = tool.id === "simulx" ? ["theme.css", "simulx-theme.css"] : ["theme.css"];
  return [...theme, "layout.css", "cards.css", "tables.css"];
}

// A section of runs declared in mlx-runs.json. Its runs keep the order of the file
export interface RunGroup {
  readonly name: string;
  readonly runs: readonly string[];
}

export interface ToolRuns {
  // Descriptions, keyed on the project path relative to the workspace
  readonly entries: Record<string, string>;
  // Empty when the file lists the runs without grouping them
  readonly groups: readonly RunGroup[];
}

export interface RunIndex {
  // One block per tool id, the same shape as at the top of mlx-runs.json
  readonly tools: Record<string, ToolRuns | undefined>;
  readonly error?: string;
}

// Runs under a folder of this name are always in the Archive group, and cannot leave it
const ARCHIVE_FOLDER = "archive";
export const ARCHIVE_GROUP = "Archive";
const UNGROUPED_GROUP = "Ungrouped";

const EMPTY_TOOL_RUNS: ToolRuns = { entries: {}, groups: [] };

// Hand-written by the user, keyed on the project path relative to the workspace
export function runIndexUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder && vscode.Uri.joinPath(folder.uri, "mlx-runs.json");
}

export function runKey(projectUri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(projectUri, false);
}

export function toolRuns(index: RunIndex, tool: Tool): ToolRuns {
  return index.tools[tool.id] ?? EMPTY_TOOL_RUNS;
}

// A run stored in an archive folder: its place in the Archive group comes from the disk
export function isArchived(key: string): boolean {
  return key
    .split("/")
    .slice(0, -1)
    .some((folder) => folder.toLowerCase() === ARCHIVE_FOLDER);
}

// The two sections the extension derives itself cannot be declared in the file
function isReserved(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === ARCHIVE_GROUP.toLowerCase() || lower === UNGROUPED_GROUP.toLowerCase();
}

export async function readRunIndex(): Promise<RunIndex> {
  const uri = runIndexUri();
  const text = uri && (await readText(uri));
  if (text === undefined) {
    return { tools: {} };
  }

  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch (error) {
    return { tools: {}, error: `mlx-runs.json is not valid JSON: ${(error as Error).message}` };
  }
  if (typeof file !== "object" || file === null || Array.isArray(file)) {
    return { tools: {}, error: "mlx-runs.json must be an object with a \"monolix\" and a \"simulx\" block." };
  }

  const tools: Record<string, ToolRuns> = {};
  for (const [id, block] of Object.entries(file)) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) {
      return { tools: {}, error: `The "${id}" block of mlx-runs.json must be an object.` };
    }

    const entries: Record<string, string> = {};
    let groups: readonly RunGroup[] = [];
    for (const [key, value] of Object.entries(block)) {
      if (key === "groups") {
        const parsed = parseGroups(id, value);
        if (typeof parsed === "string") {
          return { tools: {}, error: parsed };
        }
        groups = parsed;
      } else if (typeof value === "string") {
        entries[key] = value;
      } else {
        return {
          tools: {},
          error: `The "${key}" entry of the "${id}" block of mlx-runs.json must be a description string.`,
        };
      }
    }
    tools[id] = { entries, groups };
  }
  return { tools };
}

// Returns an error message rather than the groups when the file is malformed
function parseGroups(toolId: string, value: unknown): RunGroup[] | string {
  if (!Array.isArray(value)) {
    return `The "groups" of the "${toolId}" block of mlx-runs.json must be a list.`;
  }

  const groups: RunGroup[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return `Each group of the "${toolId}" block of mlx-runs.json needs a "name".`;
    }
    const { name, runs } = raw as { name?: unknown; runs?: unknown };
    if (typeof name !== "string" || name === "") {
      return `Each group of the "${toolId}" block of mlx-runs.json needs a "name".`;
    }
    if (groups.some((group) => group.name === name)) {
      return `The group "${name}" appears twice in the "${toolId}" block of mlx-runs.json.`;
    }
    if (runs !== undefined && (!Array.isArray(runs) || runs.some((key) => typeof key !== "string"))) {
      return `The "runs" of the group "${name}" in the "${toolId}" block of mlx-runs.json must be a list of run paths.`;
    }
    groups.push({ name, runs: (runs as string[] | undefined) ?? [] });
  }
  return groups;
}

// Adds newly discovered runs to mlx-runs.json, keeping existing descriptions and groups
// untouched. Skipped when the file is malformed, so we don't clobber a file the user is
// mid-editing.
export async function syncRunIndex(
  tool: Tool,
  runs: readonly vscode.Uri[],
  index: RunIndex
): Promise<RunIndex> {
  const uri = runIndexUri();
  if (!uri || index.error) {
    return index;
  }

  const current = toolRuns(index, tool);
  const entries = { ...current.entries };
  let changed = false;
  for (const run of runs) {
    const key = runKey(run);
    if (!(key in entries)) {
      entries[key] = "";
      changed = true;
    }
  }
  if (!changed) {
    return index;
  }

  const tools = { ...index.tools, [tool.id]: { entries, groups: current.groups } };
  await writeRunIndex(uri, tools);
  return { tools };
}

// Moves a run into `group`, or out of every group when it is undefined.
// An archived run keeps the Archive group its folder gives it.
export async function moveRunToGroup(
  tool: Tool,
  key: string,
  group: string | undefined
): Promise<RunIndex> {
  const index = await readRunIndex();
  const uri = runIndexUri();
  if (!uri || index.error || isArchived(key)) {
    return index;
  }

  const current = toolRuns(index, tool);
  const groups = current.groups.map((candidate) => ({
    name: candidate.name,
    runs: candidate.runs.filter((member) => member !== key),
  }));
  if (group !== undefined) {
    const target = groups.find((candidate) => candidate.name === group);
    if (target) {
      target.runs.push(key);
    } else {
      groups.push({ name: group, runs: [key] });
    }
  }

  const entries = key in current.entries ? current.entries : { ...current.entries, [key]: "" };
  const tools = { ...index.tools, [tool.id]: { entries, groups } };
  await writeRunIndex(uri, tools);
  return { tools };
}

// Prompts for the name of a new empty group, inserted after the group named `after`
// when there is one, at the end of the list otherwise.
export async function createGroup(tool: Tool, after?: string): Promise<void> {
  const uri = runIndexUri();
  if (!uri) {
    vscode.window.showWarningMessage("Open a folder to create sections.");
    return;
  }

  const index = await readRunIndex();
  if (index.error !== undefined) {
    vscode.window.showErrorMessage(index.error);
    return;
  }

  const current = toolRuns(index, tool);
  const name = await vscode.window.showInputBox({
    title: `New ${tool.label} section`,
    prompt: "Name of the section, saved in mlx-runs.json",
    validateInput: (value) => {
      const trimmed = value.trim();
      if (trimmed === "") {
        return "Enter a name for the section.";
      }
      if (isReserved(trimmed)) {
        return `"${trimmed}" is reserved for the section the extension fills itself.`;
      }
      if (current.groups.some((group) => group.name === trimmed)) {
        return `A section named "${trimmed}" already exists.`;
      }
      return undefined;
    },
  });
  if (name === undefined) {
    return;
  }

  const groups: { name: string; runs: string[] }[] = current.groups.map(({ name, runs }) => ({
    name,
    runs: [...runs],
  }));
  const created = { name: name.trim(), runs: [] as string[] };
  const position = after === undefined ? -1 : groups.findIndex((group) => group.name === after);
  if (position === -1) {
    groups.push(created);
  } else {
    groups.splice(position + 1, 0, created);
  }

  await writeRunIndex(uri, { ...index.tools, [tool.id]: { entries: current.entries, groups } });
}

async function writeRunIndex(uri: vscode.Uri, tools: RunIndex["tools"]): Promise<void> {
  const file: Record<string, unknown> = {};
  for (const [id, toolRuns] of Object.entries(tools)) {
    if (!toolRuns) {
      continue;
    }
    const block: Record<string, unknown> = {};
    if (toolRuns.groups.length > 0) {
      block.groups = toolRuns.groups.map(({ name, runs }) => ({ name, runs }));
    }
    Object.assign(block, toolRuns.entries);
    file[id] = block;
  }
  await writeText(uri, JSON.stringify(file, null, 2) + "\n");
}

export type SectionKind = "group" | "ungrouped" | "archive";

export interface RunSection {
  readonly name: string;
  readonly kind: SectionKind;
  // Name of the group in mlx-runs.json, for the kind "group"
  readonly group?: string;
  readonly runs: readonly vscode.Uri[];
}

export interface RunSections {
  // false when the file declares no group: the runs are listed without a section
  readonly grouped: boolean;
  readonly sections: readonly RunSection[];
}

// Splits the runs into the sections of mlx-runs.json, then Ungrouped, then Archive.
// A run belongs to a single group: the first one that lists it.
export function sectionsFor(tool: Tool, runs: readonly vscode.Uri[], index: RunIndex): RunSections {
  const { groups } = toolRuns(index, tool);
  const byKey = new Map(runs.map((uri) => [runKey(uri), uri]));

  const claimed = new Set<string>();
  const sections: RunSection[] = [];
  for (const group of groups) {
    if (isReserved(group.name)) {
      continue;
    }
    const members: vscode.Uri[] = [];
    for (const key of group.runs) {
      const uri = byKey.get(key);
      if (uri !== undefined && !claimed.has(key) && !isArchived(key)) {
        claimed.add(key);
        members.push(uri);
      }
    }
    sections.push({ name: group.name, kind: "group", group: group.name, runs: members });
  }

  const ungrouped = [...byKey]
    .filter(([key]) => !claimed.has(key) && !isArchived(key))
    .map(([, uri]) => uri);
  const archived = [...byKey].filter(([key]) => isArchived(key)).map(([, uri]) => uri);

  sections.push({ name: UNGROUPED_GROUP, kind: "ungrouped", runs: ungrouped });
  if (archived.length > 0) {
    sections.push({ name: ARCHIVE_GROUP, kind: "archive", runs: archived });
  }

  return { grouped: groups.some((group) => !isReserved(group.name)), sections };
}

export function renderRunIndexPage(
  tool: Tool,
  runs: readonly vscode.Uri[],
  index: RunIndex,
  assets: WebviewAssets
): string {
  const { grouped, sections } = sectionsFor(tool, runs, index);
  const entries = toolRuns(index, tool).entries;

  const content = runs.length === 0
    ? `<section class="card empty-state"><div>No ${escapeHtml(tool.label)} project found.</div></section>`
    : sections
      .filter((section) => section.runs.length > 0)
      .map((section) =>
        renderSection(
          // Without a declared group, the plain list keeps the title it always had
          section.kind === "ungrouped" && !grouped ? "Descriptions" : section.name,
          section.runs,
          tool,
          entries
        )
      )
      .join("\n");

  const error = index.error
    ? `<section class="card empty-state"><div>${escapeHtml(index.error)}</div></section>`
    : "";

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

function renderSection(
  title: string,
  runs: readonly vscode.Uri[],
  tool: Tool,
  entries: Record<string, string>
): string {
  const rows = runs
    .map((uri, i) => {
      const name = path.basename(uri.fsPath, tool.extension);
      const description = entries[runKey(uri)];
      const cell = description !== undefined && description !== ""
        ? `<td>${escapeHtml(description)}</td>`
        : '<td class="empty">—</td>';
      return `<tr${stripe(i)}><td title="${escapeHtml(runKey(uri))}">${escapeHtml(name)}</td>${cell}</tr>`;
    })
    .join("");

  return `<section class="card">
      <details open>
        <summary class="card-head"><span class="chevron">▶</span><h2>${escapeHtml(title)}</h2></summary>
        <table>
          <thead><tr><th>Run</th><th>Description</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
    </section>`;
}

// Opens mlx-runs.json, first syncing in an empty entry for every run missing from it
export async function editRunIndex(): Promise<void> {
  const uri = runIndexUri();
  if (!uri) {
    vscode.window.showWarningMessage("Open a folder to describe its runs.");
    return;
  }

  let index = await readRunIndex();
  for (const tool of TOOLS) {
    index = await syncRunIndex(tool, await scanProjects(tool.glob, tool.identifies), index);
  }

  await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside });
}
