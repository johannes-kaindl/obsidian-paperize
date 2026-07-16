// tests/obsidian/output.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('obsidian', () => ({ Notice: class {}, App: class {} }));
import { resolveOutputPath, sanitizeBase, resolveVersionedOutputPath } from '../../src/obsidian/output';

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
