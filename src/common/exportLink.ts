import { escapeHtml } from "./webview";

export type Section = "parameters" | "criteria" | "correlation" | "simulxParameters";

const ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M8 10.5V2"/><path d="M4.8 5.2 8 2l3.2 3.2"/><path d="M3 9.5V13.5h10V9.5"/></svg>';

// What the page's shrinkage switch shows. A script-free page cannot report it, so the card
// carries one link per state and the CSS shows the matching one.
export interface ExportOptions {
  shrinkage: boolean;
}

export function renderExportLink(
  projectUri: string,
  section: Section,
  setName?: string,
  options?: ExportOptions
): string {
  const parts: unknown[] = [projectUri, section];
  if (setName !== undefined || options !== undefined) {
    parts.push(setName ?? null); // Positional: the options come after the set
  }
  if (options !== undefined) {
    parts.push(options);
  }
  const variant = options === undefined ? "" : options.shrinkage ? " shrinkage" : " no-shrinkage";
  const href = `command:mlx-explorer.exportTable?${encodeURIComponent(JSON.stringify(parts))}`;
  return `<a class="btn-export${variant}" href="${escapeHtml(href)}" aria-label="Export this table" ` +
    `title="Export this table as an image for a slide">${ICON}</a>`;
}
