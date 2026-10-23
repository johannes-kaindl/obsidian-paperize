# Entscheidungen — das Warum

Verdichtete Design-Essenz zu den Regeln im Kern (`AGENTS.md`). Vor dem Übernehmen einer Altentscheidung gilt: Grund aufsuchen, messen, ob er heute trägt.

## Nicht Zero-Build, `main.js` nicht committet

Anders als Letterhead (Zero-Build-Vanilla-JS) ist Paperize ein TS+esbuild-Projekt. `main.js` ist ein Build-Artefakt (`.gitignore`); der Release-Workflow baut es serverseitig aus dem getaggten Commit und attestiert das Ergebnis.

## Core-14-Schriften only

Der Font-Layer nutzt ausschließlich die Adobe-Core-14-Standardschriften (Helvetica/Times/Courier-Familien) — keine eingebetteten Schriften, keine Custom-Fonts. Das hält die PDFs klein und dependency-frei. Es ist eine bewusste Grenze, nicht „noch nicht implementiert“.

## Kein Electron-/Node-API im Laufzeitpfad

Nur Obsidian-API und Browser-APIs, damit das Plugin auf iOS/iPad läuft (`isDesktopOnly: false`) und dort echte Vektor-PDF-Bytes erzeugt.

## Degradation statt Abbruch

Was die Engine nicht abbildet, wird vereinfacht dargestellt und gezählt, der Export scheitert nicht. Die Zusammenfassungs-Notice nennt die Zahl der vereinfachten Elemente, damit „vereinfacht“ von „verloren“ unterscheidbar bleibt.

## Begrenzte Zahlenwerte als Slider

Ein Textfeld mit Guard im `onChange` verwirft eine Eingabe außerhalb der Grenzen still, die Anzeige lügt. Ein Slider macht den ungültigen Wert unmöglich (Regel: `.claude/rules/settings-tab.md`).

## Settings über Definitionen, nicht über zwei Render-Pfade

`getSettingDefinitions()` ist die eine Wahrheit, damit der native Host-Renderer (ab 1.13, mit Settings-Suche) und der Fallback (`display()`) nicht auseinanderlaufen (seit 0.3.3).

## SDD-Artefakte außerhalb des Repos

Spezifikationen und Pläne (SDD-Artefakte) liegen nicht im öffentlichen Repo, sondern im Arbeitskontext des Maintainers (CORE-META-12/14): Sie tragen Interna von Schwester-Repos, die hier niemandem nützen. Das Repo behält die Design-Essenz in diesen beiden Dateien, die Gotchas unter `.claude/rules/` und `CHANGELOG.md`. Keine absoluten Pfade außerhalb des Repos in committete Dateien; im Zweifel Platzhalter (`<code-workspace>/…`, `$VAULT/…`).
