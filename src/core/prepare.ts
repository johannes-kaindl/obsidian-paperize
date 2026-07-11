// src/core/prepare.ts
// Remove a leading YAML frontmatter block (--- ... ---).
export function stripFrontmatter(md: string): string {
  const m = /^﻿?---\r?\n(?:[\s\S]*?\r?\n)?---\r?\n?/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

// Derive a document title: first ATX H1 (# ...), else the note's base name.
export function deriveTitle(md: string, fallbackName: string): string {
  const lines = md.split(/\r?\n/);
  for (const ln of lines) {
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(ln);
    if (m) return m[1].trim();
    if (ln.trim() !== '') break; // only look before the first non-blank non-heading line
  }
  return fallbackName;
}
