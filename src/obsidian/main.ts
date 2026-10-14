// src/obsidian/main.ts
import { Plugin, Notice, MarkdownRenderer, Component, TFile, normalizePath, getLanguage, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, PaperizeSettings, PaperizeSettingTab, settingsToOptions } from './settings';
import { writePdf, resolveVersionedOutputPath, mayOverwrite, confirmReplace } from './output';
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
import { localParts } from '../vendor/kit/local-stamp';
import { ExportCancelled, startExportProgress } from './export-progress';

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

// Local date/time parts for the running footer and the filename scheme (the kit's local stamp;
// Obsidian's global `moment` is not used, see obsidian.d.ts' namespace import).
function nowParts(): { date: string; time: string } {
  const p = localParts(new Date());
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}${p.minute}` };
}

export default class PaperizePlugin extends Plugin {
  // mergeSettings statt Spread: { ...DEFAULT_SETTINGS } teilt die uiCollapsed-Referenz mit
  // den Defaults, ein Zuklappen wuerde sie mutieren.
  settings: PaperizeSettings = mergeSettings(DEFAULT_SETTINGS, null);
  // Ein Export zur Zeit: ein zweiter Klick auf den Ribbon-Knopf startete sonst einen parallelen Lauf.
  private exporting = false;

  async onload() {
    // Language must be resolved before any user-facing string is registered below.
    registerI18n();
    setLang(pickLang(readObsidianLocale()));
    await this.loadSettings();
    this.addRibbonIcon('file-down', t('cmd.export'), () => this.exportActive());
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
    if (this.exporting) { new Notice(t('notice.exportBusy')); return; }
    this.exporting = true;
    const progress = startExportProgress();
    try {
      await this.exportFile(file, () => progress.checkpoint());
    } catch (e) {
      if (e instanceof ExportCancelled) { new Notice(t('notice.exportCancelled')); return; }
      console.error('Paperize: export failed', e);
      new Notice(t('notice.exportFailed'));
    } finally {
      progress.done();
      this.exporting = false;
    }
  }

  private async exportFile(file: TFile, checkpoint: () => void): Promise<void> {
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
      checkpoint();
      // Die Platzhalter stehen IM PDF und muessen deshalb der Oberflaechensprache folgen.
      // Bis Kit 0.30.0 waren sie in der puren Engine deutsch festgeschrieben — ein
      // englischer Nutzer bekam "[Formel]" ins Dokument. Die Engine kann kein i18n haben
      // (sie ist Obsidian-frei), also reicht der Konsument die Texte durch. Seit Kit 0.44.0
      // dient dasselbe Optionsobjekt auch resolveImages() (imageFailed fuer ein Bild ohne
      // Alt-Text, das nicht dekodiert werden konnte).
      const pdfPlaceholders = {
        math: t('pdf.placeholder.math'), graphic: t('pdf.placeholder.graphic'),
        image: t('pdf.placeholder.image'), imageFailed: t('pdf.placeholder.imageFailed'),
      };
      const extracted = domToIrSync(holder, {
        pageBreakMarker: this.settings.pageBreakMarker,
        codes,
        resolvePlaceholder: (t) => parseCodePlaceholder(t, 'PAPERIZECODE'),
        placeholders: pdfPlaceholders,
      });
      unsupportedCount = extracted.unsupportedCount;
      resolved = await resolveImages(extracted.blocks, extracted.imageEls, (src) => this.decodeImage(src, file), pdfPlaceholders);
    } finally {
      comp.unload();
    }

    checkpoint();
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
      ? await this.attachmentPathFor(file, buildFilename(this.settings.filenameTemplate, { ...vars, version: 1 }, t('file.fallbackName')))
      : '';
    const { path, baseName } = await resolveVersionedOutputPath(
      this.app,
      this.settings.outputMode,
      this.settings.filenameTemplate,
      vars,
      { noteDir: noteDir === '/' ? '' : noteDir, customFolder: this.settings.customFolder, attachmentPath },
    );
    checkpoint();
    // Standard-Schema {title}: der Name ändert sich nie, ein zweiter Export ersetzt die Datei — erst fragen.
    if (mayOverwrite(this.settings.outputMode, this.settings.filenameTemplate, path)
      && !(await confirmReplace(this.app, path))) throw new ExportCancelled();
    await writePdf(this.app, bytes, this.settings.outputMode, {
      baseName,
      resolvedPath: path,
      openAfter: this.settings.openAfter,
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
