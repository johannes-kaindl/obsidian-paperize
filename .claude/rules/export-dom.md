---
paths:
  - "src/obsidian/main.ts"
  - "src/vendor/kit/pdf/dom-to-ir.ts"
  - "src/vendor/kit/pdf/image.ts"
  - "src/core/image-source.ts"
---

# Export-DOM und Obsidian-Naht — Gotchas

- **Das Export-DOM ist nicht das Preview-DOM.** `MarkdownRenderer.render` in einen *detached* Container (`createDiv()`) führt nicht alles aus, was die Live-Ansicht zeigt: Ein Callout-Icon bleibt dort ein nacktes `<svg width="16" height="16">` **ohne Klasse und ohne `aria-hidden`**, während dasselbe Callout im Preview `class="svg-icon lucide-alert-triangle"` trägt. Wer DOM-Verhalten für den Export prüft, misst am Export — ein am Preview-Markup geschriebener Test war 2026-08-04 grün, während das PDF `[Grafik]` zeigte. Abgreifen lässt sich das Export-DOM nur per temporärem `console.log` im Renderpfad (+ `obsidian dev:debug on`).
- **`moment()` aus dem Obsidian-Namespace-Re-Export ist unter diesem TS/obsidian-types-Setup „not callable“** — siehe `nowParts()` in `src/obsidian/main.ts` für den lokalen Datums-/Zeit-Formatter als Workaround (liefert `date` für die Fußzeile und `time` für das Dateiname-Schema).
