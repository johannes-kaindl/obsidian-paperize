// @vitest-environment happy-dom
// Kette vom gemessenen MathJax-4-DOM (iPhone JK, Obsidian 1.15.0, 2026-11-09) bis zum PDF-Text
// und zur Zaehlung der Meldung. Vorher stand im PDF nur "=2" und nichts wurde gezaehlt.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../../src/vendor/kit/i18n';
import { registerI18n } from '../../src/i18n/strings';
import { buildPdfPlaceholders } from '../../src/obsidian/pdf-placeholders';
import { domToIrSync } from '../../src/vendor/kit/pdf/dom-to-ir';
import { renderPdf, DEFAULT_OPTIONS } from '../../src/vendor/kit/pdf';

const mj = (latex: string, glyphs: string, display: boolean): string =>
  `<mjx-container class="MathJax" jax="CHTML" overflow="overflow"${display ? ' display="true"' : ''}>` +
  `<mjx-math data-latex="${latex}"${display ? ' display="true"' : ''} class="TEX-N">` +
  `<mjx-mi data-latex="E"><mjx-c class="mjx-c1D438">${glyphs}</mjx-c></mjx-mi></mjx-math></mjx-container>`;

const BLOCK = `<p dir="auto"><span class="math math-block is-loaded">${mj('E = mc^2', '𝐸=𝑚𝑐2', true)}</span></p>`;
const INLINE = `<p dir="auto">Wert <span class="math math-inline is-loaded">${mj('\\alpha', '𝛼', false)}</span> im Satz</p>`;

const run = (html: string) => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const out = domToIrSync(holder, { placeholders: buildPdfPlaceholders() });
  const text = out.blocks.map((b) => JSON.stringify(b)).join('\n');
  return { out, text };
};

beforeEach(() => { registerI18n(); setLang('en'); });
afterEach(() => setLang('en'));

describe('Formel mit LaTeX-Quelle (MathJax 4)', () => {
  it('Blockformel: Markierung mit Quelle, gezaehlt, Glyphen nicht im Text (EN)', () => {
    const { out, text } = run(BLOCK);
    expect(text).toContain('[Formula: E = mc^2]');
    expect(text).not.toContain('=𝑚');
    expect(out.unsupportedCount).toBe(1);
  });
  it('Blockformel deutsch', () => {
    setLang('de');
    expect(run(BLOCK).text).toContain('[Formel: E = mc^2]');
  });
  it('Inline-Formel: Markierung im Satz, gezaehlt', () => {
    const { out, text } = run(INLINE);
    expect(text).toContain('Formula: \\\\alpha');
    expect(text).toContain('im Satz');
    expect(text).not.toContain('𝛼');
    expect(out.unsupportedCount).toBeGreaterThanOrEqual(1);
  });
  it('Formel ohne Quelle: nur [Formula]', () => {
    const html = '<p><span class="math math-block"><mjx-container jax="CHTML" display="true"><mjx-math><mjx-c>=</mjx-c></mjx-math></mjx-container></span></p>';
    const { out, text } = run(html);
    expect(text).toContain('[Formula]');
    expect(out.unsupportedCount).toBe(1);
  });
  it('die Markierung landet als Text im PDF-Strom', () => {
    const { out } = run(BLOCK);
    const bytes = renderPdf(out.blocks, DEFAULT_OPTIONS);
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    expect(s).toContain('[Formula: E = mc^2]');
  });
});
