// src/obsidian/export-desktop.ts
// Desktop-Druckweg: Notiz in Obsidians eigenem Renderer zeichnen, CSS einsammeln, in einem
// unsichtbaren <webview> drucken. Alles Reine liegt in core/desktop-print.ts und im Kit.
import { App, Component, MarkdownRenderer, TFile, requestUrl } from 'obsidian';
import type { PaperizeSettings } from './settings';
import {
  desktopExtraCss, printBackgroundFor, profileBodyClass, renderWidthPx,
} from '../core/desktop-print';
import type { DesktopPageSettings, DesktopProfile, PageColors } from '../core/desktop-print';
import { buildMetadataEntries } from '../core/frontmatter';
import { leadingH1 } from '../core/prepare';
import { imageSourceKind, mimeForBytes, withTimeout } from '../core/image-source';
import { collectDocumentCss } from '../vendor/kit/collect-css';
import { buildPrintDocument, supportsPageMarginBoxes } from '../vendor/kit/print-document';
import { PRINT_PAGE_CLASS } from '../vendor/kit/print-css';
import { bytesToBase64, mimeForExtension } from '../vendor/kit/data-url';
import { extractCodeBlocks } from '../vendor/kit/pdf/code-blocks';
import type { printHtmlToPdf } from '../vendor/kit-obsidian/print-to-pdf';

const IMAGE_TIMEOUT_MS = 15000;
const RENDER_TIMEOUT_MS = 10000;
const MERMAID_POLL_MS = 100;
/** Keine Skripte, keine Frames; Stile und Bilder nur inline, als data: oder https. */
const PRINT_CSP = "default-src 'none'; style-src 'unsafe-inline' https:; font-src data: https:; img-src data: https:";

export interface DesktopExportInput {
  app: App;
  file: TFile;
  body: string;
  title: string;
  profile: DesktopProfile;
  settings: PaperizeSettings;
  dateStr: string;
  checkpoint: () => void;
  print: typeof printHtmlToPdf;
}

function pageSettingsOf(s: PaperizeSettings, title: string, dateStr: string): DesktopPageSettings {
  return {
    pageSize: s.pageSize,
    marginMm: s.marginMm,
    pageNumbers: s.pageNumbers,
    footer: s.runningHeaderFooter ? { left: title, right: dateStr } : null,
    imageMaxWidthPct: s.imageMaxWidthPct,
    keepTablesTogether: s.keepTablesTogether,
    repeatTableHeader: s.repeatTableHeader,
    keepImagesTogether: s.keepImagesTogether,
    keepCodeTogether: s.keepCodeTogether,
    headingKeepWithLines: s.headingKeepWithLines,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => { window.setTimeout(r, ms); });

/** Wartet, bis jedes Mermaid-Diagramm ein svg hat, höchstens `RENDER_TIMEOUT_MS`. Was danach fehlt, bleibt so. */
async function waitForMermaid(host: HTMLElement, expected: number): Promise<void> {
  const deadline = Date.now() + RENDER_TIMEOUT_MS;
  while (expected > 0 && host.querySelectorAll('.mermaid svg').length < expected && Date.now() < deadline) {
    await sleep(MERMAID_POLL_MS);
  }
}

function isClear(color: string): boolean {
  const c = color.trim().toLowerCase();
  return c === '' || c === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(c);
}

/** Liest zwei ausgeschriebene Farben für `@page` aus einem Probe-Element (dort wirken keine Variablen). */
function probeColors(host: HTMLElement): PageColors {
  const probe = host.createDiv({ cls: 'paperize-color-probe' });
  try {
    const cs = activeWindow.getComputedStyle(probe);
    return {
      background: isClear(cs.backgroundColor) ? null : cs.backgroundColor,
      muted: isClear(cs.color) ? null : cs.color,
    };
  } finally {
    probe.remove();
  }
}

async function toDataUrl(src: string): Promise<string | null> {
  const kind = imageSourceKind(src);
  if (kind === 'direct' && /^data:/i.test(src)) return null;
  let bytes: Uint8Array;
  let header = '';
  if (kind === 'remote') {
    const res = await withTimeout(requestUrl({ url: src, throw: false }), IMAGE_TIMEOUT_MS);
    if (!res || res.status < 200 || res.status >= 300) return null;
    bytes = new Uint8Array(res.arrayBuffer);
    header = res.headers['content-type'] ?? '';
  } else {
    const res = await withTimeout(activeWindow.fetch(src), IMAGE_TIMEOUT_MS);
    if (!res || !res.ok) return null;
    bytes = new Uint8Array(await res.arrayBuffer());
    header = res.headers.get('content-type') ?? '';
  }
  return `data:${mimeForBytes(header, bytes)};base64,${bytesToBase64(bytes)}`;
}

/** Der Gast hat kein app://-Origin: Bilder gehen als data:-URL hinein, was scheitert, bleibt stehen. */
async function inlineImages(host: HTMLElement): Promise<void> {
  for (const img of Array.from(host.querySelectorAll('img'))) {
    const src = img.getAttribute('src');
    if (!src) continue;
    try {
      const url = await toDataUrl(src);
      if (url) img.setAttribute('src', url);
    } catch (e) { console.warn('Paperize: image not inlined', src, e); }
  }
}

/** Das Symbol des externen Links aus Obsidians eigenem Paket als data:-URL; `null`, wenn es sich nicht holen lässt (dann bleibt die Lücke, wie bisher). */
async function loadExternalLinkIcon(): Promise<string | null> {
  try {
    const res = await withTimeout(activeWindow.fetch(new URL('./public/external-link.svg', activeDocument.baseURI).href), IMAGE_TIMEOUT_MS);
    if (!res || !res.ok) return null;
    return `data:image/svg+xml;base64,${bytesToBase64(new Uint8Array(await res.arrayBuffer()))}`;
  } catch { return null; }
}

async function inlineFontUrl(url: string): Promise<string | null> {
  try {
    const res = await withTimeout(activeWindow.fetch(url), IMAGE_TIMEOUT_MS);
    if (!res || !res.ok) return null;
    const ext = /\.(woff2?|ttf|otf)(?:[?#].*)?$/i.exec(url)?.[1] ?? '';
    const mime = mimeForExtension(ext) ?? 'application/octet-stream';
    return `data:${mime};base64,${bytesToBase64(new Uint8Array(await res.arrayBuffer()))}`;
  } catch { return null; }
}

function addTitleAndMetadata(host: HTMLElement, input: DesktopExportInput): void {
  const { settings, body, title, app, file } = input;
  const top: HTMLElement[] = [];
  if (settings.showTitle && leadingH1(body) === null) {
    top.push(createEl('h1', { text: title, cls: 'paperize-title' }));
  }
  if (settings.showFrontmatter) {
    const entries = buildMetadataEntries(app.metadataCache.getFileCache(file)?.frontmatter);
    if (entries.length) {
      const table = createEl('table', { cls: 'paperize-meta' });
      for (const e of entries) {
        const tr = table.createEl('tr');
        tr.createEl('th', { text: e.key });
        tr.createEl('td', { text: e.value });
      }
      top.push(table);
    }
  }
  host.prepend(...top);
}

function markPageBreaks(host: HTMLElement, marker: string): void {
  if (!marker) return;
  for (const p of Array.from(host.querySelectorAll('p'))) {
    if ((p.textContent ?? '').trim() === marker) p.replaceWith(createDiv({ cls: 'paperize-break' }));
  }
}

export async function renderDesktopPdf(input: DesktopExportInput): Promise<Uint8Array> {
  const { app, file, body, profile, settings, checkpoint } = input;
  const page = pageSettingsOf(settings, input.title, input.dateStr);
  const host = activeDocument.body.createDiv({ cls: 'paperize-render-host markdown-preview-view markdown-rendered' });
  host.setCssProps({ '--paperize-render-width': `${renderWidthPx(page)}px` });
  const comp = new Component();
  try {
    // Ohne extractCodeBlocks: Mermaid und fremde Prozessoren sollen zeichnen dürfen.
    const mermaidCount = extractCodeBlocks(body, 'PAPERIZECODE').codes.filter((c) => c.lang === 'mermaid').length;
    await withTimeout(MarkdownRenderer.render(app, body, host, file.path, comp), RENDER_TIMEOUT_MS);
    await waitForMermaid(host, mermaidCount);
    checkpoint();
    addTitleAndMetadata(host, input);
    markPageBreaks(host, settings.pageBreakMarker);
    await inlineImages(host);
    const colors = probeColors(host);
    const { css } = await collectDocumentCss(activeDocument, { inlineUrl: inlineFontUrl });
    const linkIcon = await loadExternalLinkIcon();
    checkpoint();

    const marginBoxes = supportsPageMarginBoxes(activeWindow.navigator.userAgent);
    const html = buildPrintDocument({
      css,
      extraCss: desktopExtraCss(profile, page, colors, marginBoxes, linkIcon),
      htmlClass: activeDocument.documentElement.className,
      bodyClass: profileBodyClass(profile, activeDocument.body.className),
      bodyStyle: activeDocument.body.getAttribute('style') ?? '',
      lang: activeDocument.documentElement.lang || 'en',
      contentHtml: `<div class="${PRINT_PAGE_CLASS}"><div class="markdown-preview-view markdown-rendered">${host.innerHTML}</div></div>`,
      csp: PRINT_CSP,
    });
    checkpoint();
    const bytes = await input.print(activeDocument, html, {
      pageSize: settings.pageSize,
      printBackground: printBackgroundFor(profile),
    });
    checkpoint();
    return bytes;
  } finally {
    host.remove();
    comp.unload();
  }
}
