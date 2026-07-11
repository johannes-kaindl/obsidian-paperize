# AGENTS.md — obsidian-paperize

> **Workspace-Standards:** Die verbindliche Leitkonvention steht in
> `../_docs/CONVENTIONS.md` (Modell comply-or-explain). Begründete Abweichungen
> stehen unten unter „Abweichungen von der Leitkonvention".

Conventions for AI agents (Claude Code, Codex, …) working on this repository.

## Project character

Obsidian-Plugin „Paperize": exportiert die aktive Notiz als sauberes, textselektierbares
Vektor-PDF — **kein** Briefkopf, keine Marke, nur der Notizinhalt. Bewusster Gegenpart zu
Letterhead: Letterhead formatiert einen Geschäftsbrief, Paperize gibt einfach die Notiz
als PDF aus, mit Standard-Markdown-Unterstützung und garantierter Degradation statt
Abbruch. Desktop **und** iOS/iPad (`isDesktopOnly: false`) erzeugen echte Vektor-PDF-Bytes.

- **Plugin-ID:** `paperize` (deployed unter `.obsidian/plugins/paperize/`).
- **Nicht Zero-Build:** Anders als Letterhead ist dies ein TS+esbuild-Projekt. `main.js`
  ist ein Build-Artefakt (`.gitignore`) — es wird von `npm run build` bzw. der
  Release-Action aus `src/` erzeugt, nicht committet.

## Architecture principles

- Kein Electron-/Node-API im Laufzeitpfad → mobil-tauglich. Nur Obsidian-API +
  Browser-APIs.
- **Pure Engine vendored:** `src/vendor/kit/pdf/` ist die pure PDF-Engine aus
  `obsidian-kit@0.8.0` (Layout, Metrics, Writer, IR) — Obsidian-frei, per
  `tools/`-Sync-Skript aus dem Kit übernommen, nicht von Hand editiert. Änderungen an der
  Engine gehören stromaufwärts ins Kit, nicht hier.
- **DOM→IR-Seam:** `src/core/dom-to-ir.ts` wandelt Obsidians gerenderten Markdown-DOM
  (`MarkdownRenderer.render`) in die pure Block/Inline-IR des Kits um — der einzige Ort,
  an dem Obsidian-DOM und pure Engine sich berühren. Nicht unterstützte Elemente werden zu
  `{ type: 'unsupported' }`-Blöcken (Degradation, kein Abbruch); der Zähler treibt die
  Zusammenfassungs-Notice in `main.ts`.
- **Standard-Markdown-Scope:** Überschriften, Absätze, Bold/Italic/Inline-Code,
  verschachtelte Listen, Blockquotes, HR, Links, Bilder (zu JPEG re-encodiert), Codeblöcke,
  einfache Tabellen. Alles außerhalb (Callouts, Mathe, Embeds, …) wird vereinfacht
  dargestellt statt den Export scheitern zu lassen.
- Reine Funktionen (`src/core/*`, `src/vendor/kit/*`) sind frei von Obsidian-Imports und
  damit in Node/vitest testbar; `npm run check:pure` erzwingt das (`grep` gegen
  `from 'obsidian'`).
- **Core-14-Schriften only:** Der Font-Layer nutzt ausschließlich die Adobe-Core-14-
  Standardschriften (Helvetica/Times/Courier-Familien) — keine eingebetteten Schriften,
  keine Custom-Fonts. Hält die PDFs klein und dependency-frei; bewusste Grenze, nicht
  „noch nicht implementiert".

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run --passWithNoTests
npm run check:pure  # verweigert 'obsidian'-Imports in src/core + src/vendor
npm run build       # typecheck + esbuild --production → main.js (Build-Artefakt)
npm run gate        # typecheck + test + check:pure + build — vor jedem Commit/Release
npm run deploy      # build + cp main.js manifest.json styles.css → $OBSIDIAN_PLUGIN_DIR
```

Manuelles Deploy-Ziel: `<vault>/.obsidian/plugins/paperize/`.

## Releasing

Releases erzeugt **GitHub Actions** (`.github/workflows/release.yml`), getriggert durch
einen SemVer-Tag-Push (ohne v-Präfix), der GitHub erreicht: `git push github <tag>`. Im
Unterschied zu Letterheads Zero-Build-Attestation baut dieser Workflow das Plugin frisch
aus dem getaggten Commit (`npm run gate`, inkl. `build`) und attestiert **das
Build-Ergebnis** (`main.js`/`manifest.json`/`styles.css`) — das attestierte Subjekt ist
also kein committeter Quelltext, sondern der reproduzierbar erzeugte Output. Details und
Einordnung: [`SECURITY.md`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/SECURITY.md).

- `scripts/release.mjs` (`npm run release -- <version>`) bündelt Versions-Bump (siehe
  `scripts/version-bump.mjs`), CHANGELOG-Rewrite, Commit, Tag, Push nach Codeberg
  (`origin`), lokalen Build, Codeberg-Release und Dual-Push-Mirror nach `github` (Tag
  zuerst, dann Branch) — Letzteres non-fatal: schlägt der GitHub-Push fehl, bleibt der
  Codeberg-Release gültig, der GitHub-Tag-Push muss manuell nachgeholt werden.
- `origin` bleibt Codeberg; nur der Tag muss zusätzlich auf den `github`-Remote, damit
  der Workflow feuert. Voraussetzung: Actions sind im Mirror-Repo aktiviert und
  `~/.codeberg-token` existiert lokal für den Codeberg-Release-Schritt.
- **Nicht mehr** manuell `gh release create` aufrufen: Die Attestation kann nur der
  Actions-Lauf signieren (OIDC-Identität = Workflow, nicht Laptop).

## Conventions

- Conventional Commits; SemVer-Tags **ohne** v-Präfix; nur berührte Dateien stagen.
- Remotes: Codeberg `origin`, GitHub-Mirror für Obsidian-Verzeichnis/BRAT.
- Doku ist zweisprachig: Änderungen immer in **beiden** Sprachen pflegen
  (EN `*.md` + DE `*.de.md`), sonst driften die Versionen auseinander.
- **Absolute GitHub-URLs** für Bilder/Datei-Links in READMEs: Das Community-Directory
  löst relative Pfade nicht auf (Carry-over-Gotcha aus Letterhead).
- Workspace-weite Standards: `../_docs/CONVENTIONS.md`.

## Gotchas

- `main.js` ist ein **Build-Artefakt** (`.gitignore`) — anders als bei Letterhead nicht
  committen. Der Release-Workflow baut es serverseitig aus dem getaggten Commit.
- `tools/` enthält den Vendoring-Sync gegen `obsidian-kit`; bei Kit-Updates dort
  synchronisieren, nicht `src/vendor/kit/pdf/` von Hand nachziehen.
- `moment()` aus dem Obsidian-Namespace-Re-Export ist unter diesem TS/obsidian-types-Setup
  „not callable" — siehe `todayStr()` in `src/obsidian/main.ts` für den lokalen
  YYYY-MM-DD-Formatter als Workaround.

## Memory

Projekt-Memory unter `~/.claude/projects/<slug>/memory/` (Index: `MEMORY.md`).
Session-Handoff unter `.remember/` (gitignored).

## Abweichungen von der Leitkonvention

Keine bekannten Abweichungen — dieses Repo folgt dem Standard-Profil
`ts-node · obsidian-plugin` (TypeScript + esbuild + vitest), im Unterschied zu
Letterheads bewusstem Zero-Build-Vanilla-JS-Profil.

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `/Users/Shared/code/obsidian-plugins/`.
**Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und `../REGISTRY.md`
(Lösungs-Registry) prüfen — viele Probleme sind in Nachbar-Plugins oder im
`obsidian-kit` bereits gelöst.

**Vor jeder UI-Arbeit** (Views, Modals, Settings-Tabs, CSS): `../UI-STANDARD.md` ist
verbindlich (Obsidian-nativ first, ein Frontend pro Plugin, nur Theme-CSS-Variablen).
