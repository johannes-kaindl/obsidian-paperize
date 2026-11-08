// vendored from obsidian-kit@0.81.0, src/pure/print-css.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/**
 * Druck-CSS für den Desktop-PDF-Export einer gerenderten Obsidian-Notiz.
 *
 * Domänen-Annahme (deshalb `src/pure/` und nicht code-kit): die Selektoren setzen Obsidians
 * Vorschau-DOM voraus (`.markdown-preview-view`, `.callout`) und dessen Layout-Eigenheiten
 * (`contain` und feste Höhe auf `html, body`, die den Fluss auf Seiten verhindern).
 *
 * Reinheits-Garantie: keine Imports, nur Zeichenketten. Der Wert steht unverändert in einem
 * `<style>` des Druckdokuments; er braucht keinen Theme-Wert (kein `var(`).
 *
 * Werte gemessen in der Paperize-Machbarkeitsmessung (Runde 2, 2026-11-08).
 */

/** Klasse des Wrappers, der die Notiz im Druckdokument umschließt (`div.okit-print-page`). */
export const PRINT_PAGE_CLASS = "okit-print-page";

/**
 * Hebt die Bildschirm-Layoutregeln von Obsidian auf, damit der Inhalt in Seiten fließt.
 * Gilt für jedes Profil.
 *
 * @example
 * obsidianPrintResetCss().includes("contain: initial !important"); // true
 */
export function obsidianPrintResetCss(): string {
  return [
    "html, body { height: auto !important; overflow: visible !important; position: static !important; width: auto !important; contain: initial !important; padding-top: 0 !important; }",
    ".markdown-preview-view { height: auto !important; overflow: visible !important; padding: 0 !important; width: auto !important; }",
  ].join("\n");
}

/**
 * Profil „Papier“: dunkler Text auf weißem Grund, keine Flächen, dünne Linien.
 * Wirkt nur unter `.okit-print-page`; Bilder und SVG behalten ihre Farben.
 *
 * @example
 * paperProfileCss().includes(".okit-print-page a"); // true
 */
export function paperProfileCss(): string {
  const p = `.${PRINT_PAGE_CLASS}`;
  return [
    `${p}, ${p} *:not(svg):not(svg *):not(img) { color: #1a1a1a !important; background: none !important; box-shadow: none !important; text-shadow: none !important; mix-blend-mode: normal !important; }`,
    `${p} .callout { border: 0.75pt solid #777 !important; }`,
    `${p} pre { border: 0.5pt solid #999 !important; }`,
    `${p} th, ${p} td { border: 0.5pt solid #999 !important; }`,
    `${p} a { text-decoration: underline; }`,
  ].join("\n");
}
