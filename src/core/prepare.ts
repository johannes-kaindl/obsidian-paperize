// src/core/prepare.ts
// Remove a leading YAML frontmatter block (--- ... ---).
export function stripFrontmatter(md: string): string {
  const m = /^\uFEFF?---\r?\n(?:[\s\S]*?\r?\n)?---\r?\n?/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

// The note's own leading H1, if it has one — null otherwise. Only the block before the
// first non-blank, non-heading line is considered: a `# ...` further down is a section
// heading, not the document's title.
export function leadingH1(md: string): string | null {
  for (const ln of md.split(/\r?\n/)) {
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(ln);
    if (m) return m[1].trim();
    if (ln.trim() !== '') break;
  }
  return null;
}

// Derive a document title: first ATX H1 (# ...), else the note's base name.
export function deriveTitle(md: string, fallbackName: string): string {
  return leadingH1(md) ?? fallbackName;
}
