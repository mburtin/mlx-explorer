import { braceBody } from "../../common/mlxtran";

export interface NamedEntry {
  name: string;
  body: string;
}

export function scanNamedEntries(content: string): NamedEntry[] {
  const pattern = /'([^']+)'\s*=\s*\{/g;
  const entries: NamedEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const openIndex = match.index + match[0].length - 1;
    const body = braceBody(content, openIndex);
    if (body === undefined) {
      continue;
    }
    entries.push({ name: match[1], body });
    pattern.lastIndex = openIndex + body.length + 2;
  }

  return entries;
}
