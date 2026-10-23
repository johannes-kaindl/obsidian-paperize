---
paths:
  - "src/obsidian/settings.ts"
  - "src/obsidian/main.ts"
  - "src/vendor/kit/settings.ts"
  - "src/vendor/kit-obsidian/settings_walker.ts"
  - "tests/obsidian/settings.test.ts"
  - "src/obsidian/help-row.ts"
  - "tests/obsidian/help-row.test.ts"
  - "src/vendor/kit-obsidian/help-setting.ts"
  - "scripts/gui-smoke.ts"
---

# Settings-Tab — Gotchas

Der Settings-Tab ist zweigleisig, `getSettingDefinitions()` ist die eine Wahrheit (Aufbau: `docs/internal/architecture.md`). Wer eine Einstellung hinzufügt, ergänzt `groups()`, nie einen der beiden Render-Pfade einzeln.

- **`visible` am Gruppen-Item wertet der native 1.13.7-Renderer nicht aus.** Die Definition lieferte korrekt `false`, die Zeile blieb stehen, auch nach vollem Tab-Neuaufbau. Bedingte Zeilen deshalb **weglassen** statt ausblenden — wirkt in beiden Pfaden, weil `getSettingDefinitions()` bei jedem Rebuild neu ausgewertet wird. Details in `../REGISTRY.md` im Dach.
- **Ein interner `display()`-Aufruf löst die 1.13-Deprecation aus.** Der Rebuild liegt in `renderFallback()`; `display()` bleibt nur als Wrapper stehen, weil der Host < 1.13 genau diese Methode ruft.
- **Die Obsidian-Version nicht aus `Info.plist` lesen** — die App aktualisiert sich intern, ohne sie zu ändern (gemessen 1.12.4, tatsächlich 1.13.7). Zur Laufzeit messen: `require('electron').ipcRenderer.sendSync('version')`. Der falsche Wert führte hier zur Fehlannahme, der native Pfad sei gar nicht prüfbar.
- **`uiCollapsed` erzwingt `mergeSettings`:** Mit dem Sektions-Zustand kam der erste **Objekt-Default** in die Settings. Ein flacher Merge (`Object.assign`/Spread) teilt dessen Referenz mit `DEFAULT_SETTINGS` — das erste Zuklappen mutiert dann die Modul-Defaults. Beide Merge-Stellen in `main.ts` nutzen deshalb das vendored `mergeSettings`; ein Regressionstest hält das fest.
- **Begrenzte Zahlenwerte gehören in einen Slider, nicht in ein Textfeld:** Textfeld + `if`-Guard im `onChange` verwirft eine Eingabe außerhalb der Grenzen **still** — nichts gespeichert, nichts gemeldet, das Feld zeigt weiter den getippten Wert. Die Anzeige lügt. Ein `slider`-Control mit `min`/`max`/`step` macht den ungültigen Wert unmöglich und zeigt die Grenzen. Gilt für `baseSizePt`/`marginMm`/`lineHeight`/`imageMaxWidthPct`/`headingKeepWithLines`. Den Wert zeigt seit 0.3.3 `displayFormat` (er steht dauerhaft im Namen, mit Einheit) statt `setDynamicTooltip()` — das ist ab 1.13 deprecated und im deklarativen Pfad gar nicht vorhanden, wo es den Wert also **nirgends** mehr angezeigt hätte.
- **Testbarkeit:** Der Obsidian-Mock ist minimal (`Setting` ist eine leere Klasse), also sind die *Definitionen* unit-testbar und die Render-Pfade nicht — genau deshalb liegt die Wahrheit in den Daten.
