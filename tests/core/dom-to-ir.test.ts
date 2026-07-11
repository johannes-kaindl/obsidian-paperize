// tests/core/dom-to-ir.test.ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { domToIrSync, resolveImages } from '../../src/core/dom-to-ir';

function dom(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
}

describe('domToIrSync', () => {
  it('maps headings with levels', () => {
    const { blocks } = domToIrSync(dom('<h2>Titel</h2>'));
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2 });
  });
  it('maps a paragraph with bold and italic runs', () => {
    const { blocks } = domToIrSync(dom('<p>a <strong>b</strong> <em>c</em></p>'));
    const p = blocks[0] as any;
    expect(p.type).toBe('paragraph');
    expect(p.inlines.some((r: any) => r.bold)).toBe(true);
    expect(p.inlines.some((r: any) => r.italic)).toBe(true);
  });
  it('maps nested lists', () => {
    const { blocks } = domToIrSync(dom('<ul><li>top<ul><li>child</li></ul></li></ul>'));
    const list = blocks[0] as any;
    expect(list.type).toBe('list');
    expect(list.items[0].children[0].type).toBe('list');
  });
  it('maps a fenced code block with language', () => {
    const { blocks } = domToIrSync(dom('<pre><code class="language-js">x=1</code></pre>'));
    expect(blocks[0]).toMatchObject({ type: 'code', lang: 'js' });
  });
  it('maps a table with header and rows', () => {
    const { blocks } = domToIrSync(dom('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>a1</td></tr></tbody></table>'));
    const t = blocks[0] as any;
    expect(t.type).toBe('table');
    expect(t.header.length).toBe(1);
    expect(t.rows.length).toBe(1);
  });
  it('maps unknown block elements to unsupported', () => {
    const { blocks, unsupportedCount } = domToIrSync(dom('<div class="callout">Achtung</div>'.replace('div', 'aside')));
    expect(unsupportedCount).toBe(1);
    expect(blocks[0].type).toBe('unsupported');
  });
  it('emits an image placeholder paired with the img element', () => {
    const { blocks, imageEls } = domToIrSync(dom('<p><img src="x.png" alt="Foto"></p>'));
    expect(blocks[0].type).toBe('image');
    expect(imageEls.length).toBe(1);
  });
});

describe('resolveImages', () => {
  it('replaces a placeholder with decoded bytes', async () => {
    const { blocks, imageEls } = domToIrSync(dom('<p><img src="x.png"></p>'));
    const res = await resolveImages(blocks, imageEls, async () => ({ data: new Uint8Array([1]), wPx: 10, hPx: 5 }));
    expect(res.blocks[0]).toMatchObject({ type: 'image', wPx: 10, hPx: 5 });
  });
  it('degrades to unsupported when decode fails', async () => {
    const { blocks, imageEls } = domToIrSync(dom('<p><img src="x.png" alt="Foto"></p>'));
    const res = await resolveImages(blocks, imageEls, async () => null);
    expect(res.blocks[0].type).toBe('unsupported');
    expect(res.unsupportedAdded).toBe(1);
  });
});
