---
paths:
  - "src/obsidian/export-desktop.ts"
  - "src/core/desktop-print.ts"
  - "scripts/print-matrix.ts"
---

# Desktop-Druckweg — Fallen, die die Messung gezeigt hat

Aufbau: `docs/internal/architecture.md`, Warum: `docs/internal/decisions.md`, Messpunkte und Gegenproben: `docs/SMOKE.md`. Die Messung gehört in eine Zweitinstanz mit Lock; Bilder und Kontraste sieht die Session selbst an.

- **Ein leeres PDF entsteht ohne Fehler, und die Größe trennt es nicht von einem gesunden.** Gründe: `body > :not(.print) { display: none }` aus Obsidians Druck-CSS, danach `contain` am `body`. Kaputte PDFs maßen 786 bis 6495 Bytes, gesunde 5780 bis 7603. Der Kit-Fühler `PRINT_CONTENT_PROBE` (obsidian-kit 0.81.1) zählt sichtbaren Text und sichtbare Medien vor dem Druck; Text mit transparenter Farbe erkennt er nicht (Task im Kit-Cockpit).
- **Obsidians Druck-CSS muss raus, und die Rücksetzung muss dasselbe leisten.** Es setzt `.print { --code-background: #eeeeee !important }`, im dunklen Theme wird Inline-Code unlesbar. `obsidianPrintResetCss()` setzt `contain: initial`, `height`, `overflow`, `position`, `width`, `padding-top`; ohne `contain: initial` bleibt das PDF leer (Gegenprobe im Smoke).
- **`@page` kennt keine CSS-Variablen.** Seitenhintergrund und Seitenzahl-Farbe werden aus einem Probe-Element ausgelesen und ausgeschrieben; ist der Hintergrund leer oder durchsichtig, bleibt der Seitenrand weiß.
- **Ein Ergebnis mit Field Report belegt kein anderes Theme.** Das Theme färbt Mermaid selbst um; die Matrix fährt deshalb auch Obsidian-Standard.
- **Thema und Modus vor dem Start in `appearance.json` setzen und am `body` gegenlesen.** `app.setTheme` schaltete in der Machbarkeitsmessung nicht um, der Arm hieß hell und war dunkel.
- **M11 (verdecktes Fenster) braucht die Kontrolle `visibilityState` `hidden`.** Die Fokus-Emulation der Brücke (`requireVisible`) hält das Fenster für Chromium sichtbar, auch wenn der Prozess per System Events versteckt ist; vor dem Verstecken `releaseFokusEmulation` rufen, sonst ist der Arm „nichts gemessen“.
- **Eine Gegenprobe, deren Build scheitert, lässt `main.js` unverändert.** sha1 vor und nach dem Rückbau vergleichen und bei Gleichstand abbrechen (`.claude/rules/gui-smoke-gegenprobe.md`); eine Mutation muss typprüfen.
- **Der GUI-Smoke liest `(…) Tj` im Klartext und kann Chromium-PDFs nicht lesen.** Er schaltet den Druck ab (`plugin.desktopPrint = null`), die Druck-Matrix liest mit Poppler.
- **Store-Lint:** `activeDocument`/`activeWindow`, kein `innerHTML`-Schreiben, keine Inline-Styles (Klasse oder `setCssProps`), kein CSS-Selektor `webview`, kein `require()`.
