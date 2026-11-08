# Entscheidungen — das Warum

Verdichtete Design-Essenz zu den Regeln im Kern (`AGENTS.md`). Vor dem Übernehmen einer Altentscheidung gilt: Grund aufsuchen, messen, ob er heute trägt.

## Nicht Zero-Build, `main.js` nicht committet

Anders als Letterhead (Zero-Build-Vanilla-JS) ist Paperize ein TS+esbuild-Projekt. `main.js` ist ein Build-Artefakt (`.gitignore`); der Release-Workflow baut es serverseitig aus dem getaggten Commit und attestiert das Ergebnis.

## Core-14-Schriften only (nur im Vektor-Weg)

Der Font-Layer der eigenen Engine nutzt ausschließlich die Adobe-Core-14-Standardschriften (Helvetica/Times/Courier-Familien) — keine eingebetteten Schriften, keine Custom-Fonts. Das hält die PDFs klein und dependency-frei. Es ist eine bewusste Grenze, nicht „noch nicht implementiert“. Sie gilt seit 0.6.0 nur noch für den Vektor-Weg; der Desktop-Weg lässt Chromium die Schriften des Themes einbetten.

## Kein Import aus Electron oder Node im Laufzeitpfad

Das Plugin läuft auf iOS/iPad (`isDesktopOnly: false`) und erzeugt dort echte Vektor-PDF-Bytes. Deshalb gibt es keinen `import` aus `electron` oder `fs`, kein `require()`, kein `nodeintegration` und keine Electron-IPC; das hielte auch die Store-Note „Passed“. Der Desktop-Weg braucht nichts davon: Ein `<webview>` ist ein DOM-Element, seine Methode `printToPDF` läuft ohne `electron`-Import (gemessen 2026-11-08). Er ist hinter `Platform.isDesktopApp` und `isDesktopPrintAvailable()` verschlossen.

## Chromium am Desktop, Vektor-Engine als iPhone-Weg und Rückfall

Johannes verschickt PDFs und will, dass sie so aussehen wie die Notiz: Callouts mit Betonung, Mermaid-Diagramme, Farben und Schriften des Themes. Die eigene Engine kann das nicht (Callouts werden Fließtext, Mermaid kommt als Quelltext ins PDF, gemessen mit Punkt J1 im GUI-Smoke). Ein Ausbau der Engine dafür wäre ein eigener Browser; Chromium druckt es, mit eingebetteten Schriften und auswählbarem Text. Der Vormittags-Beschluss „kein Chromium“ vom 2026-11-08 ist deshalb aufgehoben, der Vektor-Ausbau fürs iPhone ist ein zweiter Schritt. Beide Wege bleiben: Scheitert der Desktop-Weg (kein `<webview>`, Zeitüberschreitung, leeres PDF), läuft der Vektor-Weg und eine Notice sagt es; ein Abbruch durch den Nutzer löst keinen Rückfall aus.

## Zwei Profile, Papier ist der Standard

Papier (weißer Grund, dunkler einfarbiger Text, dünne Linien, Diagramme in der hellen Fassung) spart Tinte und hängt von keinem Farbwert des Themes ab; Bildschirm lässt das Theme, wie es ist. Papier ist der Standard, weil ein Update Bestandsnutzern sonst plötzlich dunkle PDFs erzeugte. Die Einstellungen zu Schriftart, Größe und Zeilenabstand gelten am Desktop nicht mehr (die Schrift kommt aus dem Theme).

## Degradation statt Abbruch

Was die Engine nicht abbildet, wird vereinfacht dargestellt und gezählt, der Export scheitert nicht. Die Zusammenfassungs-Notice nennt die Zahl der vereinfachten Elemente, damit „vereinfacht“ von „verloren“ unterscheidbar bleibt.

## Begrenzte Zahlenwerte als Slider

Ein Textfeld mit Guard im `onChange` verwirft eine Eingabe außerhalb der Grenzen still, die Anzeige lügt. Ein Slider macht den ungültigen Wert unmöglich (Regel: `.claude/rules/settings-tab.md`).

## Settings über Definitionen, nicht über zwei Render-Pfade

`getSettingDefinitions()` ist die eine Wahrheit, damit der native Host-Renderer (ab 1.13, mit Settings-Suche) und der Fallback (`display()`) nicht auseinanderlaufen (seit 0.3.3).

## SDD-Artefakte außerhalb des Repos

Spezifikationen und Pläne (SDD-Artefakte) liegen nicht im öffentlichen Repo, sondern im Arbeitskontext des Maintainers (CORE-META-12/14): Sie tragen Interna von Schwester-Repos, die hier niemandem nützen. Das Repo behält die Design-Essenz in diesen beiden Dateien, die Gotchas unter `.claude/rules/` und `CHANGELOG.md`. Keine absoluten Pfade außerhalb des Repos in committete Dateien; im Zweifel Platzhalter (`<code-workspace>/…`, `$VAULT/…`).
