import { describe, it, expect, vi } from 'vitest';
vi.mock('obsidian', () => ({ setIcon: () => {} }));
import { renderPdf, DEFAULT_OPTIONS } from '../src/vendor/kit/pdf';
import { COLLAPSIBLE_CSS, resolveCollapsed } from '../src/vendor/kit/obsidian/collapsible';

describe('vendored kit engine', () => {
  it('renders a trivial PDF', () => {
    const bytes = renderPdf([{ type: 'paragraph', inlines: [{ text: 'hi' }] }], DEFAULT_OPTIONS);
    let s = ''; for (const b of bytes.slice(0, 8)) s += String.fromCharCode(b);
    expect(s.startsWith('%PDF-1.7')).toBe(true);
  });
});

// Toggle-Verhalten und a11y sind Kit-seitig getestet (obsidian-kit/tests/collapsible.test.ts) —
// hier nur, dass der Import traegt und die uebernommene CSS-Konstante konform bleibt.
describe('vendored collapsible', () => {
  it('resolves a stored state over the default', () => {
    const storage = { getCollapsed: () => false, setCollapsed: () => {} };
    expect(resolveCollapsed('output', true, storage)).toBe(false);
  });
  it('falls back to the default without a stored value', () => {
    const storage = { getCollapsed: () => undefined, setCollapsed: () => {} };
    expect(resolveCollapsed('output', false, storage)).toBe(false);
  });
  it('ships CSS built only from theme variables', () => {
    expect(COLLAPSIBLE_CSS).toContain('.okit-collapsible-body.is-collapsed');
    expect(COLLAPSIBLE_CSS).not.toMatch(/#[0-9a-f]{3,6}\b/i); // keine Farb-Literale
    expect(COLLAPSIBLE_CSS).not.toContain('!important');
  });
});
