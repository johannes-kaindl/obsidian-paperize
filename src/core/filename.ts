// Konfigurierbares Dateiname-Schema für den PDF-Export. Rein und testbar (kein obsidian-Import).
// Platzhalter: {title} {date} {time} {folder} {version}
//   {title} = Basename der Notiz · {date} = YYYY-MM-DD · {time} = HHMM
//   {folder} = Ordnername der Notiz (nicht der Pfad; leer wenn im Vault-Root)
//   {version} = Export-Zähler; die Zählung selbst lebt in src/obsidian/output.ts (braucht Vault-Zugriff)
//
// Diese Datei ist seit dem Kit-Anschluss (0.27.0) keine Adaption mehr, sondern die repo-eigene
// Hülle um ein Kit-Modul: Sanitisierung und Platzhalter-Auflösung liegen in
// ../vendor/kit/filename-template.ts (dort aus yijing-oracle, obsidian-paperize und
// obsidian-letterhead zusammengeführt). Hier bleibt, was Paperize-spezifisch ist und im Kit
// bewusst keine Entsprechung hat: das Default-Schema, die Wertetabelle und der
// {version}-Guard.

import { buildFilename as fillTemplate } from '../vendor/kit/filename-template';

export { sanitizeFilename } from '../vendor/kit/filename-template';

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
 *  stehen, damit ein Tippfehler im Dateinamen sichtbar wird statt still zu wirken.
 *
 *  Die Fallback-Kette ist Paperize' bisherige, wörtlich übersetzt: leeres oder
 *  weg-sanitisiertes Schema → Titel, sonst die Konstante — nie ein leerer Dateiname.
 *  `onInvalid` bleibt beim Kit-Default 'replace' (ungültiges Zeichen → `_`), das ist
 *  Paperize' etablierte Semantik. */
export function buildFilename(template: string, v: FilenameValues): string {
  return fillTemplate(
    template,
    {
      title: v.title,
      date: v.date,
      time: v.time,
      folder: v.folder,
      version: String(v.version),
    },
    { fallbacks: ['{title}'], lastResort: 'Dokument' },
  );
}
