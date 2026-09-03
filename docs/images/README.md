# Aufnahme-Vertrag — README-Bilder

Was jedes Bild zeigen **muss**, damit es seinen Platz in der README verdient. Der Vertrag
steht vor der Aufnahme fest; ein Bild, das ihn nicht erfüllt, wird neu aufgenommen oder
fällt mit Begründung heraus — nicht stillschweigend ersetzt.

Erzeugt von `scripts/shots.ts` (`npm run shots`), geprüft von `npm run shots:check` gegen
den workspace-weiten Bild-Standard.

## Bilder

| Datei | Klasse | referenziert von | muss zeigen |
|---|---|---|---|
| `hero.png` | hero (820) | README-Kopf, beide Sprachen | Die Notiz im Lesemodus **links**, das daraus erzeugte PDF im Obsidian-PDF-Viewer **rechts**. Das ist das ganze Versprechen in einem Bild: derselbe Inhalt, einmal als Notiz, einmal als Dokument — kein Druckdialog dazwischen. Beide Seiten müssen **denselben** Text zeigen, sonst behauptet das Bild etwas Falsches. |
| `settings-output.png` | feature (820) | „Configuration" | Die Sektion **Output** im Auslieferungszustand: Ausgabeziel und das Feld **Filename scheme** mit seinem Hilfetext. ⚠️ Das *geöffnete* Dropdown mit allen vier Zielen ist nicht aufnehmbar — Obsidians Dropdown ist ein natives `<select>`, seine Liste ein OS-Menü. Grund für genau diesen Ausschnitt: das Ausgabeziel existierte seit 0.1.0 und war in einer flachen 17-Zeilen-Liste unauffindbar — es war kein fehlendes Feature, sondern ein unsichtbares. |
| `settings-all.png` | detail (380, verlinkt auf Vollauflösung) | „Configuration" | Den gesamten Settings-Tab mit **allen fünf** Sektionsüberschriften in einem Bild. Hoch statt breit, deshalb als klickbare Vorschau mit Bildunterschrift. |
| `filename-versions.png` | feature (820) | „Filename scheme" | Den Datei-Explorer mit `Quarterly Field Report v1.pdf` **und** `… v2.pdf` neben der Notiz, beide als PDF erkennbar. Ohne das zweite PDF wäre das Bild leer von Aussage: der Punkt ist, dass zweimal exportieren **nicht** überschreibt. (Das Schema-Feld steht nicht mit im Bild — es liegt ab 1.13 in einem eigenen Fenster; `settings-output.png` zeigt es.) |
| `degradation.png` | feature (820) | „Standard Markdown scope & graceful degradation" | Links die Notiz mit Callout und Formel, rechts das PDF mit den Platzhaltern, **und die Notice mit der Anzahl**. Die Notice ist der Kern: nicht dass etwas vereinfacht wird, sondern dass es **gezählt** wird — stiller Verlust wäre der Defekt (gemessen am 2026-08-04, als Formeln spurlos und ungezählt verschwanden). |

## Fixture

`docs/images/fixture/` — getrennt vom Prüf-Fixture des GUI-Smoke (`fixtures/vault/`),
weil beide gegensätzliche Anforderungen haben: dort machen `MARK…`-Marker den PDF-Inhalt
mechanisch entscheidbar, hier soll der Inhalt gut aussehen und etwas erzählen.

- `notes/Quarterly Field Report.md` — die Schau-Notiz: Frontmatter, Absatz, Liste,
  Blockzitat, Tabelle, Bild. **Ohne eigene H1**, und das ist Absicht: bis zum 2026-09-02
  druckte Paperize über einer Notiz mit H1 zusätzlich den abgeleiteten Titel, sodass
  dieselben Worte zweimal auf Seite eins standen. Genau das hat die erste Fassung dieses
  Bildes gezeigt — der Befund kam aus dem Ansehen, nicht aus einem Test. Behoben; die
  Notiz bleibt trotzdem ohne H1, weil der Dateiname hier der bessere Titel ist.
- `notes/Release Notes.md` — Callout, Formel, Task-Liste: das Material für `degradation.png`.
- `make-assets.mjs` — erzeugt `assets/chart.png` (Balkendiagramm). Als Generator statt als
  eingecheckte Binärdatei, damit die Zahlen im Bild und die Zahlen in der Tabelle nicht
  still auseinanderlaufen.
- `obsidian/` — Vault-Konfiguration: nur Paperize aktiv (sonst malen fremde Ribbon-Icons
  ins Bild), helles Theme, `showInlineTitle: false` (sonst steht der Titel doppelt).

**Alle Inhalte sind generisch und englisch.** Keine echten Personen, Firmen oder Zahlen —
was in einem Bild lesbar ist, geht mit dem Repo um die Welt. `README.md` ist die
kanonische Fassung, `README.de.md` bettet dieselben Bilder ein.

## Reproduktion

```bash
npm run build
npm run shots -- --setup        # Vault aus diesem Fixture bauen
# Obsidian neu starten, Vault öffnen, Plugin aktivieren
npm run deploy                  # der Treiber nimmt auf, was im Vault liegt — nicht den Arbeitsbaum
npm run shots -- --only hero    # ein Bild pro Obsidian-Start
npm run shots:check
```

⚠️ **`npm run shots` baut und deployt nicht selbst.** Wer den Deploy auslässt, bebildert
den vorigen Stand — und der Lauf meldet dabei Erfolg.

## Status

**Vier von fünf Motiven stehen** (2026-09-02): `hero.png`, `degradation.png`,
`filename-versions.png`, `settings-output.png`. Das fünfte ist **nicht misslungen,
sondern an einer Werkzeuggrenze** — und die Gründe unten sind wertvoller, als die Bilder
es gewesen wären.

### `degradation.png` — erst blockiert, dann erledigt

Das Bild war beim ersten Anlauf **fertig und richtig** — und zeigte im PDF den Platzhalter
`[Formel]`, **deutsch, in einer englischen Oberfläche**. Ein README-Bild, das einen Defekt
prominent zeigt, bewirbt ihn; deshalb blieb es zunächst draußen und der Befund ging
stromaufwärts.

**Behoben am selben Tag:** Kit 0.30.0 reicht die Platzhalter als Option durch
(`domToIrSync(el, { placeholders })`, rein additiv), Paperize setzt sie aus seinem eigenen
i18n (`pdf.placeholder.math` / `.graphic`). Das Bild zeigt jetzt `[Formula]`.

Zwei Dinge, die dabei fast durchgerutscht wären:

1. **Die Aufnahme lief unter deutscher Oberfläche, und der Guard hat es durchgelassen.**
   Er las `localStorage["language"]` — der Schlüssel ist ungesetzt, solange niemand die
   Sprache ausdrücklich wählt, und Obsidian folgt dann der Systemsprache. Ein `|| "en"`
   darüber macht aus „unbekannt" ein „englisch". Im Bild stand „von 1" statt „of 1", und
   `[Formel]` war unter dieser Oberfläche sogar **richtig** — der Fix hätte also als
   wirkungslos gegolten, obwohl er wirkte. Der Guard misst jetzt
   `document.documentElement.lang`.
2. **Backticks in einem Kommentar innerhalb eines Template-Literals** beenden es
   vorzeitig. Kostet einen Syntaxfehler, der auf eine Zeile zeigt, an der nichts falsch
   ist.

### `settings-all.png` — blockiert durch eine Werkzeuggrenze

Der Settings-Tab ist 1754 px hoch, der Bildschirm gibt 949 her. Vier Wege gemessen, keiner
trägt: `withMetrics` (Emulation vergrößert den Viewport, nicht die gezeichnete Fläche),
Zoom auf Faktor 0.48 (verkleinert das Layout, ändert nichts am Compositing-Surface), den
Scroll-Container per DOM aufklappen (obwohl `capture()` `captureBeyondViewport: true`
setzt — der harte Grund ist Electron: die gezeichnete Fläche eines BrowserWindow **ist**
das Fenster), und schließlich Kacheln zu stapeln (`langerAusschnitt`, liegt im Treiber).
Der Stapel liefert ein Bild ohne schwarze Ränder, aber mit **falschen Versätzen** — im
Ergebnis fehlten ganze Einstellungszeilen, während unter „Page" die Zeilen von
„Typography" standen. Ein Bild, das die Oberfläche falsch wiedergibt, ist schlechter als
keines.

**Fünfter Anlauf am 2026-09-03: der Anker-Versatz ist gebaut, hat die vermutete Ursache
aber widerlegt.** `langerAusschnitt` nimmt den Versatz jetzt aus der gemessenen Position
einer `.setting-group` statt aus `scrollTop` — und liefert damit **korrekte** Werte
(0, 670, 1117 px bei 1786 px Inhalt; die dritte Kachel ist sauber gekappt). Das Bild ist
trotzdem falsch zusammengesetzt: unter „Page" stehen weiterhin die Zeilen von
„Typography", ganze Einstellungen fehlen.

Damit ist die Diagnose eine andere geworden: **es liegt nicht am Versatz beim
Zusammensetzen, sondern daran, dass die Aufnahme den gescrollten Zustand des inneren
Containers nicht zeigt.** `Page.captureScreenshot` mit `clip` fotografiert offenbar nicht,
was nach dem Setzen von `container.scrollTop` sichtbar ist. Wer den nächsten Anlauf fährt,
sollte dort ansetzen und nicht wieder am Stapeln — die zwei naheliegenden Proben sind:
eine Kachel einzeln aufnehmen und **ansehen**, ob sie überhaupt den erwarteten Bereich
zeigt, und `Element.scrollIntoView()` statt `scrollTop` versuchen.

Der Anker-Code bleibt im Treiber: er ist nachweislich besser als der `scrollTop`-Versatz
und wird bei der Lösung gebraucht. Nur löst er das Problem nicht allein.

Die Aussage „der Tab ist in fünf Sektionen gegliedert" trägt vorerst die Tabelle in der
README, und `settings-output.png` zeigt die wichtigste Sektion.

### Korrigierte Vertragszeile

Der Vertrag versprach für `settings-output.png` ursprünglich das **geöffnete**
Ausgabeziel-Dropdown mit allen vier Zielen. Das ist mit CDP nicht aufnehmbar: Obsidians
Dropdown ist ein natives `<select>`, seine geöffnete Liste ein OS-Menü, das in keinem
Screenshot erscheint. Die Zeile oben sagt das jetzt, statt es zu versprechen.
