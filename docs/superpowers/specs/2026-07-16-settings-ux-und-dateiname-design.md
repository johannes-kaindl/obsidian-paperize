# Spec — Settings-UX + Dateiname-Schema (Paperize)

**Datum:** 2026-07-16 · **Status:** validiert, freigegeben · **Zyklus:** brainstorm → spec → plan → SDD

> **Herkunft:** Eine parallele Session schrieb am selben Tag einen Spec zum selben Thema
> (`1bc7253`, reverted in `4c448ff`). Drei seiner Entscheidungen sind hier übernommen, weil sie
> besser sind als die ursprünglich geplanten: die Vendor-Schichtung (§ Kit-first), die Slider
> statt stiller Validierung (§ Fehlerbehandlung) und die bedingte Ordner-Zeile (§ Sektions-Schnitt).
> Der Rest folgt diesem Spec — insbesondere die offene Ausgabe-Sektion, die der andere Spec
> mangels Kenntnis von Jays Auffindbarkeits-Befund zugeklappt lassen wollte.

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

**Der Vendor bekommt eine Schicht.** Bislang galt in Paperize implizit „`src/vendor/kit/` == pure",
maschinell erzwungen durch `check:pure` (`grep` über `src/core src/vendor`). `collapsible.ts`
importiert `setIcon` — die Annahme trägt nicht mehr, seit das Kit selbst zwei Schichten hat.

**Entscheidung:** Der Vendor **spiegelt die Kit-Struktur**. Obsidian-gekoppelte Kit-Module liegen
unter `src/vendor/kit/obsidian/`, alles übrige im Vendor bleibt pure. `check:pure` wird dadurch
**geschärft statt aufgeweicht**:

```
! grep -rl "from 'obsidian'" src/core src/vendor --exclude-dir=obsidian
```

Das ist einer dateispezifischen Ausnahme (`--exclude=collapsible.ts`) vorzuziehen: Die Grenze wird
strukturell benannt statt pro Datei nachgepflegt, und jedes künftige gekoppelte Kit-Modul fällt
ohne Skript-Änderung an die richtige Stelle. vault-rag legt `collapsible.ts` flach in
`src/vendor/kit/` und hat kein `check:pure` — dort gibt es kein Muster zu übernehmen; Paperize ist
hier strenger und bleibt es.

## Architektur

Genau **eine** neue pure Datei; der Rest sind Änderungen an Bestehendem. Der `check:pure`-Gate bleibt
gewahrt: Der Resolver rechnet nur, jeder Vault-Zugriff lebt in `src/obsidian/`.

| Datei | Änderung |
|---|---|
| `src/core/filename.ts` | **neu, pure** — `buildFilename` · `sanitizeFilename` · `hasVersionPlaceholder` |
| `src/obsidian/output.ts` | Versions-Schleife statt festem `basename` |
| `src/obsidian/settings.ts` | fünf Sektionen statt flacher Kette; `SECTIONS` · `createCollapsibleStorage`; drei neue Kontrollen |
| `src/obsidian/main.ts` | `mergeSettings` statt `Object.assign` (Z. 50 **und** Z. 36); Template-Variablen bauen |
| `src/vendor/kit/obsidian/collapsible.ts` | **neu vendored** aus Kit 0.14.0 (obsidian-gekoppelt, eigene Schicht) |
| `src/vendor/kit/settings.ts` | **neu vendored** (`mergeSettings`, pure) |
| `package.json` · `AGENTS.md` | `check:pure` auf die Vendor-Schichtung geschärft |
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
über `createCollapsibleStorage(plugin)` — eine **benannte, exportierte** Funktion statt einer Closure
in `display()`, damit die Persistenz-Bridge ohne DOM testbar ist.

**Warum „Ausgabe" offen ist:** vault-rag lässt genau die Sektion offen, ohne die das Plugin nicht
einzurichten ist (Endpunkt). Paperize hat keine solche Pflichtkonfiguration — es exportiert mit den
Defaults sofort. Das spräche für „alle zu" (so der parallele Spec). Der Ausschlag gibt der
empirische Befund: Jay hat das Ausgabeziel **gesucht und nicht gefunden**. Eine Sektion, die den
dokumentierten Fehlgriff des einzigen bekannten Nutzers enthält, ist der Kandidat für „muss man
sehen". Danach gewinnt ohnehin der persistierte Zustand.

**Bedingte Ordner-Zeile:** `customFolder` rendert nur bei `outputMode === 'customFolder'`; das
Dropdown ruft nach `save()` ein `this.display()`. Dadurch entfällt der i18n-Key
`settings.customFolder.desc` („Nur bei ‚Eigener Ordner'") in **beiden** Sprachen — die UI sagt es
selbst, statt es zu erklären.

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

## Fehlerbehandlung — die Anzeige lügt heute

`baseSizePt`, `marginMm` und `headingKeepWithLines` sind Textfelder mit einem `if`-Guard im
`onChange`. Eine Eingabe außerhalb der Grenzen trifft die Bedingung nicht: Es wird **nichts
gespeichert und nichts gesagt**. Das Feld zeigt weiter den getippten Wert, gespeichert ist der alte
— die Anzeige behauptet einen Zustand, den es nicht gibt.

**Fix (aus dem parallelen Spec übernommen): `addSlider().setLimits(min, max, step).setDynamicTooltip()`.**
Damit wird eine ungültige Eingabe **strukturell unmöglich**, statt still verworfen zu werden, und die
Grenzen sind sichtbar, statt sich erst zu zeigen, wenn man dagegenläuft. Das ist die
Obsidian-Best-Practice für begrenzte numerische Werte und der Grund, warum es hierher gehört: Wer
`display()` ohnehin umbaut, lässt die lügende Anzeige nicht stehen.

| Setting | Limits | Schritt |
|---|---|---|
| `baseSizePt` | 6–24 | 0.5 |
| `marginMm` | 12–50 | 1 |
| `headingKeepWithLines` | 0–10 | 1 |
| `lineHeight` (neu) | 1.0–2.0 | 0.05 |
| `imageMaxWidthPct` (neu) | 25–100 | 5 |

Die 12-mm-Untergrenze bleibt inhaltlich, wie sie ist (unter ~11 mm fällt die Footer-Zeichnung von der
Seite); der saubere Fix wäre ein Clamp stromaufwärts im Kit und ist ein eigenes Vorhaben.

Das Dateiname-Schema kann nicht „ungültig" sein: Unbekannte Platzhalter bleiben sichtbar,
Leereingabe fällt auf den Default zurück.

## Testing

Alles Neue ist pure und in Node testbar (`environment: 'node'`, vitest 1.6.1, aktuell 50 Tests grün).

- `tests/core/filename.test.ts` **(neu)** — jeder Platzhalter einzeln · Kombinationen · unbekannter
  Platzhalter bleibt literal · Sanitizing inkl. Obsidian-Sonderzeichen · leeres Schema → Fallback ·
  `hasVersionPlaceholder` true/false (der Endlosschleifen-Guard).
- `tests/obsidian/output.test.ts` **(erweitert)** — Schema ohne `{version}` überschreibt (ein
  `exists`-Aufruf, kein Hochzählen) · Schema mit `{version}` zählt bis zum freien Pfad · Anhang-Modus
  ignoriert `{version}`.
- `tests/obsidian/settings.test.ts` **(erweitert)** — die pure `SECTIONS`-Tabelle (fünf Sektionen in
  Render-Reihenfolge · nur `output` offen · Keys eindeutig · jeder Titel in EN **und** DE) ·
  `createCollapsibleStorage` (schreibt in `uiCollapsed`, ruft `saveSettings`, liefert `undefined` für
  unbekannte Keys, damit `defaultCollapsed` greift) · `mergeSettings`-Verdrahtung als
  **Regressionstest** für den Referenz-Bug (ein Zuklappen darf `DEFAULT_SETTINGS` nicht mutieren).
- `tests/obsidian/i18n.test.ts` — läuft unverändert und erzwingt EN/DE-Key-Gleichheit; deckt den
  Wegfall von `settings.customFolder.desc` automatisch mit ab.

**Bewusste Test-Grenze:** `display()` selbst wird nicht unit-getestet. Der Obsidian-Mock des Repos
ist minimal (`Setting` ist eine leere Klasse), und `settings.test.ts` testet auch heute nur
`settingsToOptions`. Den 676-Zeilen-Mock aus `obsidian-kit/testing` zu vendoren wäre ein eigener
Zyklus. Getestet ist deshalb, was Bugs birgt und pure ist — Tabelle, Storage-Bridge, Resolver,
Versions-Schleife; die DOM-Verdrahtung geht in die Geräte-Abnahme. Kit-Interna
(`collapsibleSection`, `resolveCollapsed`) werden nicht nachgetestet, sie sind Kit-seitig abgedeckt.

Gate vor jedem Commit: `npm run gate` (typecheck + test + check:pure + build).

## Folge-Notizen (kein Blocker)

- **UI-STANDARD §5 vs. `collapsibleSection`:** §5 verlangt Sektionen über
  `new Setting(el).setName(…).setHeading()`; `collapsibleSection` baut einen eigenen Header
  (`<div role="button">` + Titel-Span, „im setHeading-Look" laut Kit-Doc) — er **muss** klickbar
  sein, was `setHeading()` nicht leistet. Das ist keine Regelverletzung: §5 adressiert *manuell
  gebaute Heading-Elemente* (`<h3>` per Hand), nicht einen interaktiven Aufklapp-Schalter. Der
  Kit-Header ist a11y-annotiert und trägt vault-rag produktiv; der Standard (2026-07-05) ist
  schlicht älter als das Kit-Modul und kennt den Fall nicht. **Vorschlag:** §5 sollte den
  einklappbaren Sektions-Header als zulässige Form neben `setHeading()` benennen.
- **CSS-Drift (aus dem parallelen Spec):** Das Kit exportiert `COLLAPSIBLE_CSS` als String,
  injiziert aber bewusst kein CSS — der Consumer kopiert. vault-rag hat den Snippet handkopiert
  **ohne jeden Verweis** auf die Kit-Konstante (`vault-rag/styles.css:198ff`); die Konstante driftet
  damit still von jeder `styles.css`, die sie kopiert hat, und niemand merkt es. Strukturell
  derselbe Befund wie die offene kuro-Lektion („Artefakt ohne Build-Feedback driftet unbemerkt").
  **Hier nur markiert:** Kommentar in `styles.css` mit Kit-Version + Herkunft, damit ein Re-Vendor
  den Menschen erinnert. Die eigentliche Lösung (`sync-kit.sh` schreibt den Block zwischen Marker)
  betrifft das Kit und zwei Consumer — eigenes Vorhaben.
- **Release-Einordnung:** Der parallele Spec veranschlagte 0.2.1 (reine UI-Ergonomie plus ein
  latenter Bug). Mit dem Dateiname-Schema kommt echtes neues Verhalten hinzu → **0.3.0**.
- **REGISTRY:** `filename.ts` von „Muster-Referenz" auf **Kit-Kandidat** heben (n=2).
- **`openAfter` ist toter Code:** `output.ts:66` wertet es aus, `main.ts:107` setzt es hart auf
  `false`. Kein Setting dahinter. Nicht Teil dieses Zyklus.
