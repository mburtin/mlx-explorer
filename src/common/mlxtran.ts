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
 * Monolix 2023+ writes file={path='...'}, earlier versions a bare file='...'
 */
export function fileValue(content: string): string | undefined {
  return /^[ \t]*file[ \t]*=[ \t]*(?:\{[ \t]*path[ \t]*=[ \t]*)?'([^']*)'/m.exec(content)?.[1];
}

// The value of a quoted `key = '...'` setting
export function quotedValue(content: string, key: string): string | undefined {
  return new RegExp(`^${key}\\s*=\\s*'([^']*)'`, "m").exec(content)?.[1];
}
