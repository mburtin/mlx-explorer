import { TOOL as MONOLIX } from "./monolix/project";
import { TOOL as SIMULX } from "./simulx/project";

// Define supported tools
export const TOOLS: readonly Tool[] = [MONOLIX, SIMULX];

/**
 * A file the user brought into the project - the structural model, the dataset, an
 * external table - and the folder it belongs in inside the run. MonolixSuite gathers
 * them there when `userFilesNextToProject` is set, which is what makes a run portable.
 */
export interface DeclaredFile {
  // The path as written in the project. The rewrite is keyed on it.
  readonly declared: string;
  // Folder inside the run: "ModelFile", "DataFile" or "ExternalFiles".
  readonly folder: string;
}

/**
 * Describes a MonolixSuite project so the workbench can find and open its projects.
 */
export interface Tool {
  // Unique identifier for the group and item in the tree
  readonly id: string;
  // Name displayed in the tree and on the open button
  readonly label: string;
  readonly glob: string;
  // Stripped from the file name to label a project
  readonly extension: string;
  // Boolean to indicate if the file is a project
  identifies(content: string): boolean;
  // Command when the user clicks on the project
  readonly openCommand: string;
  // Folder the project exports to, relative to the project folder
  exportPath(content: string): string | undefined;
  // The user files the project points at, in the order the dialog lists them
  userFiles(content: string): DeclaredFile[];
}


