import * as vscode from "vscode";
import { exists, resolveProjectPath } from "../../common/files";
import { block, fileValue, hasSection, quotedValue, section } from "../../common/mlxtran";
import { DeclaredFile } from "../index";

function identifies(content: string): boolean {
  return hasSection(content, "MONOLIX");
}

// Define Monolix's project specifications
export const TOOL = {
  id: "monolix",
  label: "Monolix",
  glob: "**/*.mlxtran",
  extension: ".mlxtran",
  identifies,
  openCommand: "mlxSuite.openRun",
  exportPath: parseExportPath,
  userFiles,
};

export function parseExportPath(content: string): string | undefined {
  return quotedValue(content, "exportpath");
}

export function parseDataFile(content: string): string | undefined {
  const datafile = section(content, "DATAFILE");
  return datafile === undefined ? undefined : fileValue(datafile);
}

export function parseModelFile(content: string): string | undefined {
  const model = section(content, "MODEL");
  if (model === undefined) {
    return undefined;
  }
  const longitudinal = block(model, "LONGITUDINAL");
  return longitudinal === undefined ? undefined : fileValue(longitudinal);
}

function userFiles(content: string): DeclaredFile[] {
  const files: DeclaredFile[] = [];

  const model = parseModelFile(content);
  if (model !== undefined && !model.startsWith("lib:")) {
    files.push({ declared: model, folder: "ModelFile" });
  }

  const data = parseDataFile(content);
  if (data !== undefined) {
    files.push({ declared: data, folder: "DataFile" });
  }

  return files;
}


export function resultsFolder(
  projectUri: vscode.Uri,
  project: string | undefined,
  name: string
): vscode.Uri {
  return resolveProjectPath(projectUri, (project && parseExportPath(project)) || name);
}

export async function resolveDataFile(
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
