import { hasSection } from "../../common/mlxtran";

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
  // No run page yet: a click hands the project straight to the application.
  openCommand: "mlxSuite.openInApp",
};
