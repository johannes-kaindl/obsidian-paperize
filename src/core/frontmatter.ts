// src/core/frontmatter.ts
// Build clean metadata entries from Obsidian's parsed frontmatter object.
// Pure — no obsidian, no DOM. System/internal fields are dropped so the
// metadata block shows content, not Obsidian bookkeeping.

const SYSTEM_FIELDS = new Set([
  'position', 'aliases', 'cssclasses', 'cssclass', 'linter-yaml-title-alias',
]);

export interface MetadataEntry { key: string; value: string }

// Narrow-typed stringifier for the primitive-else branch below: `String()` itself takes
// `any`, so casting straight into `String(raw as ...)` type-checks trivially and
// `@typescript-eslint/no-unnecessary-type-assertion` then flags the cast as pointless —
// but without it, `@typescript-eslint/no-base-to-string` correctly distrusts the
// unnarrowable `unknown` remainder. Routing through a genuinely narrow parameter type
// satisfies both rules at once.
function stringifyPrimitive(v: string | number | boolean | bigint | symbol): string {
  return String(v);
}

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
      // Primitive (string/number/boolean/bigint/symbol) — Array and object are already
      // handled above. TS can't narrow `unknown` through elimination here (typeof's
      // negative branch on `unknown` stays `{}`), so the domain is asserted explicitly.
      value = stringifyPrimitive(raw as string | number | boolean | bigint | symbol);
    }
    out.push({ key, value });
  }
  return out;
}
