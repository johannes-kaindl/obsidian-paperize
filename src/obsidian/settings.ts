// src/obsidian/settings.ts
import { App, Plugin, PluginSettingTab } from 'obsidian';
import type { SettingControl, SettingDefinitionGroup, SettingDefinitionItem, SettingGroupItem } from 'obsidian';
import { DEFAULT_OPTIONS } from '../vendor/kit/pdf';
import type { LayoutOptions, FontChoice } from '../vendor/kit/pdf';
import { t } from '../vendor/kit/i18n';
import { DEFAULT_FILENAME_TEMPLATE } from '../core/filename';
import { collapsibleSection } from '../vendor/kit-obsidian/collapsible';
import type { CollapsibleStorage } from '../vendor/kit-obsidian/collapsible';
import { renderSettingDefinitions, refreshSettingsTab } from '../vendor/kit-obsidian/settings_walker';

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

/** Eine deklarative Gruppe, um ihren Sektions-Key erweitert. Obsidians eigener Typ hat kein
 *  Feld dafuer, der Fallback-Pfad braucht ihn aber fuer i18n-Titel und persistierten
 *  Auf-/Zu-Zustand. Als typisierte Variable gebaut (nicht als Literal an einer
 *  SettingDefinitionItem-Position), damit die Zusatz-Eigenschaft kein Excess-Property-Fehler
 *  wird. Muster uebernommen aus kuro-gamification/src/settings/SettingsTab.ts, 2026-08-14. */
type PaperizeGroup = SettingDefinitionGroup & { key: string };

/* Zweigleisige Settings (REGISTRY „Zweigleisige deklarative Settings — eine-Wahrheit-Walker"):
   getSettingDefinitions() IST die Struktur — ab Obsidian 1.13 zeichnet der Host sie selbst und
   nimmt die Zeilen in die Settings-SUCHE auf. Darunter ruft der Host display(), das DIESELBE
   Struktur mit der klassischen Setting-API nachzeichnet; minAppVersion bleibt deshalb 1.8.7.
   Unterschied der beiden Pfade: die einklappbaren Sektionen gibt es nur im Fallback — der
   native Renderer kennt kein Collapse-Verhalten. Bewusst akzeptiert (wie kuro-gamification):
   ab 1.13 ersetzt die Settings-Suche das Zuklappen als Mittel gegen die lange Liste. */
export class PaperizeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: { settings: PaperizeSettings; saveSettings: () => Promise<void> }) {
    super(app, plugin as unknown as Plugin);
  }

  /* ── Deklarative API (Obsidian ≥ 1.13) — die eine Wahrheit ────────────── */

  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.groups();
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    await this.plugin.saveSettings();
    // Die Ordner-Zeile haengt am Ausgabemodus. Ab 1.13 kann der Host partiell neu zeichnen,
    // darunter braucht es den vollen Rebuild — refreshSettingsTab waehlt das per Feature-Check.
    if (key === 'outputMode') refreshSettingsTab(this, () => this.renderFallback());
  }

  /* ── Imperativer Fallback (Obsidian < 1.13) — zeichnet dieselben Gruppen ── */

  display(): void {
    this.renderFallback();
  }

  /** Der eigentliche Fallback-Aufbau. Getrennt von display(), weil ein interner Aufruf von
   *  display() die 1.13-Deprecation ausloest — die Methode selbst muss bleiben (der Host < 1.13
   *  ruft genau sie), aber wir rufen sie nicht selbst. */
  private renderFallback(): void {
    const { containerEl } = this;
    containerEl.empty();
    const storage: CollapsibleStorage = createCollapsibleStorage(this.plugin);
    for (const group of this.groups()) {
      const def = SECTIONS.find((d) => d.key === group.key);
      if (!def) throw new Error(`unknown section: ${group.key}`);
      const body = collapsibleSection(containerEl, {
        title: t(def.titleKey),
        key: def.key,
        defaultCollapsed: def.defaultCollapsed,
        storage,
      });
      renderSettingDefinitions(body, group.items ?? [], this, this.app);
    }
  }

  /* ── Gruppen-Definitionen ─────────────────────────────────────────────── */

  private groups(): PaperizeGroup[] {
    const s = this.plugin.settings;
    const group = (key: string, items: SettingGroupItem[]): PaperizeGroup => {
      const def = SECTIONS.find((d) => d.key === key);
      const g: PaperizeGroup = { type: 'group', heading: t(def!.titleKey), items, key };
      return g;
    };
    const slider = (
      key: string, min: number, max: number, step: number, unit = '',
    ): SettingControl => ({ type: 'slider', key, min, max, step,
      // Ersetzt setDynamicTooltip(): der Wert stand dort nur waehrend des Ziehens, hier
      // dauerhaft im Namen — und der deklarative Pfad hat gar keinen Tooltip.
      displayFormat: (v: number) => `${v}${unit}` } as unknown as SettingControl);

    return [
      group('output', [
        { name: t('settings.output.name'), control: { type: 'dropdown', key: 'outputMode', options: {
          nextToNote: t('settings.output.nextToNote'),
          attachmentFolder: t('settings.output.attachmentFolder'),
          customFolder: t('settings.output.customFolder'),
          share: t('settings.output.share'),
        } } },
        // Nur im passenden Modus sichtbar — dadurch braucht es keinen Hilfetext „nur bei X".
        // Die Zeile wird WEGGELASSEN statt per `visible` ausgeblendet: Obsidian 1.13.7 wertet
        // ein `visible` an einem Gruppen-Item im nativen Renderer nicht aus (gemessen
        // 2026-08-14 — die Definition lieferte korrekt `false`, die Zeile blieb trotzdem
        // stehen, auch nach vollem Tab-Neuaufbau). Weglassen wirkt in BEIDEN Pfaden, weil
        // getSettingDefinitions() bei jedem update()/Rebuild neu ausgewertet wird.
        ...(s.outputMode === 'customFolder'
          ? [{ name: t('settings.customFolder.name'), control: { type: 'text', key: 'customFolder' } }]
          : []),
        { name: t('settings.filename.name'), desc: t('settings.filename.desc'),
          control: { type: 'text', key: 'filenameTemplate', placeholder: DEFAULT_FILENAME_TEMPLATE } },
      ] as unknown as SettingGroupItem[]),

      group('page', [
        { name: t('settings.pageSize.name'), control: { type: 'dropdown', key: 'pageSize', options: { A4: 'A4', Letter: 'Letter' } } },
        // Untergrenze 12mm, nicht das theoretische Engine-Minimum: unter ~11mm unterem Rand
        // fallen die Fusszeilen-/Seitenzahl-Zeichnungen mit festem Offset von der Seite.
        { name: t('settings.margins.name'), control: slider('marginMm', 12, 50, 1, ' mm') },
      ] as unknown as SettingGroupItem[]),

      group('type', [
        { name: t('settings.font.name'), desc: t('settings.font.desc'), control: { type: 'dropdown', key: 'fontChoice', options: {
          sans: 'Sans (Helvetica)', serif: 'Serif (Times)', mono: 'Mono (Courier)',
        } } },
        { name: t('settings.fontSize.name'), control: slider('baseSizePt', 6, 24, 0.5, ' pt') },
        { name: t('settings.lineHeight.name'), desc: t('settings.lineHeight.desc'), control: slider('lineHeight', 1.0, 2.0, 0.05) },
        { name: t('settings.imageWidth.name'), desc: t('settings.imageWidth.desc'), control: slider('imageMaxWidthPct', 25, 100, 5, ' %') },
      ] as unknown as SettingGroupItem[]),

      group('content', [
        { name: t('settings.title.name'), control: { type: 'toggle', key: 'showTitle' } },
        { name: t('settings.frontmatter.name'), desc: t('settings.frontmatter.desc'), control: { type: 'toggle', key: 'showFrontmatter' } },
        { name: t('settings.pageNumbers.name'), control: { type: 'toggle', key: 'pageNumbers' } },
        { name: t('settings.footer.name'), control: { type: 'toggle', key: 'runningHeaderFooter' } },
      ] as unknown as SettingGroupItem[]),

      group('pagination', [
        { name: t('settings.pagebreak.name'), desc: t('settings.pagebreak.desc'), control: { type: 'text', key: 'pageBreakMarker' } },
        { name: t('settings.keepTables.name'), desc: t('settings.keepTables.desc'), control: { type: 'toggle', key: 'keepTablesTogether' } },
        { name: t('settings.repeatHeader.name'), desc: t('settings.repeatHeader.desc'), control: { type: 'toggle', key: 'repeatTableHeader' } },
        { name: t('settings.keepImages.name'), desc: t('settings.keepImages.desc'), control: { type: 'toggle', key: 'keepImagesTogether' } },
        { name: t('settings.keepCode.name'), desc: t('settings.keepCode.desc'), control: { type: 'toggle', key: 'keepCodeTogether' } },
        { name: t('settings.orphan.name'), desc: t('settings.orphan.desc'), control: slider('headingKeepWithLines', 0, 10, 1) },
      ] as unknown as SettingGroupItem[]),
    ];
  }
}
