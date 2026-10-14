// Fortschritts-Hinweis: Abbrechen-Knopf setzt das Flag, checkpoint() wirft, done() schließt.
import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ hidden: 0, click: () => {}, text: '' }));
vi.mock('obsidian', () => ({
  Notice: class {
    messageEl = { createEl: (_t: string, o: { text: string }) => ({ addEventListener: (_e: string, f: () => void) => { log.click = f; log.text = o.text; } }) };
    hide() { log.hidden++; }
  },
}));

import { ExportCancelled, startExportProgress } from '../../src/obsidian/export-progress';

describe('startExportProgress', () => {
  it('lässt checkpoint durch, bis abgebrochen wird, und wirft dann ExportCancelled', () => {
    const p = startExportProgress();
    expect(() => p.checkpoint()).not.toThrow();
    log.click();
    expect(() => p.checkpoint()).toThrow(ExportCancelled);
  });
  it('schließt den Hinweis bei done()', () => {
    log.hidden = 0;
    startExportProgress().done();
    expect(log.hidden).toBe(1);
  });
});
