import { escapeHtml } from "./webview";

// Keep in sync with syntaxes/mlxtran.tmLanguage.json
const CONDITIONS = new Set(["if", "elseif", "else", "end"]);
const MACROS = new Set([
  "compartment", "peripheral", "oral", "iv", "depot", "elimination", "transfer", "effect",
  "empty", "reset", "absorption", "pkmodel", "delay", "input", "output", "table", "correlation", 
  "Seizure", "rightCensoringTime", "CountNumber", "level", "State", "Event"
]);
const KEYWORDS = new Set([
  "t", "t0", "odeType", "odeAbsTol", "use", "distribution", "prediction", "errorModel", "typical", "sd",
  "adm", "target", "no-variability", "type", "eventType", "maxEventNumber", "categories", "dependence",
  "hazard", "cmt", "amount", "volume", "concentration", "Tlag", "amtDose", "inftDose", "tDose",
  "min", "max", "abs", "sqrt", "exp", "log", "log10", "logit", "invlogit", "probit", "normcdf", 
  "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "atan2", "gammaln", "floor", 
  "ceil", "factorial", "factln", "rem"
]);

// Token regex for general patterns (no ^ to avoid issues with alternation)
const TOKEN = new RegExp(
  [
    /(?<comment>;.*)/,
    /(?<string>"[^"\n]*")/,
    /(?<section>\[[A-Za-z_]+\])/,
    /(?<number>\b\d+(?:\.\d*)?(?:[eE][+-]?\d+)?\b)/,
    /(?<word>\bno-variability\b|\b[A-Za-z_]\w*\b)/,
  ].map((re) => re.source).join("|"),
  "gm"
);

// Regex for block labels at start of line: PK:, EQUATION:, etc.
const BLOCK_LABEL = /^[ \t]*([A-Za-z_]+)(?=:)/;

function wordClass(word: string, next: string): string | undefined {
  if (word === "r" && next === "(") {
    return "keyword";  // correlation = {r(A, B) = ...}
  }
  if (CONDITIONS.has(word)) {
    return "condition";
  }
  if (MACROS.has(word)) {
    return "macros";
  }
  if (KEYWORDS.has(word) || word.startsWith("ddt_")) {
    return "keyword";
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
      ? wordClass(token, text.charAt(start + token.length))
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
