import { describe, it, expect } from 'vitest';
import { renderPdf, DEFAULT_OPTIONS } from '../src/vendor/kit/pdf';

describe('vendored kit engine', () => {
  it('renders a trivial PDF', () => {
    const bytes = renderPdf([{ type: 'paragraph', inlines: [{ text: 'hi' }] }], DEFAULT_OPTIONS);
    let s = ''; for (const b of bytes.slice(0, 8)) s += String.fromCharCode(b);
    expect(s.startsWith('%PDF-1.7')).toBe(true);
  });
});
