import { block, fileValue, hasSection, parseExportPath, section } from "../../common/mlxtran";
import { DeclaredFile, Tool } from "../index";

function identifies(content: string): boolean {
  return hasSection(content, "MONOLIX");
}

// Define Monolix's project specifications
export const TOOL: Tool = {
  id: "monolix",
  label: "Monolix",
  glob: "**/*.mlxtran",
  extension: ".mlxtran",
  identifies,
  openCommand: "mlx-explorer.openRun",
  exportPath: parseExportPath,
  userFiles,
};

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
