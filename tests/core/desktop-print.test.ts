// tests/core/desktop-print.test.ts
import { describe, it, expect } from 'vitest';
import {
  profileBodyClass, printBackgroundFor, renderWidthPx, paginationCss, desktopExtraCss, exportCommands, EDGE_GUARD_CSS,
} from '../../src/core/desktop-print';
import type { DesktopPageSettings } from '../../src/core/desktop-print';
import { obsidianPrintResetCss } from '../../src/vendor/kit/print-css';

const S: DesktopPageSettings = {
  pageSize: 'A4', marginMm: 20, pageNumbers: true, footer: null, imageMaxWidthPct: 100,
  keepTablesTogether: true, repeatTableHeader: true, keepImagesTogether: true, keepCodeTogether: true,
  headingKeepWithLines: 2,
};

describe('profileBodyClass', () => {
  it('paper forces the light class', () => {
    expect(profileBodyClass('paper', 'theme-dark mod-macos')).toBe('theme-light mod-macos');
    expect(profileBodyClass('paper', 'mod-macos')).toBe('theme-light mod-macos');
  });
  it('screen keeps the class', () => {
    expect(profileBodyClass('screen', 'theme-dark mod-macos')).toBe('theme-dark mod-macos');
  });
});

describe('printBackgroundFor', () => {
  it('paper prints no background', () => {
    expect(printBackgroundFor('paper')).toBe(false);
    expect(printBackgroundFor('screen')).toBe(true);
  });
});

describe('renderWidthPx', () => {
  it('A4 with 20 mm margins is 643 px', () => {
    expect(renderWidthPx(S)).toBe(643);
  });
  it('Letter is wider', () => {
    expect(renderWidthPx({ ...S, pageSize: 'Letter' })).toBe(Math.round((215.9 - 40) / 25.4 * 96));
  });
});

describe('paginationCss', () => {
  it('follows the settings', () => {
    const on = paginationCss(S);
    expect(on).toContain('table { break-inside: avoid; }');
    expect(on).toMatch(/img, \.mermaid \{ break-inside: avoid; \}/);
    expect(on).toContain('pre { break-inside: avoid; }');
    expect(on).toContain('.callout { break-inside: avoid; }');
    expect(on).toContain('break-after: avoid');
    expect(on).toContain('.paperize-break { break-after: page; }');
    expect(on).not.toContain('thead { display: table-row-group; }');
    expect(on).toContain('img { max-width: 100%; }');
    const off = paginationCss({
      ...S, keepTablesTogether: false, keepImagesTogether: false, keepCodeTogether: false,
      headingKeepWithLines: 0, repeatTableHeader: false, imageMaxWidthPct: 60,
    });
    expect(off).not.toContain('table { break-inside');
    expect(off).not.toContain('.mermaid');
    expect(off).not.toContain('pre { break-inside');
    expect(off).not.toContain('break-after: avoid');
    expect(off).toContain('thead { display: table-row-group; }');
    expect(off).toContain('img { max-width: 60%; }');
    expect(off).toContain('.callout { break-inside: avoid; }');
    expect(off).toContain('.paperize-break { break-after: page; }');
  });
});

describe('desktopExtraCss', () => {
  it('paper css', () => {
    const css = desktopExtraCss('paper', S, { background: 'rgb(15, 16, 20)', muted: 'rgb(1, 2, 3)' }, true);
    expect(css).toContain('#1a1a1a');
    expect(css).toContain('#555');
    const page = /@page \{[^}]*\}/.exec(css)![0];
    expect(page).not.toContain('background:');
  });
  it('screen css with a colour', () => {
    const css = desktopExtraCss('screen', S, { background: 'rgb(15, 16, 20)', muted: 'rgb(9, 8, 7)' }, true);
    expect(/@page \{[^}]*background: rgb\(15, 16, 20\)/.test(css)).toBe(true);
    expect(css).toContain('html, body { background: rgb(15, 16, 20); }');
    expect(css).toContain('rgb(9, 8, 7)');
  });
  it('screen css without a colour', () => {
    const css = desktopExtraCss('screen', S, { background: null, muted: null }, true);
    expect(css).not.toContain('background');
  });
  it('old shells', () => {
    const css = desktopExtraCss('paper', S, { background: null, muted: null }, false);
    expect(css).not.toContain('@bottom-center');
  });
  it('every profile keeps the right frame of full-width boxes inside the page area', () => {
    for (const p of ['paper', 'screen'] as const) {
      expect(desktopExtraCss(p, S, { background: null, muted: null }, true)).toContain(EDGE_GUARD_CSS);
    }
  });
  it('every profile gets the reset', () => {
    for (const p of ['paper', 'screen'] as const) {
      expect(desktopExtraCss(p, S, { background: null, muted: null }, true)).toContain(obsidianPrintResetCss());
    }
  });
});

describe('exportCommands', () => {
  it('lists three commands on desktop', () => {
    expect(exportCommands(true)).toEqual([
      { id: 'export-pdf', nameKey: 'cmd.export', profile: null },
      { id: 'export-pdf-screen', nameKey: 'cmd.exportScreen', profile: 'screen' },
      { id: 'export-pdf-paper', nameKey: 'cmd.exportPaper', profile: 'paper' },
    ]);
  });
  it('lists one command elsewhere', () => {
    expect(exportCommands(false).map((c) => c.id)).toEqual(['export-pdf']);
  });
});
