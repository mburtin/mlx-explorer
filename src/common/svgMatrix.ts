/**
 * Renders the correlation matrix as a standalone SVG, on a transparent ground, laid out like
 * the page: lower triangle, row names on the left, column names swung down-left underneath.
 */

import { CORR_WARNING, corrAlpha, CorrelationMatrix } from "../modules/monolix/page/resultsTab";
import { parseSymbol } from "./symbols";
import { escapeXml, FONT, FS, INK, labelPiece, MARGIN, MINUS, n, Rendered, SvgOptions } from "./svgTable";

// Whole user units, so every cell edge lands on a pixel at any integer scale: adjacent
// translucent cells would otherwise show a seam where their anti-aliased edges overlap.
const CELL_W = 62;
const CELL_H = 32;
const LABEL_GAP = 12;
const BASE = 0.35 * FS; // from a line's middle down to its text baseline
const DIAGONAL = Math.SQRT1_2; // a name swung by 45° covers this much of its length each way

// The page's two palettes (theme.css). Dark ink sits on a light slide, so it takes the
// light theme's cells, and the reverse.
const PALETTE = {
  dark: { pos: "#1c6384", neg: "#a8452a", strong: "#ffffff" },
  light: { pos: "#00add3", neg: "#e8845a", strong: "#10222b" },
};

export function renderSvgMatrix(matrix: CorrelationMatrix, options: SvgOptions): Rendered {
  const ink = INK[options.ink];
  const palette = PALETTE[options.ink];
  const labels = matrix.names.map((name) => labelPiece(parseSymbol(name)));
  const labelWidth = labels.reduce((most, label) => Math.max(most, label.em), 0) * FS;

  const left = Math.ceil(MARGIN + labelWidth + LABEL_GAP);
  const top = Math.ceil(MARGIN);
  const bottom = top + matrix.names.length * CELL_H;

  const parts: string[] = [];
  matrix.values.forEach((row, i) => {
    const middle = top + i * CELL_H + CELL_H / 2;
    parts.push(`<text x="${n(left - LABEL_GAP)}" y="${n(middle + BASE)}" text-anchor="end">${labels[i].markup}</text>`);

    row.forEach((value, j) => {
      const alpha = corrAlpha(value);
      // Same rules as the page: the label flips past this saturation, and a pair this
      // correlated is called out in bold.
      const fill = Number(alpha) >= 0.6 ? ` fill="${palette.strong}"` : "";
      const bold = i !== j && Math.abs(value) >= CORR_WARNING ? ' font-weight="700"' : "";
      parts.push(
        `<rect x="${left + j * CELL_W}" y="${top + i * CELL_H}" width="${CELL_W}" height="${CELL_H}" ` +
          `fill="${value < 0 ? palette.neg : palette.pos}" fill-opacity="${alpha}"/>`
      );
      parts.push(
        `<text x="${n(left + (j + 0.5) * CELL_W)}" y="${n(middle + BASE)}" text-anchor="middle"${fill}${bold}>` +
          `${value.toFixed(2).replace(/^-/, MINUS)}</text>`
      );
    });
  });

  // Anchored under the middle of its column and swung down-left, so the name reads up
  // towards the column it labels. The baseline drops by BASE in the turned frame so the
  // glyphs, not their baseline, sit on the column's axis.
  const labelTop = bottom + 0.5 * FS;
  labels.forEach((label, j) => {
    parts.push(
      `<text transform="translate(${n(left + (j + 0.5) * CELL_W)} ${n(labelTop)}) rotate(-45)" ` +
        `y="${n(BASE)}" text-anchor="end">${label.markup}</text>`
    );
  });

  const width = left + matrix.names.length * CELL_W + MARGIN;
  const height = labelTop + labelWidth * DIAGONAL + FS + MARGIN;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width * options.scale)}" ` +
    `height="${n(height * options.scale)}" viewBox="0 0 ${n(width)} ${n(height)}">\n` +
    `<g fill="${ink}" stroke="none" font-family="${escapeXml(FONT)}" font-size="${FS}">\n` +
    parts.join("\n") +
    `\n</g>\n</svg>\n`;

  return { svg, width: Math.ceil(width * options.scale), height: Math.ceil(height * options.scale) };
}
