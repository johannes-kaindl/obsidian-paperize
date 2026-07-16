# Settings-UX + Dateiname-Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paperize' Settings-Tab wird in fünf einklappbare Sektionen gegliedert (Ausgabe offen), bekommt ein konfigurierbares Dateiname-Schema und die zwei bislang UI-losen Settings.

**Architecture:** Eine neue pure Datei (`src/core/filename.ts`) hält die Template-Engine; jeder Vault-Zugriff bleibt in `src/obsidian/`. `collapsibleSection` und `mergeSettings` werden unverändert aus dem Kit vendored. Die Sektions-Zuordnung ist eine pure Tabelle (`SECTIONS`), damit sie ohne DOM testbar ist.

**Tech Stack:** TypeScript strict · vitest 1.6.1 (`environment: 'node'`) · Obsidian Plugin API · esbuild

**Spec:** `docs/superpowers/specs/2026-07-16-settings-ux-und-dateiname-design.md`

## Global Constraints

- **`check:pure` ist Gate-Teil:** `src/core/**` und `src/vendor/**` dürfen **nie** `from 'obsidian'` importieren. Prüfung: `npm run check:pure`.
- **`src/vendor/kit/**` ist read-only:** Vendored Dateien nicht editieren. Herkunfts-Header Pflicht: `// vendored from obsidian-kit#<tag>, <quelle> — do not hand-edit; re-vendor via tools/sync-kit.sh`.
- **EN + DE Pflicht:** Jeder neue i18n-Key muss in **beiden** Dicts stehen — `tests/obsidian/i18n.test.ts` erzwingt Key-Set-Gleichheit und schlägt sonst fehl.
- **Sentence case** für alle UI-Labels (UI-STANDARD §5): „Filename scheme", nicht „Filename Scheme".
- **CSS nur mit Theme-Variablen**, kein `!important` (UI-STANDARD §3).
- **Gate vor jedem Commit:** `npm run gate` (typecheck + test + check:pure + build). Ausgangslage: **50 Tests grün**.
- **Commits:** Conventional Commits, deutsche Beschreibung, **nur berührte Dateien stagen**. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Arbeitsverzeichnis:** `/Users/Shared/code/obsidian-plugins/obsidian-paperize` (**nicht** image-to-markdown).

---

### Task 1: Dateiname-Resolver (pure)

**Files:**
- Create: `src/core/filename.ts`
- Test: `tests/core/filename.test.ts`

**Interfaces:**
- Consumes: nichts (erste Task, keine Abhängigkeit).
- Produces:
  - `export interface FilenameValues { title: string; date: string; time: string; folder: string; version: number }`
  - `export const DEFAULT_FILENAME_TEMPLATE = '{title}'`
  - `export function sanitizeFilename(s: string): string`
  - `export function hasVersionPlaceholder(template: string): boolean`
  - `export function buildFilename(template: string, v: FilenameValues): string`

**Kontext für den Implementierer:** Adaptiert von `yijing-oracle/src/core/filename.ts` (Kit-first: zweites Exemplar, REGISTRY-Status wird in Task 6 auf „Kit-Kandidat" gehoben — **nicht** ins Kit extrahieren). Zwei bewusste Abweichungen von yijing: Die Platzhalter sind andere, und ungültige Zeichen werden durch `_` **ersetzt** statt gelöscht — das ist Paperize' bestehende Semantik (`sanitizeBase`, `src/obsidian/output.ts:16`), die in Task 2 auf diese Funktion umgestellt wird und deren Tests grün bleiben müssen.

- [ ] **Step 1: Write the failing test**

`tests/core/filename.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  buildFilename,
  sanitizeFilename,
  hasVersionPlaceholder,
  DEFAULT_FILENAME_TEMPLATE,
} from '../../src/core/filename';

const V = { title: 'Mein Bericht', date: '2026-07-16', time: '1435', folder: 'Projekte', version: 1 };

describe('sanitizeFilename', () => {
  it('replaces OS-illegal characters with an underscore', () => {
    expect(sanitizeFilename('a/b:c?')).toBe('a_b_c_');
  });
  it('also replaces Obsidian-specific characters', () => {
    expect(sanitizeFilename('a#b^c[d]e')).toBe('a_b_c_d_e');
  });
  it('collapses whitespace and trims', () => {
    expect(sanitizeFilename('  a   b  ')).toBe('a b');
  });
  it('returns an empty string for empty input', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

describe('hasVersionPlaceholder', () => {
  // Load-bearing: without this guard the search loop in output.ts would rebuild the same
  // name forever when the template has no {version}.
  it('detects the version placeholder', () => {
    expect(hasVersionPlaceholder('{title} v{version}')).toBe(true);
  });
  it('is false without it', () => {
    expect(hasVersionPlaceholder('{title} {date}')).toBe(false);
  });
  it('does not match a similarly named placeholder', () => {
    expect(hasVersionPlaceholder('{versionx}')).toBe(false);
  });
});

describe('buildFilename', () => {
  it('resolves every placeholder', () => {
    expect(buildFilename('{title} {date} {time} {folder} v{version}', V))
      .toBe('Mein Bericht 2026-07-16 1435 Projekte v1');
  });
  it('defaults to the note title alone', () => {
    expect(buildFilename(DEFAULT_FILENAME_TEMPLATE, V)).toBe('Mein Bericht');
  });
  it('leaves an unknown placeholder literal so the typo stays visible', () => {
    expect(buildFilename('{title} {foo}', V)).toBe('Mein Bericht {foo}');
  });
  it('sanitizes the resolved result', () => {
    expect(buildFilename('{title}', { ...V, title: 'A/B' })).toBe('A_B');
  });
  it('collapses the gap left by an empty folder (note in vault root)', () => {
    expect(buildFilename('{title} {folder}', { ...V, folder: '' })).toBe('Mein Bericht');
  });
  it('falls back to the title for an empty template', () => {
    expect(buildFilename('', V)).toBe('Mein Bericht');
  });
  it('falls back to Dokument when template and title are both empty', () => {
    expect(buildFilename('', { ...V, title: '' })).toBe('Dokument');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/filename.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/filename"`

- [ ] **Step 3: Write minimal implementation**

`src/core/filename.ts`:
```ts
// Konfigurierbares Dateiname-Schema für den PDF-Export. Rein und testbar (kein obsidian-Import).
// Platzhalter: {title} {date} {time} {folder} {version}
//   {title} = Basename der Notiz · {date} = YYYY-MM-DD · {time} = HHMM
//   {folder} = Ordnername der Notiz (nicht der Pfad; leer wenn im Vault-Root)
//   {version} = Export-Zähler; die Zählung selbst lebt in src/obsidian/output.ts (braucht Vault-Zugriff)
// Adaptiert von yijing-oracle/src/core/filename.ts (2. Exemplar, siehe REGISTRY „Kit-Kandidat").

// OS-illegale plus Obsidian-spezifische Zeichen (#^[]).
const INVALID = /[\\/:*?"<>|#^[\]]/g;

/** Ungültige Datei-Zeichen durch _ ersetzen, Whitespace kollabieren, trimmen.
 *  Ersetzen statt Löschen ist Paperize' etablierte Semantik (vormals sanitizeBase). */
export function sanitizeFilename(s: string): string {
  return s.replace(INVALID, '_').replace(/\s+/g, ' ').trim();
}

export const DEFAULT_FILENAME_TEMPLATE = '{title}';

export interface FilenameValues {
  /** Basename der Notiz, z.B. "Mein Bericht" */
  title: string;
  /** "2026-07-16" */
  date: string;
  /** "1435" (HHMM) */
  time: string;
  /** Ordnername der Notiz, "" im Vault-Root */
  folder: string;
  /** Export-Zähler, ab 1 */
  version: number;
}

/** Enthält das Schema {version}? Load-bearing: ohne diese Prüfung würde die Suchschleife in
 *  output.ts bei einem Schema ohne {version} denselben Namen endlos neu bauen. */
export function hasVersionPlaceholder(template: string): boolean {
  return /\{version\}/.test(template);
}

/** Löst das Schema auf und sanitisiert das Ergebnis. Unbekannte Platzhalter bleiben literal
 *  stehen, damit ein Tippfehler im Dateinamen sichtbar wird statt still zu wirken. */
export function buildFilename(template: string, v: FilenameValues): string {
  const subs: Record<string, string> = {
    title: v.title,
    date: v.date,
    time: v.time,
    folder: v.folder,
    version: String(v.version),
  };
  const filled = template.replace(/\{(\w+)\}/g, (_m, key: string) => subs[key] ?? `{${key}}`);
  const clean = sanitizeFilename(filled);
  // Leeres/weg-sanitisiertes Schema → Titel, sonst Konstante: nie ein leerer Dateiname.
  return clean || sanitizeFilename(v.title) || 'Dokument';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/filename.test.ts`
Expected: PASS — 14 Tests grün.

- [ ] **Step 5: Run the full gate**

Run: `npm run gate`
Expected: typecheck ✓ · 64 Tests grün (50 vorher + 14) · check:pure ✓ (die neue Datei importiert kein `obsidian`) · build ✓

- [ ] **Step 6: Commit**

```bash
git add src/core/filename.ts tests/core/filename.test.ts
git commit -m "$(cat <<'EOF'
feat(filename): pure Resolver fuer das Dateiname-Schema

Platzhalter {title} {date} {time} {folder} {version}, adaptiert von
yijing-oracle (2. Exemplar). hasVersionPlaceholder ist eine eigene
Funktion, weil der Endlosschleifen-Guard in output.ts daran haengt.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Versions-Schleife in output.ts

**Files:**
- Modify: `src/obsidian/output.ts:15-17` (sanitizeBase), `:38-69` (writePdf)
- Test: `tests/obsidian/output.test.ts` (erweitern)

**Interfaces:**
- Consumes: `buildFilename`, `hasVersionPlaceholder`, `sanitizeFilename`, `FilenameValues` aus `src/core/filename.ts` (Task 1).
- Produces:
  - `export async function resolveVersionedOutputPath(app: App, mode: OutputMode, template: string, vars: Omit<FilenameValues, 'version'>, ctx: { noteDir: string; customFolder: string; attachmentPath: string }): Promise<{ path: string | null; baseName: string }>`
  - `writePdf` ändert seine Signatur auf `(app: App, bytes: Uint8Array, mode: OutputMode, ctx: { baseName: string; resolvedPath: string | null; openAfter: boolean })`
  - `resolveOutputPath` und `sanitizeBase` bleiben exportiert (unveränderte Signatur).

**Kontext für den Implementierer:** `sanitizeBase` wird zum Delegate auf `sanitizeFilename` — dadurch gibt es genau **eine** Sanitisierungs-Regel im Repo. Die beiden bestehenden `sanitizeBase`-Tests (`tests/obsidian/output.test.ts:25-32`) müssen **unverändert grün bleiben**; das ist der Beweis, dass die Umstellung verhaltensgleich ist.

`writePdf` resolvt den Pfad heute selbst (`:62`). Künftig bekommt es ihn fertig — `resolveVersionedOutputPath` ist die einzige Stelle, die zählt. Das ist nötig, weil die Zählung `await`en muss (`adapter.exists`) und `resolveOutputPath` synchron und rein ist.

- [ ] **Step 1: Write the failing test**

An `tests/obsidian/output.test.ts` anhängen (der bestehende `vi.mock('obsidian', …)`-Aufruf oben in der Datei bleibt unverändert; `resolveVersionedOutputPath` zum bestehenden Import ergänzen):
```ts
import { resolveVersionedOutputPath } from '../../src/obsidian/output';

// Fake-App mit steuerbarem Vault-Adapter: `existing` listet Pfade, die schon belegt sind.
function fakeApp(existing: string[]) {
  const calls: string[] = [];
  const app = {
    vault: {
      adapter: {
        exists: async (p: string) => { calls.push(p); return existing.includes(p); },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { app: app as any, calls };
}

describe('resolveVersionedOutputPath', () => {
  const vars = { title: 'Bericht', date: '2026-07-16', time: '1435', folder: 'Projekte' };
  const ctx = { noteDir: 'Notes', customFolder: 'Exports', attachmentPath: 'Media/Bericht.pdf' };

  it('overwrites without {version} — a single pass, no existence check', async () => {
    const { app, calls } = fakeApp(['Notes/Bericht.pdf']);
    const r = await resolveVersionedOutputPath(app, 'nextToNote', '{title}', vars, ctx);
    expect(r.path).toBe('Notes/Bericht.pdf');
    expect(r.baseName).toBe('Bericht');
    expect(calls).toEqual([]); // kein exists()-Aufruf: nichts zu zaehlen
  });

  it('counts {version} up until the path is free', async () => {
    const { app } = fakeApp(['Notes/Bericht v1.pdf', 'Notes/Bericht v2.pdf']);
    const r = await resolveVersionedOutputPath(app, 'nextToNote', '{title} v{version}', vars, ctx);
    expect(r.path).toBe('Notes/Bericht v3.pdf');
    expect(r.baseName).toBe('Bericht v3');
  });

  it('starts at 1 when nothing exists yet', async () => {
    const { app } = fakeApp([]);
    const r = await resolveVersionedOutputPath(app, 'nextToNote', '{title} v{version}', vars, ctx);
    expect(r.path).toBe('Notes/Bericht v1.pdf');
  });

  it('lets Obsidian win in the attachment mode — {version} stays inert', async () => {
    const { app, calls } = fakeApp(['Media/Bericht.pdf']);
    const r = await resolveVersionedOutputPath(app, 'attachmentFolder', '{title} v{version}', vars, ctx);
    expect(r.path).toBe('Media/Bericht.pdf'); // der vorab aufgeloeste Anhang-Pfad, unveraendert
    expect(calls).toEqual([]);
  });

  it('returns a null path for share mode', async () => {
    const { app } = fakeApp([]);
    const r = await resolveVersionedOutputPath(app, 'share', '{title} v{version}', vars, ctx);
    expect(r.path).toBeNull();
    expect(r.baseName).toBe('Bericht v1');
  });

  it('applies the template to the custom folder too', async () => {
    const { app } = fakeApp([]);
    const r = await resolveVersionedOutputPath(app, 'customFolder', '{date} {title}', vars, ctx);
    expect(r.path).toBe('Exports/2026-07-16 Bericht.pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/output.test.ts`
Expected: FAIL — `resolveVersionedOutputPath is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/obsidian/output.ts` — Import ergänzen (nach `import { t } …`):
```ts
import { buildFilename, hasVersionPlaceholder, sanitizeFilename } from '../core/filename';
import type { FilenameValues } from '../core/filename';
```

`sanitizeBase` (`:15-17`) ersetzen durch:
```ts
// Delegat auf die eine Sanitisierungs-Regel des Repos (src/core/filename.ts) plus Paperize'
// Fallback-Konstante. Verhaltensgleich zur vorherigen lokalen Implementierung.
export function sanitizeBase(name: string): string {
  return sanitizeFilename(name) || 'Dokument';
}
```

Nach `resolveOutputPath` (also nach `:36`) einfügen:
```ts
// Löst den finalen Pfad auf und zählt dabei {version} hoch, bis der Pfad frei ist.
// Ohne {version} im Schema gibt es nichts zu zählen: ein Durchlauf, bestehende Datei wird
// überschrieben (Paperize' bisheriges Verhalten). Der hasVersionPlaceholder-Guard ist der
// Abbruch der Schleife — ohne ihn liefe sie endlos, weil der Name sich nie ändern würde.
export async function resolveVersionedOutputPath(
  app: App,
  mode: OutputMode,
  template: string,
  vars: Omit<FilenameValues, 'version'>,
  ctx: { noteDir: string; customFolder: string; attachmentPath: string },
): Promise<{ path: string | null; baseName: string }> {
  const counting = hasVersionPlaceholder(template);
  let version = 1;
  for (;;) {
    const baseName = buildFilename(template, { ...vars, version });
    const path = resolveOutputPath(mode, { ...ctx, baseName });
    // share: kein Vault-Ziel (.paperize-export wird vor jedem Export geleert).
    // attachmentFolder: getAvailablePathForAttachment hat Kollisionen bereits aufgelöst —
    // ein zweiter Zähler darüber ergäbe "Bericht v1 1.pdf". Obsidian gewinnt.
    if (!counting || path === null || mode === 'attachmentFolder') return { path, baseName };
    if (!(await app.vault.adapter.exists(path))) return { path, baseName };
    version++;
  }
}
```

`writePdf` (`:38-69`) — Signatur und Pfad-Nutzung ändern. Die Zeilen `:42` und `:62` ersetzen:
```ts
export async function writePdf(
  app: App,
  bytes: Uint8Array,
  mode: OutputMode,
  ctx: { baseName: string; resolvedPath: string | null; openAfter: boolean },
): Promise<{ savedPath: string | null }> {
```
und im Nicht-Share-Zweig (vormals `:62`):
```ts
  const path = ctx.resolvedPath!;
```
Der Rest von `writePdf` (share-Zweig, mkdir, writeBinary, Notice) bleibt unverändert.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/obsidian/output.test.ts`
Expected: PASS — die 6 neuen Tests **und** die bestehenden `resolveOutputPath`/`sanitizeBase`-Tests grün. Bleibt `sanitizeBase('a/b:c?') === 'a_b_c_'` grün, ist die Umstellung verhaltensgleich.

- [ ] **Step 5: Typecheck (main.ts bricht hier erwartbar)**

Run: `npx tsc --noEmit`
Expected: **FAIL** in `src/obsidian/main.ts:102-108` — der `writePdf`-Aufruf übergibt noch die alte ctx-Form. Das ist beabsichtigt und wird in Task 3 geschlossen. **Kein Commit vor Task 3** — die beiden Tasks teilen sich einen grünen Gate-Punkt.

- [ ] **Step 6: Weiter zu Task 3 (kein Commit)**

Task 2 und 3 werden zusammen committet, weil der Repo-Zustand dazwischen nicht typecheckt.

---

### Task 3: main.ts verdrahten + Settings-Felder + mergeSettings

**Files:**
- Create: `src/vendor/kit/settings.ts`
- Modify: `src/obsidian/settings.ts:9-28` (Interface), `:30-49` (Defaults)
- Modify: `src/obsidian/main.ts:2-11` (Imports), `:29-33` (todayStr → nowParts), `:48-51` (loadSettings), `:88-108` (exportFile), `:113-121` (attachmentPathFor)
- Test: `tests/obsidian/settings.test.ts` (erweitern)

**Interfaces:**
- Consumes: `resolveVersionedOutputPath`, `writePdf` (Task 2); `buildFilename`, `DEFAULT_FILENAME_TEMPLATE` (Task 1).
- Produces:
  - `PaperizeSettings` bekommt `filenameTemplate: string` und `uiCollapsed: Record<string, boolean>`.
  - `DEFAULT_SETTINGS.filenameTemplate = DEFAULT_FILENAME_TEMPLATE` (`'{title}'`), `DEFAULT_SETTINGS.uiCollapsed = {}`.
  - `export function mergeSettings<T extends object>(defaults: T, raw: unknown): T` in `src/vendor/kit/settings.ts`.

**Kontext für den Implementierer:** `mergeSettings` ist hier **nicht Kosmetik**. `main.ts:50` macht heute `Object.assign({}, DEFAULT_SETTINGS, data)` — mit `uiCollapsed` als verschachteltem Objekt teilt das Ergebnis sonst die Referenz mit `DEFAULT_SETTINGS`, und ein Sektions-Toggle würde die Defaults mutieren. UI-STANDARD §5 schreibt `mergeSettings` verbindlich vor.

Der Anhang-Pfad hat eine Zirkel-Falle: `attachmentPathFor` braucht den fertigen Dateinamen, der Dateiname bräuchte die Version, die Version kommt aus dem Pfad. Aufgelöst dadurch, dass `{version}` im Anhang-Modus wirkungslos ist (Task 2) — dort wird mit `version: 1` gebaut.

- [ ] **Step 1: Kit-Datei vendoren**

Run:
```bash
cp /Users/Shared/code/obsidian-plugins/obsidian-kit/src/pure/settings.ts src/vendor/kit/settings.ts
```
Dann als **erste Zeile** in `src/vendor/kit/settings.ts` einfügen:
```ts
// vendored from obsidian-kit#0.14.0, src/pure/settings.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
```

- [ ] **Step 2: Write the failing test**

An `tests/obsidian/settings.test.ts` anhängen (`DEFAULT_SETTINGS` ist bereits importiert):
```ts
import { mergeSettings } from '../../src/vendor/kit/settings';

describe('settings defaults', () => {
  it('defaults the filename scheme to the note title alone (today\'s behaviour)', () => {
    expect(DEFAULT_SETTINGS.filenameTemplate).toBe('{title}');
  });
  it('starts with no persisted section states', () => {
    expect(DEFAULT_SETTINGS.uiCollapsed).toEqual({});
  });
});

describe('mergeSettings over DEFAULT_SETTINGS', () => {
  it('fills in keys missing from stored data', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { marginMm: 30 });
    expect(merged.marginMm).toBe(30);
    expect(merged.filenameTemplate).toBe('{title}');
  });
  it('never shares the uiCollapsed reference with the defaults', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, null);
    merged.uiCollapsed.output = true;
    expect(DEFAULT_SETTINGS.uiCollapsed).toEqual({}); // Defaults unberuehrt
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/settings.test.ts`
Expected: FAIL — `expected undefined to be '{title}'`

- [ ] **Step 4: Settings-Felder ergänzen**

In `src/obsidian/settings.ts` — Import ergänzen:
```ts
import { DEFAULT_FILENAME_TEMPLATE } from '../core/filename';
```
Im Interface `PaperizeSettings` (nach `customFolder: string;`, `:21`):
```ts
  /** Dateiname-Schema, Platzhalter siehe src/core/filename.ts. */
  filenameTemplate: string;
  /** Auf-/Zu-Zustand der Settings-Sektionen, Key = SectionDef.key. */
  uiCollapsed: Record<string, boolean>;
```
In `DEFAULT_SETTINGS` (nach `customFolder: '',`, `:42`):
```ts
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  uiCollapsed: {},
```

- [ ] **Step 5: main.ts verdrahten**

In `src/obsidian/main.ts` — Imports ergänzen:
```ts
import { writePdf, resolveVersionedOutputPath } from './output';
import { buildFilename } from '../core/filename';
import { mergeSettings } from '../vendor/kit/settings';
```
(die bestehende Zeile `import { writePdf } from './output';` wird dadurch ersetzt)

`todayStr()` (`:29-33`) ersetzen durch:
```ts
// Lokale Datums-/Zeit-Teile für den laufenden Footer und das Dateiname-Schema.
// Obsidians globales `moment` ist hier bewusst nicht genutzt: obsidian.d.ts re-exportiert es
// via Namespace-Import (`import * as Moment from 'moment'`), wodurch TypeScript die
// Call-Signatur von `typeof Moment` entfernt — `moment()` ist unter der TS/obsidian-types-
// Kombination dieses Repos „not callable".
function nowParts(): { date: string; time: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}${pad(d.getMinutes())}`,
  };
}
```

`loadSettings` (`:48-51`) ersetzen durch:
```ts
  async loadSettings() {
    // mergeSettings statt Object.assign: klont Default-Werte eine Ebene tief, damit
    // settings.uiCollapsed nie die Referenz mit DEFAULT_SETTINGS teilt (UI-STANDARD §5).
    this.settings = mergeSettings(DEFAULT_SETTINGS, await this.loadData());
  }
```

In `exportFile` die Zeile `const dateStr = todayStr();` (`:88`) ersetzen durch:
```ts
    const { date: dateStr, time: timeStr } = nowParts();
```

Den Block `:100-108` (von `const attachmentPath = …` bis zum Ende des `writePdf`-Aufrufs) ersetzen durch:
```ts
    const noteDir = file.parent ? file.parent.path : '';
    const vars = {
      title: file.basename,
      date: dateStr,
      time: timeStr,
      folder: file.parent ? file.parent.name : '',
    };
    // Der Anhang-Pfad braucht den fertigen Dateinamen. {version} ist in diesem Modus
    // wirkungslos (Obsidian löst Kollisionen selbst auf) — daher version: 1, kein Zirkel.
    const attachmentPath = this.settings.outputMode === 'attachmentFolder'
      ? await this.attachmentPathFor(file, buildFilename(this.settings.filenameTemplate, { ...vars, version: 1 }))
      : '';
    const { path, baseName } = await resolveVersionedOutputPath(
      this.app,
      this.settings.outputMode,
      this.settings.filenameTemplate,
      vars,
      { noteDir: noteDir === '/' ? '' : noteDir, customFolder: this.settings.customFolder, attachmentPath },
    );
    await writePdf(this.app, bytes, this.settings.outputMode, {
      baseName,
      resolvedPath: path,
      openAfter: false,
    });
```

`attachmentPathFor` (`:113-121`) ersetzen durch:
```ts
  // Resolve the destination path Obsidian would use for an attachment named <baseName>.pdf.
  private async attachmentPathFor(file: TFile, baseName: string): Promise<string> {
    // getAvailablePathForAttachment is present at runtime but not in the public typings.
    const fm = this.app.fileManager as FileManagerExt;
    if (typeof fm.getAvailablePathForAttachment === 'function') {
      return normalizePath(await fm.getAvailablePathForAttachment(`${baseName}.pdf`, file.path));
    }
    return normalizePath(`${file.parent ? file.parent.path : ''}/${baseName}.pdf`);
  }
```

- [ ] **Step 6: Run the full gate**

Run: `npm run gate`
Expected: typecheck ✓ (der Task-2-Fehler ist geschlossen) · **70 Tests grün** (50 + 14 aus Task 1 + 6 aus Task 2, wobei `resolveOutputPath`/`sanitizeBase` unverändert grün bleiben) · check:pure ✓ · build ✓

- [ ] **Step 7: Commit (Task 2 + 3 gemeinsam)**

```bash
git add src/core/filename.ts src/obsidian/output.ts src/obsidian/main.ts src/obsidian/settings.ts src/vendor/kit/settings.ts tests/obsidian/output.test.ts tests/obsidian/settings.test.ts
git commit -m "$(cat <<'EOF'
feat(output): Dateiname-Schema verdrahtet, {version} zaehlt hoch

resolveVersionedOutputPath zaehlt {version} bis der Pfad frei ist;
ohne {version} im Schema ein Durchlauf mit Ueberschreiben (bisheriges
Verhalten, unveraendert). Im Anhang-Modus gewinnt Obsidians eigene
Kollisionsaufloesung.

sanitizeBase delegiert jetzt an core/filename.ts -> eine
Sanitisierungs-Regel im Repo; die bestehenden Tests bleiben gruen und
belegen die Verhaltensgleichheit.

mergeSettings vendored (Kit 0.14.0) ersetzt Object.assign: uiCollapsed
teilt sonst die Referenz mit DEFAULT_SETTINGS (UI-STANDARD Paragraf 5).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: collapsibleSection vendoren + CSS

**Files:**
- Create: `src/vendor/kit/collapsible.ts`
- Modify: `styles.css` (aktuell ein 53-Byte-Platzhalter)
- Test: `tests/vendor-smoke.test.ts` (erweitern)

**Interfaces:**
- Consumes: nichts.
- Produces (aus `src/vendor/kit/collapsible.ts`):
  - `export function collapsibleSection(containerEl: HTMLElement, opts: CollapsibleOptions): HTMLElement`
  - `export function resolveCollapsed(key: string | undefined, defaultCollapsed: boolean, storage?: CollapsibleStorage): boolean`
  - `export interface CollapsibleStorage { getCollapsed(key: string): boolean | undefined; setCollapsed(key: string, collapsed: boolean): void }`
  - `export interface CollapsibleOptions { title: string; defaultCollapsed?: boolean; key?: string; storage?: CollapsibleStorage }`
  - `export const COLLAPSIBLE_CSS: string`

**Kontext für den Implementierer:** Das Modul ist im Kit bereits getestet (`obsidian-kit/tests/collapsible.test.ts`, inkl. a11y und Toggle-Verhalten) — **nicht nachtesten**. Paperize prüft nur, dass der Import trägt; dafür gibt es `tests/vendor-smoke.test.ts`. Das Kit injiziert bewusst kein CSS, der Consumer übernimmt `COLLAPSIBLE_CSS` in seine `styles.css` (so macht es vault-rag in `styles.css:198-212`).

Dies ist paperize' **erstes** obsidian-gekoppeltes Vendor-Modul (bisher nur `i18n` + `pdf`, beide pure). `check:pure` verbietet `from 'obsidian'` in `src/vendor` — **prüfe das in Step 3**, bevor du weitermachst.

- [ ] **Step 1: Kit-Datei vendoren**

Run:
```bash
cp /Users/Shared/code/obsidian-plugins/obsidian-kit/src/obsidian/collapsible.ts src/vendor/kit/collapsible.ts
```
Dann als **erste Zeile** einfügen:
```ts
// vendored from obsidian-kit#0.14.0, src/obsidian/collapsible.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
```

- [ ] **Step 2: Write the failing test**

An `tests/vendor-smoke.test.ts` anhängen:
```ts
import { COLLAPSIBLE_CSS, resolveCollapsed } from '../src/vendor/kit/collapsible';

describe('vendored collapsible', () => {
  it('resolves a stored state over the default', () => {
    const storage = { getCollapsed: () => false, setCollapsed: () => {} };
    expect(resolveCollapsed('output', true, storage)).toBe(false);
  });
  it('falls back to the default without a stored value', () => {
    const storage = { getCollapsed: () => undefined, setCollapsed: () => {} };
    expect(resolveCollapsed('output', false, storage)).toBe(false);
  });
  it('ships CSS built only from theme variables', () => {
    expect(COLLAPSIBLE_CSS).toContain('.okit-collapsible-body.is-collapsed');
    expect(COLLAPSIBLE_CSS).not.toMatch(/#[0-9a-f]{3,6}\b/i); // keine Farb-Literale
    expect(COLLAPSIBLE_CSS).not.toContain('!important');
  });
});
```
Falls `tests/vendor-smoke.test.ts` `describe`/`it`/`expect` noch nicht importiert, oben ergänzen: `import { describe, it, expect } from 'vitest';`

- [ ] **Step 3: Run test + check:pure**

Run: `npx vitest run tests/vendor-smoke.test.ts && npm run check:pure`
Expected: Tests PASS.
**`check:pure` schlägt FEHL** — `collapsible.ts` importiert `setIcon` aus `'obsidian'`, und `check:pure` grept über `src/core src/vendor`. Das ist der erwartete Konflikt.

- [ ] **Step 4: check:pure auf die pure Vendor-Teilmenge einschränken**

Das Skript prüft heute `src/core src/vendor` pauschal. `src/vendor/kit/collapsible.ts` ist ein **obsidian-gekoppeltes** Kit-Modul und darf importieren — die Grenze verläuft nicht bei „vendored", sondern bei „pure".

In `package.json` das `check:pure`-Skript ersetzen:
```json
"check:pure": "! grep -rl \"from 'obsidian'\" src/core src/vendor --exclude=collapsible.ts"
```
Und in `AGENTS.md` unter den Architektur-Abschnitt (bei der `check:pure`-Erwähnung) diesen Absatz ergänzen:
```markdown
**Ausnahme `src/vendor/kit/collapsible.ts`:** Das Kit hat zwei Schichten (`src/pure` und
`src/obsidian`). `collapsible.ts` stammt aus der obsidian-Schicht und importiert `setIcon` —
es ist von `check:pure` ausgenommen. Die Grenze verläuft bei „pure", nicht bei „vendored";
alle übrigen Vendor-Module (`i18n`, `pdf`, `settings`) sind pure und bleiben geprüft.
```

- [ ] **Step 5: CSS übernehmen**

`styles.css` komplett ersetzen durch:
```css
/* Paperize — styles */

/* Einklappbare Settings-Sektionen. Uebernommen aus obsidian-kit COLLAPSIBLE_CSS
   (das Kit injiziert bewusst kein CSS selbst). Nur Theme-Variablen. */
.okit-collapsible-header {
  display: flex; align-items: center; gap: var(--size-4-2);
  cursor: pointer; padding: var(--size-4-2) 0;
  font-weight: var(--font-semibold); color: var(--text-normal);
  border-bottom: 1px solid var(--background-modifier-border);
}
.okit-collapsible-header:hover { color: var(--text-accent); }
.okit-collapsible-header:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: 2px;
  border-radius: var(--radius-s);
}
.okit-collapsible-chevron { display: inline-flex; color: var(--text-muted); }
.okit-collapsible-body { padding-top: var(--size-4-2); }
.okit-collapsible-body.is-collapsed { display: none; }
```

- [ ] **Step 6: Run the full gate**

Run: `npm run gate`
Expected: typecheck ✓ · **73 Tests grün** (70 + 3) · check:pure ✓ (Ausnahme greift) · build ✓

- [ ] **Step 7: Commit**

```bash
git add src/vendor/kit/collapsible.ts styles.css tests/vendor-smoke.test.ts package.json AGENTS.md
git commit -m "$(cat <<'EOF'
feat(settings): collapsibleSection aus dem Kit vendored

Erstes obsidian-gekoppeltes Vendor-Modul in diesem Repo. check:pure
prueft bisher pauschal src/vendor - die Grenze verlaeuft aber bei
"pure", nicht bei "vendored": collapsible.ts stammt aus der
obsidian-Schicht des Kits und importiert setIcon. Ausnahme im Skript
+ Begruendung in AGENTS.md.

COLLAPSIBLE_CSS in styles.css uebernommen (das Kit injiziert bewusst
kein CSS). Toggle/a11y sind Kit-seitig getestet, hier nur Smoke.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Sektions-Tabelle + i18n-Keys

**Files:**
- Modify: `src/obsidian/settings.ts` (SECTIONS ergänzen, oberhalb der Klasse)
- Modify: `src/i18n/strings.ts:20-50` (EN), `:64-94` (DE)
- Test: `tests/obsidian/settings.test.ts` (erweitern)

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `export interface SectionDef { key: string; titleKey: string; defaultCollapsed: boolean }`
  - `export const SECTIONS: SectionDef[]` — genau 5 Einträge in Render-Reihenfolge.

**Kontext für den Implementierer:** Die Sektions-Zuordnung ist **Daten, keine UI** — deshalb eine pure exportierte Tabelle statt einer Konstante innerhalb von `display()`. UI-STANDARD §6 verlangt „UI-Logik als pure `State → ViewModel` neben der View"; hier ist die Tabelle das ViewModel und ohne DOM testbar. `display()` (Task 6) liest daraus Titel und Default-Zustand.

`t()` interpoliert **nur** `{0}`, `{1}` … (reine Ziffern, `src/vendor/kit/i18n.ts:28`). Literale Platzhalter wie `{title}` im Hilfetext bleiben unangetastet — das ist geprüft, nicht angenommen.

- [ ] **Step 1: Write the failing test**

An `tests/obsidian/settings.test.ts` anhängen:
```ts
import { SECTIONS } from '../../src/obsidian/settings';
import { EN, DE } from '../../src/i18n/strings';

describe('SECTIONS', () => {
  it('lists the five sections in render order, output first', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(['output', 'page', 'type', 'content', 'pagination']);
  });
  it('opens only the output section by default', () => {
    // Das ist der Kern dieses Zyklus: das Ausgabeziel war unauffindbar.
    const open = SECTIONS.filter((s) => !s.defaultCollapsed).map((s) => s.key);
    expect(open).toEqual(['output']);
  });
  it('uses unique keys (they are the persistence keys)', () => {
    expect(new Set(SECTIONS.map((s) => s.key)).size).toBe(SECTIONS.length);
  });
  it('has a translated title for every section in both languages', () => {
    for (const s of SECTIONS) {
      expect(EN[s.titleKey], `EN missing ${s.titleKey}`).toBeTruthy();
      expect(DE[s.titleKey], `DE missing ${s.titleKey}`).toBeTruthy();
    }
  });
});

describe('filename scheme help text', () => {
  it('shows the placeholders literally — t() only interpolates {0}, {1}, …', () => {
    expect(EN['settings.filename.desc']).toContain('{title}');
    expect(DE['settings.filename.desc']).toContain('{version}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/settings.test.ts`
Expected: FAIL — `SECTIONS` ist kein Export von `src/obsidian/settings`

- [ ] **Step 3: SECTIONS ergänzen**

In `src/obsidian/settings.ts`, direkt vor `export class PaperizeSettingTab` (`:73`):
```ts
/** Eine Settings-Sektion: sichtbarer Titel (i18n-Key), Persistenz-Key, Startzustand.
 *  Reihenfolge = Render-Reihenfolge. Pure Daten, damit ohne DOM testbar (UI-STANDARD §6). */
export interface SectionDef {
  key: string;
  titleKey: string;
  defaultCollapsed: boolean;
}

/** „Ausgabe" startet als einzige offen: das Ausgabeziel existierte schon, war in der flachen
 *  17-Settings-Liste aber unauffindbar. Danach gewinnt der persistierte User-Zustand. */
export const SECTIONS: SectionDef[] = [
  { key: 'output', titleKey: 'settings.section.output', defaultCollapsed: false },
  { key: 'page', titleKey: 'settings.section.page', defaultCollapsed: true },
  { key: 'type', titleKey: 'settings.section.type', defaultCollapsed: true },
  { key: 'content', titleKey: 'settings.section.content', defaultCollapsed: true },
  { key: 'pagination', titleKey: 'settings.section.pagination', defaultCollapsed: true },
];
```

- [ ] **Step 4: i18n-Keys ergänzen**

In `src/i18n/strings.ts`, im **EN**-Dict nach `// settings` (`:20`):
```ts
  // settings — sections
  "settings.section.output": "Output",
  "settings.section.page": "Page",
  "settings.section.type": "Typography",
  "settings.section.content": "Content",
  "settings.section.pagination": "Pagination",

  // settings — filename scheme
  "settings.filename.name": "Filename scheme",
  "settings.filename.desc": "Placeholders: {title} {date} {time} {folder} {version}. Empty = {title} (the note's name). {version} counts up (1, 2, 3 …) instead of overwriting an existing PDF — it has no effect in the attachment-folder mode, where Obsidian resolves collisions itself.",

  // settings — typography
  "settings.lineHeight.name": "Line height",
  "settings.lineHeight.desc": "Multiple of the font size. 1.45 = comfortable reading.",
  "settings.imageWidth.name": "Maximum image width (%)",
  "settings.imageWidth.desc": "Share of the text width an image may occupy at most.",
```
Im **DE**-Dict an gleicher Stelle (`:64`):
```ts
  // settings — sections
  "settings.section.output": "Ausgabe",
  "settings.section.page": "Seite",
  "settings.section.type": "Typografie",
  "settings.section.content": "Inhalt",
  "settings.section.pagination": "Umbruch",

  // settings — filename scheme
  "settings.filename.name": "Dateiname-Schema",
  "settings.filename.desc": "Platzhalter: {title} {date} {time} {folder} {version}. Leer = {title} (Name der Notiz). {version} zählt hoch (1, 2, 3 …), statt eine vorhandene PDF zu überschreiben — im Anhangordner-Modus wirkungslos, dort löst Obsidian Kollisionen selbst auf.",

  // settings — typography
  "settings.lineHeight.name": "Zeilenabstand",
  "settings.lineHeight.desc": "Vielfaches der Schriftgröße. 1,45 = komfortabel lesbar.",
  "settings.imageWidth.name": "Maximale Bildbreite (%)",
  "settings.imageWidth.desc": "Anteil der Textbreite, den ein Bild höchstens einnehmen darf.",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/obsidian/settings.test.ts tests/obsidian/i18n.test.ts`
Expected: PASS — insbesondere `i18n.test.ts` (EN/DE-Key-Gleichheit) muss grün bleiben; ein Key nur in einem Dict lässt sie fehlschlagen.

- [ ] **Step 6: Run the full gate**

Run: `npm run gate`
Expected: typecheck ✓ · **78 Tests grün** (73 + 5) · check:pure ✓ · build ✓

- [ ] **Step 7: Commit**

```bash
git add src/obsidian/settings.ts src/i18n/strings.ts tests/obsidian/settings.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): Sektions-Tabelle + i18n fuer Sektionen/Schema

SECTIONS als pure Datentabelle statt Konstante in display() - damit
ohne DOM testbar (UI-STANDARD Paragraf 6). "Ausgabe" ist die einzige
offene Sektion; genau die Auffindbarkeit war das Problem.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: display() umbauen + die drei neuen Kontrollen

**Files:**
- Modify: `src/obsidian/settings.ts:77-124` (`display()` komplett)
- Modify: `/Users/Shared/code/obsidian-plugins/REGISTRY.md` (Zeile mit `filename.ts`)
- Modify: `README.md` und `README.de.md` (Settings-Abschnitt)

**Interfaces:**
- Consumes: `SECTIONS`, `SectionDef` (Task 5); `collapsibleSection`, `CollapsibleStorage` (Task 4); `filenameTemplate`, `uiCollapsed` in `PaperizeSettings` (Task 3).
- Produces: nichts für spätere Tasks (letzte Task).

**Kontext für den Implementierer:** `display()` wird nicht unit-getestet — der Obsidian-Mock des Repos ist minimal (`tests/__mocks__/obsidian.ts`: `Setting` ist eine leere Klasse), und `tests/obsidian/settings.test.ts` testet auch heute nur `settingsToOptions`. Einen 676-Zeilen-Mock aus dem Kit zu vendoren wäre ein eigener Zyklus. Getestet ist stattdessen, was Bugs birgt: die pure `SECTIONS`-Tabelle (Task 5) und `resolveCollapsed` (Kit). Die DOM-Verdrahtung geht in die Geräte-Abnahme.

Die Settings-Reihenfolge **innerhalb** einer Sektion bleibt wie gehabt; es wird nichts umbenannt. Neu sind nur drei Kontrollen: Dateiname-Schema (Ausgabe), Zeilenabstand und max. Bildbreite (Typografie).

**Nicht anfassen:** Die stillschweigend verworfenen Zahlen-Eingaben (ungültiger Wert → kein Feedback) bleiben, wie sie sind. Der Spec nennt das ausdrücklich als eigenen Scope.

- [ ] **Step 1: Imports ergänzen**

In `src/obsidian/settings.ts`:
```ts
import { collapsibleSection } from '../vendor/kit/collapsible';
import type { CollapsibleStorage } from '../vendor/kit/collapsible';
```

- [ ] **Step 2: display() ersetzen**

`display()` (`:77-124`) vollständig ersetzen durch:
```ts
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();

    // Auf-/Zu-Zustand landet in den Plugin-Settings; undefined = noch nie geklickt,
    // dann greift SectionDef.defaultCollapsed.
    const storage: CollapsibleStorage = {
      getCollapsed: (key) => (key in s.uiCollapsed ? s.uiCollapsed[key] : undefined),
      setCollapsed: (key, collapsed) => { s.uiCollapsed[key] = collapsed; void save(); },
    };
    const section = (key: string): HTMLElement => {
      const def = SECTIONS.find((d) => d.key === key);
      if (!def) throw new Error(`unknown section: ${key}`);
      return collapsibleSection(containerEl, {
        title: t(def.titleKey),
        key: def.key,
        defaultCollapsed: def.defaultCollapsed,
        storage,
      });
    };

    // — Ausgabe (offen: hier steht das Ausgabeziel) —
    const output = section('output');
    new Setting(output).setName(t('settings.output.name')).addDropdown((d) => d.addOptions({
      nextToNote: t('settings.output.nextToNote'), attachmentFolder: t('settings.output.attachmentFolder'), customFolder: t('settings.output.customFolder'), share: t('settings.output.share'),
    }).setValue(s.outputMode).onChange(async (v) => { s.outputMode = v as OutputMode; await save(); }));
    new Setting(output).setName(t('settings.customFolder.name')).setDesc(t('settings.customFolder.desc'))
      .addText((txt) => txt.setValue(s.customFolder).onChange(async (v) => { s.customFolder = v.trim(); await save(); }));
    new Setting(output).setName(t('settings.filename.name')).setDesc(t('settings.filename.desc'))
      .addText((txt) => txt.setPlaceholder(DEFAULT_FILENAME_TEMPLATE).setValue(s.filenameTemplate)
        // Leereingabe → Default, damit nie ein leeres Schema persistiert wird.
        .onChange(async (v) => { s.filenameTemplate = v.trim() || DEFAULT_FILENAME_TEMPLATE; await save(); }));

    // — Seite —
    const page = section('page');
    new Setting(page).setName(t('settings.pageSize.name')).addDropdown((d) => d.addOptions({ A4: 'A4', Letter: 'Letter' })
      .setValue(s.pageSize).onChange(async (v) => { s.pageSize = v as 'A4' | 'Letter'; await save(); }));
    // Lower bound is 12mm, not the engine's theoretical minimum: below ~11mm bottom margin the
    // fixed-offset footer/page-number draws fall off the page. Proper fix is an engine-side
    // clamp upstream in the kit (src/vendor/kit/pdf/*); this is a plugin-side guard rail.
    new Setting(page).setName(t('settings.margins.name')).addText((txt) => txt.setValue(String(s.marginMm))
      .onChange(async (v) => { const n = Number(v); if (n >= 12 && n <= 50) { s.marginMm = n; await save(); } }));

    // — Typografie —
    const type = section('type');
    new Setting(type).setName(t('settings.font.name')).setDesc(t('settings.font.desc'))
      .addDropdown((d) => d.addOptions({ sans: 'Sans (Helvetica)', serif: 'Serif (Times)', mono: 'Mono (Courier)' })
        .setValue(s.fontChoice).onChange(async (v) => { s.fontChoice = v as FontChoice; await save(); }));
    new Setting(type).setName(t('settings.fontSize.name')).addText((txt) => txt.setValue(String(s.baseSizePt))
      .onChange(async (v) => { const n = Number(v); if (n >= 6 && n <= 24) { s.baseSizePt = n; await save(); } }));
    new Setting(type).setName(t('settings.lineHeight.name')).setDesc(t('settings.lineHeight.desc'))
      .addSlider((sl) => sl.setLimits(1.0, 2.0, 0.05).setValue(s.lineHeight).setDynamicTooltip()
        .onChange(async (v) => { s.lineHeight = v; await save(); }));
    new Setting(type).setName(t('settings.imageWidth.name')).setDesc(t('settings.imageWidth.desc'))
      .addSlider((sl) => sl.setLimits(25, 100, 5).setValue(s.imageMaxWidthPct).setDynamicTooltip()
        .onChange(async (v) => { s.imageMaxWidthPct = v; await save(); }));

    // — Inhalt —
    const content = section('content');
    new Setting(content).setName(t('settings.title.name')).addToggle((tg) => tg.setValue(s.showTitle)
      .onChange(async (v) => { s.showTitle = v; await save(); }));
    new Setting(content).setName(t('settings.frontmatter.name')).setDesc(t('settings.frontmatter.desc'))
      .addToggle((tg) => tg.setValue(s.showFrontmatter)
        .onChange(async (v) => { s.showFrontmatter = v; await save(); }));
    new Setting(content).setName(t('settings.pageNumbers.name')).addToggle((tg) => tg.setValue(s.pageNumbers)
      .onChange(async (v) => { s.pageNumbers = v; await save(); }));
    new Setting(content).setName(t('settings.footer.name')).addToggle((tg) => tg.setValue(s.runningHeaderFooter)
      .onChange(async (v) => { s.runningHeaderFooter = v; await save(); }));

    // — Umbruch —
    const pagination = section('pagination');
    new Setting(pagination).setName(t('settings.pagebreak.name')).setDesc(t('settings.pagebreak.desc'))
      .addText((txt) => txt.setValue(s.pageBreakMarker).onChange(async (v) => { s.pageBreakMarker = v; await save(); }));
    new Setting(pagination).setName(t('settings.keepTables.name')).setDesc(t('settings.keepTables.desc'))
      .addToggle((tg) => tg.setValue(s.keepTablesTogether).onChange(async (v) => { s.keepTablesTogether = v; await save(); }));
    new Setting(pagination).setName(t('settings.repeatHeader.name')).setDesc(t('settings.repeatHeader.desc'))
      .addToggle((tg) => tg.setValue(s.repeatTableHeader).onChange(async (v) => { s.repeatTableHeader = v; await save(); }));
    new Setting(pagination).setName(t('settings.keepImages.name')).setDesc(t('settings.keepImages.desc'))
      .addToggle((tg) => tg.setValue(s.keepImagesTogether).onChange(async (v) => { s.keepImagesTogether = v; await save(); }));
    new Setting(pagination).setName(t('settings.keepCode.name')).setDesc(t('settings.keepCode.desc'))
      .addToggle((tg) => tg.setValue(s.keepCodeTogether).onChange(async (v) => { s.keepCodeTogether = v; await save(); }));
    new Setting(pagination).setName(t('settings.orphan.name')).setDesc(t('settings.orphan.desc'))
      .addText((txt) => txt.setValue(String(s.headingKeepWithLines))
        .onChange(async (v) => { const n = Number(v); if (Number.isInteger(n) && n >= 0 && n <= 10) { s.headingKeepWithLines = n; await save(); } }));
  }
```

- [ ] **Step 3: Run the full gate**

Run: `npm run gate`
Expected: typecheck ✓ · **78 Tests grün** (unverändert — `display()` hat keine Unit-Tests) · check:pure ✓ · build ✓

Falls der Typecheck bei `addSlider` scheitert: `SliderComponent` existiert in den Obsidian-Typings; prüfe, dass `setLimits(min, max, step)` und `setDynamicTooltip()` verkettet werden (beide geben `this` zurück).

- [ ] **Step 4: REGISTRY-Zeile aktualisieren**

In `/Users/Shared/code/obsidian-plugins/REGISTRY.md` die Zeile zu yijing-oracles `filename.ts` (Zeile ~56, erkennbar an „Muster-Referenz (erstes Exemplar; pure, TDD — bei 2. note-erzeugendem Plugin Kit-Bewertung)") auf den neuen Stand heben:
```markdown
  [Dateien / Naming] Konfigurierbares Dateinamen-Schema aus einem Template ({date}/{title}/…) auflösen + sanitisieren → `yijing-oracle/src/core/filename.ts` · `obsidian-paperize/src/core/filename.ts` → `buildFilename`/`sanitizeFilename` (Kit-Kandidat (n=2, 2026-07-16; Engine gemeinsam, Platzhalter-Sets disjunkt — Regel-der-Drei abwarten))
```

- [ ] **Step 5: README EN + DE aktualisieren**

Beide READMEs beschreiben die Settings. Ergänze im jeweiligen Settings-Abschnitt das Dateiname-Schema — **EN und DE sind Pflicht** (AGENTS.md:85-86).

`README.md`:
```markdown
**Filename scheme** — placeholders `{title}` `{date}` `{time}` `{folder}` `{version}`.
Default `{title}` (the note's name). Adding `{version}` counts exports up (1, 2, 3 …) instead
of overwriting the previous PDF; it has no effect in the attachment-folder mode, where Obsidian
resolves collisions itself.
```

`README.de.md`:
```markdown
**Dateiname-Schema** — Platzhalter `{title}` `{date}` `{time}` `{folder}` `{version}`.
Standard `{title}` (Name der Notiz). Mit `{version}` zählen Exporte hoch (1, 2, 3 …), statt die
vorherige PDF zu überschreiben; im Anhangordner-Modus wirkungslos, dort löst Obsidian
Kollisionen selbst auf.
```

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/settings.ts README.md README.de.md
git commit -m "$(cat <<'EOF'
feat(settings): fuenf einklappbare Sektionen + drei neue Kontrollen

display() rendert statt einer flachen 17-Settings-Kette fuenf
Sektionen; "Ausgabe" startet offen und enthaelt das Ausgabeziel, das
vorher zwar existierte, aber unauffindbar war.

Neu bedienbar: Dateiname-Schema (Ausgabe) sowie Zeilenabstand und
maximale Bildbreite (Typografie) - letztere beiden existierten im
Interface und in den Defaults, hatten aber nie eine UI und waren nur
ueber data.json erreichbar.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: REGISTRY separat committen (anderes Repo-Verzeichnis)**

```bash
cd /Users/Shared/code/obsidian-plugins
git add REGISTRY.md
git commit -m "$(cat <<'EOF'
docs(registry): filename.ts auf Kit-Kandidat (n=2)

obsidian-paperize ist das zweite Exemplar. Engine gemeinsam, aber die
Platzhalter-Sets sind disjunkt ({hexpair} vs {folder}/{version}) -
Regel-der-Drei abwarten statt die Grenzen aus zwei Consumern raten.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
Falls `/Users/Shared/code/obsidian-plugins` kein eigenes Git-Repo ist (prüfe mit `git -C /Users/Shared/code/obsidian-plugins rev-parse --show-toplevel`), entfällt dieser Commit — dann die Änderung nur speichern und im Abschlussbericht erwähnen.

---

## Abnahme (nach Task 6)

Die DOM-Verdrahtung von `display()` ist bewusst nicht unit-getestet — sie braucht Jays Blick:

1. `npm run deploy` (kopiert nach `$OBSIDIAN_PLUGIN_DIR`), dann Obsidian **neu laden**.
   **Wichtig:** Erst den Reload verifizieren, bevor ein gemeldeter Fehler untersucht wird — ein
   stale build hat in image-to-markdown 0.13.0 schon einmal einen Phantom-Bug vorgetäuscht
   (aktive LESSONS-Regel).
2. Settings öffnen → **„Ausgabe" ist offen**, die vier übrigen Sektionen zu.
3. Eine Sektion auf-/zuklappen, Settings schließen und neu öffnen → Zustand ist erhalten.
4. Schema auf `{date} {title}` setzen → Export heißt `2026-07-16 Notiz.pdf`.
5. Schema auf `{title} v{version}` setzen → zweimal exportieren → `Notiz v1.pdf` **und** `Notiz v2.pdf` existieren beide.
6. Schema leeren → Feld zeigt den Platzhalter `{title}`, Export heißt wie die Notiz.
7. Zeilenabstand-Slider bewegen → PDF ändert den Zeilenabstand sichtbar.
