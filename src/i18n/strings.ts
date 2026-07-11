// Plugin-owned UI strings (EN canonical, DE translation). Registered once via
// registerI18n() in onload, before addCommand/addRibbonIcon/addSettingTab. The engine
// (defineStrings/t/setLang/pickLang) is vendored from the kit under vendor/kit/i18n.ts.
// Key namespaces: cmd.* · notice.* · settings.*. EN and DE MUST define the same key set
// (enforced by tests/obsidian/i18n.test.ts).
import { defineStrings } from "../vendor/kit/i18n";

export const EN: Record<string, string> = {
  // commands / ribbon
  "cmd.export": "Export active note as PDF",
  "cmd.exportRibbon": "Paperize: export as PDF",

  // notices
  "notice.noActiveNote": "No active Markdown note.",
  "notice.exportFailed": "PDF export failed (see console).",
  "notice.nothingToExport": "Nothing to export.",
  "notice.simplified": "PDF created. {0} element(s) were simplified (e.g. callouts, math).",
  "notice.saved": "PDF saved: {0}",

  // settings
  "settings.font.name": "Font family",
  "settings.font.desc": "Body typeface (standard fonts only).",
  "settings.fontSize.name": "Font size (pt)",
  "settings.pageSize.name": "Page size",
  "settings.margins.name": "Margins (mm)",
  "settings.frontmatter.name": "Show frontmatter as a metadata block",
  "settings.frontmatter.desc": "Frontmatter appears as a subtle metadata list at the top (instead of a raw YAML block). Off = omit entirely.",
  "settings.title.name": "Title on top",
  "settings.pageNumbers.name": "Page numbers",
  "settings.footer.name": "Running footer (title/date)",
  "settings.output.name": "Output destination",
  "settings.output.nextToNote": "Next to the note",
  "settings.output.attachmentFolder": "Obsidian attachment folder",
  "settings.output.customFolder": "Custom folder",
  "settings.output.share": "Share/open out of the vault",
  "settings.customFolder.name": "Custom output folder",
  "settings.customFolder.desc": "Only used with “Custom folder”.",
  "settings.pagebreak.name": "Page-break marker",
  "settings.pagebreak.desc": "A paragraph matching exactly this text forces a page break. Empty = feature off.",
  "settings.keepTables.name": "Keep tables together",
  "settings.keepTables.desc": "A table that fits on one page is not broken across a page boundary.",
  "settings.repeatHeader.name": "Repeat table header",
  "settings.repeatHeader.desc": "For a table spanning multiple pages, repeat the header row on every following page.",
  "settings.keepImages.name": "Keep images together",
  "settings.keepImages.desc": "An image is not cut across a page boundary.",
  "settings.keepCode.name": "Keep code blocks together",
  "settings.keepCode.desc": "A code block that fits on one page is not broken across a page boundary.",
  "settings.orphan.name": "Heading orphan control (lines)",
  "settings.orphan.desc": "Minimum number of following lines that must stay with a heading on the same page. 0 = off.",
};

export const DE: Record<string, string> = {
  // commands / ribbon
  "cmd.export": "Aktive Notiz als PDF exportieren",
  "cmd.exportRibbon": "Paperize: als PDF exportieren",

  // notices
  "notice.noActiveNote": "Keine aktive Markdown-Notiz.",
  "notice.exportFailed": "PDF-Export fehlgeschlagen (siehe Konsole).",
  "notice.nothingToExport": "Nichts zu exportieren.",
  "notice.simplified": "PDF erstellt. {0} Element(e) wurden vereinfacht dargestellt (z.B. Callouts, Mathe).",
  "notice.saved": "PDF gespeichert: {0}",

  // settings
  "settings.font.name": "Schriftfamilie",
  "settings.font.desc": "Basis-Font (nur Standardschriften).",
  "settings.fontSize.name": "Schriftgröße (pt)",
  "settings.pageSize.name": "Seitenmaß",
  "settings.margins.name": "Ränder (mm)",
  "settings.frontmatter.name": "Frontmatter als Metadaten-Block zeigen",
  "settings.frontmatter.desc": "Frontmatter erscheint als dezente Metadaten-Liste oben (statt als roher YAML-Block). Aus = ganz weglassen.",
  "settings.title.name": "Titel oben",
  "settings.pageNumbers.name": "Seitenzahlen",
  "settings.footer.name": "Laufende Fußzeile (Titel/Datum)",
  "settings.output.name": "Ausgabeziel",
  "settings.output.nextToNote": "Neben der Notiz",
  "settings.output.attachmentFolder": "Obsidian-Anhangordner",
  "settings.output.customFolder": "Eigener Ordner",
  "settings.output.share": "Aus Vault teilen/öffnen",
  "settings.customFolder.name": "Eigener Ausgabe-Ordner",
  "settings.customFolder.desc": "Nur bei „Eigener Ordner“.",
  "settings.pagebreak.name": "Seitenumbruch-Marker",
  "settings.pagebreak.desc": "Ein Absatz, der genau diesem Text entspricht, erzwingt einen Seitenumbruch. Leer = Funktion aus.",
  "settings.keepTables.name": "Tabellen zusammenhalten",
  "settings.keepTables.desc": "Eine Tabelle, die auf eine Seite passt, wird nicht mittendrin umbrochen.",
  "settings.repeatHeader.name": "Tabellenkopf wiederholen",
  "settings.repeatHeader.desc": "Bei einer Tabelle, die über mehrere Seiten läuft, wird die Kopfzeile auf jeder Folgeseite wiederholt.",
  "settings.keepImages.name": "Bilder zusammenhalten",
  "settings.keepImages.desc": "Ein Bild wird nicht über eine Seitengrenze hinweg abgeschnitten.",
  "settings.keepCode.name": "Codeblöcke zusammenhalten",
  "settings.keepCode.desc": "Ein Codeblock, der auf eine Seite passt, wird nicht mittendrin umbrochen.",
  "settings.orphan.name": "Überschriften-Waisenschutz (Zeilen)",
  "settings.orphan.desc": "Mindestanzahl Folgezeilen, die mit einer Überschrift auf derselben Seite bleiben müssen. 0 = aus.",
};

/** Registers EN/DE with the vendored i18n engine. Call once in onload, before t(). */
export function registerI18n(): void {
  defineStrings({ en: EN, de: DE });
}
