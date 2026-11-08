/**
 * Druck-Matrix — misst den Desktop-Druckweg (Chromium, `<webview>.printToPDF`) gegen ein
 * **laufendes** Obsidian: Field Report dunkel und hell, Obsidian-Standard dunkel, je Profil
 * Bildschirm und Papier. Der Prüfgegenstand ist das erzeugte PDF, ausgewertet am Host mit
 * Poppler (`pdftotext`, `pdffonts`, `pdfinfo`, `pdftoppm`). Der Vektor-Smoke (`gui-smoke.ts`)
 * liest `(…) Tj` im Klartext und kann Chromium-PDFs nicht lesen.
 *
 * Pro Arm startet der Treiber **eine eigene Zweitinstanz** (frisches Profil, eigener Port), denn
 * Thema und Modus stehen vor dem Start in `appearance.json`; `app.setTheme` schaltete in der
 * Machbarkeitsmessung nicht um. Gegengelesen wird am `body` (`theme-dark`/`theme-light`) und an
 * `app.customCss.theme`; stimmt es nicht, ist der Arm „nichts gemessen“, nicht grün.
 *
 * ```bash
 * npm run build
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label obsidian-paperize --intent "Druck-Matrix" \
 *   --exclusive focus --port 9556 --ttl 900 --warten 540 > /dev/null && npm run smoke:print -- --port 9556
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release --port 9556
 * ```
 *
 * Weitere Schalter: `--arm fr-dark|fr-light|std-dark` (ein Arm), `--gegenprobe` (siehe unten),
 * `--out <Ordner>` (Standard: Temp-Ordner), `--pdf <Datei> [--ref <rgb>]` (nur auswerten, ohne Obsidian:
 * Kalibrierung der Auswertung an bekannten PDFs, CORE-TEST-12).
 *
 * `--gegenprobe`: Der Lauf fährt gegen einen Build, dessen Rücksetzung `contain: initial` fehlt
 * (Rückbau und sha1-Vergleich macht der Aufrufer, `.claude/rules/gui-smoke-gegenprobe.md`). Erwartet:
 * kein brauchbares Druck-PDF, der Rückfall läuft und die Notice steht. Grün heißt hier: der Defekt wurde bemerkt.
 *
 * Messgrößen (Plan Task 6, Spec § 9): M1 Marker im Text, M2 Schwelle des leeren PDFs, M3 Schriften
 * eingebettet, M4 Eckpixel der Seite, M6 Tintendeckung Papier. Nicht gemessen: M5 Kontrast, M7 bis M12
 * (Task 8). Tintendeckung = mittlere Dunkelheit über alle Seiten bei 40 dpi (siehe `tintendeckung`).
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cwd } from 'node:process';

import { createBilanz, parseArgs, runDriver } from '../../tools/obsidian-cdp/bilanz.js';
import { Cdp, attachTo, bereiteInstanzVor, clearNotices, closeExtraLeaves, notices, openExisting, pollUntil, requireVisible } from '../../tools/obsidian-cdp/cdp.js';
import { zweitinstanzStartargumente } from '../../tools/obsidian-cdp/instanz.js';
import { buildVault, requireEigenerBuild, stagingVaultDir } from '../../tools/obsidian-cdp/vault.js';
import { beendeZweitinstanz, starteZweitinstanz } from '../../tools/obsidian-cdp/zweitinstanz.js';

const REPO_NAME = 'obsidian-paperize';
const PLUGIN_ID = 'paperize';
const REPO_ROOT = cwd();
const FIXTURE_DIR = join(REPO_ROOT, 'fixtures/vault');
const THEME_DIR = join(REPO_ROOT, '../obsidian-themes/field-report');

type Profil = 'paper' | 'screen';
interface Arm { id: string; theme: string; modus: 'obsidian' | 'moonstone'; label: string }

/** `obsidian` ist der dunkle, `moonstone` der helle Modus (appearance.json `theme`). */
const ARME: Arm[] = [
  { id: 'fr-dark', theme: 'field-report', modus: 'obsidian', label: 'Field Report dunkel' },
  { id: 'fr-light', theme: 'field-report', modus: 'moonstone', label: 'Field Report hell' },
  { id: 'std-dark', theme: '', modus: 'obsidian', label: 'Standard dunkel' },
];
const PROFILE: Profil[] = ['paper', 'screen'];

/** Marker der Musternotiz (`fixtures/vault/notes/Muster.md`), Groß-/Kleinschreibung egal (Themes setzen Versalien). */
const MARKER = ['MARK-H1', 'MARK-H2', 'MARK-INFO', 'MARK-WARN', 'MARK-TIP', 'MARK-H2B', 'MARK-KNOTEN', 'MARK-H2C', 'MARK-ZELLE', 'MARK-H2D', 'mark_code'];
const EMPTY_PDF_MAX_BYTES = 4096;
const INK_MAX_PAPER = 0.08;
const RENDER_FRIST_MS = 60_000;

/* ------------------------------------------------------------- Auswertung */

interface Schrift { name: string; emb: boolean }
interface Ppm { w: number; h: number; data: Buffer }
export interface PdfBefund {
  bytes: number;
  seiten: number;
  producer: string;
  text: string;
  schriften: Schrift[];
  eckpixel: [number, number, number] | null;
  tinte: number | null;
}

function werkzeug(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function leseSchriften(ausgabe: string): Schrift[] {
  const out: Schrift[] = [];
  for (const zeile of ausgabe.split('\n').slice(2)) {
    const m = /^(\S+)\s.*?\s(yes|no)\s+(?:yes|no)\s+(?:yes|no)\s+\d+\s+\d+\s*$/.exec(zeile);
    if (m && m[1] !== undefined && m[2] !== undefined) out.push({ name: m[1], emb: m[2] === 'yes' });
  }
  return out;
}

export function leseSeiten(ausgabe: string): number {
  const m = /^Pages:\s+(\d+)/m.exec(ausgabe);
  return m && m[1] !== undefined ? Number(m[1]) : 0;
}

/** Binäres PPM (P6, 8 Bit), wie `pdftoppm` es standardmäßig schreibt. */
export function leseP6(buf: Buffer): Ppm {
  let pos = 0;
  const wort = (): string => {
    while (/\s/.test(String.fromCharCode(buf[pos] ?? 0))) pos++;
    const start = pos;
    while (pos < buf.length && !/\s/.test(String.fromCharCode(buf[pos] ?? 0))) pos++;
    return buf.toString('latin1', start, pos);
  };
  if (wort() !== 'P6') throw new Error('kein P6-PPM');
  const w = Number(wort());
  const h = Number(wort());
  if (wort() !== '255') throw new Error('PPM nicht 8 Bit');
  pos += 1;
  return { w, h, data: buf.subarray(pos, pos + w * h * 3) };
}

export function luminanz(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Tintendeckung = mittlere Dunkelheit (1 − Luminanz/255) über alle Pixel aller Seiten. Auflösungsstabil:
 *  ein Schwellenanteil (Pixel unter Luminanz 230) lag an der Muster-PDF bei 40 dpi auf 12,6 %, bei 150 dpi auf 7,7 %,
 *  die mittlere Dunkelheit bei 4,7 bis 5,0 % (Kalibrierung 2026-11-08). */
export function tintendeckung(seiten: Ppm[]): number {
  let dunkel = 0;
  let alle = 0;
  for (const s of seiten) {
    for (let i = 0; i + 2 < s.data.length; i += 3) {
      dunkel += 1 - luminanz(s.data[i] ?? 0, s.data[i + 1] ?? 0, s.data[i + 2] ?? 0) / 255;
      alle++;
    }
  }
  return alle === 0 ? 0 : dunkel / alle;
}

export function werteAus(pdf: string): PdfBefund {
  const bytes = readFileSync(pdf);
  const info = werkzeug('pdfinfo', [pdf]);
  const dir = mkdtempSync(join(tmpdir(), 'paperize-ppm-'));
  try {
    werkzeug('pdftoppm', ['-r', '40', pdf, join(dir, 's')]);
    const seiten = readdirSync(dir).filter((f) => f.endsWith('.ppm')).sort().map((f) => leseP6(readFileSync(join(dir, f))));
    const erste = seiten[0];
    const ecke: [number, number, number] | null = erste && erste.data.length >= 3
      ? [erste.data[0] ?? 0, erste.data[1] ?? 0, erste.data[2] ?? 0]
      : null;
    return {
      bytes: bytes.length,
      seiten: leseSeiten(info),
      producer: /^Producer:\s*(.*)$/m.exec(info)?.[1]?.trim() ?? '',
      text: werkzeug('pdftotext', ['-layout', pdf, '-']),
      schriften: leseSchriften(werkzeug('pdffonts', [pdf])),
      eckpixel: ecke,
      tinte: seiten.length ? tintendeckung(seiten) : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function fehlendeMarker(text: string): string[] {
  const klein = text.toLowerCase();
  return MARKER.filter((m) => !klein.includes(m.toLowerCase()));
}

export function nahe(a: readonly number[], b: readonly number[], tol: number): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - (b[i] ?? 0)) <= tol);
}

/* ------------------------------------------------------------------ Punkte */

const punktName = (arm: Arm, profil: Profil, m: string): string => `${arm.id}/${profil} ${m}`;
const M1 = 'M1 alle Marker im Text';
const M3 = 'M3 Schriften eingebettet';
const M4 = 'M4 Eckpixel der Seite';
const M6 = 'M6 Tintendeckung';
const WEG = 'Weg: Desktop-Druck ohne Rückfall';
const M2 = 'M2 Ein-Wort-Notiz über der Schwelle, kein Rückfall';
const FEHLER = 'Mermaid-Fehler: PDF mit Fehlerkasten, kein Rückfall';
const GEGEN = 'G Gegenprobe: ohne contain-Rücksetzung kein Druck-PDF, Rückfall mit Notice';

function sollListe(arme: Arm[], gegenprobe: boolean): string[] {
  if (gegenprobe) return [GEGEN];
  const out: string[] = [];
  for (const a of arme) {
    out.push(`${a.id} Aufbau: Thema und Modus stehen`);
    for (const p of PROFILE) {
      out.push(punktName(a, p, WEG), punktName(a, p, M1), punktName(a, p, M3), punktName(a, p, M4));
      if (p === 'paper') out.push(punktName(a, p, M6));
    }
  }
  if (arme[0]) out.push(`${arme[0].id} ${M2}`, `${arme[0].id} ${FEHLER}`);
  return out;
}

/* ------------------------------------------------------------- Instanz/Export */

interface Lauf { pdf: string; dauerMs: number; notices: string; konsole: string[] }

const FALLBACK_NOTICE = /plain style|einfachen Stil/i;

async function exportiere(cdp: Cdp, vaultDir: string, notiz: string, profil: Profil, konsole: string[]): Promise<Lauf> {
  const pdf = join(vaultDir, notiz.replace(/\.md$/, '.pdf'));
  rmSync(pdf, { force: true });
  konsole.length = 0;
  await clearNotices(cdp);
  if (!(await openExisting(cdp, notiz, 'preview'))) throw new Error(`Notiz ließ sich nicht öffnen: ${notiz}`);
  await closeExtraLeaves(cdp);
  const t0 = Date.now();
  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    window.__pzDone = null;
    p.exportActive(${JSON.stringify(profil)}).then(() => { window.__pzDone = 'ok'; }, (e) => { window.__pzDone = 'fehler: ' + e; });
    return true;
  `);
  const fertig = await pollUntil<string>(cdp, 'return window.__pzDone;', RENDER_FRIST_MS, 250);
  if (fertig !== 'ok') throw new Error(`Export ohne Abschluss (${String(fertig)})`);
  const dauerMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 800));
  if (!existsSync(pdf)) throw new Error(`Kein PDF entstanden: ${pdf}`);
  return { pdf, dauerMs, notices: await notices(cdp), konsole: [...konsole] };
}

async function erwarteterHintergrund(cdp: Cdp): Promise<[number, number, number]> {
  const rgb = await cdp.evaluate<number[]>(`
    const d = document.body.createDiv();
    d.setCssProps({ 'background-color': 'var(--background-primary)' });
    const c = getComputedStyle(d).backgroundColor; d.remove();
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1, 1);
    return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3);
  `);
  return [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0];
}

function schreibeAppearance(vaultDir: string, arm: Arm): void {
  const cfg: Record<string, unknown> = { theme: arm.modus, baseFontSize: 16 };
  if (arm.theme) cfg.cssTheme = arm.theme;
  writeFileSync(join(vaultDir, '.obsidian/appearance.json'), JSON.stringify(cfg, null, 2));
  if (arm.theme) {
    const ziel = join(vaultDir, '.obsidian/themes', arm.theme);
    mkdirSync(ziel, { recursive: true });
    for (const f of ['theme.css', 'manifest.json']) copyFileSync(join(THEME_DIR, f), join(ziel, f));
  } else {
    rmSync(join(vaultDir, '.obsidian/themes'), { recursive: true, force: true });
  }
}

async function verbinde(port: number): Promise<Cdp> {
  const ende = Date.now() + 90_000;
  let letzter = '';
  while (Date.now() < ende) {
    try {
      const cdp = await attachTo('workspace', port, REPO_NAME);
      if (cdp) return cdp;
    } catch (e) { letzter = (e as Error).message; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Kein Obsidian-Fenster auf Port ${port} nach 90 s ${letzter}`);
}

/* ------------------------------------------------------------------- Lauf */

async function fahreArm(arm: Arm, port: number, vaultDir: string, outDir: string, erster: boolean, nurGegenprobe: boolean, b: ReturnType<typeof createBilanz>): Promise<void> {
  const { record, unmeasured } = b;
  schreibeAppearance(vaultDir, arm);
  const inst = starteZweitinstanz({
    port,
    profilBasis: `/tmp/obs-test-${REPO_NAME}-druck`,
    vaultName: REPO_NAME,
    vaultPfad: vaultDir,
    startargumente: (profil) => zweitinstanzStartargumente({ profil, port, sprache: 'en' }),
    frisch: true,
  });
  let cdp: Cdp | null = null;
  try {
    cdp = await verbinde(port);
    const konsole: string[] = [];
    await cdp.mitschnitt((zeile) => { if (/Paperize|desktop print|PrintToPdf/i.test(zeile)) konsole.push(zeile); });
    await requireVisible(cdp);
    requireEigenerBuild(join(vaultDir, '.obsidian/plugins', PLUGIN_ID, 'main.js'), join(REPO_ROOT, 'main.js'), (m) => console.log(`WARNUNG: ${m}`));
    const klar = await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: REPO_NAME, sprache: 'en' });
    console.log(`  ${klar.hinweis}`);

    const stand = await cdp.evaluate<{ dunkel: boolean; hell: boolean; css: string; version: string }>(`
      return { dunkel: document.body.classList.contains('theme-dark'), hell: document.body.classList.contains('theme-light'),
               css: app.customCss.theme || '', version: (document.title.match(/Obsidian (\\d+\\.\\d+\\.\\d+)/) || [])[1] || '?' };
    `);
    const modusOk = arm.modus === 'obsidian' ? stand.dunkel && !stand.hell : stand.hell && !stand.dunkel;
    const themeOk = stand.css === arm.theme;
    if (!nurGegenprobe) {
      record(`${arm.id} Aufbau: Thema und Modus stehen`, modusOk && themeOk, `Obsidian ${stand.version}, body ${stand.dunkel ? 'theme-dark' : 'theme-light'}, cssTheme „${stand.css}“`);
    }
    if (!modusOk || !themeOk) {
      if (nurGegenprobe) unmeasured(GEGEN, 'Aufbau stimmt nicht');
      return;
    }
    const hintergrund = await erwarteterHintergrund(cdp);
    console.log(`  erwarteter Seitenhintergrund: rgb(${hintergrund.join(', ')})`);

    if (nurGegenprobe) {
      const lauf = await exportiere(cdp, vaultDir, 'Muster.md', 'paper', konsole);
      const befund = werteAus(lauf.pdf);
      const rueckfall = FALLBACK_NOTICE.test(lauf.notices);
      const druck = /skia|chrom/i.test(befund.producer);
      record(GEGEN, rueckfall && !druck, `Notice „${lauf.notices}“, Producer „${befund.producer}“, ${befund.bytes} Bytes, Konsole: ${lauf.konsole.join(' | ').slice(0, 300)}`);
      return;
    }

    for (const profil of PROFILE) {
      try {
        const lauf = await exportiere(cdp, vaultDir, 'Muster.md', profil, konsole);
        const ziel = join(outDir, `${arm.id}-${profil}.pdf`);
        copyFileSync(lauf.pdf, ziel);
        const befund = werteAus(ziel);
        const desktop = !FALLBACK_NOTICE.test(lauf.notices) && /skia|chrom/i.test(befund.producer) && befund.bytes > EMPTY_PDF_MAX_BYTES;
        record(punktName(arm, profil, WEG), desktop, `${befund.bytes} Bytes, ${befund.seiten} Seiten, Producer „${befund.producer}“, ${lauf.dauerMs} ms, Notice „${lauf.notices}“`);
        const fehlt = fehlendeMarker(befund.text);
        record(punktName(arm, profil, M1), fehlt.length === 0, fehlt.length ? `fehlt: ${fehlt.join(', ')}` : `${MARKER.length} von ${MARKER.length}`);
        const namen = befund.schriften.map((s) => `${s.name}${s.emb ? '' : ' (nicht eingebettet)'}`);
        const themeSchrift = arm.theme ? befund.schriften.some((s) => /serif|mono|special|typewriter/i.test(s.name)) : true;
        record(punktName(arm, profil, M3), befund.schriften.length > 0 && befund.schriften.every((s) => s.emb) && themeSchrift, namen.join(', ') || 'keine Schriften');
        const soll: readonly number[] = profil === 'paper' ? [255, 255, 255] : hintergrund;
        const ist = befund.eckpixel;
        record(punktName(arm, profil, M4), !!ist && nahe(ist, soll, 6), `Ecke ${ist ? `rgb(${ist.join(', ')})` : '?'}, erwartet rgb(${soll.join(', ')})`);
        if (profil === 'paper') {
          record(punktName(arm, profil, M6), befund.tinte !== null && befund.tinte <= INK_MAX_PAPER, `Tintendeckung ${befund.tinte === null ? '?' : (befund.tinte * 100).toFixed(1)} % (Grenze ${INK_MAX_PAPER * 100} %)`);
        } else {
          console.log(`  Bildschirm: Tintendeckung ${befund.tinte === null ? '?' : (befund.tinte * 100).toFixed(1)} % (nur zur Kenntnis)`);
        }
      } catch (e) {
        for (const m of [WEG, M1, M3, M4, ...(profil === 'paper' ? [M6] : [])]) unmeasured(punktName(arm, profil, m), (e as Error).message);
      }
    }

    if (erster) {
      try {
        const lauf = await exportiere(cdp, vaultDir, 'Ein-Wort.md', 'paper', konsole);
        const befund = werteAus(lauf.pdf);
        record(`${arm.id} ${M2}`, befund.bytes > EMPTY_PDF_MAX_BYTES && !FALLBACK_NOTICE.test(lauf.notices) && /skia|chrom/i.test(befund.producer), `${befund.bytes} Bytes (Schwelle ${EMPTY_PDF_MAX_BYTES}), Producer „${befund.producer}“, Text „${befund.text.trim()}“, Notice „${lauf.notices}“`);
      } catch (e) { unmeasured(`${arm.id} ${M2}`, (e as Error).message); }
      try {
        const lauf = await exportiere(cdp, vaultDir, 'Mermaid-Fehler.md', 'paper', konsole);
        copyFileSync(lauf.pdf, join(outDir, `${arm.id}-mermaid-fehler.pdf`));
        const befund = werteAus(lauf.pdf);
        const text = befund.text;
        const ok = !FALLBACK_NOTICE.test(lauf.notices) && /skia|chrom/i.test(befund.producer)
          && /MARK-FEHLER/i.test(text) && /MARK-NACH/i.test(text);
        record(`${arm.id} ${FEHLER}`, ok, `${befund.bytes} Bytes, ${lauf.dauerMs} ms (Frist ${RENDER_FRIST_MS} ms), Text um das Diagramm da, Fehlerkasten-Text: „${(/(error|parse|syntax)[^\n]{0,60}/i.exec(text)?.[0] ?? 'keiner gefunden').trim()}“`);
      } catch (e) { unmeasured(`${arm.id} ${FEHLER}`, (e as Error).message); }
    }
  } finally {
    cdp?.close();
    console.log(`  ${await beendeZweitinstanz(inst)}`);
  }
}

function kalibriere(pdf: string): void {
  const b = werteAus(pdf);
  console.log(JSON.stringify({ ...b, text: undefined, markerFehlen: fehlendeMarker(b.text), textZeichen: b.text.length }, null, 2));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pdf = args.value('pdf');
  if (pdf) { kalibriere(pdf); return; }

  const portArg = args.value('port');
  if (!portArg || !Number.isInteger(Number(portArg))) throw new Error('--port <Port> ist Pflicht (Zweitinstanz) — kein Standardport.');
  const port = Number(portArg);
  const nurGegenprobe = args.has('gegenprobe');
  const armId = args.value('arm');
  const arme = nurGegenprobe ? [ARME.find((a) => a.id === 'std-dark') as Arm] : armId ? ARME.filter((a) => a.id === armId) : ARME;
  if (arme.length === 0) throw new Error(`Unbekannter Arm: ${String(armId)}`);
  const outDir = args.value('out') ?? join(tmpdir(), 'paperize-print-matrix');
  mkdirSync(outDir, { recursive: true });

  const b = createBilanz({ punkte: sollListe(arme, nurGegenprobe) });
  const vaultDir = stagingVaultDir(REPO_NAME);
  const log = buildVault({ repoRoot: REPO_ROOT, vaultDir, fixtureDir: FIXTURE_DIR, pluginId: PLUGIN_ID });
  for (const z of log) console.log(`  · ${z}`);

  let erster = true;
  for (const arm of arme) {
    console.log(`\n== Arm ${arm.id}: ${arm.label} ==`);
    try {
      await fahreArm(arm, port, vaultDir, outDir, erster && !nurGegenprobe, nurGegenprobe, b);
    } catch (e) {
      console.error(`Arm ${arm.id} abgebrochen: ${(e as Error).message}`);
    }
    erster = false;
  }
  console.log(`\nPDFs: ${outDir}`);
  b.abschluss();
}

if (process.argv[1]?.endsWith('print-matrix.mjs') || process.argv[1]?.endsWith('print-matrix.ts')) runDriver(main);
