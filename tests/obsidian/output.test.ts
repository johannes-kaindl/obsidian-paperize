// tests/obsidian/output.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('obsidian', () => ({ Notice: class {}, App: class {} }));
import { resolveOutputPath, sanitizeBase, resolveVersionedOutputPath, writePdf } from '../../src/obsidian/output';

describe('resolveOutputPath', () => {
  const base = { noteDir: 'Notes', baseName: 'Meine Notiz', customFolder: 'Exports', attachmentPath: 'Media/Meine Notiz.pdf' };
  it('places the pdf next to the note', () => {
    expect(resolveOutputPath('nextToNote', base)).toBe('Notes/Meine Notiz.pdf');
  });
  it('uses the custom folder', () => {
    expect(resolveOutputPath('customFolder', base)).toBe('Exports/Meine Notiz.pdf');
  });
  it('uses the resolved attachment path verbatim', () => {
    expect(resolveOutputPath('attachmentFolder', base)).toBe('Media/Meine Notiz.pdf');
  });
  it('returns null for share mode', () => {
    expect(resolveOutputPath('share', base)).toBeNull();
  });
  it('handles a note in the vault root', () => {
    expect(resolveOutputPath('nextToNote', { ...base, noteDir: '' })).toBe('Meine Notiz.pdf');
  });
  // „Eigener Ordner" ist ein freies Textfeld im Settings-Tab, es kommt roh hier an.
  it('normalises slash noise in a hand-typed custom folder', () => {
    expect(resolveOutputPath('customFolder', { ...base, customFolder: '/Export//PDF/' }))
      .toBe('Export/PDF/Meine Notiz.pdf');
  });
  it('normalises backslashes in a hand-typed custom folder', () => {
    expect(resolveOutputPath('customFolder', { ...base, customFolder: 'Export\\PDF' }))
      .toBe('Export/PDF/Meine Notiz.pdf');
  });
});

describe('sanitizeBase', () => {
  it('strips illegal filename characters', () => {
    expect(sanitizeBase('a/b:c?')).toBe('a_b_c_');
  });
  it('falls back for empty input', () => {
    expect(sanitizeBase('')).toBe('Dokument');
  });
});

// Fake-App mit steuerbarem Vault-Adapter: `existing` listet Pfade, die schon belegt sind.
function fakeApp(existing: string[]) {
  const calls: string[] = [];
  const app = {
    vault: {
      adapter: {
        exists: async (p: string) => { calls.push(p); return existing.includes(p); },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { app: app as any, calls };
}

describe('resolveVersionedOutputPath', () => {
  const vars = { title: 'Bericht', date: '2026-07-16', time: '1435', folder: 'Projekte' };
  const ctx = { noteDir: 'Notes', customFolder: 'Exports', attachmentPath: 'Media/Bericht.pdf' };

  it('overwrites without {version} — a single pass, no existence check', async () => {
    const { app, calls } = fakeApp(['Notes/Bericht.pdf']);
    const r = await resolveVersionedOutputPath(app, 'nextToNote', '{title}', vars, ctx);
    expect(r.path).toBe('Notes/Bericht.pdf');
    expect(r.baseName).toBe('Bericht');
    expect(calls).toEqual([]); // kein exists()-Aufruf: nichts zu zaehlen
  });

  it('counts {version} up until the path is free', async () => {
    const { app } = fakeApp(['Notes/Bericht v1.pdf', 'Notes/Bericht v2.pdf']);
    const r = await resolveVersionedOutputPath(app, 'nextToNote', '{title} v{version}', vars, ctx);
    expect(r.path).toBe('Notes/Bericht v3.pdf');
    expect(r.baseName).toBe('Bericht v3');
  });

  it('starts at 1 when nothing exists yet', async () => {
    const { app } = fakeApp([]);
    const r = await resolveVersionedOutputPath(app, 'nextToNote', '{title} v{version}', vars, ctx);
    expect(r.path).toBe('Notes/Bericht v1.pdf');
  });

  it('lets Obsidian win in the attachment mode — {version} stays inert', async () => {
    const { app, calls } = fakeApp(['Media/Bericht.pdf']);
    const r = await resolveVersionedOutputPath(app, 'attachmentFolder', '{title} v{version}', vars, ctx);
    expect(r.path).toBe('Media/Bericht.pdf'); // der vorab aufgeloeste Anhang-Pfad, unveraendert
    expect(calls).toEqual([]);
  });

  it('returns a null path for share mode', async () => {
    const { app } = fakeApp([]);
    const r = await resolveVersionedOutputPath(app, 'share', '{title} v{version}', vars, ctx);
    expect(r.path).toBeNull();
    expect(r.baseName).toBe('Bericht v1');
  });

  it('applies the template to the custom folder too', async () => {
    const { app } = fakeApp([]);
    const r = await resolveVersionedOutputPath(app, 'customFolder', '{date} {title}', vars, ctx);
    expect(r.path).toBe('Exports/2026-07-16 Bericht.pdf');
  });
});

// writePdf hatte bis 2026-08-20 gar keinen Test. Der Netzgrund: seine Ordner-Ableitung ist
// seither vaultDirname aus dem Kit statt einer lokalen Inline-Rechnung.
function fakeWriteApp() {
  const mkdirs: string[] = [];
  const writes: string[] = [];
  const app = {
    vault: {
      adapter: {
        exists: async (_p: string) => false,
        mkdir: async (p: string) => { mkdirs.push(p); },
        writeBinary: async (p: string, _b: ArrayBuffer) => { writes.push(p); },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { app: app as any, mkdirs, writes };
}

describe('writePdf', () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it('creates the parent folder and writes to the resolved path', async () => {
    const { app, mkdirs, writes } = fakeWriteApp();
    const r = await writePdf(app, bytes, 'nextToNote', {
      baseName: 'Bericht', resolvedPath: 'Notes/Projekte/Bericht.pdf', openAfter: false,
    });
    expect(mkdirs).toEqual(['Notes/Projekte']);
    expect(writes).toEqual(['Notes/Projekte/Bericht.pdf']);
    expect(r.savedPath).toBe('Notes/Projekte/Bericht.pdf');
  });

  // Die -1-Falle: slice(0, lastIndexOf('/')) ergaebe hier den Phantom-Ordner "Muster GmbH.pd",
  // der neben jedem Export in der Vault-Wurzel angelegt wuerde.
  it('creates no phantom folder for a file in the vault root', async () => {
    const { app, mkdirs, writes } = fakeWriteApp();
    const r = await writePdf(app, bytes, 'nextToNote', {
      baseName: 'Muster GmbH', resolvedPath: 'Muster GmbH.pdf', openAfter: false,
    });
    expect(mkdirs).toEqual([]);
    expect(writes).toEqual(['Muster GmbH.pdf']);
    expect(r.savedPath).toBe('Muster GmbH.pdf');
  });
});
