import { stripe } from "../../../common/webview";

// Same checkbox trick as the CV (%) switch: no script runs, :has() in the CSS reads its state.
export const SIMULATED_TOGGLE = `<label class="cv-switch" title="Show only what the simulation groups use">
    <input type="checkbox" class="sim-toggle" checked>
    <span class="cv-switch-slider"></span>
    <span class="cv-switch-label">Simulated</span>
  </label>`;

/**
 * Two bodies, one per view, each striped on its own: hiding rows of a single body
 * would leave the zebra uneven.
 */
export function renderToggledBodies<T extends { simulated: boolean }>(
  items: T[],
  row: (item: T, alt: string) => string
): string {
  const all = items.map((item, i) => row(item, stripe(i))).join("");
  const simulated = items
    .filter((item) => item.simulated)
    .map((item, i) => row(item, stripe(i)))
    .join("");
  return `<tbody class="rows-all">${all}</tbody><tbody class="rows-simulated">${simulated}</tbody>`;
}
