# Aufbau von Paperize

Modul-Layout und Schnittstellen. Das Warum steht in `docs/internal/decisions.md`, die Regeln im Kern (`AGENTS.md`).

## Schichten

- `src/core/*` ist pure (kein Obsidian-Import, in Node/vitest testbar): Dateiname-Schema (`filename.ts`, ein Shim über das vendorte Kit-Modul), Frontmatter, Bildquellen (`image-source.ts`), Vorbereitung der Optionen (`prepare.ts`). `npm run check:pure` erzwingt das für `src/core` und `src/vendor`.
- `src/obsidian/*` ist die einzige Schicht mit Obsidian-API: `main.ts` (Befehl, Ribbon, Export-Ablauf), `output.ts` (Ausgabemodi, Zielpfad, `{version}`-Zählung), `settings.ts` (Settings-Tab), `export-progress.ts`, `help-row.ts`.
- `src/i18n/strings.ts` trägt die EN/DE-Texte; die Sprachwahl kommt aus dem vendorten Kit-Modul `i18n.ts`.
- `src/vendor/kit/` ist die vendorte pure Schicht, `src/vendor/kit-obsidian/` die Obsidian-gekoppelte. Beide sind Kopien mit Herkunftsstempel; den Stand nennen die `VENDOR.json`, die Konfiguration steht in `tools/kit-sync.json`.

## Vendor-Schichtung

Das Kit hat zwei Schichten (`src/pure` und `src/obsidian`); der Vendor spiegelt sie. Obsidian-gekoppelte Kit-Module liegen unter `src/vendor/kit-obsidian/` (`collapsible.ts`, `folder-suggest.ts`, `settings_walker.ts`, `help-setting.ts`, `confirm.ts`, `share-export.ts`). Dieser Ordner steht als einziger Eintrag in `EXCLUDED` in `scripts/check-pure.mjs`. Alles übrige im Vendor (`i18n`, `pdf`, `settings`, `vault-path`, `filename-template`, `rel-path` …) ist pure und bleibt geprüft. Die Grenze verläuft bei „pure“, nicht bei „vendored“.

Die PDF-Engine (`src/vendor/kit/pdf/`: Layout, Metrics, Writer, IR) ist die pure Engine aus obsidian-kit und Obsidian-frei. Die Domänen-freien Module (`i18n`, `settings`, `filename-template`, `data-url`, `local-stamp`, `rel-path`) kommen aus code-kit.

## DOM→IR-Seam

`src/vendor/kit/pdf/dom-to-ir.ts` wandelt Obsidians gerenderten Markdown-DOM (`MarkdownRenderer.render`) in die pure Block/Inline-IR des Kits um — der einzige Ort, an dem Obsidian-DOM und pure Engine sich berühren. Nicht unterstützte Elemente werden zu `{ type: 'unsupported' }`-Blöcken (Degradation, kein Abbruch); der Zähler treibt die Zusammenfassungs-Notice in `main.ts`.

## Markdown-Umfang

Überschriften, Absätze, Bold/Italic/Inline-Code, verschachtelte Listen, Blockquotes, HR, Links, Bilder (zu JPEG re-encodiert), Codeblöcke, einfache Tabellen. Alles außerhalb (Callouts, Mathe, Embeds, …) wird vereinfacht dargestellt statt den Export scheitern zu lassen.

## Settings-Tab (zweigleisig)

Ab Obsidian 1.13 fragt der Host `getSettingDefinitions()` selbst ab, rendert die Definitionen nativ und nimmt die Zeilen in die Settings-Suche auf; darunter ruft er `display()`, das über `renderSettingDefinitions` (vendored aus dem Kit) *dieselben* Definitionen nachzeichnet. `minAppVersion` bleibt deshalb 1.8.7. `SECTIONS` bleibt die pure Tabelle (Key · i18n-Titel · Startzustand) und speist beides: den Gruppen-Aufbau und die Collapsible-Sektionen des Fallbacks.

## Dateiname und Pfade

`src/core/filename.ts` rechnet nur, die Zählung braucht Vault-Zugriff (`resolveVersionedOutputPath` in `output.ts`). Ordner-Anteile laufen über `vault-path.ts`, der Dateiname über das Schema (`filename-template.ts`). Fallstricke: `.claude/rules/dateiname-und-pfade.md`.

## Release-Weg

Releases entstehen auf GitHub Actions (`.github/workflows/release.yml`): ein SemVer-Tag ohne `v`-Präfix löst den Lauf aus, der das Plugin frisch aus dem getaggten Commit baut (`npm run gate`, inkl. `build`) und das Build-Ergebnis (`main.js`, `manifest.json`, `styles.css`) attestiert. Das attestierte Subjekt ist also kein committeter Quelltext, sondern der reproduzierbar erzeugte Output (Einordnung: `SECURITY.md`). `npm run release -- <version>` ruft das zentrale Tooling im Dach (`../tools/release/release.mjs`).
