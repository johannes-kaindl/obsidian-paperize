# AGENTS.md — obsidian-paperize

> **Workspace-Standards:** Die verbindliche Leitkonvention steht in
> `../../_docs/CONVENTIONS.md` (Modell comply-or-explain). Begründete Abweichungen
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
- **DOM→IR-Seam:** `src/vendor/kit/pdf/dom-to-ir.ts` wandelt Obsidians gerenderten Markdown-DOM
  (`MarkdownRenderer.render`) in die pure Block/Inline-IR des Kits um — der einzige Ort,
  an dem Obsidian-DOM und pure Engine sich berühren. Nicht unterstützte Elemente werden zu
  `{ type: 'unsupported' }`-Blöcken (Degradation, kein Abbruch); der Zähler treibt die
  Zusammenfassungs-Notice in `main.ts`.
- **Standard-Markdown-Scope:** Überschriften, Absätze, Bold/Italic/Inline-Code,
  verschachtelte Listen, Blockquotes, HR, Links, Bilder (zu JPEG re-encodiert), Codeblöcke,
  einfache Tabellen. Alles außerhalb (Callouts, Mathe, Embeds, …) wird vereinfacht
  dargestellt statt den Export scheitern zu lassen.
- Reine Funktionen (`src/core/*`, `src/vendor/kit/*`) sind frei von Obsidian-Imports und
  damit in Node/vitest testbar; `npm run check:pure` erzwingt das.
- **Vendor-Schichtung:** Das Kit hat zwei Schichten (`src/pure` und `src/obsidian`); der Vendor
  spiegelt sie. Obsidian-gekoppelte Kit-Module liegen real unter `src/vendor/kit-obsidian/`
  (derzeit `collapsible.ts`, importiert `setIcon`). Dieser Ordner steht als einziger Eintrag in
  `EXCLUDED` in `scripts/check-pure.mjs` — die Ausnahme ist damit benannt statt implizit.
  Alles übrige im Vendor (`i18n`, `pdf`, `settings`) ist pure und bleibt geprüft. Die
  Grenze verläuft bei **„pure", nicht bei „vendored"**: Ein neues gekoppeltes Kit-Modul gehört
  in diesen Ordner, nicht in eine weitere Skript-Ausnahme.
- **Settings-Tab — zweigleisig, `getSettingDefinitions()` ist die eine Wahrheit** (seit 0.3.3):
  Ab Obsidian 1.13 fragt der Host die Definitionen selbst ab, rendert sie nativ und nimmt die
  Zeilen in die **Settings-Suche** auf; darunter ruft er `display()`, das über
  `renderSettingDefinitions` (vendored aus dem Kit) *dieselben* Definitionen nachzeichnet.
  `minAppVersion` bleibt deshalb 1.8.7. Wer eine Einstellung hinzufügt, ergänzt `groups()` —
  **nie einen der beiden Render-Pfade einzeln**, sonst driften sie auseinander. `SECTIONS`
  bleibt die pure Tabelle (Key · i18n-Titel · Startzustand) und speist beides: den
  Gruppen-Aufbau und die Collapsible-Sektionen des Fallbacks. Testbarkeit unverändert: der
  Obsidian-Mock ist minimal (`Setting` ist eine leere Klasse), also sind die *Definitionen*
  unit-testbar und die Render-Pfade nicht — genau deshalb liegt die Wahrheit in den Daten.
  Drei Fallstricke, alle gemessen (Details in `../REGISTRY.md`):
  1. **`visible` am Gruppen-Item wertet der native 1.13.7-Renderer nicht aus.** Die Definition
     lieferte korrekt `false`, die Zeile blieb stehen, auch nach vollem Tab-Neuaufbau. Bedingte
     Zeilen deshalb **weglassen** statt ausblenden — wirkt in beiden Pfaden, weil
     `getSettingDefinitions()` bei jedem Rebuild neu ausgewertet wird.
  2. **Ein interner `display()`-Aufruf löst die 1.13-Deprecation aus.** Der Rebuild liegt in
     `renderFallback()`; `display()` bleibt nur als Wrapper stehen, weil der Host < 1.13 genau
     diese Methode ruft.
  3. **Die Obsidian-Version nicht aus `Info.plist` lesen** — die App aktualisiert sich intern,
     ohne sie zu ändern (gemessen 1.12.4, tatsächlich 1.13.7). Zur Laufzeit messen:
     `require('electron').ipcRenderer.sendSync('version')`. Der falsche Wert führte hier zur
     Fehlannahme, der native Pfad sei gar nicht prüfbar.
- **`uiCollapsed` erzwingt `mergeSettings`:** Mit dem Sektions-Zustand kam der erste
  **Objekt-Default** in die Settings. Ein flacher Merge (`Object.assign`/Spread) teilt dessen
  Referenz mit `DEFAULT_SETTINGS` — das erste Zuklappen mutiert dann die Modul-Defaults. Beide
  Merge-Stellen in `main.ts` nutzen deshalb das vendored `mergeSettings`; ein Regressionstest
  hält das fest.
- **Begrenzte Zahlenwerte gehören in einen Slider, nicht in ein Textfeld:** Textfeld +
  `if`-Guard im `onChange` verwirft eine Eingabe außerhalb der Grenzen **still** — nichts
  gespeichert, nichts gemeldet, das Feld zeigt weiter den getippten Wert. Die Anzeige lügt.
  Ein `slider`-Control mit `min`/`max`/`step` macht den ungültigen Wert unmöglich und zeigt die
  Grenzen. Gilt für `baseSizePt`/`marginMm`/`lineHeight`/`imageMaxWidthPct`/`headingKeepWithLines`.
  Den Wert zeigt seit 0.3.3 `displayFormat` (er steht dauerhaft im Namen, mit Einheit) statt
  `setDynamicTooltip()` — das ist ab 1.13 deprecated und im deklarativen Pfad gar nicht
  vorhanden, wo es den Wert also **nirgends** mehr angezeigt hätte.
- **Dateiname-Schema:** `src/core/filename.ts` ist pure und rechnet nur; die `{version}`-Zählung
  braucht Vault-Zugriff und lebt deshalb in `resolveVersionedOutputPath` (`output.ts`).
  `hasVersionPlaceholder` ist **load-bearing**: Ohne diesen Guard würde die Suchschleife bei
  einem Schema ohne `{version}` denselben Namen endlos neu bauen. Im Anhang-Modus bleibt
  `{version}` wirkungslos — dort löst Obsidian Kollisionen selbst auf, zwei Zähler übereinander
  ergäben `Bericht v1 1.pdf`.
- **SDD-Artefakte liegen im Coding-Cockpit, nicht hier** (CORE-META-12/14 der Workspace-
  Konventionen): Specs/Plans tragen Arbeitskontext (Schwester-Repo-Interna, absolute Pfade,
  interne Doku-Referenzen), der in einem öffentlichen Repo niemandem nützt. Das Repo behält die
  Design-Essenz — diese Gotchas plus `CHANGELOG.md`. **Keine absoluten Pfade außerhalb des Repos**
  in committete Dateien; im Zweifel Platzhalter (`<code-workspace>/…`, `$VAULT/…`).
- **`check:pure` ist ein Script, kein grep-Einzeiler** (`scripts/check-pure.mjs`, seit
  2026-08-03): Der frühere Einzeiler matchte nur `from 'obsidian'` — einfache Anführungszeichen
  sind der *Paperize*-Stil, das vendored Kit schreibt doppelte. Das Gate war damit blind für
  genau den Fremdcode, den es prüfen soll, und hätte nie einen vendored Obsidian-Import
  gemeldet. **Regel:** Ein Gate gegen *fremden* Code darf nicht auf *eigene* Konventionen
  matchen. Das Script fängt beide Quote-Stile, `import()` und Subpath-Importe, nennt die
  Fundstellen und trägt die `kit-obsidian`-Ausnahme explizit. Wer es anfasst: gegen einen
  echten Verstoß in **beiden** Quote-Stilen laufen lassen und den Exit-Code prüfen, nicht nur
  den Grün-Lauf ansehen — ein Gate, das nie rot wird, ist kein Gate.
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

- `npm run release -- <version>` ruft das **zentrale** Tooling im Dach
  (`../tools/release/release.mjs`) — seit 2026-08-13 gibt es keine repo-lokale Kopie mehr,
  und eine neu auftauchende wäre ein Rückstand, kein Sonderweg. Es bündelt README-Gate,
  Versions-Bump (inkl. `package-lock.json`), CHANGELOG-Rewrite, das volle `npm run gate`
  **vor** Commit und Tag, Push nach Forgejo (`origin`), Build gegen den getaggten Stand,
  Dual-Push-Mirror nach `github` und dessen **Verifikation** (Tag und Branch müssen dort
  auf dem Release-Commit stehen — ein still fehlgeschlagener Branch-Push friert den Store
  auf der alten Version ein). Ein Klon ohne das Dach-Verzeichnis ist nicht release-fähig
  und sagt das mit einer eigenen Meldung.
- `origin` bleibt Forgejo; nur der Tag muss zusätzlich auf den `github`-Remote, damit
  der Workflow feuert. Voraussetzung: Actions sind im Mirror-Repo aktiviert und
  `~/.forgejo-token` existiert lokal für den Forgejo-Release-Schritt.
- **Nicht mehr** manuell `gh release create` aufrufen: Die Attestation kann nur der
  Actions-Lauf signieren (OIDC-Identität = Workflow, nicht Laptop).

## Conventions

- Conventional Commits; SemVer-Tags **ohne** v-Präfix; nur berührte Dateien stagen.
- Remotes: Forgejo `origin`, GitHub-Mirror für Obsidian-Verzeichnis/BRAT.
- Doku ist zweisprachig: Änderungen immer in **beiden** Sprachen pflegen
  (EN `*.md` + DE `*.de.md`), sonst driften die Versionen auseinander.
- **Absolute GitHub-URLs** für Bilder/Datei-Links in READMEs: Das Community-Directory
  löst relative Pfade nicht auf (Carry-over-Gotcha aus Letterhead).
- Workspace-weite Standards: `../../_docs/CONVENTIONS.md`.

## Gotchas

- `main.js` ist ein **Build-Artefakt** (`.gitignore`) — anders als bei Letterhead nicht
  committen. Der Release-Workflow baut es serverseitig aus dem getaggten Commit.
- `tools/sync-kit.sh` ist der Vendoring-Sync gegen `obsidian-kit` — ein Aufruf zieht
  `pdf/*.ts`, `i18n.ts` und `settings.ts` nach, stempelt jede Datei mit der Kit-Version und
  schreibt `VENDOR.json`. Nie `src/vendor/kit/` von Hand nachziehen.
- **Das Export-DOM ist nicht das Preview-DOM.** `MarkdownRenderer.render` in einen *detached*
  Container (`createDiv()`) führt nicht alles aus, was die Live-Ansicht zeigt: Ein Callout-Icon
  bleibt dort ein nacktes `<svg width="16" height="16">` **ohne Klasse und ohne `aria-hidden`**,
  während dasselbe Callout im Preview `class="svg-icon lucide-alert-triangle"` trägt. Wer
  DOM-Verhalten für den Export prüft, misst am Export — ein am Preview-Markup geschriebener
  Test war 2026-08-04 grün, während das PDF `[Grafik]` zeigte. Abgreifen lässt sich das
  Export-DOM nur per temporärem `console.log` im Renderpfad (+ `obsidian dev:debug on`).
- `moment()` aus dem Obsidian-Namespace-Re-Export ist unter diesem TS/obsidian-types-Setup
  „not callable" — siehe `nowParts()` in `src/obsidian/main.ts` für den lokalen
  Datums-/Zeit-Formatter als Workaround (liefert `date` für die Fußzeile und `time` für das
  Dateiname-Schema).

## Memory

Projekt-Memory unter `~/.claude/projects/<slug>/memory/` (Index: `MEMORY.md`).
Session-Handoff unter `.remember/` (gitignored).

## Abweichungen von der Leitkonvention

- **`.github/workflows/release.yml` weicht bewusst vom `tools/release-template/` ab.** Die
  Schritte sind identisch; abweichend sind nur die **Kommentare**, die hier englisch statt
  deutsch sind (öffentliches Repo mit zweisprachiger Doku) und die Build-vs-Zero-Build-Frage
  erklären: Das attestierte Subjekt ist hier der reproduzierbar erzeugte **Build-Output**, kein
  committeter Quelltext. Der `template_drift`-Check des Workspace-Audits meldet das als Drift —
  er vergleicht Text, nicht Verhalten. Was er zu Recht fand und was gefixt wurde:
  `actions/checkout`/`setup-node` hingen auf `v4` (2026-08-04 → `v5`).

Ansonsten folgt dieses Repo dem Standard-Profil
`ts-node · obsidian-plugin` (TypeScript + esbuild + vitest), im Unterschied zu
Letterheads bewusstem Zero-Build-Vanilla-JS-Profil.

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `<code-workspace>/obsidian-plugins/`.
**Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und `../REGISTRY.md`
(Lösungs-Registry) prüfen — viele Probleme sind in Nachbar-Plugins oder im
`obsidian-kit` bereits gelöst.

**Vor jeder UI-Arbeit** (Views, Modals, Settings-Tabs, CSS): `../UI-STANDARD.md` ist
verbindlich (Obsidian-nativ first, ein Frontend pro Plugin, nur Theme-CSS-Variablen).
