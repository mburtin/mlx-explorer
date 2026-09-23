import { escapeHtml } from "./webview";

const ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M10.8 2.7 13.3 5.2 5.5 13H3v-2.5z"/><path d="M9.3 4.2l2.5 2.5"/></svg>';

export function renderEditLink(fileUri: string): string {
  const href = `command:mlx-explorer.editModel?${encodeURIComponent(JSON.stringify([fileUri]))}`;
  return `<a class="btn-edit" href="${escapeHtml(href)}" aria-label="Edit the model" ` +
    `title="Open the model file in an editor">${ICON}</a>`;
}
