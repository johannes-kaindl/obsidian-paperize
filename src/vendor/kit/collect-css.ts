// vendored from code-kit@0.61.0, src/ts/web/collect-css.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Collect the CSS of a live document into one string that a separate document can carry.
 *
 *  Origin: written for `obsidian-paperize` (desktop PDF export, plan 2026-11-08, Task 1): the
 *  export renders a note in the live window, then prints it in a blank `<webview>` that sees none
 *  of the window's style sheets. This module reads them out of the CSSOM (`document.styleSheets`).
 *  It assumes nothing about Obsidian; any `{ styleSheets }` shaped object works, which is why it
 *  sits in `web/` (needs a CSSOM at run time) and why the types are structural ("Like").
 *
 *  What it does, and what it deliberately does not:
 *  - **Rules that apply only to print are dropped** (`@media print`, `only print`): the target is
 *    a print run whose look should come from the screen styles. A rule is dropped when *every*
 *    comma-separated query of its `media` starts with `print` (`screen, print` and `not print`
 *    stay). Nested `@media print` inside another rule is not looked into.
 *  - **A sheet that cannot be read is skipped and counted** (`skippedSheets`): reading `cssRules`
 *    of a cross-origin sheet (a foreign `@import`) throws; one bad sheet must not cost the export.
 *  - **Font urls that point into the host are inlined**: only `url("…")` with the extension `woff`,
 *    `woff2`, `ttf` or `otf` whose value starts with `/` or `app:` (the CSSOM always writes double
 *    quotes). The caller supplies `inlineUrl` (a fetch plus base64 in its world); `null` or a
 *    missing resolver leaves the url untouched and counts it in `unresolvedUrls`. `data:` and
 *    `https:` urls are never touched. Each distinct url is resolved once.
 */

export interface CssRuleLike {
  readonly cssText: string;
  readonly media?: { readonly mediaText: string };
}
export interface CssSheetLike {
  readonly cssRules: ArrayLike<CssRuleLike>;
}
export interface StyleSheetSource {
  readonly styleSheets: ArrayLike<CssSheetLike>;
}
export interface CollectCssOptions {
  /** Resolve a host url to a `data:` url, or `null` when that is not possible. */
  inlineUrl?: (url: string) => Promise<string | null>;
}
export interface CollectedCss {
  css: string;
  skippedSheets: number;
  unresolvedUrls: number;
}

const PRINT_QUERY = /^\s*(only\s+)?print\b/i;
const FONT_URL = /url\("((?:\/|app:)[^"]*\.(?:woff2?|ttf|otf))"\)/gi;

function isPrintOnly(mediaText: string | undefined): boolean {
  if (mediaText === undefined || mediaText.trim() === "") return false;
  return mediaText.split(",").every((q) => PRINT_QUERY.test(q));
}

export async function collectDocumentCss(doc: StyleSheetSource, options: CollectCssOptions = {}): Promise<CollectedCss> {
  const parts: string[] = [];
  let skippedSheets = 0;
  for (let i = 0; i < doc.styleSheets.length; i++) {
    const sheet = doc.styleSheets[i];
    if (!sheet) continue;
    let rules: ArrayLike<CssRuleLike>;
    try {
      rules = sheet.cssRules;
      // Touch the length inside the try: some engines throw on first access of the list itself.
      void rules.length;
    } catch {
      skippedSheets++;
      continue;
    }
    for (let j = 0; j < rules.length; j++) {
      const r = rules[j];
      if (!r || isPrintOnly(r.media?.mediaText)) continue;
      parts.push(r.cssText);
    }
  }

  let css = parts.join("\n");
  const resolved = new Map<string, string | null>();
  const urls = new Set<string>();
  for (const m of css.matchAll(FONT_URL)) urls.add(m[1] ?? "");
  let unresolvedUrls = 0;
  for (const url of urls) {
    let data: string | null = null;
    if (options.inlineUrl) {
      try {
        data = await options.inlineUrl(url);
      } catch {
        data = null;
      }
    }
    resolved.set(url, data);
    if (data === null) unresolvedUrls++;
  }
  css = css.replace(FONT_URL, (whole, url: string) => {
    const data = resolved.get(url);
    return data ? `url("${data}")` : whole;
  });
  return { css, skippedSheets, unresolvedUrls };
}
