import * as path from "path";
import * as vscode from "vscode";
import { readText } from "../../common/files";
import { block, label, section } from "../../common/mlxtran";
import { ModelFile, readModel } from "./page/modelTab";
import { OutputDef, readOutputs } from "./page/outputsSection";
import { ParameterSet, readParameters } from "./page/parametersSection";
import { Treatment, readTreatments } from "./page/treatmentsSection";
import { resolveDataFile } from "./project";

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
  /** The project's external dataset, set only when the declared file is on disk. */
  dataUri?: string;
}

function hasSimulationGroups(content: string): boolean {
  const simulx = section(content, "SIMULX");
  const simulation = simulx === undefined ? undefined : block(simulx, "SIMULATION");
  const groups = simulation === undefined ? undefined : label(simulation, "GROUPS");
  return groups !== undefined && /'[^']+'\s*=\s*\{/.test(groups);
}

export async function readSummary(projectUri: vscode.Uri): Promise<Summary> {
  const name = path.basename(projectUri.fsPath, ".smlx");
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
    dataUri: content === undefined ? undefined : await resolveDataFile(projectUri, content, name),
  };
}
