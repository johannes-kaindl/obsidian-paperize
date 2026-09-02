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
| `settings-output.png` | feature (820) | „Configuration" | Die Sektion **Output** mit geöffnetem Ausgabeziel-Dropdown, sodass alle **vier** Ziele lesbar sind, darunter das Feld **Filename scheme**. Grund für genau diesen Ausschnitt: das Ausgabeziel existierte seit 0.1.0 und war in einer flachen 17-Zeilen-Liste unauffindbar — es war kein fehlendes Feature, sondern ein unsichtbares. |
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

Noch kein Bild aufgenommen. Der Vertrag steht (abgestimmt 2026-09-02), Fixture und
Treiber liegen; die Aufnahme folgt.
