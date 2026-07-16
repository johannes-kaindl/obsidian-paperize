# Paperize — Settings-UI: einklappbare Sektionen + Best-Practice-Sweep

**Datum:** 2026-07-16 · **Status:** akzeptiert · **Repo:** `obsidian-plugins/obsidian-paperize`

## Problem

Paperizes Settings-Tab rendert 16 Zeilen flach untereinander — ohne Gliederung, ohne
Gruppierung. Das Tab ist damit eine ununterbrochene Liste, in der Typografie-, Inhalts-,
Ausgabe- und Umbruch-Einstellungen visuell gleichrangig nebeneinanderstehen. `vault-rag`
löst das seit Längerem mit einklappbaren Sektionen; das Muster soll auf Paperize übertragen
werden.

Der Sweep entlang der Obsidian-Settings-Guidelines fand dabei zwei Befunde, die über
Kosmetik hinausgehen (unten §3 und §4).

## Nicht-Ziele

- Keine neuen Settings. `lineHeight` und `imageMaxWidthPct` existieren im Interface, haben
  aber keine UI-Zeile — bewusst außerhalb dieses Specs (wäre echtes Feature-Verhalten).
- Kein Umbau der PDF-Engine. Die 12mm-Ränder-Untergrenze bleibt ein plugin-seitiges
  Geländer; der saubere Fix (Clamp stromaufwärts im Kit) bleibt ein eigenes Vorhaben.
- Kein Kit-Neubau. Alles Geteilte existiert bereits im Kit.

## §1 Vendoring — nichts Neues bauen

`obsidian-kit@0.14.0` liefert beide benötigten Module fertig:

| Kit-Quelle | Ziel in Paperize | Charakter |
|---|---|---|
| `src/obsidian/collapsible.ts` | `src/vendor/kit/obsidian/collapsible.ts` | obsidian-gekoppelt (`setIcon`) |
| `src/pure/settings.ts` | `src/vendor/kit/settings.ts` | pur |

`collapsibleSection()` bringt Header, Chevron, Persistenz-Bridge und a11y (`role="button"`,
`aria-expanded`, Enter/Space) mit. `vault-rag` vendored davon 0.13.0; 0.14.0 ist inhaltlich
identisch. `tools/sync-kit.sh` bekommt für beide je einen Block nach dem etablierten
i18n-Muster (kopieren, „do-not-hand-edit"-Header prependen).

### Die Vendor-Struktur bekommt eine Schicht

Bisher galt in Paperize implizit „`src/vendor/kit/` == pur", erzwungen durch
`npm run check:pure` (`grep` gegen `from 'obsidian'` über `src/core src/vendor`).
`collapsible.ts` importiert `setIcon` — die Annahme trägt nicht mehr, seit das Kit einen
eigenen `src/obsidian/`-Layer hat.

**Entscheidung:** Der Vendor spiegelt die Kit-Struktur. Obsidian-gekoppelte Kit-Module
liegen unter `src/vendor/kit/obsidian/`, alles andere im Vendor bleibt pur. `check:pure`
wird entsprechend geschärft statt aufgeweicht:

```
! grep -rl "from 'obsidian'" src/core src/vendor --exclude-dir=obsidian
```

Damit bleibt die Regel prüfbar und benennt die Grenze explizit: `src/core` komplett pur,
`src/vendor` pur **außer** dem Ordner, der per Konstruktion koppelt. `vault-rag` hat kein
`check:pure` und legt `collapsible.ts` flach in `src/vendor/kit/` — dort gibt es also kein
Muster zu übernehmen; Paperize ist an dieser Stelle strenger und bleibt es.

## §2 Settings-Modell

`uiCollapsed: Record<string, boolean>` (Default `{}`) in `PaperizeSettings`. Keys:
`layout` · `content` · `output` · `pagination`.

Die `CollapsibleStorage`-Bridge liest/schreibt darin und ruft `saveSettings()` — wörtlich
vault-rags Muster (`vault-rag/src/settings.ts:199-206`). Sie wird als benannte Funktion
`createCollapsibleStorage(plugin)` exportiert, damit sie ohne DOM testbar ist.

## §3 `mergeSettings` — ein latenter Referenz-Bug wird scharf

`main.ts:50` merged mit `Object.assign({}, DEFAULT_SETTINGS, data ?? {})`, `main.ts:36`
initialisiert mit `{ ...DEFAULT_SETTINGS }`. Beides ist ein flacher Merge.

Solange **alle** Settings Primitive sind, ist das harmlos. Mit `uiCollapsed: {}` kommt der
erste Objekt-Default hinzu: existiert kein gespeicherter Wert, teilt `settings.uiCollapsed`
die Referenz mit `DEFAULT_SETTINGS.uiCollapsed` — das erste Zuklappen einer Sektion mutiert
dann die Defaults des Moduls.

Das Feature zieht den Fix also nicht aus Gründlichkeit herbei, es braucht ihn. `mergeSettings`
löst genau das (Ein-Ebenen-Klon der Default-Werte) und ist der Grund, warum es im Kit liegt.
**UI-STANDARD §5 verlangt es ohnehin verbindlich** („Persistenz über `mergeSettings` — nie
roher `Object.assign`/Spread-Merge"); Paperize war bislang ein ungelisteter
Migrationskandidat. Beide Stellen in `main.ts` stellen um.

## §4 Stille Validierung → Slider

`Schriftgröße`, `Ränder` und `Waisenschutz` sind Textfelder mit einem `if`-Guard im
`onChange`. Eine Eingabe außerhalb der Grenzen trifft die Bedingung nicht: es wird **nichts
gespeichert und nichts gesagt**. Das Feld zeigt weiter den getippten Wert, gespeichert ist
der alte. Die Anzeige lügt.

**Fix:** `addSlider().setLimits(min, max, step).setDynamicTooltip()` — die
Obsidian-Best-Practice für begrenzte numerische Werte. Eine ungültige Eingabe wird dadurch
strukturell unmöglich statt still verworfen, und die Grenzen werden sichtbar, statt sich erst
zu zeigen, wenn man dagegenläuft.

| Setting | Limits | Schritt |
|---|---|---|
| `baseSizePt` | 6–24 | 0.5 |
| `marginMm` | 12–50 | 1 |
| `headingKeepWithLines` | 0–10 | 1 |

## §5 `display()` — Aufbau

Vier Sektionen, alle eingeklappt (Kit-Default `defaultCollapsed: true`). vault-rag lässt
genau eine Sektion offen — die, ohne die man das Plugin nicht einrichten kann (Endpunkt).
Paperize hat keine solche Pflichtkonfiguration: es exportiert mit den Defaults sofort. Es
gibt also keinen Kandidaten für „muss man sehen".

```
▸ Layout & Typografie   Schrift · Schriftgröße · Seitenformat · Ränder
▸ Inhalt                Metadaten-Block · Titel · Seitenzahlen · Fußzeile
▸ Ausgabe               Ausgabeziel · [Eigener Ordner]
▸ Seitenumbruch         Marker · Tabellen · Kopfzeilen-Wdh. · Bilder · Code · Waisenschutz
```

**Bedingte Zeile:** `customFolder` rendert nur bei `outputMode === 'customFolder'`; das
Dropdown ruft nach `save()` ein `this.display()`. Damit entfällt `settings.customFolder.desc`
(„Nur bei ‚Eigener Ordner'") in beiden Sprachen — die UI sagt es selbst, statt es zu erklären.

**i18n:** vier neue Keys `settings.section.{layout,content,output,pagination}`, ein Key
entfällt. Der bestehende EN/DE-Paritätstest deckt das automatisch ab.

### Bekannte Spannung zu UI-STANDARD §5

§5 verlangt Sektionen über `new Setting(el).setName(...).setHeading()`. `collapsibleSection`
baut stattdessen einen eigenen Header (`<div role="button">` + Titel-Span, „im
setHeading-Look" laut Kit-Doc) — er muss klickbar sein, was `setHeading()` nicht leistet.

Das ist keine Regelverletzung im Sinne von §5: die Regel adressiert *manuell gebaute
Heading-Elemente* (`<h3>` per Hand, Gegenbeispiel `kuro-gamification`), nicht einen
interaktiven Aufklapp-Schalter. Der Kit-Header ist a11y-annotiert und ist geteilte
Dach-Substanz, die `vault-rag` produktiv trägt. Der Standard (2026-07-05) ist schlicht älter
als das Kit-Modul und kennt den Fall nicht.

**Aktion:** nicht hier lösen. Notiert als Punkt für den Dach-Standard — §5 sollte den
einklappbaren Sektions-Header als zulässige Form neben `setHeading()` benennen.

## §6 CSS — kopiert, mit Vorbehalt

`styles.css` ist leer; der Inhalt von `COLLAPSIBLE_CSS` kommt hinein (nur Theme-Variablen,
konform zu UI-STANDARD §3).

**Vorbehalt:** Das Kit exportiert `COLLAPSIBLE_CSS` als String, injiziert aber bewusst kein
CSS — der Consumer kopiert. `vault-rag` hat den Snippet handkopiert, **ohne jeden Verweis**
auf die Kit-Konstante (`vault-rag/styles.css:198ff`). Damit driftet die Konstante still von
jeder `styles.css`, die sie kopiert hat, und niemand merkt es. Strukturell derselbe Befund
wie die offene kuro-Lektion („Artefakt ohne Build-Feedback driftet unbemerkt").

**In diesem Spec nur markiert:** Kommentar in `styles.css` mit Kit-Version + Herkunft, damit
ein Re-Vendor den Menschen erinnert. Die eigentliche Lösung — `sync-kit.sh` schreibt den
CSS-Block zwischen Marker automatisch — betrifft das Kit und zwei Consumer und ist ein
eigenes Vorhaben.

## §7 Tests & Verifikation

- `resolveCollapsed`/`collapsibleSection` sind Kit-Substanz und dort getestet — Paperize
  testet keine Kit-Interna nach.
- **Neu:** `createCollapsibleStorage` — schreibt in `uiCollapsed`, ruft `saveSettings`,
  liefert `undefined` für unbekannte Keys (damit `defaultCollapsed` greift).
- **Neu:** `mergeSettings`-Verdrahtung — ein Zuklappen mutiert `DEFAULT_SETTINGS` nicht
  (der Bug aus §3, als Regressionstest).
- EN/DE-Parität: läuft automatisch mit.
- `npm run gate` (typecheck · test · check:pure · build).
- **GUI-Smoke** (manuell, Pallas-Vault): Auf-/Zuklappen, Persistenz über Tab-Wechsel,
  Slider-Grenzen, bedingte Ordner-Zeile — mit dem bekannten Deploy-Gotcha
  (`OBSIDIAN_PLUGIN_DIR=… npm run deploy` + Plugin neu laden, sonst testet man den Altstand).

## Release-Einordnung

Reine UI-Ergonomie plus ein latenter Referenz-Bug, der nie zugeschlagen hat — kein neues
Feature. Passt als **0.2.1**.
