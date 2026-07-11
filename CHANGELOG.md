# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

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
