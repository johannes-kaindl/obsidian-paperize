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
 * Messgrößen (Spec § 9): M1 Marker im Text, M2 Schwelle des leeren PDFs, M3 Schriften eingebettet,
 * M4 Eckpixel der Seite, M5 Kontrast (Papier: Text; Bildschirm: Inline-Code), M6 Tintendeckung Papier,
 * M7 Seitenzahl „n/m“ auf Seite 2 (abschaltbar), M9 die drei Befehle erzeugen je ihr Profil,
 * M11 verdecktes Fenster (Prozess per System Events versteckt, `visibilityState` als Kontrolle).
 * M12 (Linux im Container): `--container-setup --arm <id>` baut Vault und Thema, danach startet der Aufrufer den Container
 * (`tools/obsidian-cdp/container/README.md`) und fährt `--container --arm <id> --port <Port>` gegen die laufende Instanz; M11 entfällt dort.
 * Nicht hier: M8 (gui-smoke I1/I2), M10 (Sichtvergleich durch die Session),
 * M13/M14 (nach dem Release, Gerätelauf). Tintendeckung = mittlere Dunkelheit über alle Seiten bei 40 dpi (siehe `tintendeckung`).
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cwd } from 'node:process';

import { createBilanz, parseArgs, runDriver } from '../../tools/obsidian-cdp/bilanz.js';
import { Cdp, attachTo, bereiteInstanzVor, clearNotices, closeExtraLeaves, notices, openExisting, pollUntil, releaseFokusEmulation, requireVisible } from '../../tools/obsidian-cdp/cdp.js';
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

/** WCAG-Kontrast zweier sRGB-Farben. */
export function kontrastVerhaeltnis(a: readonly number[], b: readonly number[]): number {
  const lin = (c: number): number => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c: readonly number[]): number => 0.2126 * lin(c[0] ?? 0) + 0.7152 * lin(c[1] ?? 0) + 0.0722 * lin(c[2] ?? 0);
  const [hell, dunkel] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hell + 0.05) / (dunkel + 0.05);
}

/** Wortrechtecke (PDF-Punkte) der ersten Seite aus `pdftotext -bbox`. */
export function leseWorte(html: string): { text: string; x0: number; y0: number; x1: number; y1: number }[] {
  const out: { text: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    out.push({ x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]), text: m[5] ?? '' });
  }
  return out;
}

/** Kontrast eines Wortes im gedruckten PDF: Hintergrund = häufigste Farbe im Wortrechteck, Vordergrund = die davon am weitesten
 *  entfernte (Luminanz). 200 dpi, damit dünne Striche ihre volle Farbe erreichen. `null`: Wort nicht gefunden. */
export function messeKontrast(pdf: string, wort: string, seite = 1): { ratio: number; fg: number[]; bg: number[] } | null {
  const box = leseWorte(werkzeug('pdftotext', ['-bbox', '-f', String(seite), '-l', String(seite), pdf, '-'])).find((w) => w.text.includes(wort));
  if (!box) return null;
  const dpi = 200;
  const k = dpi / 72;
  const x = Math.max(0, Math.floor(box.x0 * k) - 1);
  const y = Math.max(0, Math.floor(box.y0 * k) - 1);
  const w = Math.ceil((box.x1 - box.x0) * k) + 2;
  const h = Math.ceil((box.y1 - box.y0) * k) + 2;
  const dir = mkdtempSync(join(tmpdir(), 'paperize-kontrast-'));
  try {
    werkzeug('pdftoppm', ['-r', String(dpi), '-f', String(seite), '-l', String(seite), '-x', String(x), '-y', String(y), '-W', String(w), '-H', String(h), '-singlefile', pdf, join(dir, 'k')]);
    const bild = leseP6(readFileSync(join(dir, 'k.ppm')));
    const zaehler = new Map<number, number>();
    for (let i = 0; i + 2 < bild.data.length; i += 3) {
      const key = ((bild.data[i] ?? 0) << 16) | ((bild.data[i + 1] ?? 0) << 8) | (bild.data[i + 2] ?? 0);
      zaehler.set(key, (zaehler.get(key) ?? 0) + 1);
    }
    const bgKey = [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0xffffff;
    const bg = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255];
    let fg = bg;
    let abstand = -1;
    for (const key of zaehler.keys()) {
      const c = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
      const d = Math.abs(luminanz(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0) - luminanz(bg[0] ?? 0, bg[1] ?? 0, bg[2] ?? 0));
      if (d > abstand) { abstand = d; fg = c; }
    }
    return { ratio: kontrastVerhaeltnis(fg, bg), fg, bg };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Text einer einzelnen Seite. */
export function seitenText(pdf: string, seite: number): string {
  return werkzeug('pdftotext', ['-layout', '-f', String(seite), '-l', String(seite), pdf, '-']);
}

/** Erste Seite, auf der `wort` im Textlayer steht (Wortvergleich wie `messeKontrast`); `null`: nirgends. */
export function findeSeite(pdf: string, wort: string): number | null {
  const n = leseSeiten(werkzeug('pdfinfo', [pdf]));
  for (let seite = 1; seite <= n; seite++) {
    const html = werkzeug('pdftotext', ['-bbox', '-f', String(seite), '-l', String(seite), pdf, '-']);
    if (leseWorte(html).some((w) => w.text.includes(wort))) return seite;
  }
  return null;
}

/** Kontrast eines Wortes auf der Seite, auf der es steht (Wort-Messung wie `messeKontrast`). */
export function messeKontrastIrgendwo(pdf: string, wort: string): { ratio: number; fg: number[]; bg: number[]; seite: number } | null {
  const seite = findeSeite(pdf, wort);
  if (seite === null) return null;
  const k = messeKontrast(pdf, wort, seite);
  return k ? { ...k, seite } : null;
}

/** Sichtbare Tinte des Kästchens links von `wort` (Aufgabenzeile): Anzahl Pixel, deren Luminanz mehr als 60 vom Grund der Zeile
 *  abweicht, in einem Streifen von 18 pt links vom Wort bis 1 pt davor, 200 dpi. `null`: Wort nicht gefunden. */
export function messeKaestchen(pdf: string, wort: string): { tinte: number; seite: number } | null {
  const seite = findeSeite(pdf, wort);
  if (seite === null) return null;
  const box = leseWorte(werkzeug('pdftotext', ['-bbox', '-f', String(seite), '-l', String(seite), pdf, '-'])).find((w) => w.text.includes(wort));
  if (!box) return null;
  const k = 200 / 72;
  const x = Math.max(0, Math.floor((box.x0 - 18) * k));
  const y = Math.max(0, Math.floor(box.y0 * k) - 2);
  const w = Math.ceil(17 * k);
  const h = Math.ceil((box.y1 - box.y0) * k) + 4;
  const dir = mkdtempSync(join(tmpdir(), 'paperize-kaestchen-'));
  try {
    werkzeug('pdftoppm', ['-r', '200', '-f', String(seite), '-l', String(seite), '-x', String(x), '-y', String(y), '-W', String(w), '-H', String(h), '-singlefile', pdf, join(dir, 'k')]);
    const bild = leseP6(readFileSync(join(dir, 'k.ppm')));
    const lum = (i: number): number => luminanz(bild.data[i] ?? 0, bild.data[i + 1] ?? 0, bild.data[i + 2] ?? 0);
    const grund = lum(0);
    let tinte = 0;
    for (let i = 0; i + 2 < bild.data.length; i += 3) if (Math.abs(lum(i) - grund) > 60) tinte++;
    return { tinte, seite };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Rahmenbreite links und rechts einer vollen Box (Callout „Info-Kastens“) in Pixelspalten bei 200 dpi: Spalten in der Nähe des linken beziehungsweise
 *  rechten Satzspiegelrands, in denen 80 % der Zeilen der Box vom Grund abweichen. `rechts` kleiner als `links` heißt: Rahmenlinie abgeschnitten. */
export function messeRahmen(pdf: string): { links: number; rechts: number } | null {
  const seite = findeSeite(pdf, 'Info-Kastens');
  if (seite === null) return null;
  const worte = leseWorte(werkzeug('pdftotext', ['-bbox', '-f', String(seite), '-l', String(seite), pdf, '-']));
  const titel = worte.find((w) => w.text.includes('Info-Kastens'));
  const ende = worte.find((w) => w.text.includes('Betonung'));
  if (!titel || !ende) return null;
  const k = 200 / 72;
  const dir = mkdtempSync(join(tmpdir(), 'paperize-rahmen-'));
  try {
    werkzeug('pdftoppm', ['-r', '200', '-f', String(seite), '-l', String(seite), '-singlefile', pdf, join(dir, 'r')]);
    const bild = leseP6(readFileSync(join(dir, 'r.ppm')));
    const y0 = Math.floor((titel.y0 + 2) * k);
    const y1 = Math.floor((ende.y1 - 2) * k);
    const lum = (x: number, y: number): number => { const i = (y * bild.w + x) * 3; return luminanz(bild.data[i] ?? 0, bild.data[i + 1] ?? 0, bild.data[i + 2] ?? 0); };
    const spalten = (von: number, bis: number): number => {
      let n = 0;
      for (let x = von; x < bis; x++) {
        const grund = lum(x - 6 < 0 ? 0 : x - 6, y0);
        let treffer = 0;
        for (let y = y0; y <= y1; y++) if (Math.abs(lum(x, y) - grund) > 40) treffer++;
        if (treffer >= 0.8 * (y1 - y0 + 1)) n++;
      }
      return n;
    };
    const rand = Math.round(56.69 * k);
    return { links: spalten(rand - 12, rand + 12), rechts: spalten(bild.w - rand - 12, bild.w - rand + 12) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ Punkte */

const punktName = (arm: Arm, profil: Profil, m: string): string => `${arm.id}/${profil} ${m}`;
const M1 = 'M1 alle Marker im Text';
const M3 = 'M3 Schriften eingebettet';
const M4 = 'M4 Eckpixel der Seite';
const M5 = 'M5 Kontrast';
const M6 = 'M6 Tintendeckung';
const M7 = 'M7 Seitenzahl „n/m“ auf Seite 2, abschaltbar';
const M9 = 'M9 Befehle: jeder erzeugt sein Profil';
const P1 = 'P1 Callout-Text sichtbar';
const P2 = 'P2 Aufgaben-Kästchen offen und erledigt sichtbar';
const P4 = 'P4 Rahmen der vollen Boxen rechts nicht abgeschnitten';
const P3 = 'P3 Mermaid-Knoten hell, Text lesbar';
const M11 = 'M11 verdecktes Fenster: Export läuft oder der Rückfall ist dokumentiert';
const KONTRAST_PAPIER = 7;
const KONTRAST_CODE = 4.5;
const KONTRAST_CALLOUT = 4.5;
const KNOTEN_HELL_MIN = 150;
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
      out.push(punktName(a, p, WEG), punktName(a, p, M1), punktName(a, p, M3), punktName(a, p, M4), punktName(a, p, M5), punktName(a, p, P1), punktName(a, p, P2), punktName(a, p, P3), punktName(a, p, P4));
      if (p === 'paper') out.push(punktName(a, p, M6));
    }
  }
  if (arme[0]) out.push(`${arme[0].id} ${M2}`, `${arme[0].id} ${FEHLER}`, `${arme[0].id} ${M7}`, `${arme[0].id} ${M9}`, `${arme[0].id} ${M11}`);
  return out;
}

/* ------------------------------------------------------------- Instanz/Export */

interface Lauf { pdf: string; dauerMs: number; notices: string; konsole: string[] }

const FALLBACK_NOTICE = /plain style|einfachen Stil/i;

interface ExportOptionen {
  /** Läuft nach dem Öffnen der Notiz, unmittelbar vor dem Start (z. B. Fenster verstecken). */
  vorStart?: () => Promise<void>;
  /** Befehls-Id (`paperize:…`) statt `exportActive(profil)`: misst den Weg, den der Nutzer nimmt. */
  befehl?: string;
}

async function exportiere(cdp: Cdp, vaultDir: string, notiz: string, profil: Profil, konsole: string[], opt: ExportOptionen = {}): Promise<Lauf> {
  const pdf = join(vaultDir, notiz.replace(/\.md$/, '.pdf'));
  rmSync(pdf, { force: true });
  konsole.length = 0;
  await clearNotices(cdp);
  if (!(await openExisting(cdp, notiz, 'preview'))) throw new Error(`Notiz ließ sich nicht öffnen: ${notiz}`);
  await closeExtraLeaves(cdp);
  if (opt.vorStart) await opt.vorStart();
  const t0 = Date.now();
  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    window.__pzDone = null;
    ${opt.befehl
      ? `app.commands.executeCommandById(${JSON.stringify(opt.befehl)}); window.__pzDone = 'ok';`
      : `p.exportActive(${JSON.stringify(profil)}).then(() => { window.__pzDone = 'ok'; }, (e) => { window.__pzDone = 'fehler: ' + e; });`}
    return true;
  `);
  const fertig = await pollUntil<string>(cdp, 'return window.__pzDone;', RENDER_FRIST_MS, 250);
  if (fertig !== 'ok') throw new Error(`Export ohne Abschluss (${String(fertig)})`);
  // Ein Befehl kehrt sofort zurück: auf die Datei warten (die Notice „PDF saved“ steht erst nach dem Schreiben).
  const ende = Date.now() + RENDER_FRIST_MS;
  while (opt.befehl && !existsSync(pdf) && Date.now() < ende) await new Promise((r) => setTimeout(r, 250));
  const dauerMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 800));
  if (!existsSync(pdf)) throw new Error(`Kein PDF entstanden: ${pdf}`);
  return { pdf, dauerMs, notices: await notices(cdp), konsole: [...konsole] };
}

/** Einstellung im laufenden Plugin setzen (nur für diesen Lauf; die Instanz ist Wegwerfware). */
async function setzeEinstellung(cdp: Cdp, patch: Record<string, unknown>): Promise<void> {
  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    Object.assign(p.settings, ${JSON.stringify(patch)});
    await p.saveSettings();
    return true;
  `);
}

function leseSichtbar(pid: number): string {
  try { return execFileSync('osascript', ['-e', `tell application "System Events" to get visible of (first process whose unix id is ${pid})`], { encoding: 'utf8' }).trim(); } catch (e) { return `?(${(e as Error).message.slice(0, 60)})`; }
}

/** Prozess der Zweitinstanz per System Events verstecken (`visible`) oder zeigen; trifft nur diese PID, nie die reguläre Instanz. */
function setzeSichtbar(pid: number, sichtbar: boolean): void {
  execFileSync('osascript', ['-e', `tell application "System Events" to set visible of (first process whose unix id is ${pid}) to ${sichtbar}`]);
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

async function fahreArm(arm: Arm, port: number, vaultDir: string, outDir: string, erster: boolean, nurGegenprobe: boolean, b: ReturnType<typeof createBilanz>, container = false): Promise<void> {
  const { record, unmeasured, skipped } = b;
  // Im Container steht die Instanz schon (Thema und Vault vor ihrem Start gesetzt, `--container-setup`): nichts starten, nichts beenden.
  if (!container) schreibeAppearance(vaultDir, arm);
  const inst = container ? null : starteZweitinstanz({
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
        {
          const code = messeKontrast(ziel, 'Inline-Code');
          const text = messeKontrast(ziel, 'Füllstoff');
          const f = (k: ReturnType<typeof messeKontrast>): string => (k ? `${k.ratio.toFixed(1)}:1 (Text rgb(${k.fg.join(', ')}) auf rgb(${k.bg.join(', ')}))` : 'Wort nicht gefunden');
          const detail = `Inline-Code ${f(code)}; Fließtext ${f(text)}`;
          if (profil === 'paper') record(punktName(arm, profil, M5), !!code && !!text && Math.min(code.ratio, text.ratio) >= KONTRAST_PAPIER, `${detail} (Grenze ${KONTRAST_PAPIER}:1)`);
          else record(punktName(arm, profil, M5), !!code && code.ratio >= KONTRAST_CODE, `${detail} (Grenze Inline-Code ${KONTRAST_CODE}:1)`);
        }
        {
          // P1 bis P3: die Stellen, an denen das Profil Papier gescheitert wäre, ohne dass M1/M4/M5 es sahen (Textlayer, Eckpixel, Fließtext).
          const c = messeKontrastIrgendwo(ziel, 'Info-Kastens');
          record(punktName(arm, profil, P1), !!c && c.ratio >= KONTRAST_CALLOUT,
            c ? `Callout-Text ${c.ratio.toFixed(1)}:1 (Text rgb(${c.fg.join(', ')}) auf rgb(${c.bg.join(', ')}), Seite ${c.seite}; Grenze ${KONTRAST_CALLOUT}:1)` : 'Wort „Info-Kastens“ nicht gefunden');
          const offen = messeKaestchen(ziel, 'offene');
          const fertig = messeKaestchen(ziel, 'erledigte');
          record(punktName(arm, profil, P2), !!offen && !!fertig && (profil === 'screen' || offen.tinte > 0) && fertig.tinte > offen.tinte,
            offen && fertig ? `Tinte neben dem Wort: offen ${offen.tinte} Pixel, erledigt ${fertig.tinte} Pixel (erledigt muss mehr tragen als offen; Papier: der offene Rahmen muss selbst sichtbar sein)` : 'Aufgabenzeile nicht gefunden');
          const n = messeKontrastIrgendwo(ziel, 'MARK-KNOTEN');
          const lumBg = n ? luminanz(n.bg[0] ?? 0, n.bg[1] ?? 0, n.bg[2] ?? 0) : 0;
          record(punktName(arm, profil, P3), !!n && n.ratio >= KONTRAST_CALLOUT && (profil === 'screen' || lumBg >= KNOTEN_HELL_MIN),
            n ? `Knotentext ${n.ratio.toFixed(1)}:1 (Text rgb(${n.fg.join(', ')}) auf Füllung rgb(${n.bg.join(', ')}), Füllung Luminanz ${lumBg.toFixed(0)}${profil === 'paper' ? `, Grenze ${KNOTEN_HELL_MIN}` : ''})` : 'Wort „MARK-KNOTEN“ nicht gefunden');
        }
        {
          const r = messeRahmen(ziel);
          if (r && r.links === 0) skipped(punktName(arm, profil, P4), 'die Box hat in diesem Thema keine Rahmenlinie am Rand, nur eine Fläche: nichts zu messen');
          else record(punktName(arm, profil, P4), !!r && r.rechts >= r.links,
            r ? `Rahmenspalten (200 dpi) am Rand der Info-Box: links ${r.links}, rechts ${r.rechts}` : 'Info-Box nicht gefunden');
        }
        if (profil === 'paper') {
          record(punktName(arm, profil, M6), befund.tinte !== null && befund.tinte <= INK_MAX_PAPER, `Tintendeckung ${befund.tinte === null ? '?' : (befund.tinte * 100).toFixed(1)} % (Grenze ${INK_MAX_PAPER * 100} %)`);
        } else {
          console.log(`  Bildschirm: Tintendeckung ${befund.tinte === null ? '?' : (befund.tinte * 100).toFixed(1)} % (nur zur Kenntnis)`);
        }
      } catch (e) {
        for (const m of [WEG, M1, M3, M4, M5, P1, P2, P3, P4, ...(profil === 'paper' ? [M6] : [])]) unmeasured(punktName(arm, profil, m), (e as Error).message);
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

      // M7 — Seitenzahl „n/m“ auf Seite 2, und abschaltbar (die Abschaltung ist die Gegenprobe der Messung).
      try {
        await setzeEinstellung(cdp, { pageNumbers: true });
        const an = await exportiere(cdp, vaultDir, 'Muster.md', 'paper', konsole);
        const textAn = seitenText(an.pdf, 2);
        await setzeEinstellung(cdp, { pageNumbers: false });
        const aus = await exportiere(cdp, vaultDir, 'Muster.md', 'paper', konsole);
        const textAus = seitenText(aus.pdf, 2);
        await setzeEinstellung(cdp, { pageNumbers: true });
        const zahl = /(?:^|\s)2\s*\/\s*\d+(?:\s|$)/;
        record(`${arm.id} ${M7}`, zahl.test(textAn) && !zahl.test(textAus), `an: „${(zahl.exec(textAn)?.[0] ?? 'keine').trim()}“, aus: „${(zahl.exec(textAus)?.[0] ?? 'keine').trim()}“`);
      } catch (e) { unmeasured(`${arm.id} ${M7}`, (e as Error).message); }

      // M9 — jeder Befehl erzeugt sein Profil; `export-pdf` folgt der Einstellung. Erkennung am Eckpixel (Papier weiß, Bildschirm dunkel).
      try {
        const faelle: { befehl: string; einstellung: Profil; erwartet: Profil }[] = [
          { befehl: 'export-pdf', einstellung: 'paper', erwartet: 'paper' },
          { befehl: 'export-pdf', einstellung: 'screen', erwartet: 'screen' },
          { befehl: 'export-pdf-screen', einstellung: 'paper', erwartet: 'screen' },
          { befehl: 'export-pdf-paper', einstellung: 'screen', erwartet: 'paper' },
        ];
        const zeilen: string[] = [];
        let alle = true;
        for (const f of faelle) {
          await setzeEinstellung(cdp, { desktopProfile: f.einstellung });
          const lauf = await exportiere(cdp, vaultDir, 'Muster.md', f.erwartet, konsole, { befehl: `${PLUGIN_ID}:${f.befehl}` });
          const ecke = werteAus(lauf.pdf).eckpixel;
          const soll: readonly number[] = f.erwartet === 'paper' ? [255, 255, 255] : hintergrund;
          const ok = !!ecke && nahe(ecke, soll, 6) && !FALLBACK_NOTICE.test(lauf.notices);
          alle = alle && ok;
          zeilen.push(`${f.befehl} (Einstellung ${f.einstellung}) → ${ok ? f.erwartet : `FALSCH, Ecke ${ecke ? `rgb(${ecke.join(', ')})` : '?'}`}`);
        }
        await setzeEinstellung(cdp, { desktopProfile: 'paper' });
        record(`${arm.id} ${M9}`, alle, zeilen.join(' · '));
      } catch (e) { unmeasured(`${arm.id} ${M9}`, (e as Error).message); }

      // M11 — Prozess versteckt. Kontrolle: `visibilityState` muss danach `hidden` sein, sonst ist der Arm ungültig (nichts gemessen).
      const pid = inst?.child.pid;
      if (container) skipped(`${arm.id} ${M11}`, 'Container: kein Prozess zu verstecken (Xvfb ohne Fenster-Manager)');
      else if (pid === undefined) unmeasured(`${arm.id} ${M11}`, 'keine PID der Zweitinstanz');
      else {
        let versteckt = false;
        try {
          let sicht = '?';
          const lauf = await exportiere(cdp, vaultDir, 'Muster.md', 'paper', konsole, {
            vorStart: async () => {
              // Die Fokus-Emulation von `requireVisible` hielt das Fenster für Chromium sichtbar und fokussiert (gemessen: Prozess
              // `visible=false`, aber `visibilityState` `visible`); M11 soll den echten Zustand messen.
              await releaseFokusEmulation(cdp!);
              setzeSichtbar(pid, false);
              versteckt = true;
              // Bis zu 8 s auf `hidden` warten; bleibt es `visible`, ist der Arm ungültig (gemessen 2026-11-01: n=3 von 4 Armen wurden `hidden`).
              const ende = Date.now() + 8000;
              do {
                await new Promise((r) => setTimeout(r, 500));
                sicht = await cdp!.evaluate<string>('return document.visibilityState;');
              } while (sicht !== 'hidden' && Date.now() < ende);
              console.log(`  M11-Kontrolle: visibilityState ${sicht}, hasFocus ${await cdp!.evaluate<string>('return String(document.hasFocus());')}, Prozess visible=${leseSichtbar(pid)}`);
            },
          });
          const befund = werteAus(lauf.pdf);
          const fehlt = fehlendeMarker(befund.text);
          const desktop = !FALLBACK_NOTICE.test(lauf.notices) && /skia|chrom/i.test(befund.producer);
          if (sicht !== 'hidden') unmeasured(`${arm.id} ${M11}`, `Kontrolle gescheitert: visibilityState „${sicht}“ nach dem Verstecken, der Arm war nicht verdeckt`);
          else record(`${arm.id} ${M11}`, fehlt.length === 0, `${sicht}; ${desktop ? 'Desktop-Druck' : 'RÜCKFALL (einfacher Stil)'}; ${befund.bytes} Bytes, ${lauf.dauerMs} ms, Marker ${MARKER.length - fehlt.length} von ${MARKER.length}; Notice „${lauf.notices}“`);
        } catch (e) { unmeasured(`${arm.id} ${M11}`, (e as Error).message); }
        finally { if (versteckt) setzeSichtbar(pid, true); }
      }
    }
  } finally {
    cdp?.close();
    if (inst) console.log(`  ${await beendeZweitinstanz(inst)}`);
  }
}

function kalibriere(pdf: string): void {
  const b = werteAus(pdf);
  console.log(JSON.stringify({ ...b, text: undefined, markerFehlen: fehlendeMarker(b.text), textZeichen: b.text.length, kontrastCode: messeKontrast(pdf, 'Inline-Code'), kontrastText: messeKontrast(pdf, 'Füllstoff'), callout: messeKontrastIrgendwo(pdf, 'Info-Kastens'), offen: messeKaestchen(pdf, 'offene'), erledigt: messeKaestchen(pdf, 'erledigte'), knoten: messeKontrastIrgendwo(pdf, 'MARK-KNOTEN'), rahmen: messeRahmen(pdf) }, null, 2));
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

  const container = args.has('container');
  const b = createBilanz({ punkte: sollListe(arme, nurGegenprobe) });
  const vaultDir = stagingVaultDir(REPO_NAME);
  if (args.has('container-setup')) {
    // Vorbereitung für M12 (Linux im Container): Vault bauen und das Thema des Arms setzen, danach startet der Aufrufer den Container.
    for (const z of buildVault({ repoRoot: REPO_ROOT, vaultDir, fixtureDir: FIXTURE_DIR, pluginId: PLUGIN_ID })) console.log(`  · ${z}`);
    schreibeAppearance(vaultDir, arme[0] as Arm);
    console.log(`Vault bereit für den Container: ${vaultDir} (Arm ${(arme[0] as Arm).id})`);
    return;
  }
  if (!container) {
    const log = buildVault({ repoRoot: REPO_ROOT, vaultDir, fixtureDir: FIXTURE_DIR, pluginId: PLUGIN_ID });
    for (const z of log) console.log(`  · ${z}`);
  }

  let erster = true;
  for (const arm of arme) {
    console.log(`\n== Arm ${arm.id}: ${arm.label} ==`);
    try {
      await fahreArm(arm, port, vaultDir, outDir, erster && !nurGegenprobe, nurGegenprobe, b, container);
    } catch (e) {
      console.error(`Arm ${arm.id} abgebrochen: ${(e as Error).message}`);
    }
    erster = false;
  }
  console.log(`\nPDFs: ${outDir}`);
  b.abschluss();
}

if (process.argv[1]?.endsWith('print-matrix.mjs') || process.argv[1]?.endsWith('print-matrix.ts')) runDriver(main);
