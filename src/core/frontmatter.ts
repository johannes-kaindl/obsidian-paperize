// src/core/frontmatter.ts
// Build clean metadata entries from Obsidian's parsed frontmatter object.
// Pure — no obsidian, no DOM. System/internal fields are dropped so the
// metadata block shows content, not Obsidian bookkeeping.

const SYSTEM_FIELDS = new Set([
  'position', 'aliases', 'cssclasses', 'cssclass', 'linter-yaml-title-alias',
]);

export interface MetadataEntry { key: string; value: string }

export function buildMetadataEntries(fm: Record<string, unknown> | null | undefined): MetadataEntry[] {
  if (!fm || typeof fm !== 'object') return [];
  const out: MetadataEntry[] = [];
  for (const [key, raw] of Object.entries(fm)) {
    if (SYSTEM_FIELDS.has(key)) continue;
    if (raw == null || raw === '') continue;
    let value: string;
    if (Array.isArray(raw)) {
      const parts = raw.filter((v) => v != null && v !== '').map((v) => String(v));
      if (!parts.length) continue;
      value = parts.join(', ');
    } else if (typeof raw === 'object') {
      value = JSON.stringify(raw);
    } else {
      value = String(raw);
    }
    out.push({ key, value });
  }
  return out;
}
