# Getting started

This walk-through takes you from a fresh install to your first PDF. It needs about five minutes and nothing besides Obsidian.

## 1. Install and enable the plugin

Follow one of the [install routes in the README](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/README.md#install), then enable **Paperize** under **Settings → Community plugins**. No configuration is needed; the defaults work.

## 2. Export a note

1. Open a Markdown note in Obsidian.
2. Run **Export active note as PDF** from the command palette, or click the ribbon icon (tooltip **Paperize: export as PDF**).
3. A notice reads "PDF saved: …" with the path. If some elements had to be simplified, a second notice says how many: "PDF created. N element(s) were simplified (e.g. callouts, math)."

By default the PDF lands **next to the note**, named after it (`My note.pdf`). Open it from the file explorer; Obsidian shows PDFs in its own viewer.

## 3. Choose where the PDF goes

Open **Settings → Community plugins → Paperize**. Under **Output** set **Output destination**:

- **Next to the note** — the default.
- **Obsidian attachment folder** — wherever your vault keeps attachments.
- **Custom folder** — a vault-relative folder; the row **Custom output folder** appears once you pick this.
- **Share/open out of the vault** — the share sheet on iPhone/iPad, the default PDF app on desktop.

## 4. Keep more than one version

**Filename scheme** defaults to `{title}`, so exporting twice replaces the previous PDF. Use `{title} v{version}` to get `My note v1.pdf`, `My note v2.pdf`, … Other placeholders are `{date}`, `{time}` and `{folder}`. Details are in the [README](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/README.md#filename-scheme).

## 5. Adjust the look

Under **Page**, **Typography**, **Content** and **Pagination** you set page size (A4 or Letter), margins, font family, font size, line height, page numbers, a running footer and page-break behaviour for tables, images and code. Every row has a description in the settings.

## Where to go next

- Read which parts of Markdown carry over and which are simplified in the [README](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/README.md#standard-markdown-scope--graceful-degradation).
- Something went wrong? [Troubleshooting](troubleshooting.md).
