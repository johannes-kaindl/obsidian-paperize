// src/obsidian/main.ts
import { Plugin, Notice, MarkdownRenderer, Component, TFile, normalizePath, getLanguage } from 'obsidian';
import { DEFAULT_SETTINGS, PaperizeSettings, PaperizeSettingTab, settingsToOptions } from './settings';
import { writePdf, resolveVersionedOutputPath } from './output';
import { buildFilename } from '../core/filename';
import { mergeSettings } from '../vendor/kit/settings';
import { stripFrontmatter, deriveTitle } from '../core/prepare';
import { buildMetadataEntries } from '../core/frontmatter';
import { domToIrSync, resolveImages } from '../core/dom-to-ir';
import { imageToJpeg } from '../core/image';
import { renderPdf } from '../vendor/kit/pdf';
import { pickLang, setLang, t } from '../vendor/kit/i18n';
import { registerI18n } from '../i18n/strings';

// Obsidian UI language via the native getLanguage() API (App 1.8.7+). Wrapped defensively
// so a test/window-less context (getLanguage throwing) falls back to English, not a crash.
function readObsidianLocale(): string | null {
  try { return getLanguage(); } catch { return null; }
}

// Runtime-only Obsidian API surface not covered by the public typings.
interface FileManagerExt {
  getAvailablePathForAttachment?: (filename: string, sourcePath: string) => Promise<string>;
}

// Local date/time parts for the running footer and the filename scheme. Obsidian's global
// `moment` is intentionally not used here: obsidian.d.ts re-exports it via a
// namespace import (`import * as Moment from 'moment'`), which causes
// TypeScript to strip the call signature from `typeof Moment` — `moment()`
// is "not callable" under this repo's TS/obsidian-types combination.
function nowParts(): { date: string; time: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}${pad(d.getMinutes())}`,
  };
}

export default class PaperizePlugin extends Plugin {
  // mergeSettings statt Spread: { ...DEFAULT_SETTINGS } teilt die uiCollapsed-Referenz mit
  // den Defaults, ein Zuklappen wuerde sie mutieren.
  settings: PaperizeSettings = mergeSettings(DEFAULT_SETTINGS, null);

  async onload() {
    // Language must be resolved before any user-facing string is registered below.
    registerI18n();
    setLang(pickLang(readObsidianLocale()));
    await this.loadSettings();
    this.addRibbonIcon('file-down', t('cmd.exportRibbon'), () => this.exportActive());
    this.addCommand({ id: 'export-pdf', name: t('cmd.export'), callback: () => this.exportActive() });
    this.addSettingTab(new PaperizeSettingTab(this.app, this));
  }

  async loadSettings() {
    // mergeSettings statt Object.assign: klont Default-Werte eine Ebene tief, damit
    // settings.uiCollapsed nie die Referenz mit DEFAULT_SETTINGS teilt (UI-STANDARD §5).
    this.settings = mergeSettings(DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() { await this.saveData(this.settings); }

  private async exportActive(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') { new Notice(t('notice.noActiveNote')); return; }
    try {
      await this.exportFile(file);
    } catch (e) {
      console.error('Paperize: export failed', e);
      new Notice(t('notice.exportFailed'));
    }
  }

  private async exportFile(file: TFile): Promise<void> {
    const raw = await this.app.vault.read(file);
    // Always strip the raw YAML from the body (it would render as an ugly code block);
    // the frontmatter is re-surfaced as a clean metadata block below when enabled.
    const body = stripFrontmatter(raw);
    if (!body.trim()) { new Notice(t('notice.nothingToExport')); return; }
    const title = deriveTitle(body, file.basename);

    // Render markdown → detached DOM via Obsidian's own parser.
    const holder = createDiv();
    const comp = new Component();
    let unsupportedCount: number;
    let resolved: Awaited<ReturnType<typeof resolveImages>>;
    try {
      await MarkdownRenderer.render(this.app, body, holder, file.path, comp);
      const extracted = domToIrSync(holder, { pageBreakMarker: this.settings.pageBreakMarker });
      unsupportedCount = extracted.unsupportedCount;
      resolved = await resolveImages(extracted.blocks, extracted.imageEls, (src) => this.decodeImage(src, file));
    } finally {
      comp.unload();
    }

    const totalUnsupported = unsupportedCount + resolved.unsupportedAdded;
    const { date: dateStr, time: timeStr } = nowParts();
    const options = settingsToOptions(this.settings, title, dateStr);

    // Re-surface frontmatter as a clean metadata block at the top (after the title).
    const blocks = resolved.blocks;
    if (this.settings.showFrontmatter) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const entries = buildMetadataEntries(fm);
      if (entries.length) blocks.unshift({ type: 'metadata', entries });
    }
    const bytes = renderPdf(blocks, options);

    const noteDir = file.parent ? file.parent.path : '';
    const vars = {
      title: file.basename,
      date: dateStr,
      time: timeStr,
      folder: file.parent ? file.parent.name : '',
    };
    // Der Anhang-Pfad braucht den fertigen Dateinamen. {version} ist in diesem Modus
    // wirkungslos (Obsidian löst Kollisionen selbst auf) — daher version: 1, kein Zirkel.
    const attachmentPath = this.settings.outputMode === 'attachmentFolder'
      ? await this.attachmentPathFor(file, buildFilename(this.settings.filenameTemplate, { ...vars, version: 1 }))
      : '';
    const { path, baseName } = await resolveVersionedOutputPath(
      this.app,
      this.settings.outputMode,
      this.settings.filenameTemplate,
      vars,
      { noteDir: noteDir === '/' ? '' : noteDir, customFolder: this.settings.customFolder, attachmentPath },
    );
    await writePdf(this.app, bytes, this.settings.outputMode, {
      baseName,
      resolvedPath: path,
      openAfter: false,
    });

    if (totalUnsupported > 0) new Notice(t('notice.simplified', totalUnsupported));
  }

  // Resolve the destination path Obsidian would use for an attachment named <baseName>.pdf.
  private async attachmentPathFor(file: TFile, baseName: string): Promise<string> {
    // getAvailablePathForAttachment is present at runtime but not in the public typings.
    const fm = this.app.fileManager as FileManagerExt;
    if (typeof fm.getAvailablePathForAttachment === 'function') {
      return normalizePath(await fm.getAvailablePathForAttachment(`${baseName}.pdf`, file.path));
    }
    return normalizePath(`${file.parent ? file.parent.path : ''}/${baseName}.pdf`);
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
