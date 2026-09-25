/**
 * GUI-Smoke-Treiber — fährt die mechanisch entscheidbaren Abnahmepunkte gegen ein
 * **laufendes** Obsidian statt von Hand.
 *
 * Warum getrackt (CORE-TEST-02 b): Paperize' teuerste Defekte lagen alle in der Naht
 * zwischen Obsidian und der puren Engine, wo kein Unit-Test hinsieht — das **Export-DOM
 * ist nicht das Preview-DOM**. Drei belegte Fälle: Formeln verschwanden am 2026-08-04
 * spurlos UND ungezählt aus dem PDF (MathJax rendert SVG ohne Textknoten, die Notice
 * schwieg, während Inhalt fehlte); Task-Listen verloren ihre `[ ]`/`[x]`; ein
 * Codeblock-Defekt schrieb `PAPERIZECODE0` als Fließtext ins PDF, während zwei Blöcke
 * ganz fehlten. Alle drei waren gegen den Obsidian-Mock unsichtbar und wären hier rot.
 *
 * Der Prüfgegenstand ist deshalb nicht das DOM, sondern **das erzeugte PDF**: der Treiber
 * liest die Datei, die im Vault landet, und misst ihren Text. Das ist das eine Versprechen
 * des Plugins („sauberes, textselektierbares Vektor-PDF") und zugleich der einzige Ort, an
 * dem sich Degradation von Verlust unterscheiden lässt.
 *
 * Was er **nicht** prüft: ob das PDF gut aussieht — Umbruchästhetik, Waisen-/Witwen-Wirkung,
 * Grauwert. Dafür bleibt der Blick ins Dokument. Der Lauf sagt das ausdrücklich, statt die
 * Lücke wie Abdeckung aussehen zu lassen.
 *
 * ## Voraussetzung
 *
 * ⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Der Debug-Port ist geteilte
 * Infrastruktur; ein `quit` trifft die Instanz, an der möglicherweise eine andere Session
 * arbeitet, und zerstört deren Zustand. Der eigene Lauf ist danach sauber grün, der Schaden
 * entsteht woanders und fällt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
 * curl -s http://127.0.0.1:9222/json/list | grep -o '"title":"[^"]*"'   # wen träfe ein Quit?
 * ```
 *
 * Läuft dort schon eine fremde Messung, ist die **Zweitinstanz** der richtige Ort statt
 * einer Nachfrage — die Sperre hängt am Profil, nicht am Rechner:
 *
 * ```bash
 * UD=/tmp/obs-paperize; mkdir -p "$UD"
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9333 &
 * npm run smoke:gui -- --port 9333
 * ```
 *
 * Der reguläre Weg, wenn nichts läuft:
 *
 * ```bash
 * open -a Obsidian --args --remote-debugging-port=9222
 * npm run build && npm run smoke:gui -- --setup   # Staging-Vault aus fixtures/vault/
 * npm run smoke:gui
 * ```
 *
 * `--setup` baut `$STAGING_VAULTS_DIR/obsidian-paperize` neu aus dem getrackten Fixture.
 * Der Vault ist Wegwerfware; verloren heißt neu gebaut, nicht rekonstruiert.
 *
 * Typen: `tsconfig.scripts.json` (im `gate` über `npm run typecheck:scripts`).
 */

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { cwd } from 'node:process';

import { Cdp, attachTo, closeExtraLeaves, notices, openExisting, pollUntil, requireVisible } from '../../tools/obsidian-cdp/cdp.js';
import { buildVault, requireEigenerBuild, stagingVaultDir } from '../../tools/obsidian-cdp/vault.js';

const REPO_NAME = 'obsidian-paperize';
const PLUGIN_ID = 'paperize';
const REPO_ROOT = cwd();
const FIXTURE_DIR = join(REPO_ROOT, 'fixtures/vault');

/* ---------------------------------------------------------------- Protokoll */

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const results: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Was der Lauf bewusst NICHT misst. Steht im Protokoll, damit eine Lücke nicht wie
 *  Abdeckung aussieht — ein stillschweigend ausgelassener Punkt liest sich hinterher
 *  wie ein grüner. */
const uebersprungen: string[] = [];

function skipped(name: string, reason: string): void {
  uebersprungen.push(name);
  console.log(`  – ${name} — übersprungen: ${reason}`);
}

const warnungen: string[] = [];

/* ------------------------------------------------------- PDF ohne Bibliothek */

/**
 * Text aus einem Paperize-PDF.
 *
 * Geht ohne Parser, weil die Engine ihre Content-Streams **unkomprimiert** schreibt (kein
 * `/Filter /FlateDecode` auf Seiteninhalten) und jeden Textlauf als einzelnes
 * `(...) Tj` setzt — `writer.ts:29`. Escaped werden dort nur `(`, `)` und `\`
 * (`encoding.ts::pdfTextBytes`), mehr muss diese Funktion also nicht rückgängig machen.
 *
 * Gelesen wird als latin1: die Bytes sind WinAnsi, und jeder andere Weg (utf8) macht aus
 * einem Umlaut zwei Ersatzzeichen — genau der Punkt, den C7 prüft.
 */
function pdfText(bytes: Buffer): string {
  const roh = bytes.toString('latin1');
  const stuecke: string[] = [];
  const re = /\(((?:\\.|[^()\\])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(roh)) !== null) {
    stuecke.push(m[1].replace(/\\([()\\])/g, '$1'));
  }
  return stuecke.join('\n');
}

/** Seitenzahl aus dem `/Pages`-Objekt. */
function pdfSeiten(bytes: Buffer): number {
  const m = /\/Type\s*\/Pages\s*\/Count\s+(\d+)/.exec(bytes.toString('latin1'));
  return m ? Number(m[1]) : 0;
}

/** Die Core-14-Schriften, die das PDF als `/Type1`-Objekte führt. Ein eingebetteter
 *  Font-Stream hätte `/FontFile`; Paperize' bewusste Grenze ist, dass es keinen gibt. */
function pdfFonts(bytes: Buffer): string[] {
  const roh = bytes.toString('latin1');
  const namen = new Set<string>();
  const re = /\/BaseFont\s*\/([A-Za-z0-9-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(roh)) !== null) namen.add(m[1]);
  return [...namen].sort();
}

/* ------------------------------------------------------------------ Helfer */

interface VaultInfo {
  basePath: string;
  configDir: string;
  name: string;
}

/** Wo liegt der Vault, gegen den DIESER Lauf fährt? Aus der laufenden Instanz gefragt,
 *  nicht aus `stagingVaultDir()` abgeleitet: ein Treiber dockt per `--vault` an ein
 *  beliebiges Fenster an, und ein Guard, der den konfigurierten statt des benutzten
 *  Gegenstands prüft, meldet grün über eine Datei, die mit dem Lauf nichts zu tun hat.
 *  Geprüft wird, was gemessen wird. */
async function vaultInfo(cdp: Cdp): Promise<VaultInfo> {
  return cdp.evaluate<VaultInfo>(`
    return {
      basePath: app.vault.adapter.basePath,
      configDir: app.vault.configDir,
      name: app.vault.getName(),
    };
  `);
}

/** Notices leeren, damit der nächste Punkt nicht den Toast der vorigen Aktion liest.
 *  `.notice` gehört Obsidian, nicht dem Prüfling — jedes Plugin im Vault schreibt dorthin. */
async function clearNotices(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    const docs = new Set([document]);
    if (typeof activeDocument !== "undefined" && activeDocument) docs.add(activeDocument);
    for (const doc of docs) for (const n of doc.querySelectorAll(".notice")) n.remove();
    return true;
  `);
}

async function setSettings(cdp: Cdp, patch: Record<string, unknown>): Promise<void> {
  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    Object.assign(p.settings, ${JSON.stringify(patch)});
    await p.saveSettings();
    await new Promise((r) => setTimeout(r, 200));
    return true;
  `);
}

async function readSettings(cdp: Cdp): Promise<Record<string, unknown>> {
  return cdp.evaluate<Record<string, unknown>>(`
    return JSON.parse(JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings));
  `);
}

/**
 * Eine Notiz öffnen und den Export-Befehl auslösen; liefert den Notice-Text.
 *
 * Die Notice wird VOR dem Warten auf die Datei gelesen — sie verschwindet nach wenigen
 * Sekunden, und ein Punkt, der beides aus einem Aufruf braucht, hätte sonst je nach
 * Schreibdauer mal Text und mal nicht: sporadisch rot bei intaktem Code, und das ist
 * teurer als dauerhaft rot.
 */
async function exportNote(cdp: Cdp, notePath: string): Promise<string> {
  await clearNotices(cdp);
  const offen = await openExisting(cdp, notePath, 'preview');
  if (!offen) throw new Error(`Notiz ließ sich nicht öffnen oder rendern: ${notePath}`);
  await closeExtraLeaves(cdp);
  await cdp.evaluate(`
    app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:export-pdf`)});
    return true;
  `);
  const text = await pollUntil<string>(
    cdp,
    'const t = [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).join(" | "); return t || null;',
    15_000,
    250,
  );
  // Der Schreibvorgang läuft asynchron weiter, auch wenn die Notice schon steht.
  await new Promise((r) => setTimeout(r, 600));
  return text ?? (await notices(cdp));
}

/** Auf eine Datei im Vault warten (Node-seitig — der Treiber liest sie danach selbst). */
async function warteAufDatei(pfad: string, fristMs = 10_000): Promise<boolean> {
  const ende = Date.now() + fristMs;
  while (Date.now() < ende) {
    if (existsSync(pfad)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** Erzeugte PDFs wieder wegräumen. Der Staging-Vault ist Wegwerfware, aber ein Lauf, der
 *  seine Ausgabe stehen lässt, verfälscht den nächsten: die `{version}`-Zählung zählt
 *  weiter, und E1 wäre beim zweiten Mal grün aus dem falschen Grund. */
function raeumePdfs(vaultDir: string): number {
  let n = 0;
  const lauf = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
      if (eintrag.name === '.obsidian') continue;
      const p = join(dir, eintrag.name);
      if (eintrag.isDirectory()) lauf(p);
      else if (eintrag.name.endsWith('.pdf')) { rmSync(p, { force: true }); n++; }
    }
  };
  lauf(vaultDir);
  return n;
}

/* ------------------------------------------------------------- Prüfpunkte */

async function pruefeGrundlage(cdp: Cdp, v: VaultInfo): Promise<void> {
  console.log('\nA · Grundlage');

  const geladen = await cdp.evaluate<boolean>(
    `return Boolean(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]);`,
  );
  record('A1 Plugin geladen', geladen, geladen ? `Vault ${v.name}` : 'app.plugins.plugins.paperize fehlt');
  if (!geladen) throw new Error('Ohne geladenes Plugin ist jeder weitere Punkt gegenstandslos.');

  const cmd = await cdp.evaluate<{ id: string; name: string } | null>(`
    const c = app.commands.commands[${JSON.stringify(`${PLUGIN_ID}:export-pdf`)}];
    return c ? { id: c.id, name: c.name } : null;
  `);
  record('A2 Export-Befehl registriert', Boolean(cmd), cmd ? cmd.name : 'paperize:export-pdf nicht in app.commands');

  // Über den plugin-eigenen aria-label einsteigen, nicht über `.side-dock-ribbon-action`:
  // die Klasse gehört Obsidian, und dessen eigene Ribbon-Knöpfe stehen davor.
  const ribbon = await cdp.evaluate<boolean>(`
    const kandidaten = [...document.querySelectorAll(".side-dock-ribbon-action")];
    return kandidaten.some((el) => (el.getAttribute("aria-label") || "").includes("Paperize"));
  `);
  record('A3 Ribbon-Knopf vorhanden', ribbon, ribbon ? 'aria-label enthält "Paperize"' : 'kein Ribbon-Knopf mit Paperize-Label');
}

async function pruefeGrundfall(cdp: Cdp, vaultDir: string): Promise<void> {
  console.log('\nB · Export-Grundfall (neben der Notiz)');

  await setSettings(cdp, { outputMode: 'nextToNote', filenameTemplate: '{title}' });
  const notice = await exportNote(cdp, 'Smoke.md');
  const ziel = join(vaultDir, 'Smoke.pdf');
  const da = await warteAufDatei(ziel);
  record('B1 PDF entsteht neben der Notiz', da, da ? `${ziel.replace(vaultDir, '<vault>')} · ${readFileSync(ziel).length} Bytes` : `keine Datei nach 10 s: ${ziel}` + ` · Notice: ${notice || '(keine)'}`);
  if (!da) throw new Error(`Ohne PDF ist der Rest gegenstandslos. Notice des Prüflings: ${notice || '(keine)'}`);

  const bytes = readFileSync(ziel);
  const magic = bytes.subarray(0, 5).toString('latin1') === '%PDF-';
  record('B2 Datei ist ein PDF', magic && bytes.length > 2000, `${bytes.subarray(0, 8).toString('latin1').replace(/\n/g, '')} · ${bytes.length} Bytes · ${pdfSeiten(bytes)} Seite(n)`);

  record(
    'B3 Notice nennt den gespeicherten Pfad',
    notice.includes('Smoke.pdf'),
    notice || '(keine Notice)',
  );

  // Das Kernversprechen: Vektor-PDF mit echtem Text, keine Rastergrafik einer Seite.
  const fonts = pdfFonts(bytes);
  const core14 = fonts.length > 0 && fonts.every((f) => /^(Helvetica|Times|Courier)/.test(f));
  const eingebettet = /\/FontFile\d?\b/.test(bytes.toString('latin1'));
  record(
    'B4 Text ist Vektor-Text in Core-14-Schriften',
    core14 && !eingebettet,
    `${fonts.join(', ') || 'keine /BaseFont-Objekte'}${eingebettet ? ' · WARNUNG: /FontFile gefunden' : ''}`,
  );
}

async function pruefeDomToIr(vaultDir: string): Promise<void> {
  console.log('\nC · DOM→IR am echten Export-DOM');

  const bytes = readFileSync(join(vaultDir, 'Smoke.pdf'));
  const text = pdfText(bytes);
  const roh = bytes.toString('latin1');

  const fehlt = (...marken: string[]): string[] => marken.filter((m) => !text.includes(m));

  const struktur = fehlt('MARKH1', 'MARKH2', 'MARKBOLD', 'MARKITAL', 'MARKINLINE');
  record('C1 Überschriften, Auszeichnung, Inline-Code', struktur.length === 0, struktur.length ? `fehlt im PDF: ${struktur.join(', ')}` : 'alle 5 Marker im PDF-Text');

  const listen = fehlt('MARKLIA', 'MARKLIB', 'MARKOLA', 'MARKQUOTE');
  record('C2 Listen (verschachtelt, nummeriert) und Blockzitat', listen.length === 0, listen.length ? `fehlt im PDF: ${listen.join(', ')}` : 'alle 4 Marker im PDF-Text');

  const tabelle = fehlt('MARKTABA', 'MARKTABB');
  record('C3 Tabellenzellen', tabelle.length === 0, tabelle.length ? `fehlt im PDF: ${tabelle.join(', ')}` : 'beide Zellen im PDF-Text');

  // Regression 0.3.2: ein Codeblock-Post-Prozessor eines anderen Plugins ersetzte das <pre>,
  // die Blöcke fehlten und die Platzhalter standen als Fließtext im PDF.
  const codeDa = fehlt('MARKCODEA', 'MARKCODEB');
  const platzhalter = /PAPERIZECODE\d/.test(text);
  record(
    'C4 Codeblöcke vollständig, keine Platzhalter im Fließtext',
    codeDa.length === 0 && !platzhalter,
    platzhalter ? 'PAPERIZECODE-Platzhalter steht als Text im PDF' : (codeDa.length ? `fehlt im PDF: ${codeDa.join(', ')}` : 'beide Blöcke im PDF, kein Platzhalter'),
  );

  // Regression 2026-08-04: Task-Listen verloren ihre Kästchen.
  const kaestchen = /\[\s?\]/.test(text) && /\[x\]/i.test(text);
  record(
    'C5 Task-Listen behalten [ ] und [x]',
    kaestchen && fehlt('MARKTASKOPEN', 'MARKTASKDONE').length === 0,
    kaestchen ? 'beide Kästchen im PDF-Text' : 'kein [ ] und/oder [x] im PDF-Text',
  );

  // Das Bild wird zu JPEG re-encodiert und als /DCTDecode-Stream eingebettet.
  const jpeg = /\/Filter\s*\/DCTDecode/.test(roh);
  record('C6 Bild als JPEG eingebettet', jpeg, jpeg ? '/DCTDecode-Stream im PDF' : 'kein /DCTDecode — Bild fehlt oder wurde verworfen');

  // Core-14 kann nicht alles, und die Engine hat dafuer drei abgestufte Antworten
  // (`encoding.ts`): Latin-1 direkt, haeufige Symbole als ASCII-Ersatz, Unmappbares
  // weglassen statt '?'. Alle drei sind hier eine eigene Behauptung — ein Punkt, der nur
  // "Marker vorhanden" prueft, waere gruen, waehrend die Zeile verstuemmelt im PDF steht.
  const umlaute = text.includes('äöüß');
  const pfeil = /MARKPFEIL:\s*->/.test(text);
  const emojiZeile = text.includes('MARKEMOJI');
  record(
    'C7 Sonderzeichen ueberleben die WinAnsi-Kodierung',
    umlaute && pfeil && emojiZeile,
    [
      umlaute ? 'äöüß als Latin-1' : 'Umlaute fehlen im PDF-Text',
      pfeil ? 'Pfeil als "->" ersetzt' : 'Pfeil nicht auf ASCII abgebildet',
      emojiZeile ? 'Zeile um das unmappbare Emoji bleibt' : 'Zeile mit Emoji ging verloren',
    ].join(' · '),
  );

  // Regression 2026-09-02: Traegt die Notiz ihren Titel als eigene H1, wurde er im PDF
  // ZWEIMAL gesetzt — einmal als Dokumenttitel, einmal als Ueberschrift. Kein Unit-Test sah
  // das (die Zusicherung „ein Titel wird gesetzt" war erfuellt), gefunden hat es der Blick
  // auf ein README-Bild. Gemessen wird deshalb die WIEDERHOLUNG, nicht die Existenz.
  const h1 = 'Ueberschrift Eins MARKH1';
  const male = text.split(h1).length - 1;
  record(
    'C9 Titel steht nicht doppelt, wenn die Notiz eine H1 hat',
    male === 1,
    male === 1 ? 'Ueberschrift genau einmal im PDF' : `Ueberschrift ${male}x im PDF — Dokumenttitel wiederholt die H1`,
  );

  record('C8 Link-Text bleibt erhalten', text.includes('MARKLINK'), text.includes('MARKLINK') ? 'Linktext im PDF' : 'MARKLINK fehlt im PDF');
}

async function pruefeDegradation(cdp: Cdp, vaultDir: string): Promise<void> {
  console.log('\nD · Degradation statt Abbruch');

  // Regression 2026-08-04, der teuerste Fund des Plugins: Formeln verschwanden spurlos UND
  // ungezählt — weder Block noch Zähler, die Notice schwieg, während Inhalt fehlte.
  const notice = await exportNote(cdp, 'Nur-Mathe.md');
  const ziel = join(vaultDir, 'Nur-Mathe.pdf');
  const da = await warteAufDatei(ziel);
  record('D1 Export läuft trotz nicht unterstützter Elemente durch', da, da ? 'PDF entstanden' : `keine Datei · Notice: ${notice || '(keine)'}`);

  const gezaehlt = /\b[1-9]\d*\b/.test(notice) && /(vereinfacht|simplified)/i.test(notice);
  record(
    'D2 Nicht Unterstütztes wird GEZÄHLT, nicht verschwiegen',
    gezaehlt,
    notice || '(keine Notice — genau der Fehlerfall vom 2026-08-04)',
  );

  if (da) {
    const text = pdfText(readFileSync(ziel));
    record(
      'D3 Text um das Unbekannte herum bleibt erhalten',
      text.includes('MARKMATHTEXT') && text.includes('MARKMATHH1'),
      text.includes('MARKMATHTEXT') ? 'Absatz und Überschrift im PDF' : 'Text um die Formel fehlt — Degradation hat mehr mitgenommen als sie sollte',
    );
    record(
      'D4 Callout wird vereinfacht dargestellt, nicht verworfen',
      text.includes('MARKCALLOUT'),
      text.includes('MARKCALLOUT') ? 'Callout-Text im PDF' : 'MARKCALLOUT fehlt — der Callout-Inhalt ging verloren',
    );
  } else {
    skipped('D3/D4 Inhalt trotz Degradation', 'kein PDF entstanden');
  }

  // Leere Notiz: eine Meldung, kein leeres PDF.
  const leerNotice = await exportNote(cdp, 'Leer.md');
  const leerPdf = existsSync(join(vaultDir, 'Leer.pdf'));
  record(
    'D5 Notiz ohne Inhalt erzeugt Meldung statt leerem PDF',
    !leerPdf && /(Nichts zu exportieren|Nothing to export)/i.test(leerNotice),
    `${leerPdf ? 'Leer.pdf wurde angelegt' : 'kein PDF'} · Notice: ${leerNotice || '(keine)'}`,
  );
}

async function pruefeDateiname(cdp: Cdp, vaultDir: string): Promise<void> {
  console.log('\nE · Dateiname-Schema und Ausgabemodi');

  const notiz = 'Unterordner/Versionsnotiz.md';
  const dir = join(vaultDir, 'Unterordner');

  // {version} zählt hoch, statt zu überschreiben.
  await setSettings(cdp, { outputMode: 'nextToNote', filenameTemplate: '{title} v{version}' });
  await exportNote(cdp, notiz);
  await warteAufDatei(join(dir, 'Versionsnotiz v1.pdf'));
  await exportNote(cdp, notiz);
  const v2 = await warteAufDatei(join(dir, 'Versionsnotiz v2.pdf'));
  const v1 = existsSync(join(dir, 'Versionsnotiz v1.pdf'));
  record(
    'E1 {version} zählt hoch statt zu überschreiben',
    v1 && v2,
    `v1 ${v1 ? 'da' : 'fehlt'} · v2 ${v2 ? 'da' : 'fehlt'}`,
  );

  // Ohne {version} bleibt es bei einer Datei — sonst wäre die Zählschleife endlos, und
  // der hasVersionPlaceholder-Guard ist genau ihr Abbruch.
  await setSettings(cdp, { filenameTemplate: '{title}' });
  await exportNote(cdp, notiz);
  await warteAufDatei(join(dir, 'Versionsnotiz.pdf'));
  await exportNote(cdp, notiz);
  const anzahl = readdirSync(dir).filter((f) => f === 'Versionsnotiz.pdf').length;
  record(
    'E2 ohne {version} wird überschrieben, nicht gezählt',
    anzahl === 1 && !existsSync(join(dir, 'Versionsnotiz 1.pdf')),
    `${anzahl} Datei(en) namens Versionsnotiz.pdf`,
  );

  // Eigener Ordner: wird angelegt, wenn er fehlt.
  await setSettings(cdp, { outputMode: 'customFolder', customFolder: 'Export/PDF', filenameTemplate: '{title}' });
  await exportNote(cdp, notiz);
  const imOrdner = await warteAufDatei(join(vaultDir, 'Export/PDF/Versionsnotiz.pdf'));
  record('E3 eigener Ordner wird angelegt und beschrieben', imOrdner, imOrdner ? 'Export/PDF/Versionsnotiz.pdf' : 'Datei fehlt in Export/PDF/');

  // Freitext-Schema mit verbotenen Zeichen: sanitizeFilename muss greifen, sonst entsteht
  // ein Unterordner (Slash) oder gar nichts (Doppelpunkt).
  await setSettings(cdp, { outputMode: 'nextToNote', filenameTemplate: 'A/B:C {title}' });
  await exportNote(cdp, notiz);
  await new Promise((r) => setTimeout(r, 500));
  const dateien = readdirSync(dir).filter((f) => f.endsWith('.pdf'));
  const phantom = existsSync(join(dir, 'A'));
  const bereinigt = dateien.some((f) => f.includes('Versionsnotiz') && !f.includes('/') && !f.includes(':') && f !== 'Versionsnotiz.pdf');
  record(
    'E4 verbotene Zeichen im Schema werden bereinigt',
    bereinigt && !phantom,
    `${phantom ? 'Phantom-Ordner "A" angelegt · ' : ''}Dateien: ${dateien.join(', ') || '(keine)'}`,
  );
}

/** Bilder im PDF zaehlen: jedes eingebettete Bild ist ein `/Subtype /Image`-Objekt (JPEG,
 *  `/DCTDecode`). Zaehlt Bloecke der IR 1:1, weil der Renderer je Bildblock genau eins schreibt. */
function pdfBilder(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length;
}

/** Lokaler Bild-Server: `/probe.png` liefert das Fixture-Bild, `/haengt.png` antwortet nie.
 *  Der Treiber bringt seinen Fake-Server selbst mit — ein Prüfpunkt gegen https://example.com
 *  hinge sonst am Netz des Rechners und meldete bei Offline-Betrieb rot ohne Befund. */
function starteBildServer(): Promise<{ server: Server; port: number }> {
  const png = readFileSync(join(FIXTURE_DIR, 'notes/assets/probe.png'));
  const server = createServer((req, res) => {
    if (req.url === '/probe.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); return; }
    if (req.url === '/haengt.png') return; // nie antworten
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port })));
}

async function pruefeBilder(cdp: Cdp, vaultDir: string): Promise<void> {
  console.log('\nG · Bilder');

  // E4 laesst ein Schema mit Sonderzeichen stehen — die Ausgabedateien hiessen sonst `A_B_C Bilder.pdf`.
  await setSettings(cdp, { outputMode: 'nextToNote', filenameTemplate: '{title}' });

  // Messung 2026-09-25: Embeds stehen im losgelösten Container SOFORT als <img> da — ein Warten
  // ist unnötig. Dieser Punkt fasst die drei Wege, die Nutzer tatsächlich schreiben, in ein PDF.
  await exportNote(cdp, 'Bilder.md');
  const da = await warteAufDatei(join(vaultDir, 'Bilder.pdf'));
  const n = da ? pdfBilder(readFileSync(join(vaultDir, 'Bilder.pdf'))) : 0;
  record('G1 Wikilink-Embed, Markdown-Bild und Inline-Bild landen als Bilder im PDF', n >= 3, da ? `${n} Bild(er) im PDF (erwartet ≥ 3)` : 'Bilder.pdf fehlt');

  // Kit 0.42.0: ein Bild im Listenpunkt wird ein eigener Bildblock, in einer Tabellenzelle ein
  // sichtbares "[Bild: alt]". Bis dahin verschwand beides still (nur ein Zaehler stieg).
  await exportNote(cdp, 'Bilder-Liste.md');
  const lDa = await warteAufDatei(join(vaultDir, 'Bilder-Liste.pdf'));
  const lBytes = lDa ? readFileSync(join(vaultDir, 'Bilder-Liste.pdf')) : null;
  const lText = lBytes ? pdfText(lBytes) : '';
  record(
    'G4 Bild im Listenpunkt wird Bildblock, Bild in der Tabellenzelle bleibt als Text sichtbar',
    lBytes !== null && pdfBilder(lBytes) >= 1 && lText.includes('MARKPUNKT') && lText.includes('MARKZELLE') && /\[Bild: probe\.png\]|\[Image: probe\.png\]/.test(lText),
    lBytes ? `${pdfBilder(lBytes)} Bild(er) im PDF · Zelle: ${/\[(Bild|Image): probe\.png\]/.test(lText) ? 'Platzhalter da' : 'FEHLT'}` : 'Bilder-Liste.pdf fehlt',
  );

  const { server, port } = await starteBildServer();
  const remote = join(vaultDir, 'Bild-Remote.md');
  try {
    writeFileSync(remote, `# Remote\n\nMARKREMOTE\n\n![fern](http://127.0.0.1:${port}/probe.png)\n`);
    await new Promise((r) => setTimeout(r, 1200)); // Obsidian muss die neue Datei indizieren
    await exportNote(cdp, 'Bild-Remote.md');
    const rDa = await warteAufDatei(join(vaultDir, 'Bild-Remote.pdf'));
    const rn = rDa ? pdfBilder(readFileSync(join(vaultDir, 'Bild-Remote.pdf'))) : 0;
    record('G2 entferntes Bild (http) wird über requestUrl geholt und eingebettet', rn >= 1, rDa ? `${rn} Bild(er) im PDF` : 'Bild-Remote.pdf fehlt');

    // Ein Host, der nie antwortet, darf den Export nicht blockieren: Platzhalter statt Hänger.
    writeFileSync(remote, `# Remote\n\nMARKHAENGT\n\n![haengt](http://127.0.0.1:${port}/haengt.png)\n`);
    rmSync(join(vaultDir, 'Bild-Remote.pdf'), { force: true });
    await new Promise((r) => setTimeout(r, 1200));
    const t0 = Date.now();
    await exportNote(cdp, 'Bild-Remote.md');
    const hDa = await warteAufDatei(join(vaultDir, 'Bild-Remote.pdf'), 40_000);
    const dauer = Math.round((Date.now() - t0) / 1000);
    const text = hDa ? pdfText(readFileSync(join(vaultDir, 'Bild-Remote.pdf'))) : '';
    record('G3 nie antwortender Bild-Host: PDF entsteht mit Platzhalter, kein Hänger', hDa && text.includes('MARKHAENGT') && text.includes('[Bild: haengt]'), hDa ? `nach ${dauer} s · Platzhalter ${text.includes('[Bild: haengt]') ? 'da' : 'FEHLT'}` : 'kein PDF nach 40 s');
  } finally {
    server.closeAllConnections();
    server.close();
    rmSync(remote, { force: true });
  }
}

async function pruefeSettings(cdp: Cdp): Promise<void> {
  console.log('\nF · Settings — beide Render-Pfade aus einer Wahrheit');

  // Der native Pfad ab 1.13: der Host fragt die Definitionen selbst ab und nimmt die Zeilen
  // in die Settings-SUCHE auf. Der Obsidian-Mock kann das nicht prüfen (`Setting` ist dort
  // eine leere Klasse) — deshalb steht der Punkt hier.
  const defs = await cdp.evaluate<{ gruppen: number; items: number; keys: string[]; slider: string[] } | null>(`
    const tabs = app.setting.pluginTabs || [];
    const tab = tabs.find((t) => t.id === ${JSON.stringify(PLUGIN_ID)});
    if (!tab || typeof tab.getSettingDefinitions !== "function") return null;
    const gruppen = tab.getSettingDefinitions();
    const items = [];
    for (const g of gruppen) for (const i of (g.items || [])) items.push(i);
    return {
      gruppen: gruppen.length,
      items: items.length,
      keys: gruppen.map((g) => g.heading || g.key || "?"),
      slider: items.filter((i) => i.control && i.control.type === "slider").map((i) => i.name || "?"),
    };
  `);

  if (!defs) {
    skipped('F1–F3 deklarative Settings-Definitionen', 'kein pluginTab mit getSettingDefinitions — Obsidian < 1.13?');
  } else {
    record('F1 getSettingDefinitions liefert die fünf Sektionen', defs.gruppen === 5, `${defs.gruppen} Gruppe(n): ${defs.keys.join(' · ')}`);
    record('F2 alle Einstellungen sind über die Definitionen erreichbar', defs.items >= 17, `${defs.items} Einträge (Settings-Suche findet genau diese)`);
    // Begrenzte Zahlenwerte gehören in einen Slider: ein Textfeld mit if-Guard verwirft eine
    // Eingabe außerhalb der Grenzen STILL — nichts gespeichert, nichts gemeldet, das Feld
    // zeigt weiter den getippten Wert. Die Anzeige lügt.
    record('F3 begrenzte Zahlenwerte sind Slider, keine Textfelder', defs.slider.length >= 5, `${defs.slider.length} Slider: ${defs.slider.join(' · ')}`);
  }

  // Der Fallback-Pfad: dieselben Definitionen, nachgezeichnet in einklappbaren Sektionen.
  //
  // Die Messung trennt drei Ausgänge, statt sie zu einem `false` zu verrechnen: kein
  // Container (das Einstellungen-Fenster ist ab 1.13 ein eigenes Dokument — dann ist der
  // Punkt NICHT MESSBAR), Container ohne Sektionen (Befund), Sektionen da (grün). Die erste
  // Fassung konnte das nicht: sie gab bei 0 Treffern „nicht gefunden" zurück und begründete
  // es mit dem 1.13-Fenster — beim ersten Lauf gegen 1.12.4 war das nachweislich falsch
  // (das Modal stand im Hauptfenster, nur der Selektor traf die Kit-Klasse nicht). Ein
  // Werkzeug, dessen Fehlschlag die falsche Ursache nennt, blockiert die Fehlersuche aktiv.
  const tabDom = await cdp.evaluate<{
    container: string; version: string; collapsibles: number; headings: number; zeilen: number; titel: string[];
  }>(`
    app.setting.open();
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 700));
    const docs = [["Hauptfenster", document]];
    if (typeof activeDocument !== "undefined" && activeDocument && activeDocument !== document) {
      docs.push(["Einstellungen-Fenster", activeDocument]);
    }
    // Die Version zur LAUFZEIT erfragen, nicht aus Info.plist: die App aktualisiert sich
    // intern, ohne sie zu ändern (gemessen 2026-08-14: Datei sagte 1.12.4, es lief 1.13.7).
    let version = "?";
    try { version = require("electron").ipcRenderer.sendSync("version"); } catch (e) { version = "?"; }
    for (const [ort, doc] of docs) {
      const container = doc.querySelector(".vertical-tab-content.is-active") ?? doc.querySelector(".vertical-tab-content");
      if (!container) continue;
      const collapsibles = [...container.querySelectorAll(".okit-collapsible")];
      const headings = [...container.querySelectorAll(".setting-item-heading")];
      const quelle = collapsibles.length ? collapsibles : headings;
      return {
        container: ort,
        version,
        collapsibles: collapsibles.length,
        headings: headings.length,
        // Ohne die Gruppen-Überschriften zählen: der native Renderer führt sie selbst als
        // .setting-item, und ein Vergleich mit der Definitionszahl ginge sonst um 5 daneben.
        zeilen: container.querySelectorAll(".setting-item:not(.setting-item-heading)").length,
        titel: quelle.map((s) => (
          (s.querySelector(".okit-collapsible-title") ?? s.querySelector(".setting-item-name") ?? s).textContent ?? "?"
        ).trim()),
      };
    }
    return { container: "", version, collapsibles: 0, headings: 0, zeilen: 0, titel: [] };
  `);

  if (!tabDom.container) {
    skipped(
      'F4/F5 Settings-Tab im DOM',
      'kein .vertical-tab-content im verbundenen Fenster — dann per attachTo("settings", port) auf das Fenster ohne Workspace verbinden',
    );
  } else {
    // ⚠️ Zwei zulässige Ausgänge, nicht einer. Die Sektionsgliederung entsteht ab 1.13 durch
    // den NATIVEN Renderer (`.setting-item-heading` je Gruppe, kein Collapse-Verhalten —
    // `settings.ts` nennt das als bewusst akzeptierten Unterschied) und darunter durch den
    // Fallback (`.okit-collapsible`). Ein Punkt, der nur die Collapsibles kennt, ist unter
    // 1.13 dauerhaft rot bei intaktem Code — gemessen 2026-09-02: 0 Collapsibles, 5 native
    // Headings, 23 Zeilen. Falsch ist allein das stumme Dritte: KEINE Gliederung, und genau
    // das war der Ausgangsdefekt von 0.3.0 (17 Einstellungen ohne einen Abschnitts-Header,
    // in der das vorhandene „Ausgabeziel" unauffindbar war).
    const pfad = tabDom.collapsibles ? 'Fallback (einklappbar)' : 'nativ (Host zeichnet)';
    record(
      'F4 der Tab ist in fünf Sektionen gegliedert — auf einem der beiden Pfade',
      Math.max(tabDom.collapsibles, tabDom.headings) === 5,
      `Obsidian ${tabDom.version} · ${pfad} · ${tabDom.collapsibles} einklappbar / ${tabDom.headings} native Header im ${tabDom.container}: ${tabDom.titel.join(' · ') || 'keine'}`,
    );
    // Beide Pfade speisen sich aus `groups()`. Driften sie auseinander, ist genau das der
    // Defekt, den die Zweigleisigkeit riskiert — messbar an der Zeilenzahl.
    record(
      'F5 der gezeichnete Tab führt so viele Zeilen wie die Definitionen',
      defs !== null && tabDom.zeilen === defs.items,
      defs === null ? `${tabDom.zeilen} Zeilen, Definitionen nicht lesbar` : `${tabDom.zeilen} Zeilen im Tab, ${defs.items} in den Definitionen`,
    );
  }

  await cdp.evaluate('app.setting.close(); return true;');
}

/* ------------------------------------------------------------------- Lauf */

function setupVault(): void {
  const vaultDir = stagingVaultDir(REPO_NAME);
  const log = buildVault({ repoRoot: REPO_ROOT, vaultDir, fixtureDir: FIXTURE_DIR, pluginId: PLUGIN_ID });
  console.log(`Staging-Vault gebaut: ${vaultDir}`);
  for (const zeile of log) console.log(`  · ${zeile}`);
  console.log('\nDen Vault in Obsidian öffnen (registriert ihn zugleich):');
  console.log(`  open "obsidian://open?path=${encodeURIComponent(join(vaultDir, 'Smoke.md'))}"`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--setup')) {
    setupVault();
    return;
  }

  const portArg = argv.indexOf('--port');
  const port = portArg >= 0 ? Number(argv[portArg + 1]) : 9222;
  const vaultArg = argv.indexOf('--vault');
  const vaultFilter = vaultArg >= 0 ? argv[vaultArg + 1] : REPO_NAME;
  const behalten = argv.includes('--keep');

  const cdp = await attachTo('workspace', port, vaultFilter);
  if (!cdp) throw new Error(`Kein Obsidian-Fenster für Vault "${vaultFilter}" auf Port ${port}.`);

  let vorher: Record<string, unknown> | null = null;
  let vaultDir = '';
  // Ein SIGINT mitten im Lauf ueberspringt das `finally` unten NICHT im try/catch-Sinn,
  // sondern beendet den Node-Prozess sofort — die per `setSettings` geschriebenen Test-
  // Einstellungen (data.json des Vaults) blieben ohne diesen Handler bis zur naechsten
  // manuellen Reparatur stehen. `vorher` ist zum Zeitpunkt des Signals der jeweils aktuelle
  // Wert (per closure, kein Snapshot) — genau der Vorwert, den das echte `finally` auch nimmt.
  let signalCleanupRunning = false;
  const onAbortSignal = (signal: NodeJS.Signals): void => {
    if (signalCleanupRunning) return;
    signalCleanupRunning = true;
    void (async () => {
      console.log(`\n\nAbbruch durch ${signal} — raeume Einstellungen auf...`);
      if (vorher) {
        await setSettings(cdp, vorher).catch(() => {
          console.log('  ! Einstellungen konnten nicht zurueckgeschrieben werden — von Hand pruefen');
        });
      }
      cdp.close();
      process.exit(130);
    })();
  };
  process.on('SIGINT', onAbortSignal);
  process.on('SIGTERM', onAbortSignal);

  try {
    await cdp.mitschnitt((zeile) => { if (/error|exception/i.test(zeile)) warnungen.push(`Renderer: ${zeile}`); });
    await requireVisible(cdp);

    const v = await vaultInfo(cdp);
    vaultDir = v.basePath;
    console.log(`Vault: ${v.name} (${v.basePath})`);

    // Läuft dieser Lauf gegen den eigenen Stand? `manifest.version` ist dagegen blind:
    // Store-Build und Repo-Build tragen dieselbe Nummer. Der Pfad kommt aus der LAUFENDEN
    // Instanz, nicht aus stagingVaultDir() — sonst prüfte der Guard eine andere Datei als
    // die benutzte.
    requireEigenerBuild(
      join(v.basePath, v.configDir, 'plugins', PLUGIN_ID, 'main.js'),
      join(REPO_ROOT, 'main.js'),
      (m) => warnungen.push(m),
    );

    vorher = await readSettings(cdp);
    // A0 — ein per Ctrl-C abgebrochener Vorlauf haette `vorher` NIE zurueckgeschrieben; der
    // hier gelesene Wert waere dann bereits ein Test-Patch statt des echten Ausgangszustands
    // (E3 setzt zuletzt customFolder:'Export/PDF', OHNE es je zurueckzusetzen — das ueberlebt
    // sogar einen normal durchgelaufenen Testlauf bis zum `finally`). Ohne diese Reparatur
    // wuerde JEDER kuenftige Lauf den kaputten Wert als "Original" uebernehmen und dauerhaft
    // auf sich selbst zurueckschreiben — eine Korruption, die sich selbst verewigt.
    const kaputtesVorher = vorher.outputMode === 'customFolder' || vorher.customFolder === 'Export/PDF';
    record(
      'A0 Kein liegen gebliebener Test-Ausgabepfad aus einem abgebrochenen Vorlauf',
      !kaputtesVorher,
      kaputtesVorher
        ? 'outputMode/customFolder trugen den E3-Testwert — auf Plugin-Default (nextToNote/"") zurueckgesetzt'
        : 'Ausgangszustand unauffaellig',
    );
    if (kaputtesVorher) {
      vorher = { ...vorher, outputMode: 'nextToNote', customFolder: '', filenameTemplate: '{title}' };
    }
    raeumePdfs(vaultDir);

    await pruefeGrundlage(cdp, v);
    await pruefeGrundfall(cdp, vaultDir);
    await pruefeDomToIr(vaultDir);
    await pruefeDegradation(cdp, vaultDir);
    await pruefeDateiname(cdp, vaultDir);
    await pruefeBilder(cdp, vaultDir);
    await pruefeSettings(cdp);
  } finally {
    // Vorwert zurück, auch nach Abbruch. Die Settings des Prüflings sind das Einzige, was
    // dieser Lauf am Wirt verändert — die PDFs sind seine eigene Ausgabe.
    if (vorher) {
      try {
        await setSettings(cdp, vorher);
        const nachher = await readSettings(cdp);
        const gleich = JSON.stringify(nachher) === JSON.stringify(vorher);
        console.log(`\nEinstellungen zurückgeschrieben: ${gleich ? 'gleich' : 'ABWEICHUNG — von Hand prüfen'}`);
      } catch (e) {
        console.error(`Einstellungen NICHT zurückgeschrieben: ${(e as Error).message}`);
      }
    }
    if (vaultDir && !behalten) {
      const n = raeumePdfs(vaultDir);
      console.log(`Erzeugte PDFs entfernt: ${n}`);
    }
    cdp.close();
    // Abmelden, sonst haengt ein SPAETES Signal (nach normalem Abschluss, cdp schon zu) den
    // Prozess in onAbortSignal an einer toten Verbindung auf.
    process.off('SIGINT', onAbortSignal);
    process.off('SIGTERM', onAbortSignal);
  }

  const rot = results.filter((r) => !r.passed);
  console.log(`\n${results.length - rot.length}/${results.length} Prüfpunkte grün`);
  if (uebersprungen.length) console.log(`Übersprungen: ${uebersprungen.join(' · ')}`);
  for (const w of warnungen) console.log(`WARNUNG: ${w}`);
  console.log(
    'Nicht mechanisch geprüft: wie das PDF AUSSIEHT — Umbruchästhetik, Waisen-/Witwenwirkung,\n' +
    'Grauwert, Bildqualität nach der JPEG-Re-Kodierung. Dafür bleibt der Blick ins Dokument.',
  );
  if (rot.length) {
    console.log(`\nRot: ${rot.map((r) => r.name).join(' · ')}`);
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(`\nABBRUCH: ${(e as Error).message}`);
  process.exitCode = 2;
});
