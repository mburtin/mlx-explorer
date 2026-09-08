/**
 * A project file is a flat list of `<SECTION>` markers, each holding `[BLOCK]` markers, 
 * each holding `key = value` lines.
 */

// Returns the text between a marker and the next marker of the same kind
function slice(content: string, start: RegExp, next: RegExp): string | undefined {
  const found = start.exec(content);
  if (!found) {
    return undefined;
  }
  const rest = content.slice(found.index + found[0].length);
  const end = next.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

// The body of `<NAME>`, up to the next section
export function section(content: string, name: string): string | undefined {
  return slice(content, new RegExp(`^<${name}>`, "m"), /^</m);
}

// The body of `[NAME]` inside a section, up to the next block
export function block(content: string, name: string): string | undefined {
  return slice(content, new RegExp(`^\\[${name}\\]`, "m"), /^\[/m);
}

// Whether `<NAME>` is declared at all
export function hasSection(content: string, name: string): boolean {
  return new RegExp(`^<${name}>`, "m").test(content);
}

/**
 * Returns the text after a `NAME:` marker (such as `POPULATION:`) until the next
 * marker, `[BLOCK]`, `<SECTION>`, or the end.
 */
export function label(content: string, name: string): string | undefined {
  return slice(content, new RegExp(`^${name}:`, "m"), /^[A-Z][A-Z0-9_]*:[ \t]*$|^\[|^</m);
}

/**
 * The substring between the `{` at `openIndex` and its matching `}`, depth-counted so a
 * nested `{...}` (a dose list, a time grid, ...) doesn't close it early. `content[openIndex]`
 * must be `{`. Undefined if the braces never balance.
 */
export function braceBody(content: string, openIndex: number): string | undefined {
  let depth = 0;
  for (let i = openIndex; i < content.length; i++) {
    if (content[i] === "{") {
      depth++;
    } else if (content[i] === "}") {
      depth--;
      if (depth === 0) {
        return content.slice(openIndex + 1, i);
      }
    }
  }
  return undefined;
}

/**
 * A `file` key up to its opening quote.
 * Monolix 2023+ writes file={path='...'}, earlier versions a bare file='...'.
 */
const FILE_KEY = "file[ \\t]*=[ \\t]*(?:\\{[ \\t]*path[ \\t]*=[ \\t]*)?'";

/** The path the section's own `file` key points at, the key being a line of its own. */
export function fileValue(content: string): string | undefined {
  return new RegExp(`^[ \\t]*${FILE_KEY}([^']*)'`, "m").exec(content)?.[1];
}

/**
 * The path a `file` key nested inside a `'name' = {...}` entry points at. Same key,
 * without the line anchor: Simulx writes it mid-line, as in
 * `'Regressors' = {file={path='...'}}`.
 */
export function entryFileValue(content: string): string | undefined {
  return new RegExp(`${FILE_KEY}([^']*)'`).exec(content)?.[1];
}

/** Escapes a path so it can go into a pattern as a literal. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Repoints the `file` key whose path is exactly `declared`, leaving the rest of the
 * declaration alone - Monolix writes `file={path='...', relativePath='true'}`, and the
 * trailing keys must survive. Keyed on the path rather than on a position, so the other
 * `file` keys of the project are not touched.
 */
export function replaceFileValue(
  content: string,
  declared: string,
  replacement: string
): string {
  const pattern = new RegExp(`(${FILE_KEY})${literal(declared)}'`);
  // Function form: a `$` in the new path would otherwise read as a capture reference.
  return content.replace(pattern, (_match, key: string) => `${key}${replacement}'`);
}

/**
 * Sets a bare `key=value` line in `[SETTINGS] GLOBAL:`, adding it under the marker when
 * the project does not declare it yet. A project without a `GLOBAL:` marker is returned
 * unchanged: writing the setting would mean inventing the block that holds it.
 */
export function setGlobalSetting(content: string, key: string, value: string): string {
  const existing = new RegExp(`^${key}[ \\t]*=.*$`, "m");
  if (existing.test(content)) {
    return content.replace(existing, `${key}=${value}`);
  }
  return content.replace(/^GLOBAL:$/m, (marker) => `${marker}\n${key}=${value}`);
}

// The value of a quoted `key = '...'` setting
export function quotedValue(content: string, key: string): string | undefined {
  return new RegExp(`^${key}\\s*=\\s*'([^']*)'`, "m").exec(content)?.[1];
}

/** Folder the project exports to, relative to the project folder. Same key in every tool. */
export function parseExportPath(content: string): string | undefined {
  return quotedValue(content, "exportpath");
}
