import * as vscode from "vscode";
import { formatFixed } from "./table";

// Escapes the characters that would otherwise open a tag or close an attribute
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A numeric table cell. A blank source value reads as an em dash rather than an empty box
export function numCell(raw: string, extraClass = ""): string {
  const text = raw === "" ? "—" : formatFixed(raw);
  const empty = raw === "" ? " empty" : "";
  return `<td class="num${empty}${extraClass}" title="${escapeHtml(raw)}">${escapeHtml(text)}</td>`;
}

// Zebra attribute for a body row
export function stripe(index: number): string {
  return index % 2 === 1 ? ' class="alt"' : "";
}

export interface WebviewAssets {
  // Stylesheet hrefs, already webview uris, in cascade order
  readonly styles: readonly string[];
  // The origin the CSP must allow those stylesheets to load from
  readonly cspSource: string;
}

// Builds an HTML document with the provided title, security policy, styles, and content
export function renderDocument(title: string, assets: WebviewAssets, body: string): string {
  const csp = `default-src 'none'; style-src ${assets.cspSource} 'unsafe-inline';`;
  const links = assets.styles
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<title>${escapeHtml(title)}</title>
${links}
</head>
<body>
${body}
</body>
</html>`;
}

// Panels open per key, so a split editor can hold more than one at a time
const open = new Map<string, Set<vscode.WebviewPanel>>();

// Reuses the `key` panel the user is actively viewing, so switching runs updates
// it in place; otherwise creates a new one (e.g. an empty split, or another kind
// of view being active) without touching panels already open elsewhere
export function showPanel(key: string, create: () => vscode.WebviewPanel): vscode.WebviewPanel {
  const panels = open.get(key) ?? new Set<vscode.WebviewPanel>();
  open.set(key, panels);

  const active = [...panels].find((panel) => panel.active);
  if (active) {
    return active;
  }

  const panel = create();
  panels.add(panel);
  panel.onDidDispose(() => panels.delete(panel));
  return panel;
}
