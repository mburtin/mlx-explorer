import { TOOL as MONOLIX } from "./monolix/project";
import { TOOL as SIMULX } from "./simulx/project";

// Define supported tools
export const TOOLS: readonly Tool[] = [MONOLIX, SIMULX];

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
}


