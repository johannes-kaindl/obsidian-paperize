# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text — then the cause and what to do. If yours is not here, see [Getting help](#getting-help).

## No active Markdown note

> No active Markdown note.

**Cause:** the command ran while no Markdown note had focus — a PDF, an image, a canvas or an empty pane is in front.

**Fix:** click into the note you want to export, then run **Export active note as PDF** again.

## Nothing to export

> Nothing to export.

**Cause:** the note has no content besides its frontmatter.

**Fix:** add some text to the note and export again.

## PDF export failed

> PDF export failed (see console).

**Cause:** something unexpected went wrong while building the PDF.

**Fix:** open the developer console (Ctrl+Shift+I, or Cmd+Option+I on macOS), repeat the export and look at the error. Then [open an issue](#getting-help) with that text and, if you can, the note or a reduced version of it.

## Something in the PDF is replaced by [Formula] or [Graphic]

> PDF created. 2 element(s) were simplified (e.g. callouts, math).

**Cause:** Paperize writes the PDF itself, as text. What Obsidian draws as a picture — formulas, Mermaid diagrams — cannot be carried over, so the PDF shows **[Formula]** or **[Graphic]** at that spot instead of dropping it silently. Callouts and embeds are reduced to their plain text. The notice counts these elements.

**Fix:** there is none inside Paperize; this is the deliberate scope. If the element matters, export it as an image yourself and put the image in the note.

## The new PDF replaced the old one

**Cause:** the **Filename scheme** is `{title}` (the default), so every export of the same note writes the same file name.

**Fix:** under **Settings → Community plugins → Paperize → Output** use a scheme with `{version}`, for example `{title} v{version}`, or with `{date}`. `{version}` has no effect in the *Obsidian attachment folder* mode, where Obsidian resolves name collisions itself.

## My font or a non-Latin character looks wrong

**Cause:** Paperize uses only the standard PDF fonts (Helvetica, Times, Courier). That keeps the PDFs small and identical in every viewer, but it means no custom fonts and no scripts beyond the Latin range.

**Fix:** pick a different **Font family** (Sans, Serif or Mono) under **Typography**. For custom fonts or full Unicode Paperize is not the right tool.

## Getting help

Still stuck? [Open an issue](https://github.com/johannes-kaindl/obsidian-paperize/issues) with your Obsidian version, the plugin version (Settings → Community plugins) and what you expected to happen.
