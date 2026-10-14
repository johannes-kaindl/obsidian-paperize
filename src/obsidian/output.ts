// src/obsidian/output.ts
import { App, Notice } from 'obsidian';
import type { OutputMode } from './settings';
import { getLang, t } from '../vendor/kit/i18n';
import { shareExport, SHARE_EXPORT_STRINGS_DE, SHARE_EXPORT_STRINGS_EN } from '../vendor/kit-obsidian/share-export';
import { buildFilename, hasVersionPlaceholder, sanitizeFilename } from '../core/filename';
import type { FilenameValues } from '../core/filename';
import { joinVaultPath, vaultDirname } from '../vendor/kit/vault-path';
import { confirmAction } from '../vendor/kit-obsidian/confirm';

// Nur der Typ der optionalen Plattform-Funktion, die die öffentlichen Typings nicht kennen.
interface AppWithDefaultApp { openWithDefaultApp?: (path: string) => Promise<void> }

// Delegat auf die eine Sanitisierungs-Regel des Repos plus Paperize' Fallback-Konstante.
// Die Regel selbst liegt seit dem Kit-Anschluss in src/vendor/kit/filename-template.ts;
// src/core/filename.ts ist die repo-eigene Hülle darum und bleibt die Adresse dafür.
export function sanitizeBase(name: string, fallback: string = t('file.fallbackName')): string {
  return sanitizeFilename(name) || fallback;
}

// Resolve the target .pdf path (vault-relative). Returns null for the share mode.
export function resolveOutputPath(
  mode: OutputMode,
  opts: { noteDir: string; baseName: string; customFolder: string; attachmentPath: string },
): string | null {
  const file = `${sanitizeBase(opts.baseName)}.pdf`;
  if (mode === 'share') return null;
  if (mode === 'nextToNote') return joinVaultPath(opts.noteDir, file);
  if (mode === 'customFolder') return joinVaultPath(opts.customFolder, file);
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
    const baseName = buildFilename(template, { ...vars, version }, t('file.fallbackName'));
    const path = resolveOutputPath(mode, { ...ctx, baseName });
    // share: kein Vault-Ziel (.paperize-export wird vor jedem Export geleert).
    // attachmentFolder: getAvailablePathForAttachment hat Kollisionen bereits aufgelöst —
    // ein zweiter Zähler darüber ergäbe "Bericht v1 1.pdf". Obsidian gewinnt.
    if (!counting || path === null || mode === 'attachmentFolder') return { path, baseName };
    if (!(await app.vault.adapter.exists(path))) return { path, baseName };
    version++;
  }
}

/** Ein Schema ohne {version} schreibt jeden Export auf denselben Namen: ist die Datei da, wird sie ersetzt.
 *  attachmentFolder und share sind ausgenommen (Obsidian löst die Kollision selbst, share hat kein Vault-Ziel). */
export function mayOverwrite(mode: OutputMode, template: string, path: string | null): path is string {
  return path !== null && mode !== 'attachmentFolder' && mode !== 'share' && !hasVersionPlaceholder(template);
}

/** Fragt vor dem Ersetzen einer vorhandenen PDF. true = ersetzen (oder es gibt nichts zu ersetzen). */
export async function confirmReplace(app: App, path: string): Promise<boolean> {
  if (!(await app.vault.adapter.exists(path))) return true;
  return confirmAction(app, {
    title: t('confirm.overwrite.title'),
    message: t('confirm.overwrite.message', path),
    confirmLabel: t('confirm.overwrite.confirm'),
    cancelLabel: t('confirm.cancel'),
  });
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
    // Der Kit-Baustein leert den Export-Ordner (eigene PDFs still, Fremdes nur nach Rückfrage),
    // schreibt die Datei und bietet sie dem System an. Er wirft nicht; Fehler meldet er selbst.
    const kit = getLang() === 'de' ? SHARE_EXPORT_STRINGS_DE : SHARE_EXPORT_STRINGS_EN;
    await shareExport(app, bytes, { dir: '.paperize-export', fileName: `${sanitizeBase(ctx.baseName)}.pdf`, mime: 'application/pdf', strings: kit });
    return { savedPath: null };
  }
  // Der Pfad kommt fertig aus resolveVersionedOutputPath — dort lebt die {version}-Zählung,
  // die awaiten muss (resolveOutputPath ist synchron und rein).
  const path = ctx.resolvedPath!;
  // vaultDirname statt slice(0, lastIndexOf('/')): bei einer Datei in der Vault-Wurzel ist
  // lastIndexOf gleich -1, und slice(0, -1) schnitte das letzte Zeichen des DATEINAMENS ab.
  const dir = vaultDirname(path);
  if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
  await adapter.writeBinary(path, bytes.buffer as ArrayBuffer);
  if (ctx.openAfter && typeof appExt.openWithDefaultApp === 'function') { try { await appExt.openWithDefaultApp(path); } catch { /* ignore */ } }
  new Notice(t('notice.saved', path));
  return { savedPath: path };
}
