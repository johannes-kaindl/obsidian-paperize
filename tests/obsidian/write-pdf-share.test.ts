// Modus 'share': läuft über den Kit-Baustein share-export (Welle 22). Eigene PDF-Reste werden still
// ersetzt, Fremdes im Export-Ordner wird nur nach Rückfrage gelöscht (vorher: ungefragt).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notices: string[] = [];
const confirm = vi.hoisted(() => vi.fn());
vi.mock('obsidian', () => ({
  Notice: class { constructor(m: string) { notices.push(m); } },
  Modal: class {}, App: class {},
}));
vi.mock('../../src/vendor/kit-obsidian/confirm', () => ({ confirmAction: confirm }));

import { writePdf } from '../../src/obsidian/output';

function fakeApp(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial));
  const adapter = {
    exists: async (p: string) => files.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')),
    mkdir: async () => {},
    list: async (dir: string) => ({ files: [...files.keys()].filter((k) => k.startsWith(dir + '/')), folders: [] as string[] }),
    remove: async (p: string) => { files.delete(p); },
    rmdir: async () => {},
    writeBinary: async (p: string) => { files.set(p, 'pdf'); },
  };
  return { files, app: { vault: { adapter, configDir: '.obsidian' } } as never };
}
const ctx = { baseName: 'Bericht', resolvedPath: null, openAfter: false };

describe("writePdf im Modus 'share'", () => {
  beforeEach(() => { notices.length = 0; confirm.mockReset(); });

  it('ersetzt eigene PDF-Reste ohne Rückfrage', async () => {
    const { files, app } = fakeApp({ '.paperize-export/Alt.pdf': 'old' });
    const r = await writePdf(app, new Uint8Array([1]), 'share', ctx);
    expect(r.savedPath).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    expect([...files.keys()]).toEqual(['.paperize-export/Bericht.pdf']);
  });

  it('lässt Fremdes bei Nein liegen und löscht es nach Ja', async () => {
    confirm.mockResolvedValueOnce(false);
    const a = fakeApp({ '.paperize-export/notiz.txt': 'x' });
    await writePdf(a.app, new Uint8Array([1]), 'share', ctx);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(a.files.has('.paperize-export/notiz.txt')).toBe(true);
    confirm.mockResolvedValueOnce(true);
    const b = fakeApp({ '.paperize-export/notiz.txt': 'x' });
    await writePdf(b.app, new Uint8Array([1]), 'share', ctx);
    expect(b.files.has('.paperize-export/notiz.txt')).toBe(false);
  });
});
