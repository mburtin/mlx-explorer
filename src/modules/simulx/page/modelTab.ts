import * as vscode from "vscode";
import { readText, resolveProjectPath } from "../../../common/files";
import { escapeHtml } from "../../../common/webview";
import { parseModelFile } from "../project";

export interface ModelFile {
  path: string;
  text: string;
}

/**
 * The structural model the project points at. Its content is needed anyway, so the
 * read doubles as the existence check: no separate stat call.
 */
export async function readModel(
  projectUri: vscode.Uri,
  content: string
): Promise<ModelFile | undefined> {
  const declared = parseModelFile(content);
  // A library model is not a path: it lives inside the MonolixSuite installation, which
  // the extension does not locate. No tab rather than one that shows nothing.
  if (declared === undefined || declared.startsWith("lib:")) {
    return undefined;
  }
  const uri = resolveProjectPath(projectUri, declared);
  const text = await readText(uri);
  // Model moved, or the project comes from another machine.
  return text === undefined
    ? undefined
    : { path: vscode.workspace.asRelativePath(uri), text };
}

/**
 * The model file as it sits on disk: escaped, and nothing else. No <details> here -
 * collapsing is what lets several cards be scanned on one page, and this panel holds
 * exactly one card.
 */
export function renderModel(model: ModelFile): string {
  return `<section class="card">
    <div class="card-head"><h2>Model</h2><span class="note">${escapeHtml(model.path)}</span></div>
    <pre class="model">${escapeHtml(model.text)}</pre>
  </section>`;
}
