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

  // settings — sections
  "settings.section.output": "Output",
  "settings.section.page": "Page",
  "settings.section.type": "Typography",
  "settings.section.content": "Content",
  "settings.section.pagination": "Pagination",

  // settings — filename scheme
  "settings.filename.name": "Filename scheme",
  "settings.filename.desc": "Placeholders: {title} {date} {time} {folder} {version}. Empty = {title} (the note's name). {version} counts up (1, 2, 3 …) instead of overwriting an existing PDF — it has no effect in the attachment-folder mode, where Obsidian resolves collisions itself.",

  // settings
  "settings.font.name": "Font family",
  "settings.font.desc": "Body typeface (standard fonts only).",
  "settings.fontSize.name": "Font size (pt)",
  "settings.lineHeight.name": "Line height",
  "settings.lineHeight.desc": "Multiple of the font size. 1.45 = comfortable reading.",
  "settings.imageWidth.name": "Maximum image width (%)",
  "settings.imageWidth.desc": "Share of the text width an image may occupy at most.",
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
  // Kein .desc mehr: die Zeile rendert nur noch im Modus „Custom folder" — die UI sagt es selbst.
  "settings.customFolder.name": "Custom output folder",
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

  // settings — sections
  "settings.section.output": "Ausgabe",
  "settings.section.page": "Seite",
  "settings.section.type": "Typografie",
  "settings.section.content": "Inhalt",
  "settings.section.pagination": "Umbruch",

  // settings — filename scheme
  "settings.filename.name": "Dateiname-Schema",
  "settings.filename.desc": "Platzhalter: {title} {date} {time} {folder} {version}. Leer = {title} (Name der Notiz). {version} zählt hoch (1, 2, 3 …), statt eine vorhandene PDF zu überschreiben — im Anhangordner-Modus wirkungslos, dort löst Obsidian Kollisionen selbst auf.",

  // settings
  "settings.font.name": "Schriftfamilie",
  "settings.font.desc": "Basis-Font (nur Standardschriften).",
  "settings.fontSize.name": "Schriftgröße (pt)",
  "settings.lineHeight.name": "Zeilenabstand",
  "settings.lineHeight.desc": "Vielfaches der Schriftgröße. 1,45 = komfortabel lesbar.",
  "settings.imageWidth.name": "Maximale Bildbreite (%)",
  "settings.imageWidth.desc": "Anteil der Textbreite, den ein Bild höchstens einnehmen darf.",
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
  // Kein .desc mehr: die Zeile rendert nur noch im Modus „Eigener Ordner" — die UI sagt es selbst.
  "settings.customFolder.name": "Eigener Ausgabe-Ordner",
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
