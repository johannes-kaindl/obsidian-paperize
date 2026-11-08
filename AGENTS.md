# AGENTS.md — obsidian-paperize

> **Workspace-Standards:** Die verbindliche Leitkonvention steht in `../../workspace/_docs/CONVENTIONS.md` (Modell comply-or-explain). Begründete Abweichungen stehen unten unter „Abweichungen von der Leitkonvention".

Conventions for AI agents (Claude Code, Codex, …) working on this repository.

## Project character

Obsidian-Plugin „Paperize": exportiert die aktive Notiz als sauberes, textselektierbares Vektor-PDF — **kein** Briefkopf, keine Marke, nur der Notizinhalt. Bewusster Gegenpart zu Letterhead: Letterhead formatiert einen Geschäftsbrief, Paperize gibt einfach die Notiz als PDF aus, mit Standard-Markdown-Unterstützung und garantierter Degradation statt Abbruch. Am Desktop druckt Chromium (`<webview>.printToPDF`) die Notiz im Stil des Themes (Profile Papier und Bildschirm), am iPhone und iPad (`isDesktopOnly: false`) und als Rückfall erzeugt die eigene Engine echte Vektor-PDF-Bytes.

- **Plugin-ID:** `paperize` (deployed unter `.obsidian/plugins/paperize/`).
- **Nicht Zero-Build:** Anders als Letterhead ist dies ein TS+esbuild-Projekt. `main.js` ist ein Build-Artefakt (`.gitignore`) — es wird von `npm run build` bzw. der Release-Action aus `src/` erzeugt, nicht committet.

## Architecture principles

- Kein `import` aus `electron`/`fs`, kein `require()`, kein `nodeintegration`: Der Desktop-Druck läuft über ein `<webview>`-Element hinter `Platform.isDesktopApp`, alles andere ist Obsidian-API + Browser-APIs → mobil-tauglich.
- **Pure Engine vendored:** `src/vendor/kit/pdf/` ist die pure PDF-Engine aus dem Kit, per `tools/sync-kit.sh` übernommen, nicht von Hand editiert. Änderungen an der Engine gehören stromaufwärts ins Kit, nicht hier. **Den aktuellen Stand nennt `src/vendor/kit/VENDOR.json`, nicht diese Zeile** (eine Versionsnummer in der Prosa altert still).
- **DOM→IR-Seam:** `src/vendor/kit/pdf/dom-to-ir.ts` ist der einzige Ort, an dem Obsidians gerenderter Markdown-DOM und die pure Engine sich berühren. Nicht unterstützte Elemente werden zu `{ type: 'unsupported' }`-Blöcken (Degradation, kein Abbruch); der Zähler treibt die Zusammenfassungs-Notice in `main.ts`.
- Reine Funktionen (`src/core/*`, `src/vendor/kit/*`) sind frei von Obsidian-Imports und damit in Node/vitest testbar; `npm run check:pure` erzwingt das. Die Grenze verläuft bei „pure", nicht bei „vendored": ein neues Obsidian-gekoppeltes Kit-Modul gehört nach `src/vendor/kit-obsidian/` (einziger Eintrag in `EXCLUDED` von `scripts/check-pure.mjs`), nicht in eine weitere Skript-Ausnahme.
- **Settings-Tab zweigleisig, `getSettingDefinitions()` ist die eine Wahrheit:** Wer eine Einstellung hinzufügt, ergänzt `groups()` — **nie einen der beiden Render-Pfade einzeln**, sonst driften sie auseinander. `SECTIONS` bleibt die pure Tabelle.
- **Core-14-Schriften only im Vektor-Weg** (iPhone, iPad, Rückfall): keine eingebetteten Schriften, keine Custom-Fonts — bewusste Grenze, nicht „noch nicht implementiert". Der Desktop-Weg bettet die Schriften des Themes ein. Warum und Aufbau: `docs/internal/decisions.md`, `docs/internal/architecture.md`.

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm run typecheck:test # tsc -p tsconfig.test.json (src + tests)
npm test            # check-no-abs-paths + check-no-nul-bytes + vitest
npm run check:pure  # verweigert 'obsidian'-Imports in src/core + src/vendor
npm run build       # typecheck + esbuild --production → main.js (Build-Artefakt)
npm run gate        # typecheck + typecheck:test + typecheck:scripts + test + check:pure + lint + build
npm run smoke:gui   # GUI-Smoke gegen ein LAUFENDES Obsidian (docs/SMOKE.md)
npm run deploy      # build + cp main.js manifest.json styles.css → $OBSIDIAN_PLUGIN_DIR
sh tools/sync-kit.sh  # Kit neu vendoren (Pins in tools/kit-sync.json); --check vergleicht nur
```

Manuelles Deploy-Ziel: `<vault>/.obsidian/plugins/paperize/`.

## Releasing

Releases erzeugt **GitHub Actions** (`.github/workflows/release.yml`), getriggert durch einen SemVer-Tag-Push (ohne v-Präfix). Der Workflow baut das Plugin frisch aus dem getaggten Commit und attestiert das Build-Ergebnis (Einordnung: [`SECURITY.md`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/SECURITY.md)). `npm run release -- <version>` ruft das zentrale Tooling im Dach (`../tools/release/release.mjs`); ein Klon ohne Dach ist nicht release-fähig. Mirror, Tag-Push und Store: `../.claude/rules/release-und-store.md`. Voraussetzung: Actions sind im Mirror-Repo aktiviert und `~/.forgejo-token` existiert lokal für den Forgejo-Release-Schritt. **Nicht** manuell `gh release create`: Die Attestation kann nur der Actions-Lauf signieren (OIDC-Identität = Workflow, nicht Laptop).

## Conventions

- Conventional Commits; SemVer-Tags **ohne** v-Präfix; nur berührte Dateien stagen.
- Remotes: Forgejo `origin`; `github` (Obsidian-Verzeichnis/BRAT) bekommt Branch und Tag nur über `release.mjs`, nie von Hand.
- Doku ist zweisprachig: Änderungen immer in **beiden** Sprachen pflegen (EN `*.md` + DE `*.de.md`), sonst driften die Versionen auseinander.
- **Absolute GitHub-URLs** für Bilder/Datei-Links in READMEs: Das Community-Directory löst relative Pfade nicht auf.
- **Keine absoluten Pfade außerhalb des Repos** in committete Dateien; im Zweifel Platzhalter (`<code-workspace>/…`, `$VAULT/…`). SDD-Artefakte liegen im Coding-Cockpit, nicht hier (CORE-META-12/14).
- Workspace-weite Standards: `../../workspace/_docs/CONVENTIONS.md`.

## Gotchas

- `main.js` ist ein **Build-Artefakt** (`.gitignore`) — nicht committen. Der Release-Workflow baut es serverseitig aus dem getaggten Commit.

## Context index

- Bevor du Einstellungen änderst oder den Settings-Tab anfasst (`src/obsidian/settings.ts`, `main.ts`, vendorte Settings-Bausteine): `.claude/rules/settings-tab.md`.
- Bevor du etwas unter `src/vendor/` änderst, das Kit hebst oder `scripts/check-pure.mjs` anfasst: `.claude/rules/vendor-kit.md`.
- Bevor du Dateiname-Schema, Ausgabepfade oder `{version}` änderst: `.claude/rules/dateiname-und-pfade.md`.
- Bevor du den DOM→IR-Weg, Bilder oder Datumsformatierung in `main.ts` anfasst: `.claude/rules/export-dom.md`.
- Bevor du den Desktop-Druckweg (`export-desktop.ts`, `desktop-print.ts`) oder die Druck-Matrix (`scripts/print-matrix.ts`) anfasst: `.claude/rules/export-desktop.md`.
- Bevor du den GUI-Smoke änderst oder eine Gegenprobe fährst: `.claude/rules/gui-smoke-gegenprobe.md`, `docs/SMOKE.md`; Treiber-Regeln des Dachs in `../.claude/rules/gui-smoke-treiber.md`.
- Vor Änderungen an Modul-Layout, Schichten, Markdown-Umfang oder Release-Weg: `docs/internal/architecture.md`.
- Bevor du eine Altentscheidung (Zero-Build, Core-14, kein Node-API, Degradation, Slider, Settings-Definitionen, SDD-Ablage) übernimmst: `docs/internal/decisions.md`.
- Vor einem Release oder Store-Rescan: `../.claude/rules/release-und-store.md`, Skills `plugin-release-setup` und `store-rescan`.
- Vor UI-Arbeit: `../UI-STANDARD.md`, `../.claude/rules/ui-bausteine.md`.

## Memory

Projekt-Memory unter `~/.claude/projects/<slug>/memory/` (Index: `MEMORY.md`). Session-Handoff unter `.remember/` (gitignored).

## Abweichungen von der Leitkonvention

- **`.github/workflows/release.yml` weicht bewusst vom `tools/release-template/` ab.** Die Schritte sind identisch; abweichend sind nur die **Kommentare**, die hier englisch statt deutsch sind (öffentliches Repo mit zweisprachiger Doku) und die Build-vs-Zero-Build-Frage erklären: Das attestierte Subjekt ist hier der reproduzierbar erzeugte **Build-Output**, kein committeter Quelltext. Der `template_drift`-Check des Workspace-Audits meldet das als Drift — er vergleicht Text, nicht Verhalten.

Ansonsten folgt dieses Repo dem Standard-Profil `ts-node · obsidian-plugin` (TypeScript + esbuild + vitest), im Unterschied zu Letterheads bewusstem Zero-Build-Vanilla-JS-Profil.

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `<code-workspace>/obsidian-plugins/`. **Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und `../REGISTRY.md` (Lösungs-Registry) prüfen — viele Probleme sind in Nachbar-Plugins oder im `obsidian-kit` bereits gelöst. **Vor jeder UI-Arbeit** (Views, Modals, Settings-Tabs, CSS): `../UI-STANDARD.md` ist verbindlich.
