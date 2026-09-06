import * as vscode from "vscode";
import { exists, resolveProjectPath } from "../../common/files";
import {
  block, entryFileValue, fileValue, hasSection, quotedValue, section
} from "../../common/mlxtran";
import { DeclaredFile } from "../index";
import { scanNamedEntries } from "./entries";

function identifies(content: string): boolean {
  return hasSection(content, "SIMULX");
}

// Define Simulx's project specifications
export const TOOL = {
  id: "simulx",
  label: "Simulx",
  glob: "**/*.smlx",
  extension: ".smlx",
  identifies,
  openCommand: "mlxSuite.openSummary",
  exportPath: parseExportPath,
  userFiles,
};

/** Structural model declared in `<MODEL>`, relative to the project folder. */
export function parseModelFile(content: string): string | undefined {
  const model = section(content, "MODEL");
  return model === undefined ? undefined : fileValue(model);
}

/** Export folder declared in `[SETTINGS] GLOBAL:`, relative to the project folder. */
export function parseExportPath(content: string): string | undefined {
  return quotedValue(content, "exportpath");
}

/**
 * The files a Simulx project brings in: the structural model, plus every table an entry
 * reads from disk - a regressor, a parameter set, a treatment. `[DEFINITION]` holds them
 * all, so one scan over the block covers POPULATION:, TREATMENT:, OUTPUT: and the rest;
 * `[SIMULATION]`, whose groups only name those entries, is left out by `block`.
 * A library model is not a path, so there is nothing to gather for it.
 */
function userFiles(content: string): DeclaredFile[] {
  const files: DeclaredFile[] = [];

  const model = parseModelFile(content);
  if (model !== undefined && !model.startsWith("lib:")) {
    files.push({ declared: model, folder: "ModelFile" });
  }

  const simulx = section(content, "SIMULX");
  const definition = simulx === undefined ? undefined : block(simulx, "DEFINITION");
  for (const entry of definition === undefined ? [] : scanNamedEntries(definition)) {
    const declared = entryFileValue(entry.body);
    if (declared !== undefined) {
      files.push({ declared, folder: "ExternalFiles" });
    }
  }

  return files;
}

/**
 * The dataset Simulx wrote when the project last ran, at
 * `<export>/Simulations/simulatedData.csv`. Without an exportpath, Simulx uses the
 * project name, same as Monolix. Only its location is needed - the Data tab hands it to
 * the workbench rather than rendering it.
 */
export async function resolveDataFile(
  projectUri: vscode.Uri,
  content: string,
  name: string
): Promise<string | undefined> {
  const exportRoot = resolveProjectPath(projectUri, parseExportPath(content) || name);
  const uri = vscode.Uri.joinPath(exportRoot, "Simulations", "simulatedData.csv");
  // Not run yet, or an older export layout: no Data tab rather than one that opens nothing.
  return (await exists(uri)) ? uri.toString() : undefined;
}
