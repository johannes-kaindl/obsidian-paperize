// src/obsidian/output.ts
import { App, Notice } from 'obsidian';
import type { OutputMode } from './settings';

export function sanitizeBase(name: string): string {
  return (name || 'Dokument').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Dokument';
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

export async function writePdf(
  app: App,
  bytes: Uint8Array,
  mode: OutputMode,
  ctx: { noteDir: string; baseName: string; customFolder: string; attachmentPath: string; openAfter: boolean },
): Promise<{ savedPath: string | null }> {
  const adapter = app.vault.adapter;
  if (mode === 'share') {
    const dir = '.paperize-export';
    const safe = `${sanitizeBase(ctx.baseName)}.pdf`;
    const path = `${dir}/${safe}`;
    if (await adapter.exists(dir)) { const l = await adapter.list(dir); for (const f of l.files) await adapter.remove(f); }
    else await adapter.mkdir(dir);
    await adapter.writeBinary(path, bytes.buffer as ArrayBuffer);
    const fileObj = (typeof File === 'function') ? new File([bytes as BlobPart], safe, { type: 'application/pdf' }) : null;
    if (fileObj && (navigator as any).canShare && (navigator as any).canShare({ files: [fileObj] })) {
      try { await (navigator as any).share({ files: [fileObj] }); return { savedPath: null }; }
      catch (e: any) { if (e && e.name === 'AbortError') return { savedPath: null }; }
    }
    if (typeof (app as any).openWithDefaultApp === 'function') await (app as any).openWithDefaultApp(path);
    return { savedPath: null };
  }
  const path = resolveOutputPath(mode, ctx)!;
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
  await adapter.writeBinary(path, bytes.buffer as ArrayBuffer);
  if (ctx.openAfter && typeof (app as any).openWithDefaultApp === 'function') { try { await (app as any).openWithDefaultApp(path); } catch { /* ignore */ } }
  new Notice(`PDF gespeichert: ${path}`);
  return { savedPath: path };
}
