// @vitest-environment happy-dom
// Headless end-to-end harness: representative rendered-markdown DOM →
// domToIrSync → resolveImages → renderPdf → tools/sample-output.pdf.
// Not part of the normal suite (vitest.config only includes tests/**).
// Run on demand: npx vitest run tools/render-sample.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { domToIrSync, resolveImages } from '../src/core/dom-to-ir';
import { renderPdf, DEFAULT_OPTIONS } from '../src/vendor/kit/pdf';

// A valid 1×1 JPEG so the image block embeds a real DCTDecode XObject.
const JPEG_1x1_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
  'AAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==';

function jpegBytes(): Uint8Array {
  const bin = atob(JPEG_1x1_B64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

// Representative HTML as Obsidian's MarkdownRenderer would emit for tools/sample.md.
const HTML = `
<h1>🚦 Cockpit — Funktionsüberblick</h1>
<p>Emoji-Test: 📅 Heute · ✅ Aufgaben · 🗂️ Projekte — Tasks ≥14 Tage → abschließen, WIP ≤2.</p>
<p>Ein Absatz mit <strong>fettem</strong>, <em>kursivem</em> und <code>inline-code</code> Text sowie einem <a href="https://example.com">Link zu example.com</a>. Dieser Absatz ist bewusst etwas länger, damit der Zeilenumbruch der PDF-Engine sichtbar wird und mehrere Zeilen entstehen.</p>
<h2>Aufzählungen</h2>
<ul><li>Erster Punkt</li><li>Zweiter Punkt mit Unterpunkten<ul><li>Unterpunkt A</li><li>Unterpunkt B</li></ul></li><li>Dritter Punkt</li></ul>
<h2>Nummerierte Liste</h2>
<ol><li>Schritt eins</li><li>Schritt zwei</li><li>Schritt drei</li></ol>
<h2>Zitat</h2>
<blockquote><p>Ein Blockzitat über die Qualität von PDF-Exporten. Zweite Zeile des Zitats.</p></blockquote>
<h2>Code</h2>
<pre><code class="language-js">function hallo(name) {
  return \`Hallo, \${name}!\`;
}</code></pre>
<h2>Tabelle</h2>
<table><thead><tr><th>Feld</th><th>Typ</th><th>Pflicht</th></tr></thead><tbody>
<tr><td>titel</td><td>string</td><td>ja</td></tr>
<tr><td>datum</td><td>date</td><td>nein</td></tr>
<tr><td>empfaenger</td><td>string</td><td>ja</td></tr>
</tbody></table>
<h2>Bild</h2>
<p><img src="beispiel.png" alt="Beispielbild"></p>
<hr>
<p>Abschließender Absatz nach der Trennlinie.</p>
`;

describe('render-sample (headless E2E)', () => {
  it('renders the full Standard-scope sample to a valid PDF', async () => {
    const holder = document.createElement('div');
    holder.innerHTML = HTML;
    const { blocks, imageEls, unsupportedCount } = domToIrSync(holder);
    const resolved = await resolveImages(blocks, imageEls, async () => ({ data: jpegBytes(), wPx: 1, hPx: 1 }));

    const options = { ...DEFAULT_OPTIONS, frame: { ...DEFAULT_OPTIONS.frame, title: '🚦 Paperize Beispiel', pageNumbers: true } };
    // Simulate main.ts prepending a frontmatter metadata block after the title.
    resolved.blocks.unshift({ type: 'metadata', entries: [
      { key: 'type', value: 'Cockpit' },
      { key: 'status', value: 'Evergreen' },
      { key: 'updated', value: '2026-07-08' },
      { key: 'tags', value: 'cockpit, was-jetzt' },
    ] });
    const bytes = renderPdf(resolved.blocks, options);

    writeFileSync(`${process.cwd()}/tools/sample-output.pdf`, bytes);

    let head = '';
    for (const b of bytes.slice(0, 8)) head += String.fromCharCode(b);
    let tail = '';
    for (const b of bytes.slice(-8)) tail += String.fromCharCode(b);

    expect(head.startsWith('%PDF-1.7')).toBe(true);
    expect(tail.endsWith('%%EOF')).toBe(true);
    expect(unsupportedCount).toBe(0);          // every element in the sample is Standard-scope
    expect(resolved.unsupportedAdded).toBe(0); // image decoded fine
    // sanity: block types present
    const types = resolved.blocks.map((b) => b.type);
    expect(types).toEqual(expect.arrayContaining(['heading', 'paragraph', 'list', 'blockquote', 'code', 'table', 'image', 'hr']));
    // eslint-disable-next-line no-console
    console.log(`sample-output.pdf: ${bytes.length} bytes, ${types.length} blocks`);
  });
});
