// src/obsidian/settings.ts
import { App, PluginSettingTab, Setting } from 'obsidian';
import type { LayoutOptions, FontChoice } from '../vendor/kit/pdf';

export type OutputMode = 'nextToNote' | 'attachmentFolder' | 'customFolder' | 'share';

export interface PaperizeSettings {
  fontChoice: FontChoice;
  baseSizePt: number;
  lineHeight: number;
  pageSize: 'A4' | 'Letter';
  marginMm: number;
  stripFrontmatter: boolean;
  showTitle: boolean;
  pageNumbers: boolean;
  runningHeaderFooter: boolean;
  imageMaxWidthPct: number;
  outputMode: OutputMode;
  customFolder: string;
}

export const DEFAULT_SETTINGS: PaperizeSettings = {
  fontChoice: 'sans',
  baseSizePt: 11,
  lineHeight: 1.4,
  pageSize: 'A4',
  marginMm: 20,
  stripFrontmatter: true,
  showTitle: true,
  pageNumbers: true,
  runningHeaderFooter: false,
  imageMaxWidthPct: 100,
  outputMode: 'nextToNote',
  customFolder: '',
};

// Map plugin settings + a resolved title/date into the pure engine's options.
export function settingsToOptions(s: PaperizeSettings, title: string | null, dateStr?: string): LayoutOptions {
  return {
    page: { size: s.pageSize, marginMm: { top: s.marginMm, right: s.marginMm, bottom: s.marginMm, left: s.marginMm } },
    fonts: { body: s.fontChoice, baseSizePt: s.baseSizePt, lineHeight: s.lineHeight, headingScale: 1.15 },
    colors: { text: '#1a1a1a', muted: '#666666', rule: '#cccccc', codeBg: '#f4f4f4', tableBorder: '#cccccc' },
    frame: {
      title: s.showTitle ? title : null,
      pageNumbers: s.pageNumbers,
      runningHeaderFooter: s.runningHeaderFooter ? { position: 'footer', left: title || '', right: dateStr || '' } : null,
    },
    image: { maxWidthPct: s.imageMaxWidthPct },
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
    new Setting(containerEl).setName('Ränder (mm)').addText((t) => t.setValue(String(s.marginMm))
      .onChange(async (v) => { const n = Number(v); if (n >= 5 && n <= 50) { s.marginMm = n; await save(); } }));
    new Setting(containerEl).setName('Frontmatter entfernen').addToggle((t) => t.setValue(s.stripFrontmatter)
      .onChange(async (v) => { s.stripFrontmatter = v; await save(); }));
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
  }
}
