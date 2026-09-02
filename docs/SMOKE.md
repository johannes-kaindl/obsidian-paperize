# GUI-Smoke — Abnahme gegen ein laufendes Obsidian

Erfüllt CORE-TEST-02 (b): das **getrackte** Werkzeug, das die mechanisch entscheidbaren
Abnahmepunkte gegen ein echtes Obsidian fährt statt gegen den Mock.

```bash
npm run build
npm run smoke:gui -- --setup          # Staging-Vault aus fixtures/vault/ bauen
npm run smoke:gui                     # Lauf gegen Port 9222, Vault obsidian-paperize
npm run smoke:gui -- --port 9333      # gegen eine Zweitinstanz
npm run smoke:gui -- --keep           # erzeugte PDFs stehen lassen (Ansehen)
```

## Warum das PDF der Prüfgegenstand ist, nicht das DOM

Paperize' teuerste Defekte lagen alle in der Naht zwischen Obsidian und der puren Engine:
**das Export-DOM ist nicht das Preview-DOM.** `MarkdownRenderer.render` in einen detached
Container führt nicht alles aus, was die Live-Ansicht zeigt — ein am Preview-Markup
geschriebener Test war am 2026-08-04 grün, während das PDF `[Grafik]` zeigte.

Der Treiber misst deshalb **die Datei, die im Vault landet**. Das ist zugleich der einzige
Ort, an dem sich Degradation von Verlust unterscheiden lässt: ein PDF ohne die Formel und
ohne Zähler sieht von innen genauso aus wie eines, in dem nie eine war.

Gelesen wird ohne PDF-Bibliothek: die Engine schreibt ihre Content-Streams unkomprimiert
und jeden Textlauf als `(...) Tj` (`writer.ts:29`), escaped werden nur `(`, `)` und `\`
(`encoding.ts::pdfTextBytes`). Das Fixture trägt dafür `MARK…`-Marker an jedem
Markdown-Element — sie machen mechanisch entscheidbar, was den Weg durch `dom-to-ir`
überstanden hat.

## Voraussetzung

⚠️ **Der Debug-Port ist geteilte Infrastruktur.** Vor jedem Lauf prüfen, wer sonst an
Obsidian hängt — ein `quit` zerstört fremde Messreihen, und der eigene Lauf ist danach
sauber grün:

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
curl -s http://127.0.0.1:9222/json/list | grep -o '"title":"[^"]*"'
python3 ~/.claude/hooks/obsidian-cdp-lock.py status
```

Hält eine fremde Session den Lock, ist die **Zweitinstanz** der richtige Ort statt einer
Nachfrage — die Sperre hängt am Profil, nicht am Rechner:

```bash
UD=/tmp/obs-paperize; mkdir -p "$UD"
python3 -c 'import json,time;json.dump({"vaults":{"paperize0001":{"path":"'"$STAGING_VAULTS_DIR"'/obsidian-paperize","ts":int(time.time()*1000),"open":True}}},open("'"$UD"'/obsidian.json","w"))'
/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9333 &
npm run smoke:gui -- --port 9333
```

ⓘ **Ein frisches Profil startet mit der gebündelten Obsidian-Version** (hier 1.12.4),
während das reguläre sich intern aktualisiert hat (1.13.7). Das ist kein Nachteil, sondern
**die Wahl der Prüflage — und man kann sie umschalten.** Die aktualisierte Version liegt im
regulären Profil als `.asar`; ein `cp` ins Testprofil genügt, ein `rm` schaltet zurück:

```bash
cp ~/Library/Application\ Support/obsidian/obsidian-1.13.7.asar /tmp/obs-paperize/   # → 1.13.7
rm /tmp/obs-paperize/obsidian-*.asar                                                  # → gebündelte Version
```

Für Paperize ist das kein Detail, sondern der einzige Weg, **beide** Settings-Pfade zu
messen: unter 1.12.4 zeichnet der Fallback fünf einklappbare Sektionen, ab 1.13 rendert
der Host aus `getSettingDefinitions()` nativ (fünf `.setting-item-heading`, **kein**
Collapse-Verhalten — so in `settings.ts` als bewusst akzeptiert vermerkt) und legt die
Einstellungen in ein eigenes Dokument, das `notices()` und die F4-Messung über
`activeDocument` mitlesen.

## Was er prüft (29 Punkte, gegen 1.12.4 und 1.13.7 belegt)

| Abschnitt | Inhalt |
|---|---|
| **A** Grundlage | Plugin geladen, Export-Befehl registriert, Ribbon-Knopf da |
| **B** Grundfall | PDF entsteht neben der Notiz · ist ein PDF · Notice nennt den Pfad · **Vektor-Text in Core-14-Schriften, kein `/FontFile`** |
| **C** DOM→IR | Überschriften/Auszeichnung · Listen + Blockzitat · Tabelle · **Codeblöcke ohne Platzhalter im Fließtext** · **Task-Kästchen** · Bild als `/DCTDecode` · WinAnsi-Kodierung (Latin-1, ASCII-Ersatz, Unmappbares weggelassen) · Linktext |
| **D** Degradation | Export läuft durch · **Nichtunterstütztes wird GEZÄHLT** · Text drumherum bleibt · Callout bleibt · leere Notiz meldet statt leerem PDF |
| **E** Dateiname | `{version}` zählt hoch · ohne `{version}` wird überschrieben · eigener Ordner wird angelegt · verbotene Zeichen werden bereinigt (kein Phantom-Ordner) |
| **F** Settings | `getSettingDefinitions()` liefert 5 Sektionen · 18 Einträge (= Settings-Suche) · 5 Slider statt Textfelder · Fallback zeichnet dieselben Sektionen · **beide Pfade zeigen gleich viele Zeilen** |

**Nicht mechanisch geprüft und deshalb im Protokoll ausdrücklich genannt:** wie das PDF
*aussieht* — Umbruchästhetik, Waisen-/Witwenwirkung, Grauwert, Bildqualität nach der
JPEG-Re-Kodierung. Dafür bleibt der Blick ins Dokument (`--keep`).

## Durchläufe

### 2026-09-02 · Obsidian 1.12.4 (Zweitinstanz, Port 9333) · 29/29 grün

Erster Lauf des Treibers. Vault: `$STAGING_VAULTS_DIR/obsidian-paperize` aus dem
getrackten Fixture; Herkunft des Builds per `requireEigenerBuild` gegen den frisch
gebauten Repo-Stand belegt (nicht gegen `manifest.version` — die ist blind, weil
Store- und Repo-Build dieselbe Nummer tragen).

**Gegenprobe: vier historische Defekte zurückgebaut, jedes Mal fiel genau der erwartete
Punkt — und kein zweiter.**

| Rückbau | erwartet | gemessen |
|---|---|---|
| `taskMarker` liefert immer `null` (Vorzustand vor 2026-08-04) | C5 | **C5 rot**, 28/29 |
| `graphicPlaceholder` prüft nur `textContent` (Mathe-Fund 2026-08-04) | D2 | **D2 rot**, 28/29 — PDF entsteht, Notice schweigt |
| `resolvePlaceholder` liefert `null` (Codeblock-Fund 0.3.2) | C4 | **C4 rot**, „PAPERIZECODE-Platzhalter steht als Text im PDF" |
| `hasVersionPlaceholder` liefert `false` | E1 | **E1 rot**, „v1 da · v2 fehlt" |

Zwei Funde, die erst die Gegenprobe sichtbar gemacht hat:

1. **Ein still fehlgeschlagener Deploy macht jede Gegenprobe wertlos** — und
   `requireEigenerBuild` fängt das *nicht*. Die ersten beiden Rückbau-Versuche brachen im
   `tsc`-Schritt ab, `main.js` blieb der alte Stand, und der Guard war zufrieden, weil er
   Vault und Repo **gleich** vorfand: er prüft Gleichheit, nicht Aktualität. Der Smoke war
   grün, die Dateigröße byte-identisch, und beides sah wie ein Beleg aus. Seitdem gilt für
   jede Gegenprobe: den sha1 von `main.js` **vor und nach** dem Deploy vergleichen und bei
   Gleichstand abbrechen.
2. **Ein Werkzeug, dessen Fehlschlag die falsche Ursache nennt, blockiert die Fehlersuche.**
   F4 meldete zunächst „Settings-Tab nicht erreichbar (eigenes Fenster ab 1.13)" — die
   Begründung war unter 1.12.4 nachweislich falsch, das Modal stand im Hauptfenster. Der
   Selektor traf nur die Kit-Klasse nicht (`okit-collapsible`, nicht `kit-collapsible`).
   Die Messung trennt jetzt drei Ausgänge: kein Container (nicht messbar), Container ohne
   Sektionen (Befund), Sektionen da (grün).

### 2026-09-02 · Obsidian 1.13.7 (dieselbe Zweitinstanz, `.asar` kopiert) · 29/29 grün

Gefahren, um den **nativen** Settings-Pfad zu messen, den 1.12.4 nicht zeigt — ohne die
reguläre Instanz anzufassen (deren CDP-Lock hielten den ganzen Nachmittag fremde
Sessions). Der erste Lauf meldete **F4 rot**, und das war der Prüfpunkt, nicht das Plugin:

> **Ein Prüfpunkt, der nur einen richtigen Ausgang kennt, ist dauerhaft rot bei intaktem
> Code.** F4 verlangte fünf `.okit-collapsible`. Gemessen unter 1.13.7: **0 Collapsibles,
> 5 native `.setting-item-heading`, 23 `.setting-item`** und ein Markup aus
> `setting-group` + `setting-group-search` — der Host zeichnet selbst, und dass es dabei
> **kein** Collapse-Verhalten gibt, steht in `settings.ts` seit 0.3.3 als bewusst
> akzeptierter Unterschied. Der Punkt formuliert jetzt die **Menge** der zulässigen
> Ergebnisse: fünf Sektionen auf *einem* der beiden Pfade, und er nennt Version und
> benutzten Pfad im Protokoll. Falsch ist allein das stumme Dritte — **keine** Gliederung,
> und genau das war der Ausgangsdefekt von 0.3.0 (17 Einstellungen ohne einen einzigen
> Abschnitts-Header, in der das längst vorhandene „Ausgabeziel" unauffindbar war).

Zweite Korrektur aus demselben Lauf: F5 zählte `.setting-item` **inklusive** der
Gruppen-Überschriften, die der native Renderer selbst als solche führt — 23 statt 18, der
Vergleich mit der Definitionszahl ging um genau die fünf Gruppen daneben und war nur
deshalb grün, weil er `>=` prüfte. Jetzt `:not(.setting-item-heading)` und `===`.

Gegenprobe der Umformulierung, zurück auf 1.12.4 (`.asar` entfernt): **29/29**, F4 meldet
dort „Fallback (einklappbar) · 5 einklappbar / 0 native Header". Beide Pfade sind damit an
ihrer jeweiligen Version belegt, nicht bloß behauptet.
