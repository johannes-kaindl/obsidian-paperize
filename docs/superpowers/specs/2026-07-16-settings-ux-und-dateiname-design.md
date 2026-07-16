# Spec — Settings-UX + Dateiname-Schema (Paperize)

**Datum:** 2026-07-16 · **Status:** validiert, freigegeben · **Zyklus:** brainstorm → spec → plan → SDD

## Problem

Jay wollte in Paperize „ein Ausgabeziel definieren, also wo das PDF gespeichert wird" — und hat es
nicht gefunden. Das Setting **existiert seit 0.1.0** (`outputMode`, vier Modi) und heißt in der
deutschen UI wörtlich **„Ausgabeziel"** (`src/i18n/strings.ts:75`). Es ist unauffindbar, weil
`display()` siebzehn Settings als **flache Kette ohne einen einzigen Abschnitts-Header** rendert
(`src/obsidian/settings.ts:77-124`).

Das ist der Kern-Befund dieses Zyklus: **kein fehlendes Feature, sondern eine unauffindbare Liste.**
Ein gesuchtes und nicht gefundenes Setting ist funktional ein nicht vorhandenes Setting.

Daneben zwei echte Lücken:
- **Kein Dateiname-Schema** — der Name ist hart `file.basename` (`src/obsidian/main.ts:104`).
- **Zwei Settings ohne Bedienoberfläche** — `lineHeight` und `imageMaxWidthPct` stehen im Interface
  und in den Defaults, werden aber von `display()` nicht gerendert. Nur via `data.json` änderbar.

## Nicht-Ziele (bewusst ausgeschlossen)

- **Kein KI-/LLM-Feature.** Paperize hat null Netzwerk-Code und keine Runtime-Dependencies; die
  `AGENTS.md:24-25` schreibt „Kein Electron-/Node-API im Laufzeitpfad → mobil-tauglich", `check:pure`
  erzwingt es. Ein KI-Bereich wäre Greenfield und braucht zuerst einen Zweck, nicht eine Settings-UI.
  Aus dem Kit übernommen wird deshalb nur, was **ohne** LLM trägt: `collapsibleSection`,
  `mergeSettings`. „Verbindung testen" hat hier kein Gegenstück.
- **Kein Überschreib-Schutz als Default.** Wer ihn will, nimmt `{version}` ins Schema (siehe unten).
- **Kein Ordner-Autocomplete, kein Ausgabeziel pro Notiz.** Verworfen — YAGNI.
- **Keine Kit-Extraktion des Resolvers.** Siehe „Kit-first".

## Kit-first

`REGISTRY.md:56` führt yijing-oracles `filename.ts` als „Muster-Referenz (erstes Exemplar; pure, TDD
— bei 2. note-erzeugendem Plugin Kit-Bewertung)". Paperize ist dieses zweite Exemplar.

**Entscheidung: adaptieren, nicht extrahieren.** Die Engine (Template-Ersetzung, Sanitizing,
Fallback) trägt; die Platzhalter-Sets überlappen sich nicht (`{hexpair}` vs. `{folder}`/`{version}`).
Die Regel der Drei ist nicht erfüllt, und `KIT-MATRIX.md:64` warnt genau davor, aus zwei Consumern
die Abstraktions-Grenzen zu raten. REGISTRY-Status wird auf **Kit-Kandidat** gehoben.

Regulär vendored (unverändert, mit Herkunfts-Header):
- `collapsibleSection` / `resolveCollapsed` / `COLLAPSIBLE_CSS` — Kit `src/obsidian/collapsible.ts`
- `mergeSettings` — Kit `src/pure/settings.ts`

## Architektur

Genau **eine** neue pure Datei; der Rest sind Änderungen an Bestehendem. Der `check:pure`-Gate bleibt
gewahrt: Der Resolver rechnet nur, jeder Vault-Zugriff lebt in `src/obsidian/`.

| Datei | Änderung |
|---|---|
| `src/core/filename.ts` | **neu, pure** — `buildFilename` · `sanitizeFilename` · `hasVersionPlaceholder` |
| `src/obsidian/output.ts` | Versions-Schleife statt festem `basename` |
| `src/obsidian/settings.ts` | fünf Sektionen statt flacher Kette; drei neue Kontrollen |
| `src/obsidian/main.ts` | `mergeSettings` statt `Object.assign` (Z. 50); Template-Variablen bauen |
| `src/vendor/kit/collapsible.ts` | **neu vendored** aus Kit 0.13.0 |
| `src/vendor/kit/settings.ts` | **neu vendored** (`mergeSettings`) |
| `styles.css` | `COLLAPSIBLE_CSS` (Datei ist bislang ein 53-Byte-Platzhalter) |
| `src/i18n/strings.ts` | EN + DE, Key-Set-Gleichheit ist per Test erzwungen |

## Sektions-Schnitt

Nach UI-STANDARD §5 („Wichtiges zuerst"). **Ausgabe** ist die einzige aufgeklappte Sektion — die
direkte Antwort auf das Auffindbarkeits-Problem. Danach gewinnt der persistierte User-Zustand
(Muster von vault-rag, `src/settings.ts:213-215`).

| # | Sektion | Key | Default | Inhalt |
|---|---|---|---|---|
| 1 | Ausgabe | `output` | **offen** | Ausgabeziel · eigener Ordner · **Dateiname-Schema** (neu) |
| 2 | Seite | `page` | zu | Format · Rand |
| 3 | Typografie | `type` | zu | Schrift · Größe · **Zeilenabstand** (neu) · **max. Bildbreite** (neu) |
| 4 | Inhalt | `content` | zu | Titel · Frontmatter · Seitenzahlen · Kopf-/Fußzeile |
| 5 | Umbruch | `pagination` | zu | Umbruch-Marker · Tabellen/Bilder/Code zusammenhalten · Überschriften-Bindung |

Persistenz via neues Feld `uiCollapsed: Record<string, boolean>` in `PaperizeSettings`, verdrahtet
über den `CollapsibleStorage`-Callback.

**`mergeSettings` ist hier load-bearing, nicht Kosmetik:** `main.ts:50` macht heute
`Object.assign({}, DEFAULT_SETTINGS, data)` — einen Shallow-Merge. Mit `uiCollapsed` und
`colors` existieren dann zwei verschachtelte Objekte, bei denen ein Shallow-Merge künftige
Default-Keys still verschluckt. Genau dieser Bug wurde in image-to-markdown 0.13.0 gefunden
(`fmMapFromSettings`-Backfill); UI-STANDARD §5 schreibt `mergeSettings` deshalb verbindlich vor.

## Dateiname-Schema

**Platzhalter:** `{title}` (Notiz-Basename) · `{date}` (YYYY-MM-DD) · `{time}` (HHMM) · `{folder}`
(Ordnername der Notiz, nicht der Pfad) · `{version}` (Export-Zähler).

**Default `{title}`** — bitidentisch zum heutigen Verhalten. Für Bestandsnutzer ändert sich nichts.

**Semantik `{version}` (zweigeteilt):**
- **Ohne `{version}` im Schema:** ein Durchlauf, gleichnamige Datei wird überschrieben. Heutiges
  Verhalten, unangetastet.
- **Mit `{version}`:** `output.ts` zählt hoch (1, 2, 3 …), bis der Pfad frei ist. Nie ein
  Überschreiben.

`hasVersionPlaceholder` ist **load-bearing und deshalb eine eigene, getestete Funktion**: Ohne die
Prüfung baut die Suchschleife bei einem Schema ohne `{version}` denselben Namen endlos neu — eine
Endlosschleife. Der Guard ist kein Nebeneffekt einer anderen Funktion.

**Robustheit** (übernommen von yijing-oracle):
- Unbekannte Platzhalter bleiben **literal** stehen (`{foo}` → `{foo}`), statt zu verschwinden — der
  Tippfehler wird im Dateinamen sichtbar, statt still zu wirken.
- Sanitizing über `/[\\/:*?"<>|#^[\]]/g` — OS-illegale **und** Obsidian-spezifische Zeichen (`#^[]`).
  Strenger als Paperize' heutiges `/[\\/:*?"<>|]/g`. Whitespace wird kollabiert.
- Leeres/vollständig weg-sanitisiertes Schema fällt auf `{title}` zurück, damit nie ein leerer Name
  entsteht.

**Modus-Wechselwirkungen** (dokumentiert in der Setting-Beschreibung):
- **Anhang-Ordner:** Obsidians `getAvailablePathForAttachment` löst Kollisionen bereits selbst auf.
  Zwei Zähler übereinander ergäben `Bericht v1 1.pdf`. **Obsidian gewinnt, `{version}` bleibt
  wirkungslos.**
- **Teilen:** `.paperize-export/` wird vor jedem Export geleert (`output.ts:46-61`) — `{version}`
  ist dort immer 1.

## Fehlerbehandlung

Heute werden ungültige Zahlen-Eingaben (`baseSizePt`, `marginMm`, `headingKeepWithLines`) **still
verworfen**: Der Wert wird nicht gespeichert, das Feld behält den ungültigen Text, es gibt kein
Feedback. Das bleibt in diesem Zyklus **unverändert** — es ist ein realer Mangel, aber ein eigener
Scope (er beträfe alle Zahlenfelder und braucht ein Feedback-Muster, das UI-STANDARD noch nicht
kennt). Hier notiert, damit er nicht verloren geht.

Das Dateiname-Schema selbst kann nicht „ungültig" sein: Unbekannte Platzhalter bleiben sichtbar,
Leereingabe fällt auf den Default zurück.

## Testing

Alles Neue ist pure und in Node testbar (`environment: 'node'`, vitest 1.6.1, aktuell 50 Tests grün).

- `tests/core/filename.test.ts` **(neu)** — jeder Platzhalter einzeln · Kombinationen · unbekannter
  Platzhalter bleibt literal · Sanitizing inkl. Obsidian-Sonderzeichen · leeres Schema → Fallback ·
  `hasVersionPlaceholder` true/false (der Endlosschleifen-Guard).
- `tests/obsidian/output.test.ts` **(erweitert)** — Schema ohne `{version}` überschreibt (ein
  `exists`-Aufruf, kein Hochzählen) · Schema mit `{version}` zählt bis zum freien Pfad · Anhang-Modus
  ignoriert `{version}`.
- `tests/obsidian/settings.test.ts` **(erweitert)** — fünf Sektionen werden gerendert · `output` ist
  offen, die übrigen zu · persistierter Zustand schlägt den Default · die drei neuen Kontrollen
  existieren.
- `tests/obsidian/i18n.test.ts` — läuft unverändert und erzwingt EN/DE-Key-Gleichheit.

Gate vor jedem Commit: `npm run gate` (typecheck + test + check:pure + build).

## Folge-Notizen (kein Blocker)

- **UI-STANDARD §5 vs. REGISTRY:** §5 schreibt `setHeading()` vor und kennt `collapsibleSection`
  nicht (nur `REGISTRY.md:76`). Dieser Zyklus folgt vault-rags registriertem Weg. **Vorschlag:** §5
  danach nachziehen, damit der Standard die gelebte Praxis abbildet.
- **REGISTRY:** `filename.ts` von „Muster-Referenz" auf **Kit-Kandidat** heben (n=2).
- **`openAfter` ist toter Code:** `output.ts:66` wertet es aus, `main.ts:107` setzt es hart auf
  `false`. Kein Setting dahinter. Nicht Teil dieses Zyklus.
