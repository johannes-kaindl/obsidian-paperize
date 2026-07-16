// Konfigurierbares Dateiname-Schema für den PDF-Export. Rein und testbar (kein obsidian-Import).
// Platzhalter: {title} {date} {time} {folder} {version}
//   {title} = Basename der Notiz · {date} = YYYY-MM-DD · {time} = HHMM
//   {folder} = Ordnername der Notiz (nicht der Pfad; leer wenn im Vault-Root)
//   {version} = Export-Zähler; die Zählung selbst lebt in src/obsidian/output.ts (braucht Vault-Zugriff)
// Adaptiert von yijing-oracle/src/core/filename.ts (2. Exemplar, siehe REGISTRY „Kit-Kandidat").

// OS-illegale plus Obsidian-spezifische Zeichen (#^[]).
const INVALID = /[\\/:*?"<>|#^[\]]/g;

/** Ungültige Datei-Zeichen durch _ ersetzen, Whitespace kollabieren, trimmen.
 *  Ersetzen statt Löschen ist Paperize' etablierte Semantik (vormals sanitizeBase). */
export function sanitizeFilename(s: string): string {
  return s.replace(INVALID, '_').replace(/\s+/g, ' ').trim();
}

export const DEFAULT_FILENAME_TEMPLATE = '{title}';

export interface FilenameValues {
  /** Basename der Notiz, z.B. "Mein Bericht" */
  title: string;
  /** "2026-07-16" */
  date: string;
  /** "1435" (HHMM) */
  time: string;
  /** Ordnername der Notiz, "" im Vault-Root */
  folder: string;
  /** Export-Zähler, ab 1 */
  version: number;
}

/** Enthält das Schema {version}? Load-bearing: ohne diese Prüfung würde die Suchschleife in
 *  output.ts bei einem Schema ohne {version} denselben Namen endlos neu bauen. */
export function hasVersionPlaceholder(template: string): boolean {
  return /\{version\}/.test(template);
}

/** Löst das Schema auf und sanitisiert das Ergebnis. Unbekannte Platzhalter bleiben literal
 *  stehen, damit ein Tippfehler im Dateinamen sichtbar wird statt still zu wirken. */
export function buildFilename(template: string, v: FilenameValues): string {
  const subs: Record<string, string> = {
    title: v.title,
    date: v.date,
    time: v.time,
    folder: v.folder,
    version: String(v.version),
  };
  const filled = template.replace(/\{(\w+)\}/g, (_m, key: string) => subs[key] ?? `{${key}}`);
  const clean = sanitizeFilename(filled);
  // Leeres/weg-sanitisiertes Schema → Titel, sonst Konstante: nie ein leerer Dateiname.
  return clean || sanitizeFilename(v.title) || 'Dokument';
}
