// vendored from code-kit@0.61.0, src/ts/pure/print-document.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Build the self-contained HTML document that a PDF print run takes, and the `@page` block that
 *  sets its paper.
 *
 *  Origin: written for `obsidian-paperize` (desktop PDF export, plan 2026-11-08, Task 2): the plugin
 *  renders a note in the live window, collects the CSS (`web/collect-css`) and prints the result in
 *  a blank `<webview>` via `printToPDF`. Everything here is a string function; no DOM, no I/O.
 *
 *  Safety contract (the strings come from a theme, a note title and a settings field):
 *  - Attribute values are escaped (`&`, `"`, `<`, `>`).
 *  - Inside `<style>` every `<` becomes the CSS escape `\3C ` (so `</style` cannot close the element
 *    and no `<script` survives); a `<` is never valid CSS outside a string, so no real rule changes.
 *  - Footer text is a CSS string: `\`, `"`, `<` and line breaks are escaped. Colour values are
 *    literals; `{ } ; < > " ' \` and line breaks are stripped from them so a value cannot leave
 *    its declaration. `@page` takes literal colours only, never `var()`: the page context does not
 *    inherit custom properties.
 *  - `contentHtml` is trusted markup (the rendered note); the caller owns it, `csp` is the net.
 */

export interface PrintDocumentInput {
  /** The collected document CSS. */
  css: string;
  /** CSS that must win over `css` (profile, pagination, `@page`). */
  extraCss?: string;
  htmlClass: string;
  bodyClass: string;
  bodyStyle: string;
  lang: string;
  contentHtml: string;
  /** Content-Security-Policy value, put in a `<meta>` before the first `<style>`. */
  csp: string;
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeStyle(css: string): string {
  return css.replace(/</g, "\\3C ");
}

export function buildPrintDocument(input: PrintDocumentInput): string {
  const styles = [input.css, input.extraCss ?? ""]
    .filter((c) => c !== "")
    .map((c) => `<style>${safeStyle(c)}</style>`)
    .join("\n");
  return (
    "<!doctype html>\n" +
    `<html class="${escAttr(input.htmlClass)}" lang="${escAttr(input.lang)}">\n` +
    "<head>\n<meta charset=\"utf-8\">\n" +
    `<meta http-equiv="Content-Security-Policy" content="${escAttr(input.csp)}">\n` +
    (styles === "" ? "" : styles + "\n") +
    "</head>\n" +
    `<body class="${escAttr(input.bodyClass)}" style="${escAttr(input.bodyStyle)}">${input.contentHtml}</body>\n</html>\n`
  );
}

export interface PageCssInput {
  size: "A4" | "Letter";
  marginMm: number;
  /** False when the shell is too old for `@page` margin boxes: no background, no numbers, no footer. */
  marginBoxes: boolean;
  /** Literal colour for the page background (never `var()`). */
  background?: string;
  pageNumbers?: boolean;
  numberColor?: string;
  footer?: { left?: string; right?: string };
}

function literal(value: string): string {
  return value.replace(/[{};<>"'\\\r\n]/g, "").trim();
}

function cssString(text: string): string {
  const body = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\3C ").replace(/[\r\n]+/g, " ");
  return `"${body}"`;
}

export function pageCss(input: PageCssInput): string {
  const parts: string[] = [`size: ${input.size};`, `margin: ${input.marginMm}mm;`];
  if (input.marginBoxes) {
    const bg = input.background === undefined ? "" : literal(input.background);
    if (bg !== "") parts.push(`background: ${bg};`);
    const color = input.numberColor === undefined ? "" : literal(input.numberColor);
    const box = (name: string, content: string): string =>
      `@${name} { content: ${content};${color !== "" ? ` color: ${color};` : ""} font-size: 9pt; }`;
    if (input.pageNumbers) parts.push(box("bottom-center", 'counter(page) " / " counter(pages)'));
    if (input.footer?.left) parts.push(box("bottom-left", cssString(input.footer.left)));
    if (input.footer?.right) parts.push(box("bottom-right", cssString(input.footer.right)));
  }
  return `@page { ${parts.join(" ")} }`;
}

/** Major version of the Chromium named in a user agent, `null` when there is none. */
export function chromiumMajor(userAgent: string): number | null {
  const m = /Chrome\/(\d+)/.exec(userAgent);
  return m && m[1] !== undefined ? Number(m[1]) : null;
}

/** `@page` margin boxes (page numbers, footers) and the page background need Chromium 131. */
export function supportsPageMarginBoxes(userAgent: string): boolean {
  const major = chromiumMajor(userAgent);
  return major !== null && major >= 131;
}
