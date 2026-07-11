# Paperize – clean Markdown → PDF

> 🇬🇧 English · [🇩🇪 Deutsch](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/README.de.md)

An Obsidian plugin that exports the active note as a clean, text-selectable **vector PDF**
— just your note's content, nothing added. Works identically on desktop, iPhone and
iPad.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/LICENSE)
![Platform](https://img.shields.io/badge/platform-Obsidian%20(Desktop%20%7C%20iOS)-lightgrey)

## Features

- **One command, one PDF:** run **Export active note as PDF** (command palette or
  the ribbon icon) and the active note becomes a real, text-selectable vector PDF — no
  browser print dialog, no screenshot detour.
- **Bilingual UI (English / German):** commands, settings, and notices follow your
  Obsidian display language automatically — no separate setting.
- **Standard Markdown scope:** headings, paragraphs, bold/italic/inline code, nested
  ordered and unordered lists, blockquotes, horizontal rules, links, images (re-encoded
  as JPEG), fenced code blocks, and simple tables.
- **Graceful degradation, never a failed export:** elements outside that scope (callouts,
  math, embeds, and other Obsidian-specific rendering) are simplified into plain text
  instead of breaking the export. A single summary notice tells you how many elements
  were simplified so you can check the source note if it matters.
- **Four output destinations**, chosen in settings: next to the note (default), the
  Obsidian attachment folder, a custom folder, or share/open out of the vault (the
  mobile share sheet, or the OS default app on desktop).
- **Desktop and iPhone/iPad, identically.** `main.js` produces real vector PDF bytes
  itself — there is no reliance on `window.print()` or a WebView print pipeline, so the
  same code path runs everywhere (`isDesktopOnly: false`).
- **Dependency-free at runtime, no network, no telemetry.** The PDF writer is a small,
  pure engine vendored under `src/vendor/kit/pdf/` (from `obsidian-kit@0.8.0`) — no
  third-party PDF library, no `fetch`, nothing leaves your device. See
  [`SECURITY.md`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/SECURITY.md)
  for the full statement.

## Quick start

Repository: [github.com/johannes-kaindl/obsidian-paperize](https://github.com/johannes-kaindl/obsidian-paperize)
(source mirror: [codeberg.org/jkaindl/obsidian-paperize](https://codeberg.org/jkaindl/obsidian-paperize))

### Install from Obsidian (once listed in Community Plugins)

1. Open **Settings → Community plugins → Browse**.
2. Search for **"Paperize"** and select **Install**.
3. **Enable** Paperize — no configuration is required to get started; the defaults work
   out of the box.

### Manual install

```bash
# Copy the plugin into your vault
cp manifest.json main.js styles.css \
   "<your-vault>/.obsidian/plugins/paperize/"

# …or, with OBSIDIAN_PLUGIN_DIR exported:
npm run deploy
```

Then: Obsidian → Settings → Community plugins → reload → enable **Paperize**.

## Usage

1. Open any Markdown note.
2. Run **Export active note as PDF** (command palette) or click the ribbon icon.
3. The PDF appears at the configured output location (see **Settings → Output
   destination** below). If any elements were simplified during export, a notice tells
   you how many.

Frontmatter is stripped from the exported PDF by default (configurable). The first
heading (or the note's filename, if there is none) becomes the title.

## Settings

| Setting | Description | Default |
| --- | --- | --- |
| **Font family** | Body typeface — Sans (Helvetica), Serif (Times), or Mono (Courier). Adobe Core-14 standard fonts only, see [Fonts](#fonts--the-core-14-limitation) below. | Sans |
| **Font size (pt)** | Base body text size, 6–24 pt. | 11 pt |
| **Page size** | A4 or Letter. | A4 |
| **Margins (mm)** | Page margin on all four sides, 12–50 mm. | 20 mm |
| **Strip frontmatter** | Remove YAML frontmatter from the exported body. | On |
| **Title on top** | Show a derived title (first heading, or filename) at the top of the PDF. | On |
| **Page numbers** | Print a page number on every page. | On |
| **Running header/footer** | Repeat the title and today's date in the page footer. | Off |
| **Output destination** | Where the PDF is written: *next to the note*, *Obsidian attachment folder*, *custom folder*, or *share/open out of the vault*. | Next to the note |
| **Custom output folder** | Vault-relative folder used only when output destination is *custom folder*. | *(empty)* |

Image width is capped internally (`imageMaxWidthPct`, default 100 % of the content
width) but is not yet exposed as its own control in the Settings tab — it is on the
roadmap.

## Standard Markdown scope & graceful degradation

Paperize targets a deliberately bounded, well-tested scope of Markdown, listed under
**Features** above. Anything Obsidian renders that falls outside that scope — callouts,
math blocks, embeds, and other plugin- or Obsidian-specific widgets — is not silently
dropped: its text content is extracted and shown as plain text in the PDF, and the
export always completes. After export, a notice reports how many elements were
simplified this way, so you know when to double-check a note against the PDF.

## Fonts & the Core-14 limitation

Paperize uses only the **Adobe Core-14 standard PDF fonts** (the Helvetica, Times, and
Courier families) — the fonts every PDF reader can render without any font file being
embedded in the document. This is a deliberate trade-off, not a missing feature:

- PDFs stay tiny (no embedded font data).
- No custom fonts, no theme fonts, no non-Latin scripts beyond WinAnsi coverage.
- Every PDF opens identically in any viewer, on any platform.

If you need embedded custom fonts or full Unicode coverage, Paperize is not the right
tool for that note.

## Privacy & security

Paperize runs entirely on your device: no network calls, no telemetry, no tracking.
Images are decoded and re-encoded locally; nothing is fetched from the web. The PDF
engine is a small, dependency-free module vendored into the plugin — see
[`SECURITY.md`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/SECURITY.md)
for the full statement, including how releases are built and attested (the shipped
`main.js` is an esbuild bundle of `src/`, not a committed source file — the attestation
covers the built artifact).

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run --passWithNoTests
npm run check:pure  # refuses 'obsidian' imports in src/core + src/vendor
npm run build       # typecheck + esbuild --production → main.js
npm run gate        # typecheck + test + check:pure + build — run before every commit
npm run deploy      # build + copy manifest.json main.js styles.css → $OBSIDIAN_PLUGIN_DIR
```

See [`AGENTS.md`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/AGENTS.md)
for architecture notes and release process.

## License

Code: **AGPL-3.0-or-later** — see
[`LICENSE`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/LICENSE).
