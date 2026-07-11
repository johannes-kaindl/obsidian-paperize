// src/obsidian/main.ts
import { Plugin, Notice, MarkdownRenderer, Component, TFile, normalizePath } from 'obsidian';
import { DEFAULT_SETTINGS, PaperizeSettings, PaperizeSettingTab, settingsToOptions } from './settings';
import { writePdf } from './output';
import { stripFrontmatter, deriveTitle } from '../core/prepare';
import { buildMetadataEntries } from '../core/frontmatter';
import { domToIrSync, resolveImages } from '../core/dom-to-ir';
import { imageToJpeg } from '../core/image';
import { renderPdf } from '../vendor/kit/pdf';

// Local YYYY-MM-DD formatter for the running footer date. Obsidian's global
// `moment` is intentionally not used here: obsidian.d.ts re-exports it via a
// namespace import (`import * as Moment from 'moment'`), which causes
// TypeScript to strip the call signature from `typeof Moment` — `moment()`
// is "not callable" under this repo's TS/obsidian-types combination.
function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default class PaperizePlugin extends Plugin {
  settings: PaperizeSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    this.addRibbonIcon('file-down', 'Paperize: als PDF exportieren', () => this.exportActive());
    this.addCommand({ id: 'export-pdf', name: 'Aktive Notiz als PDF exportieren', callback: () => this.exportActive() });
    this.addSettingTab(new PaperizeSettingTab(this.app, this));
  }

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }

  private async exportActive(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') { new Notice('Keine aktive Markdown-Notiz.'); return; }
    try {
      await this.exportFile(file);
    } catch (e) {
      console.error('Paperize: export failed', e);
      new Notice('PDF-Export fehlgeschlagen (siehe Konsole).');
    }
  }

  private async exportFile(file: TFile): Promise<void> {
    const raw = await this.app.vault.read(file);
    // Always strip the raw YAML from the body (it would render as an ugly code block);
    // the frontmatter is re-surfaced as a clean metadata block below when enabled.
    const body = stripFrontmatter(raw);
    if (!body.trim()) { new Notice('Nichts zu exportieren.'); return; }
    const title = deriveTitle(body, file.basename);

    // Render markdown → detached DOM via Obsidian's own parser.
    const holder = createDiv();
    const comp = new Component();
    let unsupportedCount: number;
    let resolved: Awaited<ReturnType<typeof resolveImages>>;
    try {
      await MarkdownRenderer.render(this.app, body, holder, file.path, comp);
      const extracted = domToIrSync(holder);
      unsupportedCount = extracted.unsupportedCount;
      resolved = await resolveImages(extracted.blocks, extracted.imageEls, (src) => this.decodeImage(src, file));
    } finally {
      comp.unload();
    }

    const totalUnsupported = unsupportedCount + resolved.unsupportedAdded;
    const dateStr = todayStr();
    const options = settingsToOptions(this.settings, title, dateStr);

    // Re-surface frontmatter as a clean metadata block at the top (after the title).
    const blocks = resolved.blocks;
    if (this.settings.showFrontmatter) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
      const entries = buildMetadataEntries(fm);
      if (entries.length) blocks.unshift({ type: 'metadata', entries });
    }
    const bytes = renderPdf(blocks, options);

    const attachmentPath = this.settings.outputMode === 'attachmentFolder' ? await this.attachmentPathFor(file) : '';
    const noteDir = file.parent ? file.parent.path : '';
    await writePdf(this.app, bytes, this.settings.outputMode, {
      noteDir: noteDir === '/' ? '' : noteDir,
      baseName: file.basename,
      customFolder: this.settings.customFolder,
      attachmentPath,
      openAfter: false,
    });

    if (totalUnsupported > 0) new Notice(`PDF erstellt. ${totalUnsupported} Element(e) wurden vereinfacht dargestellt (z.B. Callouts, Mathe).`);
  }

  // Resolve the destination path Obsidian would use for an attachment named <base>.pdf.
  private async attachmentPathFor(file: TFile): Promise<string> {
    const fm: any = this.app.fileManager as any;
    if (typeof fm.getAvailablePathForAttachment === 'function') {
      return normalizePath(await fm.getAvailablePathForAttachment(`${file.basename}.pdf`, file.path));
    }
    return normalizePath(`${file.parent ? file.parent.path : ''}/${file.basename}.pdf`);
  }

  // Decode an <img src> (app://, data:, or vault-relative) to JPEG bytes.
  private async decodeImage(src: string, file: TFile): Promise<{ data: Uint8Array; wPx: number; hPx: number } | null> {
    try {
      let url = src;
      if (!/^(data:|https?:|app:|blob:)/.test(src)) {
        const dest = this.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(src.replace(/^\.\//, '')), file.path);
        if (dest) url = this.app.vault.getResourcePath(dest);
      }
      return await imageToJpeg(url, 1600);
    } catch (e) { console.error('Paperize: image decode failed', e); return null; }
  }
}
