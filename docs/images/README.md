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
| `filename-versions.png` | feature (820) | „Filename scheme" | Den Datei-Explorer mit `Report v1.pdf` **und** `Report v2.pdf` neben der Notiz, dazu das Schema-Feld mit `{title} v{version}`. Ohne das zweite PDF wäre das Bild leer von Aussage: der Punkt ist, dass zweimal exportieren **nicht** überschreibt. |
| `degradation.png` | feature (820) | „Standard Markdown scope & graceful degradation" | Links die Notiz mit Callout und Formel, rechts das PDF mit den Platzhaltern, **und die Notice mit der Anzahl**. Die Notice ist der Kern: nicht dass etwas vereinfacht wird, sondern dass es **gezählt** wird — stiller Verlust wäre der Defekt (gemessen am 2026-08-04, als Formeln spurlos und ungezählt verschwanden). |

## Fixture

`docs/images/fixture/` — getrennt vom Prüf-Fixture des GUI-Smoke (`fixtures/vault/`),
weil beide gegensätzliche Anforderungen haben: dort machen `MARK…`-Marker den PDF-Inhalt
mechanisch entscheidbar, hier soll der Inhalt gut aussehen und etwas erzählen.

- `notes/Report.md` — die Schau-Notiz: Frontmatter, Überschriften, Liste, Blockzitat,
  Tabelle, Bild. Trägt den Namen `Report`, weil die README `Report v1.pdf` als Beispiel
  für `{version}` nennt.
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

**Drei von fünf Motiven stehen** (2026-09-02): `hero.png`, `filename-versions.png`,
`settings-output.png`. Die beiden übrigen sind **nicht misslungen, sondern blockiert** —
und beide Gründe sind wertvoller als das Bild gewesen wäre.

### `degradation.png` — blockiert durch einen Produktbefund

Das Bild war **fertig und richtig**: Callout und Formel links, das PDF rechts, beide
Notices sichtbar („PDF saved" und „PDF created. 1 element(s) were simplified"). Es zeigt
aber im PDF den Platzhalter **`[Formel]` — deutsch, in einer englischen Oberfläche.**

Die Platzhalter sind in der puren Engine hartkodiert
(`obsidian-kit/src/pure/pdf/dom-to-ir.ts:35`, hier gespiegelt in
`src/vendor/kit/pdf/dom-to-ir.ts:36`); die pure Schicht hat kein i18n, und sie kann auch
keins haben — sie ist Obsidian-frei. Der Weg ist, die beiden Texte als Option
durchzureichen, damit der Consumer sie lokalisiert einsetzt. Das gehört **stromaufwärts
ins Kit**, nicht hierher, und betrifft `obsidian-letterhead` mit.

Ein README-Bild, das einen Defekt prominent zeigt, bewirbt ihn. Deshalb liegt das Bild
nicht im Repo, sondern der Befund in der Task-Ablage. **Nach dem Kit-Fix ist es ein
`npm run shots -- --only degradation.png` weit weg** — Fixture und Rezept stehen.

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

Der Ausweg für einen späteren Anlauf ist vermutlich, den Versatz nicht aus `scrollTop` zu
nehmen, sondern aus der **gemessenen Position eines Ankerelements** in jeder Kachel — dann
ist er unabhängig davon, ob und wann der Container tatsächlich gescrollt hat.

Die Aussage „der Tab ist in fünf Sektionen gegliedert" trägt vorerst die Tabelle in der
README, und `settings-output.png` zeigt die wichtigste Sektion.

### Korrigierte Vertragszeile

Der Vertrag versprach für `settings-output.png` ursprünglich das **geöffnete**
Ausgabeziel-Dropdown mit allen vier Zielen. Das ist mit CDP nicht aufnehmbar: Obsidians
Dropdown ist ein natives `<select>`, seine geöffnete Liste ein OS-Menü, das in keinem
Screenshot erscheint. Die Zeile oben sagt das jetzt, statt es zu versprechen.
