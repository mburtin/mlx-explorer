import { escapeHtml } from "./webview";

// Keep in sync with syntaxes/mlxtran.tmLanguage.json
const KEYWORDS = new Set(["if", "elseif", "else", "end"]);
const FUNCTIONS = new Set([
  "compartment", "peripheral", "oral", "iv", "depot", "elimination", "transfer", "effect",
  "empty", "reset", "absorption", "pkmodel",
  "exp", "log", "log10", "sqrt", "abs", "min", "max", "pow", "sin", "cos", "tan", "floor",
  "ceil", "logit", "invlogit", "probit", "normcdf", "factorial", "gammaln", "delay",
]);
const BUILTINS = new Set([
  "t", "t0", "odeType", "use", "distribution", "prediction", "errorModel",
]);
const BLOCKS = new Set(["input", "output", "table"]);

// Token regex for general patterns (no ^ to avoid issues with alternation)
const TOKEN = new RegExp(
  [
    /(?<comment>;.*)/,
    /(?<string>"[^"\n]*")/,
    /(?<section>\[[A-Za-z_]+\])/,
    /(?<number>\b\d+(?:\.\d*)?(?:[eE][+-]?\d+)?\b)/,
    /(?<word>\b[A-Za-z_]\w*\b)/,
  ].map((re) => re.source).join("|"),
  "gm"
);

// Regex for block labels at start of line: PK:, EQUATION:, etc.
const BLOCK_LABEL = /^[ \t]*([A-Za-z_]+)(?=:)/;

function wordClass(word: string, rest: string): string | undefined {
  if (KEYWORDS.has(word)) {
    return "keyword";
  }
  if (FUNCTIONS.has(word)) {
    return "function";
  }
  if (BUILTINS.has(word) || word.startsWith("ddt_")) {
    return "builtin";
  }
  if (BLOCKS.has(word) && /^\s*=/.test(rest)) {
    return "keyword";  // input =, output =, table =
  }
  return undefined;
}

function highlightLine(line: string): string {
  // Check for block label at start of line (PK:, EQUATION:, etc.)
  const labelMatch = line.match(BLOCK_LABEL);
  if (labelMatch) {
    const beforeLabel = line.slice(0, labelMatch.index);
    const label = labelMatch[1];
    // afterLabel starts with ':' since the regex uses lookahead (?=:)
    const afterLabel = line.slice((labelMatch.index ?? 0) + labelMatch[0].length);
    return (
      escapeHtml(beforeLabel) +
      `<span class="tk-section">${escapeHtml(label)}</span>` +
      highlightRest(afterLabel)
    );
  }

  return highlightRest(line);
}

function highlightRest(text: string): string {
  let html = "";
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const groups = match.groups ?? {};
    const token = match[0];
    const start = match.index ?? 0;
    const kind = groups.word !== undefined
      ? wordClass(token, text.slice(start + token.length, start + token.length + 8))
      : Object.keys(groups).find((name) => groups[name] !== undefined);

    html += escapeHtml(text.slice(last, start));
    html += kind === undefined
      ? escapeHtml(token)
      : `<span class="tk-${kind}">${escapeHtml(token)}</span>`;
    last = start + token.length;
  }
  return html + escapeHtml(text.slice(last));
}

// Mlxtran model text as HTML, with its tokens wrapped in <span class="tk-...">
export function highlight(text: string): string {
  const lines = text.split("\n");
  return lines.map((line) => highlightLine(line)).join("\n");
}
