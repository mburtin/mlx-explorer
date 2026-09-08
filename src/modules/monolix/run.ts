import * as path from "path";
import * as vscode from "vscode";
import { exists, readText, resolveProjectPath } from "../../common/files";
import { runFolder } from "../index";
import { readSettings, Settings } from "../../projectSettings";
import { ModelFile, readModel } from "./page/modelTab";
import { ResultsData, readResults } from "./page/resultsTab";
import { parseDataFile, TOOL } from "./project";

export interface Run {
  name: string;
  resultsPath: string;
  projectUri: string;
  results?: ResultsData;
  model?: ModelFile;
  settings: Settings;
  dataUri?: string;
}

async function resolveDataFile(
  projectUri: vscode.Uri,
  project: string | undefined
): Promise<string | undefined> {
  const declared = project === undefined ? undefined : parseDataFile(project);
  if (declared === undefined) {
    return undefined;
  }
  const uri = resolveProjectPath(projectUri, declared);
  // Hide the Data tab if the dataset was moved or the project came from another machine.
  return (await exists(uri)) ? uri.toString() : undefined;
}

export async function readRun(projectUri: vscode.Uri): Promise<Run> {
  // The project's own name, not the export folder's: they differ once exportpath is set.
  const name = path.basename(projectUri.fsPath, TOOL.extension);
  const project = await readText(projectUri);
  const { uri: results } = runFolder(projectUri, project, TOOL);

  return {
    name,
    resultsPath: vscode.workspace.asRelativePath(results),
    projectUri: projectUri.toString(),
    results: await readResults(results),
    model: await readModel(projectUri, project),
    settings: await readSettings(projectUri, project, TOOL),
    dataUri: await resolveDataFile(projectUri, project),
  };
}
