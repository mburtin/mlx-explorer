import * as path from "path";
import * as vscode from "vscode";
import { readText } from "../../common/files";
import { readSettings, Settings } from "../../projectSettings";
import { ModelFile, readModel } from "./page/modelTab";
import { ResultsData, readResults } from "./page/resultsTab";
import { resolveDataFile, resultsFolder, TOOL } from "./project";

export interface Run {
  name: string;
  resultsPath: string;
  projectUri: string;
  results?: ResultsData;
  model?: ModelFile;
  settings: Settings;
  dataUri?: string;
}

export async function readRun(projectUri: vscode.Uri): Promise<Run> {
  const name = path.basename(projectUri.fsPath, ".mlxtran");
  const project = await readText(projectUri);
  const results = resultsFolder(projectUri, project, name);

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
