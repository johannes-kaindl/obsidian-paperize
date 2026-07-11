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
  it('does not duplicate nested list text into the parent item inlines', () => {
    const { blocks } = domToIrSync(dom('<ul><li>top<ul><li>child</li></ul></li></ul>'));
    const list = blocks[0] as any;
    const parentText = list.items[0].inlines.map((r: any) => r.text).join('');
    expect(parentText).toBe('top');
    const childItem = list.items[0].children[0].items[0];
    const childText = childItem.inlines.map((r: any) => r.text).join('');
    expect(childText).toBe('child');
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
  it('bumps unsupportedCount for an image inside a list item', () => {
    const { blocks, unsupportedCount } = domToIrSync(dom('<ul><li>top<img src="x.png"></li></ul>'));
    expect(blocks[0].type).toBe('list');
    expect(unsupportedCount).toBe(1);
  });
  it('bumps unsupportedCount for an image inside a table cell', () => {
    const { blocks, unsupportedCount } = domToIrSync(dom('<table><tbody><tr><td><img src="x.png"></td></tr></tbody></table>'));
    expect(blocks[0].type).toBe('table');
    expect(unsupportedCount).toBe(1);
  });
  it('keeps an inline image alongside surrounding paragraph text', () => {
    const { blocks, imageEls } = domToIrSync(dom('<p>Siehe <img src="fig.png" alt="Fig"> unten</p>'));
    const para = blocks.find((b: any) => b.type === 'paragraph') as any;
    expect(para).toBeDefined();
    expect(para.inlines.map((r: any) => r.text).join('')).toBe('Siehe  unten');
    const imageBlock = blocks.find((b: any) => b.type === 'image');
    expect(imageBlock).toBeDefined();
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
  it('resolves images to the correct bytes across top-level, blockquote-nested, and trailing positions', async () => {
    const { blocks, imageEls } = domToIrSync(
      dom('<p><img src="one.png"></p><blockquote><p><img src="two.png"></p></blockquote><p><img src="three.png"></p>'),
    );
    expect(imageEls.length).toBe(3);
    const decode = async (src: string) => ({ data: new TextEncoder().encode(src), wPx: 1, hPx: 1 });
    const res = await resolveImages(blocks, imageEls, decode);
    const topImage = res.blocks.find((b: any) => b.type === 'image') as any;
    expect(new TextDecoder().decode(topImage.data)).toBe('one.png');
    const bq = res.blocks.find((b: any) => b.type === 'blockquote') as any;
    const innerImage = bq.blocks.find((b: any) => b.type === 'image') as any;
    expect(new TextDecoder().decode(innerImage.data)).toBe('two.png');
    const trailingImage = res.blocks[res.blocks.length - 1] as any;
    expect(trailingImage.type).toBe('image');
    expect(new TextDecoder().decode(trailingImage.data)).toBe('three.png');
  });
});
