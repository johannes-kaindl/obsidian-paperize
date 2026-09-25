// src/obsidian/main.ts
import { Plugin, Notice, MarkdownRenderer, Component, TFile, normalizePath, getLanguage, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, PaperizeSettings, PaperizeSettingTab, settingsToOptions } from './settings';
import { writePdf, resolveVersionedOutputPath } from './output';
import { buildFilename } from '../core/filename';
import { imageSourceKind, withTimeout, mimeForBytes } from '../core/image-source';
import { mergeSettings } from '../vendor/kit/settings';
import { stripFrontmatter, deriveTitle, leadingH1 } from '../core/prepare';
import { buildMetadataEntries } from '../core/frontmatter';
import { domToIrSync, resolveImages } from '../vendor/kit/pdf/dom-to-ir';
import { extractCodeBlocks, parseCodePlaceholder } from '../vendor/kit/pdf/code-blocks';
import { imageToJpeg } from '../vendor/kit/pdf/image';
import { renderPdf } from '../vendor/kit/pdf';
import { pickLang, setLang, t } from '../vendor/kit/i18n';
import { registerI18n } from '../i18n/strings';

const IMAGE_TIMEOUT_MS = 15000;
const RENDER_TIMEOUT_MS = 10000;

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
      // Pull fenced code out of the Markdown BEFORE rendering. MarkdownRenderer runs every
      // registered post-processor, including other plugins' — a code-block processor (e.g.
      // json_viewer on ```json) replaces the <pre> with its own widget DOM, and the original
      // code would be unrecoverable from it.
      const { markdown, codes } = extractCodeBlocks(body, 'PAPERIZECODE');
      // render() resolves only after every embed settled — a remote image on a host that never
      // answers would hold the export forever. After RENDER_TIMEOUT_MS the DOM built so far is
      // used as is; the still-loading <img> falls through to decodeImage (own timeout → placeholder).
      await withTimeout(MarkdownRenderer.render(this.app, markdown, holder, file.path, comp), RENDER_TIMEOUT_MS);
      const extracted = domToIrSync(holder, {
        pageBreakMarker: this.settings.pageBreakMarker,
        codes,
        resolvePlaceholder: (t) => parseCodePlaceholder(t, 'PAPERIZECODE'),
        // Die Platzhalter stehen IM PDF und muessen deshalb der Oberflaechensprache folgen.
        // Bis Kit 0.30.0 waren sie in der puren Engine deutsch festgeschrieben — ein
        // englischer Nutzer bekam "[Formel]" ins Dokument. Die Engine kann kein i18n haben
        // (sie ist Obsidian-frei), also reicht der Konsument die Texte durch.
        placeholders: { math: t('pdf.placeholder.math'), graphic: t('pdf.placeholder.graphic') },
      });
      unsupportedCount = extracted.unsupportedCount;
      resolved = await resolveImages(extracted.blocks, extracted.imageEls, (src) => this.decodeImage(src, file));
    } finally {
      comp.unload();
    }

    const totalUnsupported = unsupportedCount + resolved.unsupportedAdded;
    const { date: dateStr, time: timeStr } = nowParts();
    // Traegt die Notiz ihren Titel schon als eigene H1, wird er oben NICHT noch einmal
    // gedruckt — sonst steht er zweimal auf Seite eins.
    const options = settingsToOptions(this.settings, title, dateStr, leadingH1(body) !== null);

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

  // Decode an <img src> (app://, data:, https:, or vault-relative) to JPEG bytes.
  // A hanging load (offline, dead host) must not block the export: it yields null after
  // IMAGE_TIMEOUT_MS and the caller writes the "[Bild: …]" placeholder instead.
  private async decodeImage(src: string, file: TFile): Promise<{ data: Uint8Array; wPx: number; hPx: number } | null> {
    try {
      const kind = imageSourceKind(src);
      let url = src;
      let revoke: string | null = null;
      if (kind === 'vault') {
        const dest = this.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(src.replace(/^\.\//, '')), file.path);
        if (dest) url = this.app.vault.getResourcePath(dest);
      } else if (kind === 'remote') {
        // A remote <img> taints the canvas (no CORS), so fetch the bytes via requestUrl
        // and hand imageToJpeg a same-origin blob URL.
        const res = await withTimeout(requestUrl({ url: src, throw: false }), IMAGE_TIMEOUT_MS);
        if (!res || res.status < 200 || res.status >= 300) return null;
        const bytes = new Uint8Array(res.arrayBuffer);
        url = URL.createObjectURL(new Blob([bytes], { type: mimeForBytes(res.headers['content-type'] ?? '', bytes) }));
        revoke = url;
      }
      try {
        return await withTimeout(imageToJpeg(url, () => createEl('canvas'), 1600), IMAGE_TIMEOUT_MS);
      } finally {
        if (revoke) URL.revokeObjectURL(revoke);
      }
    } catch (e) { console.error('Paperize: image decode failed', e); return null; }
  }
}
