// src/obsidian/settings.ts
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_OPTIONS } from '../vendor/kit/pdf';
import type { LayoutOptions, FontChoice } from '../vendor/kit/pdf';
import { t } from '../vendor/kit/i18n';
import { DEFAULT_FILENAME_TEMPLATE } from '../core/filename';
import type { CollapsibleStorage } from '../vendor/kit/obsidian/collapsible';

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
  /** Dateiname-Schema, Platzhalter siehe src/core/filename.ts. */
  filenameTemplate: string;
  /** Auf-/Zu-Zustand der Settings-Sektionen, Key = SectionDef.key. */
  uiCollapsed: Record<string, boolean>;
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
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  uiCollapsed: {},
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

/** Eine Settings-Sektion: sichtbarer Titel (i18n-Key), Persistenz-Key, Startzustand.
 *  Reihenfolge = Render-Reihenfolge. Pure Daten, damit ohne DOM testbar (UI-STANDARD §6). */
export interface SectionDef {
  key: string;
  titleKey: string;
  defaultCollapsed: boolean;
}

/** „Ausgabe" startet als einzige offen: das Ausgabeziel existierte schon, war in der flachen
 *  17-Settings-Liste aber unauffindbar. Danach gewinnt der persistierte User-Zustand. */
export const SECTIONS: SectionDef[] = [
  { key: 'output', titleKey: 'settings.section.output', defaultCollapsed: false },
  { key: 'page', titleKey: 'settings.section.page', defaultCollapsed: true },
  { key: 'type', titleKey: 'settings.section.type', defaultCollapsed: true },
  { key: 'content', titleKey: 'settings.section.content', defaultCollapsed: true },
  { key: 'pagination', titleKey: 'settings.section.pagination', defaultCollapsed: true },
];

/** Persistenz-Bridge zwischen collapsibleSection und den Plugin-Settings. Benannt und
 *  exportiert (statt Closure in display()), damit sie ohne DOM testbar ist.
 *  `undefined` für einen unbekannten Key ist load-bearing: nur so greift
 *  SectionDef.defaultCollapsed — ein `?? false` hier würde jede Sektion aufklappen. */
export function createCollapsibleStorage(
  plugin: { settings: PaperizeSettings; saveSettings: () => Promise<void> },
): CollapsibleStorage {
  return {
    getCollapsed: (key) => (key in plugin.settings.uiCollapsed ? plugin.settings.uiCollapsed[key] : undefined),
    setCollapsed: (key, collapsed) => {
      plugin.settings.uiCollapsed[key] = collapsed;
      void plugin.saveSettings();
    },
  };
}

export class PaperizeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: { settings: PaperizeSettings; saveSettings: () => Promise<void> }) {
    super(app, plugin as unknown as Plugin);
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();

    new Setting(containerEl).setName(t('settings.font.name')).setDesc(t('settings.font.desc'))
      .addDropdown((d) => d.addOptions({ sans: 'Sans (Helvetica)', serif: 'Serif (Times)', mono: 'Mono (Courier)' })
        .setValue(s.fontChoice).onChange(async (v) => { s.fontChoice = v as FontChoice; await save(); }));
    new Setting(containerEl).setName(t('settings.fontSize.name')).addText((txt) => txt.setValue(String(s.baseSizePt))
      .onChange(async (v) => { const n = Number(v); if (n >= 6 && n <= 24) { s.baseSizePt = n; await save(); } }));
    new Setting(containerEl).setName(t('settings.pageSize.name')).addDropdown((d) => d.addOptions({ A4: 'A4', Letter: 'Letter' })
      .setValue(s.pageSize).onChange(async (v) => { s.pageSize = v as 'A4' | 'Letter'; await save(); }));
    // Lower bound is 12mm, not the engine's theoretical minimum: below ~11mm bottom margin the
    // fixed-offset footer/page-number draws fall off the page. Proper fix is an engine-side
    // clamp upstream in the kit (src/vendor/kit/pdf/*); this is a plugin-side guard rail.
    new Setting(containerEl).setName(t('settings.margins.name')).addText((txt) => txt.setValue(String(s.marginMm))
      .onChange(async (v) => { const n = Number(v); if (n >= 12 && n <= 50) { s.marginMm = n; await save(); } }));
    new Setting(containerEl).setName(t('settings.frontmatter.name'))
      .setDesc(t('settings.frontmatter.desc'))
      .addToggle((tg) => tg.setValue(s.showFrontmatter)
        .onChange(async (v) => { s.showFrontmatter = v; await save(); }));
    new Setting(containerEl).setName(t('settings.title.name')).addToggle((tg) => tg.setValue(s.showTitle)
      .onChange(async (v) => { s.showTitle = v; await save(); }));
    new Setting(containerEl).setName(t('settings.pageNumbers.name')).addToggle((tg) => tg.setValue(s.pageNumbers)
      .onChange(async (v) => { s.pageNumbers = v; await save(); }));
    new Setting(containerEl).setName(t('settings.footer.name')).addToggle((tg) => tg.setValue(s.runningHeaderFooter)
      .onChange(async (v) => { s.runningHeaderFooter = v; await save(); }));
    new Setting(containerEl).setName(t('settings.output.name')).addDropdown((d) => d.addOptions({
      nextToNote: t('settings.output.nextToNote'), attachmentFolder: t('settings.output.attachmentFolder'), customFolder: t('settings.output.customFolder'), share: t('settings.output.share'),
    }).setValue(s.outputMode).onChange(async (v) => { s.outputMode = v as OutputMode; await save(); }));
    new Setting(containerEl).setName(t('settings.customFolder.name')).setDesc(t('settings.customFolder.desc'))
      .addText((txt) => txt.setValue(s.customFolder).onChange(async (v) => { s.customFolder = v.trim(); await save(); }));

    new Setting(containerEl).setName(t('settings.pagebreak.name')).setDesc(t('settings.pagebreak.desc'))
      .addText((txt) => txt.setValue(s.pageBreakMarker).onChange(async (v) => { s.pageBreakMarker = v; await save(); }));
    new Setting(containerEl).setName(t('settings.keepTables.name')).setDesc(t('settings.keepTables.desc'))
      .addToggle((tg) => tg.setValue(s.keepTablesTogether).onChange(async (v) => { s.keepTablesTogether = v; await save(); }));
    new Setting(containerEl).setName(t('settings.repeatHeader.name')).setDesc(t('settings.repeatHeader.desc'))
      .addToggle((tg) => tg.setValue(s.repeatTableHeader).onChange(async (v) => { s.repeatTableHeader = v; await save(); }));
    new Setting(containerEl).setName(t('settings.keepImages.name')).setDesc(t('settings.keepImages.desc'))
      .addToggle((tg) => tg.setValue(s.keepImagesTogether).onChange(async (v) => { s.keepImagesTogether = v; await save(); }));
    new Setting(containerEl).setName(t('settings.keepCode.name')).setDesc(t('settings.keepCode.desc'))
      .addToggle((tg) => tg.setValue(s.keepCodeTogether).onChange(async (v) => { s.keepCodeTogether = v; await save(); }));
    new Setting(containerEl).setName(t('settings.orphan.name')).setDesc(t('settings.orphan.desc'))
      .addText((txt) => txt.setValue(String(s.headingKeepWithLines))
        .onChange(async (v) => { const n = Number(v); if (Number.isInteger(n) && n >= 0 && n <= 10) { s.headingKeepWithLines = n; await save(); } }));
  }
}
