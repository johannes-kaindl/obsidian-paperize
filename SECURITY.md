# Security Policy

> 🇬🇧 English · [🇩🇪 Deutsch](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/SECURITY.de.md)

## Supported versions
The most recently published version receives security updates.

## Reporting a vulnerability
Please do **not** report security issues publicly as an issue. Email **code@jkaindl.de**
(PGP welcome). You will get a prompt acknowledgement and be kept informed about the fix.

## Auditability & supply chain
Paperize is a small, dependency-free Markdown→PDF exporter. Here is exactly what it does
and does not do:

- **Built, not zero-build.** Unlike some sibling plugins, Paperize is TypeScript compiled
  with esbuild: the shipped `main.js` is a bundle of `src/` (application code) and
  `src/vendor/kit/pdf/` (the vendored pure PDF engine, from `obsidian-kit@0.8.0`), **not**
  a committed, hand-readable file. `main.js` is gitignored — it is produced fresh by
  `npm run build` (`tsc --noEmit && esbuild --production`) from the tagged commit, on
  every release. There is no minification/obfuscation plugin beyond esbuild's own
  production bundling; every line of logic is readable in `src/`.
- **No network, no telemetry.** No `fetch`/`XMLHttpRequest`, no remote endpoints, no
  tracking. Everything happens locally in your vault.
- **No dynamic code execution.** No `eval`, no `new Function`, no dynamic `import()`.
  The only module import at runtime is Obsidian's own API.
- **External assets only as `data:`/local resource URLs.** Images referenced in the note
  are decoded locally (via Obsidian's `app://` resource path or an embedded `data:` URL)
  and re-encoded as JPEG bytes for the PDF — nothing is fetched from the web.
- **Minimal vault access.** Reads the active note (and its locally linked images) via the
  Obsidian API, and writes only the exported PDF — to whichever single location your
  chosen output mode points at (next to the note, the Obsidian attachment folder, a
  custom folder, or a one-shot share/open call for the out-of-vault mode).
- **Runtime-dependency-free.** No third-party runtime library — the PDF writer is a
  small, pure engine vendored under `src/vendor/kit/pdf/`. TypeScript, esbuild, and
  vitest are **build-time only** (`devDependencies`); none of them ship in `main.js`.

### A note on the community scorecard
Because Paperize is compiled, reading `main.js` directly does not tell you what runs —
read `src/` instead, and trust the build pipeline to turn that source into the bundle. To
close that trust gap, every release carries a **GitHub artifact attestation**
(Sigstore/SLSA build provenance): GitHub Actions checks out the exact tagged commit,
runs the same gate anyone can run locally (`npm run gate` — typecheck, tests, purity
check, build), and signs the resulting `main.js`, `manifest.json` and `styles.css`. The
attestation proves the published bytes were produced by that workflow from that commit —
it does **not** claim the bundle is byte-identical to any single source file (it isn't;
it's a build output, by design).

### Verifying a release
Every release is published through GitHub Actions, which signs the built files with a
Sigstore/SLSA build-provenance attestation. You can confirm that the `main.js` you run
was built by this repository's release workflow from its tagged source:

```sh
gh attestation verify main.js --repo johannes-kaindl/obsidian-paperize
```

This proves provenance (which workflow, which commit built it) — for a line-by-line
audit of behavior, read `src/` (in particular `src/core/` and `src/vendor/kit/pdf/`,
which are Obsidian-free and unit-tested).
