import * as path from "path";
import * as vscode from "vscode";
import { Section } from "./common/exportLink";
import { readText, writeText } from "./common/files";
import { rasterize } from "./common/rasterize";
import { ExportColumn, ExportTable, renderSvgTable } from "./common/svgTable";
import { Table } from "./common/table";
import { rCode } from "./exportR";
import { runFolder, toolFor } from "./modules";
import { ParameterView, readResults } from "./modules/monolix/page/resultsTab";
import { ParameterSet, readParameters } from "./modules/simulx/page/parametersSection";

interface ExportSettings {
  ink: "dark" | "light";
  digits: number;
  scale: number;
  iiv: "cv" | "omega";
}

function settings(): ExportSettings {
  const config = vscode.workspace.getConfiguration("mlx-explorer.export");
  return {
    ink: config.get<"dark" | "light">("ink", "dark"),
    digits: config.get<number>("significantDigits", 3),
    scale: config.get<number>("pngScale", 2),
    iiv: config.get<"cv" | "omega">("iiv", "cv"),
  };
}

function numeric(digits: number): ExportColumn["format"] {
  return { kind: "significant", digits };
}

function parametersTable(view: ParameterView, config: ExportSettings): ExportTable {
  const columns: ExportColumn[] = [
    { header: "Parameter", format: { kind: "symbol" } },
    { header: "Estimate", format: numeric(config.digits) },
  ];
  if (view.hasRse) {
    columns.push({ header: "RSE (%)", format: numeric(config.digits) });
  }
  if (view.hasIiv) {
    // The page's CV/omega switch is a checkbox, and a script-free page cannot report its
    // state back. Which reading the image carries is therefore a setting, not a guess.
    columns.push({
      header: config.iiv === "cv" ? "CV (%)" : "ω",
      format: numeric(config.digits),
      group: "IIV",
    });
    if (view.hasRse) {
      columns.push({ header: "RSE (%)", format: numeric(config.digits), group: "IIV" });
    }
  }

  const rows = view.rows.map((row) => {
    const cells = [row.name, row.value];
    if (view.hasRse) {
      cells.push(row.rse);
    }
    if (view.hasIiv) {
      cells.push(config.iiv === "cv" ? row.iiv : row.iivValue);
      if (view.hasRse) {
        cells.push(row.iivRse);
      }
    }
    return cells;
  });

  return { title: "Model parameters", columns, rows };
}

function criteriaTable(criteria: Table): ExportTable {
  // Transposed - one column per criterion - so it reads like the page's tiles and like the
  // one-line banner a slide wants, rather than a two-column list. standardError is dropped
  // here for the same reason renderCriteria drops it.
  const rows = criteria.rows.filter(([name]) => name !== "standardError");
  return {
    title: "Likelihood",
    // Fixed decimals rather than significant figures: two models are told apart by a
    // difference of a few units, and 3 significant figures would round -1234.567 to -1235.
    columns: rows.map(([name]) => ({
      header: name,
      format: { kind: "fixed" as const, decimals: 2 },
    })),
    rows: [rows.map((row) => row[1] ?? "")],
  };
}

function simulxTable(set: ParameterSet, config: ExportSettings): ExportTable {
  // Simulx values are fixed rather than estimated, so a set often declares no variability
  // at all. The page keeps the column to hold its shape; an export drops it as noise.
  const hasOmega = set.rows.some((row) => row.omega !== "");
  const columns: ExportColumn[] = [
    { header: "Parameter", format: { kind: "symbol" } },
    { header: "Value", format: numeric(config.digits) },
  ];
  if (hasOmega) {
    columns.push({ header: "ω", format: numeric(config.digits) });
  }

  return {
    title: set.name,
    columns,
    rows: set.rows.map((row) =>
      hasOmega ? [row.name, row.value, row.omega] : [row.name, row.value]
    ),
  };
}

/**
 * One card holds every parameter set Simulx declares, so a single link on its header has
 * to ask which one when there is more than one. With a single set - the common case - it
 * asks nothing. Returns null when the user backs out, which is not a failure.
 */
async function chooseSet(
  sets: ParameterSet[],
  wanted: string | undefined
): Promise<ParameterSet | undefined | null> {
  if (wanted !== undefined) {
    return sets.find((one) => one.name === wanted);
  }
  if (sets.length <= 1) {
    return sets[0];
  }

  const picked = await vscode.window.showQuickPick(sets.map((one) => one.name), {
    title: "Export — population parameters",
    placeHolder: "Which parameter set?",
  });
  return picked === undefined ? null : sets.find((one) => one.name === picked);
}

/**
 * Reads the section back from disk. The page is never the source: it may have been open
 * since before the run was re-estimated, and a command uri is not a channel to trust with
 * content - the same reason applyProjectFix re-checks rather than believing the tab.
 *
 * undefined means the section is gone; null means the user dismissed a prompt, which must
 * not be reported as an error.
 */
async function readSection(
  projectUri: vscode.Uri,
  section: Section,
  setName: string | undefined,
  config: ExportSettings
): Promise<ExportTable | undefined | null> {
  const tool = toolFor(projectUri);
  const content = tool === undefined ? undefined : await readText(projectUri);
  if (tool === undefined || content === undefined) {
    return undefined;
  }

  if (section === "simulxParameters") {
    const set = await chooseSet(readParameters(content), setName);
    if (set === null) {
      return null;
    }
    return set === undefined ? undefined : simulxTable(set, config);
  }

  const results = await readResults(runFolder(projectUri, content, tool).uri);
  if (results === undefined) {
    return undefined;
  }
  if (section === "criteria") {
    return results.criteria === undefined ? undefined : criteriaTable(results.criteria);
  }
  return parametersTable(results.parameters, config);
}

/** `warfarin_project` + "Model parameters" -> `warfarin_project-model-parameters`. */
function fileStem(projectUri: vscode.Uri, title: string): string {
  const project = path.basename(projectUri.fsPath, path.extname(projectUri.fsPath));
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${project}-${slug}`;
}

async function askWhereToSave(
  projectUri: vscode.Uri,
  table: ExportTable,
  extension: "svg" | "png"
): Promise<vscode.Uri | undefined> {
  return vscode.window.showSaveDialog({
    // Next to the project, which is where the run's other outputs already live.
    defaultUri: vscode.Uri.joinPath(projectUri, "..", `${fileStem(projectUri, table.title)}.${extension}`),
    // One filter, because the format was already chosen: the dialog never has to guess it
    // back from an extension the user might mistype.
    filters: { [`${extension.toUpperCase()} image`]: [extension] },
    saveLabel: "Export",
  });
}

// Offers to open what was just written, rather than leaving the user to go find it.
async function announce(target: vscode.Uri): Promise<void> {
  const reveal = "Reveal in Finder";
  const choice = await vscode.window.showInformationMessage(
    `Exported ${path.basename(target.fsPath)}.`,
    reveal
  );
  if (choice === reveal) {
    await vscode.commands.executeCommand("revealFileInOS", target);
  }
}

type Action = "png" | "svg" | "r";

/** Everything an action needs that is not the table itself. */
interface ExportContext {
  extensionUri: vscode.Uri;
  projectUri: vscode.Uri;
  /** Names the R variable: a run's parameters and its criteria must not collide. */
  section: Section;
  /** The page that fired this, so the rasterizer's panel can be pushed back behind it. */
  behind: string;
  config: ExportSettings;
}

function actions(config: ExportSettings): (vscode.QuickPickItem & { id: Action })[] {
  return [
    {
      id: "png",
      label: "$(file-media) Save as PNG…",
      detail: `PNG with transparent background, ${config.scale}×`,
    },
    { id: "svg", label: "$(symbol-color) Save as SVG…", detail: "Vector, with transparent background" },
    {
      id: "r",
      label: "$(file-code) Copy R code",
      detail: "A self-contained data.frame, at full precision",
    },
  ];
}

async function run(action: Action, table: ExportTable, context: ExportContext): Promise<void> {
  const { config, projectUri } = context;

  // No image to build for this one, and askWhereToSave below only knows the two file
  // formats - so it leaves early.
  if (action === "r") {
    await vscode.env.clipboard.writeText(rCode(table, projectUri, context.section));
    await vscode.window.showInformationMessage("R code copied. Paste it into your script.");
    return;
  }

  // Vector output needs no scale factor; only the raster does. The SVG is emitted at the
  // target size so the canvas draws it 1:1 - scaling at draw time would let the browser
  // rasterise at the intrinsic size first, and blur it.
  const scale = action === "png" ? config.scale : 1;
  const rendered = renderSvgTable(table, { ink: config.ink, scale });

  const target = await askWhereToSave(projectUri, table, action);
  if (target === undefined) {
    return;
  }

  if (action === "svg") {
    await writeText(target, rendered.svg);
  } else {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Exporting table…" },
      async () => {
        const png = await rasterize(context.extensionUri, rendered, context.behind);
        await vscode.workspace.fs.writeFile(target, png);
      }
    );
  }
  await announce(target);
}

/** The command every export link fires. */
export async function exportTable(
  extensionUri: vscode.Uri,
  target: unknown,
  rawSection: unknown,
  rawSetName?: unknown
): Promise<void> {
  const projectUri = vscode.Uri.parse(String(target));
  const section = String(rawSection) as Section;
  const config = settings();
  const table = await readSection(
    projectUri,
    section,
    rawSetName === undefined ? undefined : String(rawSetName),
    config
  );

  if (table === null) {
    return; // Backed out of the set prompt.
  }
  if (table === undefined) {
    await vscode.window.showErrorMessage(
      "That table is no longer in the run's results. Re-open the page to refresh it."
    );
    return;
  }

  const choice = await vscode.window.showQuickPick(actions(config), {
    title: `Export — ${table.title}`,
    placeHolder: "Choose what to do with this table",
  });
  if (choice === undefined) {
    return;
  }

  try {
    await run(choice.id, table, {
      extensionUri,
      projectUri,
      section,
      // The keys showPanel tracks the two pages under.
      behind: section === "simulxParameters" ? "mlx-explorer.summary" : "mlx-explorer.run",
      config,
    });
  } catch (error) {
    await vscode.window.showErrorMessage(`Could not export the table: ${error}`);
  }
}
