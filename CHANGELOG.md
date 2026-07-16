# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Added

- **Filename scheme** — the exported PDF no longer has to be named after the note. The
  scheme accepts `{title}` `{date}` `{time}` `{folder}` and `{version}`; the default
  `{title}` keeps the previous behaviour unchanged. An unknown placeholder is left as-is so
  a typo shows up in the filename instead of silently disappearing, and an empty scheme
  falls back to `{title}`.
- **`{version}` prevents overwriting.** Without it, exporting a note twice replaces the
  previous PDF (unchanged behaviour). With it, each export counts up to the next free name
  (`Report v1.pdf`, `Report v2.pdf`, …). It has no effect in the *attachment folder* mode,
  where Obsidian resolves collisions itself.
- **Line height** and **maximum image width** are now adjustable. Both settings already
  existed and were already honoured by the PDF engine, but had no control in the Settings
  tab — they could only be changed by editing `data.json` by hand.

### Changed

- **The Settings tab is now grouped into five collapsible sections** (Output, Page,
  Typography, Content, Pagination) instead of seventeen settings in one flat list.
  **Output** starts expanded; the others remember whether you left them open. If you ever
  went looking for where the PDF is saved and did not find it: it was always there, just
  buried — it is now the first thing the tab shows.
- **Font size, margins and heading orphan control are sliders.** As text fields, a value
  outside the allowed range was silently discarded: nothing was saved, nothing was said,
  and the field kept showing the value you typed while the old one stayed in effect. The
  sliders make an invalid value impossible and show the limits up front.
- The custom output folder only appears when the output destination is actually *custom
  folder* — so it no longer needs a line of text explaining when it applies.

### Fixed

- Settings are merged with the shared kit's `mergeSettings` instead of a flat
  `Object.assign`. With the new section states, a flat merge would have shared a reference
  with the defaults, and collapsing a section for the first time would have mutated them.
- Both READMEs listed the default font size as 11 pt; it has always been 10.5 pt.

## [0.2.0] — 2026-07-11

### Added

- **Bilingual UI (English / German):** commands, settings, and notices now follow the
  Obsidian display language automatically — no separate setting. Built on the shared kit
  i18n module, vendored under `src/vendor/kit/i18n.ts` with the plugin's string tables in
  `src/i18n/strings.ts`.

### Changed

- **Minimum Obsidian version raised to 1.8.7** — required by the native `getLanguage()`
  API used to detect the display language (matching the other plugins in the family).
- Reworded the tagline and plugin description (dropped the "no letterhead, no branding"
  phrasing) in both READMEs and `manifest.json`.

## [0.1.1] — 2026-07-11

### Fixed

- Image rasterization now uses `activeDocument` instead of `document`, so canvas
  creation works correctly in Obsidian popout windows.

### Changed

- Internal type-safety and hygiene cleanup addressing the Obsidian community plugin
  review: removed the unused `builtin-modules` dev dependency, replaced `any` casts on
  runtime-only APIs (`fileManager.getAvailablePathForAttachment`, `navigator.share`,
  `app.openWithDefaultApp`) with precise local interfaces, and dropped redundant type
  assertions. No behavior change.

## [0.1.0] — 2026-07-11

Initial release.

### Added

- **Clean Markdown → PDF export**: one command (`Aktive Notiz als PDF exportieren`, also
  bound to a ribbon icon) turns the active note into a real, text-selectable vector PDF —
  no letterhead, no branding, just the note content.
- **Standard markdown scope**: headings, paragraphs, bold/italic/inline code, nested
  ordered/unordered lists, blockquotes, horizontal rules, links, images (re-encoded as
  JPEG), fenced code blocks, and simple tables.
- **Graceful degradation**: elements outside the Standard scope (callouts, math, embeds,
  …) are simplified rather than dropped silently — a single summary Notice reports how
  many elements were simplified. Paperize always produces a PDF.
- **Four output modes**: next to the note (default), the Obsidian attachment folder, a
  custom folder, or share/open out of the vault (mobile share sheet / system default app).
- **Settings**: font family (Sans/Serif/Mono — Adobe Core-14 standard fonts only, no
  embedding), base font size, page size (A4/Letter), margins, frontmatter stripping,
  title display, page numbers, running header/footer, and output mode.
- **Cross-platform**: produces real vector PDF bytes identically on desktop and
  iPhone/iPad (`isDesktopOnly: false`).
- **Dependency-free at runtime**: no external PDF library, no network calls, no
  telemetry — the PDF engine is a small, pure, vendored writer
  (`src/vendor/kit/pdf/`, from `obsidian-kit@0.8.0`).
