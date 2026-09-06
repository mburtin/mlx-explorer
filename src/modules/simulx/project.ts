import * as vscode from "vscode";
import { exists, resolveProjectPath } from "../../common/files";
import { fileValue, hasSection, quotedValue, section } from "../../common/mlxtran";

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
