import * as path from "path";
import * as vscode from "vscode";
import { exists, readText } from "../../common/files";
import { runFolder } from "../index";
import { readSettings, Settings } from "../../projectSettings";
import { block, label, section } from "../../common/mlxtran";
import { ModelFile, readModel } from "./page/modelTab";
import { OutputDef, readOutputs } from "./page/outputsSection";
import { ParameterSet, readParameters } from "./page/parametersSection";
import { Treatment, readTreatments } from "./page/treatmentsSection";
import { TOOL } from "./project";

/** What the Summary page shows: the "Simulations" definition, `[EXPLORATION]` left untouched. */
export interface Summary {
  name: string;
  /** Workspace-relative, for display only. */
  path: string;
  projectUri: string;
  /** Gates the empty state: false when `[SIMULATION] GROUPS:` declares nothing. */
  hasSimulation: boolean;
  parameterSets: ParameterSet[];
  treatments: Treatment[];
  outputs: OutputDef[];
  model?: ModelFile;
  /** Always present: the tab reports even when the project points at nothing. */
  settings: Settings;
  /** The project's external dataset, set only when the declared file is on disk. */
  dataUri?: string;
}

function hasSimulationGroups(content: string): boolean {
  const simulx = section(content, "SIMULX");
  const simulation = simulx === undefined ? undefined : block(simulx, "SIMULATION");
  const groups = simulation === undefined ? undefined : label(simulation, "GROUPS");
  return groups !== undefined && /'[^']+'\s*=\s*\{/.test(groups);
}

// The dataset Simulx wrote in `<export>/Simulations/simulatedData.csv`.
async function resolveDataFile(
  projectUri: vscode.Uri,
  content: string
): Promise<string | undefined> {
  const { uri: exportRoot } = runFolder(projectUri, content, TOOL);
  const uri = vscode.Uri.joinPath(exportRoot, "Simulations", "simulatedData.csv");
  // Not run yet, or an older export layout: no Data tab rather than one that opens nothing.
  return (await exists(uri)) ? uri.toString() : undefined;
}

export async function readSummary(projectUri: vscode.Uri): Promise<Summary> {
  // The project's own name, not the export folder's: they differ once exportpath is set.
  const name = path.basename(projectUri.fsPath, TOOL.extension);
  const content = await readText(projectUri);

  return {
    name,
    path: vscode.workspace.asRelativePath(projectUri),
    projectUri: projectUri.toString(),
    hasSimulation: content !== undefined && hasSimulationGroups(content),
    parameterSets: content === undefined ? [] : readParameters(content),
    treatments: content === undefined ? [] : readTreatments(content),
    outputs: content === undefined ? [] : readOutputs(content),
    model: content === undefined ? undefined : await readModel(projectUri, content),
    settings: await readSettings(projectUri, content, TOOL),
    dataUri: content === undefined ? undefined : await resolveDataFile(projectUri, content),
  };
}
