// src/obsidian/output.ts
import { App, Notice } from 'obsidian';
import type { OutputMode } from './settings';
import { t } from '../vendor/kit/i18n';
import { buildFilename, hasVersionPlaceholder, sanitizeFilename } from '../core/filename';
import type { FilenameValues } from '../core/filename';

// Runtime-only API surfaces not covered by the standard/Obsidian typings.
interface ShareCapableNavigator {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[] }) => Promise<void>;
}
interface AppWithDefaultApp {
  openWithDefaultApp?: (path: string) => Promise<void>;
}

// Delegat auf die eine Sanitisierungs-Regel des Repos (src/core/filename.ts) plus Paperize'
// Fallback-Konstante. Verhaltensgleich zur vorherigen lokalen Implementierung.
export function sanitizeBase(name: string): string {
  return sanitizeFilename(name) || 'Dokument';
}

// Join two vault-relative path fragments without leading/trailing slash noise.
function joinPath(dir: string, file: string): string {
  const d = (dir || '').replace(/^\/+|\/+$/g, '');
  return d ? `${d}/${file}` : file;
}

// Resolve the target .pdf path (vault-relative). Returns null for the share mode.
export function resolveOutputPath(
  mode: OutputMode,
  opts: { noteDir: string; baseName: string; customFolder: string; attachmentPath: string },
): string | null {
  const file = `${sanitizeBase(opts.baseName)}.pdf`;
  if (mode === 'share') return null;
  if (mode === 'nextToNote') return joinPath(opts.noteDir, file);
  if (mode === 'customFolder') return joinPath(opts.customFolder, file);
  // attachmentFolder: attachmentPath is a resolved vault path from getAvailablePathForAttachment.
  return opts.attachmentPath;
}

// Löst den finalen Pfad auf und zählt dabei {version} hoch, bis der Pfad frei ist.
// Ohne {version} im Schema gibt es nichts zu zählen: ein Durchlauf, bestehende Datei wird
// überschrieben (Paperize' bisheriges Verhalten). Der hasVersionPlaceholder-Guard ist der
// Abbruch der Schleife — ohne ihn liefe sie endlos, weil der Name sich nie ändern würde.
export async function resolveVersionedOutputPath(
  app: App,
  mode: OutputMode,
  template: string,
  vars: Omit<FilenameValues, 'version'>,
  ctx: { noteDir: string; customFolder: string; attachmentPath: string },
): Promise<{ path: string | null; baseName: string }> {
  const counting = hasVersionPlaceholder(template);
  let version = 1;
  for (;;) {
    const baseName = buildFilename(template, { ...vars, version });
    const path = resolveOutputPath(mode, { ...ctx, baseName });
    // share: kein Vault-Ziel (.paperize-export wird vor jedem Export geleert).
    // attachmentFolder: getAvailablePathForAttachment hat Kollisionen bereits aufgelöst —
    // ein zweiter Zähler darüber ergäbe "Bericht v1 1.pdf". Obsidian gewinnt.
    if (!counting || path === null || mode === 'attachmentFolder') return { path, baseName };
    if (!(await app.vault.adapter.exists(path))) return { path, baseName };
    version++;
  }
}

export async function writePdf(
  app: App,
  bytes: Uint8Array,
  mode: OutputMode,
  ctx: { baseName: string; resolvedPath: string | null; openAfter: boolean },
): Promise<{ savedPath: string | null }> {
  const adapter = app.vault.adapter;
  const appExt = app as AppWithDefaultApp;
  if (mode === 'share') {
    const dir = '.paperize-export';
    const safe = `${sanitizeBase(ctx.baseName)}.pdf`;
    const path = `${dir}/${safe}`;
    if (await adapter.exists(dir)) { const l = await adapter.list(dir); for (const f of l.files) await adapter.remove(f); }
    else await adapter.mkdir(dir);
    await adapter.writeBinary(path, bytes.buffer as ArrayBuffer);
    const fileObj = (typeof File === 'function') ? new File([bytes as BlobPart], safe, { type: 'application/pdf' }) : null;
    const nav = navigator as ShareCapableNavigator;
    if (fileObj && nav.canShare?.({ files: [fileObj] }) && nav.share) {
      try { await nav.share({ files: [fileObj] }); return { savedPath: null }; }
      catch (e) { if (e instanceof Error && e.name === 'AbortError') return { savedPath: null }; }
    }
    if (typeof appExt.openWithDefaultApp === 'function') await appExt.openWithDefaultApp(path);
    return { savedPath: null };
  }
  // Der Pfad kommt fertig aus resolveVersionedOutputPath — dort lebt die {version}-Zählung,
  // die awaiten muss (resolveOutputPath ist synchron und rein).
  const path = ctx.resolvedPath!;
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
  await adapter.writeBinary(path, bytes.buffer as ArrayBuffer);
  if (ctx.openAfter && typeof appExt.openWithDefaultApp === 'function') { try { await appExt.openWithDefaultApp(path); } catch { /* ignore */ } }
  new Notice(t('notice.saved', path));
  return { savedPath: path };
}
