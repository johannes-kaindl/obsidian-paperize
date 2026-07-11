// src/obsidian/settings.ts
import { App, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_OPTIONS } from '../vendor/kit/pdf';
import type { LayoutOptions, FontChoice } from '../vendor/kit/pdf';

export type OutputMode = 'nextToNote' | 'attachmentFolder' | 'customFolder' | 'share';

export interface PaperizeSettings {
  fontChoice: FontChoice;
  baseSizePt: number;
  lineHeight: number;
  pageSize: 'A4' | 'Letter';
  marginMm: number;
  showFrontmatter: boolean;
  showTitle: boolean;
  pageNumbers: boolean;
  runningHeaderFooter: boolean;
  imageMaxWidthPct: number;
  outputMode: OutputMode;
  customFolder: string;
  pageBreakMarker: string;
  keepTablesTogether: boolean;
  repeatTableHeader: boolean;
  keepImagesTogether: boolean;
  keepCodeTogether: boolean;
  headingKeepWithLines: number;
}

export const DEFAULT_SETTINGS: PaperizeSettings = {
  fontChoice: 'sans',
  baseSizePt: 10.5,
  lineHeight: 1.45,
  pageSize: 'A4',
  marginMm: 20,
  showFrontmatter: true,
  showTitle: true,
  pageNumbers: true,
  runningHeaderFooter: false,
  imageMaxWidthPct: 100,
  outputMode: 'nextToNote',
  customFolder: '',
  pageBreakMarker: '\\pagebreak',
  keepTablesTogether: true,
  repeatTableHeader: true,
  keepImagesTogether: true,
  keepCodeTogether: true,
  headingKeepWithLines: 2,
};

// Map plugin settings + a resolved title/date into the pure engine's options.
export function settingsToOptions(s: PaperizeSettings, title: string | null, dateStr?: string): LayoutOptions {
  return {
    page: { size: s.pageSize, marginMm: { top: s.marginMm, right: s.marginMm, bottom: s.marginMm, left: s.marginMm } },
    fonts: { body: s.fontChoice, baseSizePt: s.baseSizePt, lineHeight: s.lineHeight, headingScale: DEFAULT_OPTIONS.fonts.headingScale },
    colors: { ...DEFAULT_OPTIONS.colors },
    frame: {
      title: s.showTitle ? title : null,
      pageNumbers: s.pageNumbers,
      runningHeaderFooter: s.runningHeaderFooter ? { position: 'footer', left: title || '', right: dateStr || '' } : null,
    },
    image: { maxWidthPct: s.imageMaxWidthPct },
    pagination: {
      keepTablesTogether: s.keepTablesTogether,
      repeatTableHeader: s.repeatTableHeader,
      keepImagesTogether: s.keepImagesTogether,
      keepCodeTogether: s.keepCodeTogether,
      headingKeepWithLines: s.headingKeepWithLines,
    },
  };
}

export class PaperizeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: { settings: PaperizeSettings; saveSettings: () => Promise<void> }) {
    super(app, plugin as any);
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();

    new Setting(containerEl).setName('Schriftfamilie').setDesc('Basis-Font (nur Standardschriften).')
      .addDropdown((d) => d.addOptions({ sans: 'Sans (Helvetica)', serif: 'Serif (Times)', mono: 'Mono (Courier)' })
        .setValue(s.fontChoice).onChange(async (v) => { s.fontChoice = v as FontChoice; await save(); }));
    new Setting(containerEl).setName('Schriftgröße (pt)').addText((t) => t.setValue(String(s.baseSizePt))
      .onChange(async (v) => { const n = Number(v); if (n >= 6 && n <= 24) { s.baseSizePt = n; await save(); } }));
    new Setting(containerEl).setName('Seitenmaß').addDropdown((d) => d.addOptions({ A4: 'A4', Letter: 'Letter' })
      .setValue(s.pageSize).onChange(async (v) => { s.pageSize = v as 'A4' | 'Letter'; await save(); }));
    // Lower bound is 12mm, not the engine's theoretical minimum: below ~11mm bottom margin the
    // fixed-offset footer/page-number draws fall off the page. Proper fix is an engine-side
    // clamp upstream in the kit (src/vendor/kit/pdf/*); this is a plugin-side guard rail.
    new Setting(containerEl).setName('Ränder (mm)').addText((t) => t.setValue(String(s.marginMm))
      .onChange(async (v) => { const n = Number(v); if (n >= 12 && n <= 50) { s.marginMm = n; await save(); } }));
    new Setting(containerEl).setName('Frontmatter als Metadaten-Block zeigen')
      .setDesc('Frontmatter erscheint als dezente Metadaten-Liste oben (statt als roher YAML-Block). Aus = ganz weglassen.')
      .addToggle((t) => t.setValue(s.showFrontmatter)
        .onChange(async (v) => { s.showFrontmatter = v; await save(); }));
    new Setting(containerEl).setName('Titel oben').addToggle((t) => t.setValue(s.showTitle)
      .onChange(async (v) => { s.showTitle = v; await save(); }));
    new Setting(containerEl).setName('Seitenzahlen').addToggle((t) => t.setValue(s.pageNumbers)
      .onChange(async (v) => { s.pageNumbers = v; await save(); }));
    new Setting(containerEl).setName('Laufende Fußzeile (Titel/Datum)').addToggle((t) => t.setValue(s.runningHeaderFooter)
      .onChange(async (v) => { s.runningHeaderFooter = v; await save(); }));
    new Setting(containerEl).setName('Ausgabeziel').addDropdown((d) => d.addOptions({
      nextToNote: 'Neben der Notiz', attachmentFolder: 'Obsidian-Anhangordner', customFolder: 'Eigener Ordner', share: 'Aus Vault teilen/öffnen',
    }).setValue(s.outputMode).onChange(async (v) => { s.outputMode = v as OutputMode; await save(); }));
    new Setting(containerEl).setName('Eigener Ausgabe-Ordner').setDesc('Nur bei „Eigener Ordner".')
      .addText((t) => t.setValue(s.customFolder).onChange(async (v) => { s.customFolder = v.trim(); await save(); }));

    new Setting(containerEl).setName('Seitenumbruch-Marker').setDesc('Ein Absatz, der genau diesem Text entspricht, erzwingt einen Seitenumbruch. Leer = Funktion aus.')
      .addText((t) => t.setValue(s.pageBreakMarker).onChange(async (v) => { s.pageBreakMarker = v; await save(); }));
    new Setting(containerEl).setName('Tabellen zusammenhalten').setDesc('Eine Tabelle, die auf eine Seite passt, wird nicht mittendrin umbrochen.')
      .addToggle((t) => t.setValue(s.keepTablesTogether).onChange(async (v) => { s.keepTablesTogether = v; await save(); }));
    new Setting(containerEl).setName('Tabellenkopf wiederholen').setDesc('Bei einer Tabelle, die über mehrere Seiten läuft, wird die Kopfzeile auf jeder Folgeseite wiederholt.')
      .addToggle((t) => t.setValue(s.repeatTableHeader).onChange(async (v) => { s.repeatTableHeader = v; await save(); }));
    new Setting(containerEl).setName('Bilder zusammenhalten').setDesc('Ein Bild wird nicht über eine Seitengrenze hinweg abgeschnitten.')
      .addToggle((t) => t.setValue(s.keepImagesTogether).onChange(async (v) => { s.keepImagesTogether = v; await save(); }));
    new Setting(containerEl).setName('Codeblöcke zusammenhalten').setDesc('Ein Codeblock, der auf eine Seite passt, wird nicht mittendrin umbrochen.')
      .addToggle((t) => t.setValue(s.keepCodeTogether).onChange(async (v) => { s.keepCodeTogether = v; await save(); }));
    new Setting(containerEl).setName('Überschriften-Waisenschutz (Zeilen)').setDesc('Mindestanzahl Folgezeilen, die mit einer Überschrift auf derselben Seite bleiben müssen. 0 = aus.')
      .addText((t) => t.setValue(String(s.headingKeepWithLines))
        .onChange(async (v) => { const n = Number(v); if (Number.isInteger(n) && n >= 0 && n <= 10) { s.headingKeepWithLines = n; await save(); } }));
  }
}
