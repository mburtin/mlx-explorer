import * as vscode from "vscode";

// Escapes the five characters that would otherwise open a tag or close an attribute
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

// One panel per key/project to avoid stacking a second copy of it
const open = new Map<string, vscode.WebviewPanel>();

// Reveals the panel already open for `key`, or creates one and tracks it until it is disposed
export function showPanel(key: string, create: () => vscode.WebviewPanel): vscode.WebviewPanel {
  const existing = open.get(key);
  if (existing) {
    existing.reveal();
    return existing;
  }

  const panel = create();
  open.set(key, panel);
  panel.onDidDispose(() => open.delete(key));
  return panel;
}
