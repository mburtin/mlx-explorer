import {
  block, entryFileValue, fileValue, hasSection, label, parseExportPath, section
} from "../../common/mlxtran";
import { DeclaredFile, Tool } from "../index";
import { scanNamedEntries } from "./entries";

function identifies(content: string): boolean {
  return hasSection(content, "SIMULX");
}

// Define Simulx's project specifications
export const TOOL: Tool = {
  id: "simulx",
  label: "Simulx",
  glob: "**/*.smlx",
  extension: ".smlx",
  identifies,
  openCommand: "mlx-explorer.openSummary",
  exportPath: parseExportPath,
  userFiles,
};

/** Structural model declared in `<MODEL>`, relative to the project folder. */
export function parseModelFile(content: string): string | undefined {
  const model = section(content, "MODEL");
  return model === undefined ? undefined : fileValue(model);
}

/**
 * `[DEFINITION]` holds every entry the project declares - POPULATION:, TREATMENT:, OUTPUT:
 * and the rest. `[SIMULATION]`, whose groups only name those entries, is left out by `block`.
 */
function definitionBlock(content: string): string | undefined {
  const simulx = section(content, "SIMULX");
  return simulx === undefined ? undefined : block(simulx, "DEFINITION");
}

/** The body of one `NAME:` marker inside `[DEFINITION]`. */
export function definitionLabel(content: string, name: string): string | undefined {
  const definition = definitionBlock(content);
  return definition === undefined ? undefined : label(definition, name);
}

/**
 * Names the `[SIMULATION] GROUPS:` entries actually use for one key (`outputs`, `treatment`).
 * A definition that no group references is recorded in the project but never simulated.
 */
export function simulatedNames(content: string, key: "outputs" | "treatment"): Set<string> {
  const simulx = section(content, "SIMULX");
  const simulation = simulx === undefined ? undefined : block(simulx, "SIMULATION");
  const groups = simulation === undefined ? undefined : label(simulation, "GROUPS");

  const names = new Set<string>();
  for (const entry of groups === undefined ? [] : scanNamedEntries(groups)) {
    const list = new RegExp(`${key}\\s*=\\s*\\{([^{}]*)\\}`).exec(entry.body)?.[1] ?? "";
    for (const [, name] of list.matchAll(/'([^']+)'/g)) {
      names.add(name);
    }
  }
  return names;
}

/**
 * The files a Simulx project brings in: the structural model, plus every table an entry
 * reads from disk - a regressor, a parameter set, a treatment. One scan over `[DEFINITION]`
 * covers them all. A library model is not a path, so there is nothing to gather for it.
 */
function userFiles(content: string): DeclaredFile[] {
  const files: DeclaredFile[] = [];

  const model = parseModelFile(content);
  if (model !== undefined && !model.startsWith("lib:")) {
    files.push({ declared: model, folder: "ModelFile" });
  }

  const definition = definitionBlock(content);
  for (const entry of definition === undefined ? [] : scanNamedEntries(definition)) {
    const declared = entryFileValue(entry.body);
    if (declared !== undefined) {
      files.push({ declared, folder: "ExternalFiles" });
    }
  }

  return files;
}
