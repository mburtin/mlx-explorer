import * as vscode from "vscode";
import { readText, resolveProjectPath } from "../../../common/files";
import { renderEditLink } from "../../../common/editLink";
import { highlight } from "../../../common/mlxtranHighlight";
import { escapeHtml } from "../../../common/webview";
import { parseModelFile } from "../project";

export interface ModelFile {
  path: string;   // Relative path
  uri: string;
  text: string;
}

export async function readModel(
  projectUri: vscode.Uri,
  project: string | undefined
): Promise<ModelFile | undefined> {
  const declared = project === undefined ? undefined : parseModelFile(project);
  // A library model lives inside the Monolix installation. Not supported.
  if (declared === undefined || declared.startsWith("lib:")) {
    return undefined;
  }
  const uri = resolveProjectPath(projectUri, declared);
  const text = await readText(uri);
  // Return the model file if it exists, otherwise undefined
  return text === undefined
    ? undefined
    : { path: vscode.workspace.asRelativePath(uri), uri: uri.toString(), text };
}

// Render the model content in the webview
export function renderModel(model: ModelFile): string {
  return `<section class="card">
    <div class="card-head"><h2>Model</h2><span class="note">${escapeHtml(model.path)}</span>${renderEditLink(model.uri)}</div>
    <pre class="model">${highlight(model.text)}</pre>
  </section>`;
}
