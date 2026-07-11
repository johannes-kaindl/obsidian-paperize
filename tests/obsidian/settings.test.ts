import { describe, it, expect, vi } from 'vitest';
vi.mock('obsidian', () => ({ PluginSettingTab: class {}, Setting: class {}, App: class {} }));
import { DEFAULT_SETTINGS, settingsToOptions } from '../../src/obsidian/settings';

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
