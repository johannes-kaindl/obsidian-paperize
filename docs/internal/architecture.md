# Aufbau von Paperize

Modul-Layout und Schnittstellen. Das Warum steht in `docs/internal/decisions.md`, die Regeln im Kern (`AGENTS.md`).

## Schichten

- `src/core/*` ist pure (kein Obsidian-Import, in Node/vitest testbar): Profile, Seiten-CSS und Befehlsliste des Desktop-Wegs (`desktop-print.ts`), Dateiname-Schema (`filename.ts`, ein Shim über das vendorte Kit-Modul), Frontmatter, Bildquellen (`image-source.ts`), Vorbereitung der Optionen (`prepare.ts`). `npm run check:pure` erzwingt das für `src/core` und `src/vendor`.
- `src/obsidian/*` ist die einzige Schicht mit Obsidian-API: `main.ts` (Befehle, Ribbon, Export-Ablauf, Rückfall), `export-desktop.ts` (Desktop-Weg), `output.ts` (Ausgabemodi, Zielpfad, `{version}`-Zählung), `settings.ts` (Settings-Tab), `export-progress.ts`, `help-row.ts`.
- `src/i18n/strings.ts` trägt die EN/DE-Texte; die Sprachwahl kommt aus dem vendorten Kit-Modul `i18n.ts`.
- `src/vendor/kit/` ist die vendorte pure Schicht, `src/vendor/kit-obsidian/` die Obsidian-gekoppelte. Beide sind Kopien mit Herkunftsstempel; den Stand nennen die `VENDOR.json`, die Konfiguration steht in `tools/kit-sync.json`.

## Vendor-Schichtung

Das Kit hat zwei Schichten (`src/pure` und `src/obsidian`); der Vendor spiegelt sie. Obsidian-gekoppelte Kit-Module liegen unter `src/vendor/kit-obsidian/` (`collapsible.ts`, `folder-suggest.ts`, `settings_walker.ts`, `help-setting.ts`, `confirm.ts`, `share-export.ts`, `clock.ts`, `print-to-pdf.ts`). Dieser Ordner steht als einziger Eintrag in `EXCLUDED` in `scripts/check-pure.mjs`. Alles übrige im Vendor (`i18n`, `pdf`, `settings`, `vault-path`, `filename-template`, `rel-path` …) ist pure und bleibt geprüft. Die Grenze verläuft bei „pure“, nicht bei „vendored“.

Die PDF-Engine (`src/vendor/kit/pdf/`: Layout, Metrics, Writer, IR) ist die pure Engine aus obsidian-kit und Obsidian-frei. Die Domänen-freien Module (`i18n`, `settings`, `filename-template`, `data-url`, `local-stamp`, `rel-path`) kommen aus code-kit.

## Desktop-Weg (Chromium)

`export-desktop.ts` rendert die Notiz mit `MarkdownRenderer.render` in einen eingehängten, unsichtbaren Container (`.paperize-render-host`, ohne `extractCodeBlocks`, damit Mermaid zeichnen darf), wartet auf die Diagramme, bettet Bilder und relative Schrift-URLs als `data:` ein und sammelt das CSS (`collectDocumentCss`, oberste `@media print`-Regeln entfallen). Daraus baut `buildPrintDocument` ein eigenständiges HTML-Dokument mit Rücksetzung von Obsidians Druck-CSS, Profil-CSS, Paginierung und `@page`; `printHtmlToPdf` druckt es in einem unsichtbaren `<webview>`. Alle reinen Bausteine kommen aus dem Kit (`collect-css`, `print-document`, `print-css`, `timeout` pur; `print-to-pdf`, `clock` Obsidian-gekoppelt), Paperize behält die Verdrahtung und die Profile. `main.ts` hält die Naht `desktopPrint` (Treiber setzen `null` und messen den Vektor-Weg) und fällt bei jedem Fehler außer Abbruch auf `renderVector` zurück. Ablauf und Messpunkte: `docs/SMOKE.md`.

## DOM→IR-Seam

`src/vendor/kit/pdf/dom-to-ir.ts` wandelt Obsidians gerenderten Markdown-DOM (`MarkdownRenderer.render`) in die pure Block/Inline-IR des Kits um — der einzige Ort, an dem Obsidian-DOM und pure Engine sich berühren. Nicht unterstützte Elemente werden zu `{ type: 'unsupported' }`-Blöcken (Degradation, kein Abbruch); der Zähler treibt die Zusammenfassungs-Notice in `main.ts`.

## Markdown-Umfang

Überschriften, Absätze, Bold/Italic/Inline-Code, verschachtelte Listen, Blockquotes, HR, Links, Bilder (zu JPEG re-encodiert), Codeblöcke, einfache Tabellen. Alles außerhalb (Callouts, Mathe, Embeds, …) wird im Vektor-Weg vereinfacht dargestellt statt den Export scheitern zu lassen. Der Desktop-Weg druckt, was Obsidian zeichnet.

## Settings-Tab (zweigleisig)

Ab Obsidian 1.13 fragt der Host `getSettingDefinitions()` selbst ab, rendert die Definitionen nativ und nimmt die Zeilen in die Settings-Suche auf; darunter ruft er `display()`, das über `renderSettingDefinitions` (vendored aus dem Kit) *dieselben* Definitionen nachzeichnet. `minAppVersion` bleibt deshalb 1.8.7. `SECTIONS` bleibt die pure Tabelle (Key · i18n-Titel · Startzustand) und speist beides: den Gruppen-Aufbau und die Collapsible-Sektionen des Fallbacks.

## Dateiname und Pfade

`src/core/filename.ts` rechnet nur, die Zählung braucht Vault-Zugriff (`resolveVersionedOutputPath` in `output.ts`). Ordner-Anteile laufen über `vault-path.ts`, der Dateiname über das Schema (`filename-template.ts`). Fallstricke: `.claude/rules/dateiname-und-pfade.md`.

## Release-Weg

Releases entstehen auf GitHub Actions (`.github/workflows/release.yml`): ein SemVer-Tag ohne `v`-Präfix löst den Lauf aus, der das Plugin frisch aus dem getaggten Commit baut (`npm run gate`, inkl. `build`) und das Build-Ergebnis (`main.js`, `manifest.json`, `styles.css`) attestiert. Das attestierte Subjekt ist also kein committeter Quelltext, sondern der reproduzierbar erzeugte Output (Einordnung: `SECURITY.md`). `npm run release -- <version>` ruft das zentrale Tooling im Dach (`../tools/release/release.mjs`).
