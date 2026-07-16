// src/obsidian/settings.ts
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_OPTIONS } from '../vendor/kit/pdf';
import type { LayoutOptions, FontChoice } from '../vendor/kit/pdf';
import { t } from '../vendor/kit/i18n';
import { DEFAULT_FILENAME_TEMPLATE } from '../core/filename';
import { collapsibleSection } from '../vendor/kit/obsidian/collapsible';
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

    const storage: CollapsibleStorage = createCollapsibleStorage(this.plugin);
    const section = (key: string): HTMLElement => {
      const def = SECTIONS.find((d) => d.key === key);
      if (!def) throw new Error(`unknown section: ${key}`);
      return collapsibleSection(containerEl, {
        title: t(def.titleKey),
        key: def.key,
        defaultCollapsed: def.defaultCollapsed,
        storage,
      });
    };

    // — Ausgabe (offen: hier steht das Ausgabeziel) —
    const output = section('output');
    new Setting(output).setName(t('settings.output.name')).addDropdown((d) => d.addOptions({
      nextToNote: t('settings.output.nextToNote'), attachmentFolder: t('settings.output.attachmentFolder'), customFolder: t('settings.output.customFolder'), share: t('settings.output.share'),
    }).setValue(s.outputMode).onChange(async (v) => {
      s.outputMode = v as OutputMode;
      await save();
      // Neu zeichnen: die Ordner-Zeile haengt am Modus. display() ist der von Obsidian
      // vorgesehene Weg fuer bedingte Settings-Zeilen.
      this.display();
    }));
    // Nur im passenden Modus sichtbar — dadurch braucht es keinen Hilfetext „nur bei X".
    if (s.outputMode === 'customFolder') {
      new Setting(output).setName(t('settings.customFolder.name'))
        .addText((txt) => txt.setValue(s.customFolder).onChange(async (v) => { s.customFolder = v.trim(); await save(); }));
    }
    new Setting(output).setName(t('settings.filename.name')).setDesc(t('settings.filename.desc'))
      .addText((txt) => txt.setPlaceholder(DEFAULT_FILENAME_TEMPLATE).setValue(s.filenameTemplate)
        // Leereingabe → Default, damit nie ein leeres Schema persistiert wird.
        .onChange(async (v) => { s.filenameTemplate = v.trim() || DEFAULT_FILENAME_TEMPLATE; await save(); }));

    // — Seite —
    const page = section('page');
    new Setting(page).setName(t('settings.pageSize.name')).addDropdown((d) => d.addOptions({ A4: 'A4', Letter: 'Letter' })
      .setValue(s.pageSize).onChange(async (v) => { s.pageSize = v as 'A4' | 'Letter'; await save(); }));
    // Lower bound is 12mm, not the engine's theoretical minimum: below ~11mm bottom margin the
    // fixed-offset footer/page-number draws fall off the page. Proper fix is an engine-side
    // clamp upstream in the kit (src/vendor/kit/pdf/*); this is a plugin-side guard rail.
    new Setting(page).setName(t('settings.margins.name'))
      .addSlider((sl) => sl.setLimits(12, 50, 1).setValue(s.marginMm).setDynamicTooltip()
        .onChange(async (v) => { s.marginMm = v; await save(); }));

    // — Typografie —
    const type = section('type');
    new Setting(type).setName(t('settings.font.name')).setDesc(t('settings.font.desc'))
      .addDropdown((d) => d.addOptions({ sans: 'Sans (Helvetica)', serif: 'Serif (Times)', mono: 'Mono (Courier)' })
        .setValue(s.fontChoice).onChange(async (v) => { s.fontChoice = v as FontChoice; await save(); }));
    new Setting(type).setName(t('settings.fontSize.name'))
      .addSlider((sl) => sl.setLimits(6, 24, 0.5).setValue(s.baseSizePt).setDynamicTooltip()
        .onChange(async (v) => { s.baseSizePt = v; await save(); }));
    new Setting(type).setName(t('settings.lineHeight.name')).setDesc(t('settings.lineHeight.desc'))
      .addSlider((sl) => sl.setLimits(1.0, 2.0, 0.05).setValue(s.lineHeight).setDynamicTooltip()
        .onChange(async (v) => { s.lineHeight = v; await save(); }));
    new Setting(type).setName(t('settings.imageWidth.name')).setDesc(t('settings.imageWidth.desc'))
      .addSlider((sl) => sl.setLimits(25, 100, 5).setValue(s.imageMaxWidthPct).setDynamicTooltip()
        .onChange(async (v) => { s.imageMaxWidthPct = v; await save(); }));

    // — Inhalt —
    const content = section('content');
    new Setting(content).setName(t('settings.title.name')).addToggle((tg) => tg.setValue(s.showTitle)
      .onChange(async (v) => { s.showTitle = v; await save(); }));
    new Setting(content).setName(t('settings.frontmatter.name'))
      .setDesc(t('settings.frontmatter.desc'))
      .addToggle((tg) => tg.setValue(s.showFrontmatter)
        .onChange(async (v) => { s.showFrontmatter = v; await save(); }));
    new Setting(content).setName(t('settings.pageNumbers.name')).addToggle((tg) => tg.setValue(s.pageNumbers)
      .onChange(async (v) => { s.pageNumbers = v; await save(); }));
    new Setting(content).setName(t('settings.footer.name')).addToggle((tg) => tg.setValue(s.runningHeaderFooter)
      .onChange(async (v) => { s.runningHeaderFooter = v; await save(); }));

    // — Umbruch —
    const pagination = section('pagination');
    new Setting(pagination).setName(t('settings.pagebreak.name')).setDesc(t('settings.pagebreak.desc'))
      .addText((txt) => txt.setValue(s.pageBreakMarker).onChange(async (v) => { s.pageBreakMarker = v; await save(); }));
    new Setting(pagination).setName(t('settings.keepTables.name')).setDesc(t('settings.keepTables.desc'))
      .addToggle((tg) => tg.setValue(s.keepTablesTogether).onChange(async (v) => { s.keepTablesTogether = v; await save(); }));
    new Setting(pagination).setName(t('settings.repeatHeader.name')).setDesc(t('settings.repeatHeader.desc'))
      .addToggle((tg) => tg.setValue(s.repeatTableHeader).onChange(async (v) => { s.repeatTableHeader = v; await save(); }));
    new Setting(pagination).setName(t('settings.keepImages.name')).setDesc(t('settings.keepImages.desc'))
      .addToggle((tg) => tg.setValue(s.keepImagesTogether).onChange(async (v) => { s.keepImagesTogether = v; await save(); }));
    new Setting(pagination).setName(t('settings.keepCode.name')).setDesc(t('settings.keepCode.desc'))
      .addToggle((tg) => tg.setValue(s.keepCodeTogether).onChange(async (v) => { s.keepCodeTogether = v; await save(); }));
    new Setting(pagination).setName(t('settings.orphan.name')).setDesc(t('settings.orphan.desc'))
      .addSlider((sl) => sl.setLimits(0, 10, 1).setValue(s.headingKeepWithLines).setDynamicTooltip()
        .onChange(async (v) => { s.headingKeepWithLines = v; await save(); }));
  }
}
