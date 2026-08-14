import { describe, it, expect, vi } from 'vitest';
// AbstractInputSuggest: vom vendorten settings_walker via folder-suggest importiert. Der
// Vendor bleibt verbatim, der Mock waechst mit — nicht umgekehrt.
vi.mock('obsidian', () => ({ PluginSettingTab: class {}, Setting: class {}, App: class {}, AbstractInputSuggest: class {} }));
import { DEFAULT_SETTINGS, settingsToOptions, SECTIONS, createCollapsibleStorage, PaperizeSettingTab } from '../../src/obsidian/settings';
import { mergeSettings } from '../../src/vendor/kit/settings';
import { EN, DE } from '../../src/i18n/strings';

describe('SECTIONS', () => {
  it('lists the five sections in render order, output first', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(['output', 'page', 'type', 'content', 'pagination']);
  });
  it('opens only the output section by default', () => {
    // Der Kern dieses Zyklus: das Ausgabeziel war unauffindbar.
    const open = SECTIONS.filter((s) => !s.defaultCollapsed).map((s) => s.key);
    expect(open).toEqual(['output']);
  });
  it('uses unique keys (they are the persistence keys)', () => {
    expect(new Set(SECTIONS.map((s) => s.key)).size).toBe(SECTIONS.length);
  });
  it('has a translated title for every section in both languages', () => {
    for (const s of SECTIONS) {
      expect(EN[s.titleKey], `EN missing ${s.titleKey}`).toBeTruthy();
      expect(DE[s.titleKey], `DE missing ${s.titleKey}`).toBeTruthy();
    }
  });
});

describe('filename scheme help text', () => {
  it('shows the placeholders literally — t() only interpolates {0}, {1}, …', () => {
    expect(EN['settings.filename.desc']).toContain('{title}');
    expect(DE['settings.filename.desc']).toContain('{version}');
  });
});

describe('createCollapsibleStorage', () => {
  function fakePlugin() {
    const saves: number[] = [];
    const plugin = {
      settings: { ...DEFAULT_SETTINGS, uiCollapsed: {} as Record<string, boolean> },
      saveSettings: async () => { saves.push(1); },
    };
    return { plugin, saves };
  }

  it('returns undefined for an untouched section so defaultCollapsed wins', () => {
    const { plugin } = fakePlugin();
    expect(createCollapsibleStorage(plugin).getCollapsed('output')).toBeUndefined();
  });
  it('persists a toggle into uiCollapsed and saves', () => {
    const { plugin, saves } = fakePlugin();
    const storage = createCollapsibleStorage(plugin);
    storage.setCollapsed('page', true);
    expect(plugin.settings.uiCollapsed.page).toBe(true);
    expect(storage.getCollapsed('page')).toBe(true);
    expect(saves.length).toBe(1);
  });
  it('reads back a stored false — not just truthy values', () => {
    const { plugin } = fakePlugin();
    const storage = createCollapsibleStorage(plugin);
    storage.setCollapsed('output', false);
    expect(storage.getCollapsed('output')).toBe(false); // nicht undefined!
  });
  it('never mutates DEFAULT_SETTINGS when toggling (the reference bug)', () => {
    // Regressionstest: mit Object.assign/Spread teilte settings.uiCollapsed die Referenz
    // mit den Defaults, und das erste Zuklappen mutierte das Modul.
    const settings = mergeSettings(DEFAULT_SETTINGS, null);
    createCollapsibleStorage({ settings, saveSettings: async () => {} }).setCollapsed('page', true);
    expect(DEFAULT_SETTINGS.uiCollapsed).toEqual({});
  });
});

describe('settings defaults', () => {
  it("defaults the filename scheme to the note title alone (today's behaviour)", () => {
    expect(DEFAULT_SETTINGS.filenameTemplate).toBe('{title}');
  });
  it('starts with no persisted section states', () => {
    expect(DEFAULT_SETTINGS.uiCollapsed).toEqual({});
  });
});

describe('mergeSettings over DEFAULT_SETTINGS', () => {
  it('fills in keys missing from stored data', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { marginMm: 30 });
    expect(merged.marginMm).toBe(30);
    expect(merged.filenameTemplate).toBe('{title}');
  });
  it('never shares the uiCollapsed reference with the defaults', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, null);
    merged.uiCollapsed.output = true;
    expect(DEFAULT_SETTINGS.uiCollapsed).toEqual({}); // Defaults unberuehrt
  });
});

describe('settingsToOptions', () => {
  it('maps margins uniformly and threads the title', () => {
    const o = settingsToOptions({ ...DEFAULT_SETTINGS, marginMm: 25 }, 'Doc');
    expect(o.page.marginMm).toEqual({ top: 25, right: 25, bottom: 25, left: 25 });
    expect(o.frame.title).toBe('Doc');
  });
  it('nulls the title when showTitle is off', () => {
    const o = settingsToOptions({ ...DEFAULT_SETTINGS, showTitle: false }, 'Doc');
    expect(o.frame.title).toBeNull();
  });
  it('builds a running footer only when enabled', () => {
    expect(settingsToOptions(DEFAULT_SETTINGS, 'Doc').frame.runningHeaderFooter).toBeNull();
    const on = settingsToOptions({ ...DEFAULT_SETTINGS, runningHeaderFooter: true }, 'Doc', '2026-07-11');
    expect(on.frame.runningHeaderFooter).toMatchObject({ position: 'footer', left: 'Doc', right: '2026-07-11' });
  });
  it('maps pagination settings with the engine defaults', () => {
    const o = settingsToOptions(DEFAULT_SETTINGS, 'T');
    expect(o.pagination).toEqual({
      keepTablesTogether: true,
      repeatTableHeader: true,
      keepImagesTogether: true,
      keepCodeTogether: true,
      headingKeepWithLines: 2,
    });
  });
});

/* ── Deklarative Settings-API (Obsidian ≥ 1.13) ──────────────────────────────
   getSettingDefinitions() IST die Wahrheit; display() zeichnet dieselbe Struktur
   fuer < 1.13 nach. Diese Tests halten die Struktur fest — display() selbst ist
   mit dem minimalen Mock (Setting = leere Klasse) nicht unit-testbar, die
   Definitionen sind es. */
describe('getSettingDefinitions', () => {
  function tab(overrides: Partial<typeof DEFAULT_SETTINGS> = {}) {
    const plugin = {
      settings: { ...DEFAULT_SETTINGS, uiCollapsed: {}, ...overrides },
      saveSettings: async () => {},
    };
    return { tab: new PaperizeSettingTab({} as never, plugin), plugin };
  }

  it('returns one group per section, in SECTIONS order', () => {
    const defs = tab().tab.getSettingDefinitions();
    expect(defs.map((g) => (g as { key: string }).key)).toEqual(SECTIONS.map((s) => s.key));
  });

  it('gives every group a heading and the group type', () => {
    for (const g of tab().tab.getSettingDefinitions()) {
      expect((g as { type?: string }).type).toBe('group');
      expect((g as { heading?: string }).heading).toBeTruthy();
    }
  });

  it('binds every control key to a real settings field (typo guard)', () => {
    const keys = new Set(Object.keys(DEFAULT_SETTINGS));
    for (const g of tab().tab.getSettingDefinitions()) {
      for (const item of (g as { items?: unknown[] }).items ?? []) {
        const c = (item as { control?: { key: string } }).control;
        if (c) expect(keys, `unknown control key ${c.key}`).toContain(c.key);
      }
    }
  });

  it('covers every setting the imperative UI offered — no row lost in migration', () => {
    // Bewusst als Literal-Liste: eine aus dem Code abgeleitete Erwartung wuerde jede
    // Auslassung mit-ableiten und den Regressionsschutz aufheben.
    const expected = [
      'outputMode', 'customFolder', 'filenameTemplate',
      'pageSize', 'marginMm',
      'fontChoice', 'baseSizePt', 'lineHeight', 'imageMaxWidthPct',
      'showTitle', 'showFrontmatter', 'pageNumbers', 'runningHeaderFooter',
      'pageBreakMarker', 'keepTablesTogether', 'repeatTableHeader',
      'keepImagesTogether', 'keepCodeTogether', 'headingKeepWithLines',
    ];
    const got = tab({ outputMode: 'customFolder' as never }).tab.getSettingDefinitions()
      .flatMap((g) => ((g as { items?: unknown[] }).items ?? []))
      .map((i) => (i as { control?: { key: string } }).control?.key)
      .filter(Boolean);
    expect(got.sort()).toEqual(expected.sort());
  });

  it('omits the folder row entirely unless the custom-folder mode is active', () => {
    // Weglassen statt `visible: false`: 1.13.7 wertet `visible` am Gruppen-Item nicht aus
    // (live gemessen). Diese Invariante haelt den Unterschied fest.
    const present = (mode: string) =>
      tab({ outputMode: mode as never }).tab.getSettingDefinitions()
        .flatMap((g) => ((g as { items?: unknown[] }).items ?? []))
        .some((i) => (i as { control?: { key: string } }).control?.key === 'customFolder');
    expect(present('customFolder')).toBe(true);
    expect(present('nextToNote')).toBe(false);
  });

  it('keeps the bounded numbers as sliders with their limits (no silent-discard text fields)', () => {
    const byKey = new Map(tab().tab.getSettingDefinitions()
      .flatMap((g) => ((g as { items?: unknown[] }).items ?? []))
      .map((i) => [(i as { control?: { key: string } }).control?.key, (i as { control?: Record<string, unknown> }).control]));
    for (const k of ['baseSizePt', 'marginMm', 'lineHeight', 'imageMaxWidthPct', 'headingKeepWithLines']) {
      const c = byKey.get(k) as { type?: string; min?: number; max?: number } | undefined;
      expect(c?.type, `${k} must stay a slider`).toBe('slider');
      expect(typeof c?.min).toBe('number');
      expect(typeof c?.max).toBe('number');
    }
  });
});

describe('setting control host', () => {
  it('reads and writes the plugin settings and persists', async () => {
    let saved = 0;
    const plugin = { settings: { ...DEFAULT_SETTINGS, uiCollapsed: {} }, saveSettings: async () => { saved++; } };
    const t2 = new PaperizeSettingTab({} as never, plugin);
    expect(t2.getControlValue('baseSizePt')).toBe(DEFAULT_SETTINGS.baseSizePt);
    await t2.setControlValue('baseSizePt', 14);
    expect(plugin.settings.baseSizePt).toBe(14);
    expect(saved).toBe(1);
  });
});
