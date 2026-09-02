/**
 * Aufnahme-Treiber für die README-Bilder — fährt den Vertrag aus `docs/images/README.md`
 * gegen ein **laufendes** Obsidian, statt die Bilder von Hand zu klicken.
 *
 * Warum getrackt: ein Werkzeug, das nur einmal im Scratchpad existiert, ist keine Praxis.
 * Dieselbe Begründung wie bei `scripts/gui-smoke.ts`, mit dem sich dieser Treiber die
 * CDP-Brücke teilt (zentral im Dach, `tools/obsidian-cdp/`).
 *
 * ## Die Besonderheit dieses Plugins: das Ergebnis ist eine Datei, kein DOM
 *
 * Paperize' Produkt ist ein PDF. Ein Bild von der Oberfläche zeigt davon nichts — deshalb
 * öffnet dieser Treiber das erzeugte PDF in **Obsidians eigenem PDF-Viewer** und nimmt
 * Notiz und Dokument nebeneinander auf. Das ist der einzige Weg, im Bild zu zeigen, was
 * die README behauptet: derselbe Inhalt, einmal als Notiz, einmal als Dokument.
 *
 * ## Ablauf
 *
 * ⚠️ **Vor dem Quit koordinieren — Obsidian ist geteilte Infrastruktur.** Dieses Rezept
 * braucht den frischen Start (jeder Lauf hinterlässt Zustand). Läuft schon eine Instanz,
 * hängt jemand dran — dann ist die **Zweitinstanz** mit eigenem Profil der Ausweg, nicht
 * der Quit:
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "belegt — erst fragen, wem"
 * UD=/tmp/obs-paperize-shots; mkdir -p "$UD"
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9334 &
 * ```
 *
 * ⚠️ **Ein frisches Profil startet mit der GEBÜNDELTEN Obsidian-Version** (1.12.4), nicht
 * mit der aktualisierten (1.13.7) — und für die Settings-Bilder ist das ein Unterschied,
 * kein Detail: ab 1.13 zeichnet der Host die Einstellungen selbst (flache Überschriften,
 * eigenes Fenster), darunter zeichnet Paperize sie als einklappbare Gruppen. Die Bilder
 * sollen zeigen, was die Mehrheit sieht — also 1.13+. Die Version liegt im regulären
 * Profil als `.asar` und lässt sich hinüberkopieren:
 *
 * ```bash
 * cp ~/Library/Application\ Support/obsidian/obsidian-1.13.7.asar "$UD"/
 * ```
 *
 * ⚠️ **Und die Oberfläche muss auf Englisch stehen** — `README.md` ist die kanonische
 * Fassung, und `README.de.md` bettet dieselben Bilder ein. Die Sprache ist app-weit:
 * `localStorage["language"] = "en"` **und** `"language": "en"` in der `obsidian.json` des
 * Profils, dann neu starten. Der Treiber bricht sonst mit Klartext ab.
 *
 * ```bash
 * npm run build && npm run shots -- --setup    # Vault aus docs/images/fixture/
 * # Obsidian starten, Vault öffnen, Vertrauen bestätigen
 * npm run deploy                               # der Treiber nimmt auf, was IM VAULT liegt
 * npm run shots -- --only hero.png             # ein Bild pro Start
 * npm run shots -- --list
 * ```
 *
 * ⚠️ **Der Aufnahme-Vault ist derselbe wie der des GUI-Smoke** (`stagingVaultDir` gibt je
 * Repo genau einen). Beide Treiber bauen ihn aus ihrem eigenen Fixture — wer nach den
 * Bildern einen Smoke fährt, führt vorher dessen `--setup` aus, sonst sucht der Smoke
 * seine Marker-Notizen in den Schau-Notizen und wird rot.
 *
 * ## Fallstricke, die hier Zeit gekostet haben
 *
 * 1. **Der Trust-Dialog: die Zustimmung trägt keine Klasse.** `mod-cancel` ist die
 *    **Ablehnung**; wer auf „erster Button" zurückfällt, lehnt ab und misst danach eine
 *    Oberfläche ohne Plugin. Über den Text wählen.
 * 2. **Obsidians Dropdown ist ein natives `<select>`.** Seine geöffnete Liste ist ein
 *    OS-Menü und erscheint in keinem Screenshot — ein Bild „alle vier Ausgabeziele" ist
 *    mit CDP nicht aufnehmbar. Der Vertrag sagt das jetzt, statt es zu versprechen.
 * 3. **`data.json` überlebt den Neustart.** Ohne Zurücksetzen zeigt ein Settings-Bild den
 *    Wert, den ein anderes Motiv zwei Läufe vorher gesetzt hat.
 * 4. **Die Notice verschwindet nach wenigen Sekunden.** Bilder, die sie zeigen sollen,
 *    stellen erst die ganze Szene her und lösen den Export **zuletzt** aus.
 * 5. **Der PDF-Viewer braucht länger als das DOM.** Gewartet wird auf eine gezeichnete
 *    Seite, nicht auf das Blatt.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { argv, cwd, env, exit } from 'node:process';

import {
  Cdp,
  attachTo,
  closeExtraLeaves,
  openExisting,
  pollUntil,
  setAppConfig,
  setPluginSetting,
} from '../../tools/obsidian-cdp/cdp.js';
import { boxOf, capture, setWindowSize, writeShot, type Rect } from '../../tools/obsidian-cdp/shot.js';
import { buildVault, stagingVaultDir } from '../../tools/obsidian-cdp/vault.js';

const PLUGIN_ID = 'paperize';
const REPO_NAME = 'obsidian-paperize';
const OUT_DIR = 'docs/images';
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const PADDING = 10;
const FENSTER_BREITE = 1440;
const FENSTER_HOEHE = 900;

const NOTIZ = 'Quarterly Field Report.md';
const NOTIZ_DEGRADATION = 'Release Notes.md';
const PDF = 'Quarterly Field Report.pdf';
const PDF_V1 = 'Quarterly Field Report v1.pdf';
const PDF_V2 = 'Quarterly Field Report v2.pdf';
const PDF_DEGRADATION = 'Release Notes.pdf';

/* ------------------------------------------------------------------ Helfer */

/** Die Plugin-Einstellungen auf den Auslieferungszustand — vor JEDEM Motiv, nicht danach.
 *  Ein Aufnahme-Lauf ist eine Kette von Zuständen, und jedes Glied erbt den Rest des
 *  vorigen; wer nur aufräumt, hängt davon ab, dass das vorige Motiv sauber endete. */
async function grundzustand(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    Object.assign(p.settings, { outputMode: "nextToNote", filenameTemplate: "{title}", customFolder: "" });
    await p.saveSettings();
    for (const f of app.vault.getFiles()) {
      if (f.extension === "pdf") await app.fileManager.trashFile(f);
    }
    await new Promise((r) => setTimeout(r, 300));
    return true;
  `);
  await setAppConfig(cdp, 'livePreview', true);
}

/** Notices löschen — `.notice` gehört Obsidian, nicht dem Prüfling. */
async function clearNotices(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    const docs = new Set([document]);
    if (typeof activeDocument !== "undefined" && activeDocument) docs.add(activeDocument);
    for (const doc of docs) for (const n of doc.querySelectorAll(".notice")) n.remove();
    return true;
  `);
}

/** Export auslösen und auf die Datei im Vault warten. */
async function exportieren(cdp: Cdp, erwartet: string): Promise<boolean> {
  await cdp.evaluate(`
    app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:export-pdf`)});
    return true;
  `);
  const da = await pollUntil<boolean>(
    cdp,
    `return Boolean(app.vault.getAbstractFileByPath(${JSON.stringify(erwartet)}));`,
    15_000,
    250,
  );
  if (!da) {
    const lage = await cdp.evaluate<string>(`
      return JSON.stringify({
        vault: app.vault.getName(),
        aktiv: app.workspace.getActiveFile()?.path ?? null,
        pdfs: app.vault.getFiles().filter((f) => f.extension === "pdf").map((f) => f.path),
        notice: [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).join(" | "),
        pluginAn: !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}],
      });
    `);
    console.log(`      · kein PDF "${erwartet}" — ${lage}`);
  }
  return Boolean(da);
}

/** Leere Blätter schließen — die, die gar keine Datei tragen.
 *
 *  Abgrenzung zu `closeExtraLeaves`: das lässt genau **ein** Blatt stehen und ist damit für
 *  jedes Bild falsch, das absichtlich zwei nebeneinander zeigt. Übrig bleibt trotzdem gern
 *  ein „New tab" aus dem Vault-Start, weil `openExisting` bei abgetrenntem Blatt ein neues
 *  aufmacht statt das leere zu benutzen. Im Bild sieht das nach Unordnung aus und nach
 *  nichts sonst — gemessen an der ersten Fassung von `filename-versions.png`. */
async function schliesseLeereBlaetter(cdp: Cdp): Promise<number> {
  return Number(await cdp.evaluate<number>(`
    let n = 0;
    for (const leaf of app.workspace.getLeavesOfType("empty")) { leaf.detach(); n++; }
    await new Promise((r) => setTimeout(r, 250));
    return n;
  `));
}

/** Auf den gezeichneten Settings-Tab WARTEN, statt ihn sofort zu messen.
 *
 *  Der erste Anlauf maß direkt nach dem Attach und bekam nichts — und meldete das als
 *  „Zustand kam nicht zustande", was überallhin zeigt außer auf die Ursache. Eine separate
 *  Messung Sekundenbruchteile später fand denselben Tab vollständig: 5 Gruppen, Container
 *  675x670. Der Fehlschlag war eine Wartefrage, und die Meldung sagte das nicht.
 *
 *  Gewartet wird auf Gruppen mit **Ausdehnung**, nicht auf ihre Existenz: Obsidian legt das
 *  DOM des Tabs an, bevor es es einblendet, und ein Vergleich gegen ein 0x0-Element wäre
 *  grün, während im Bild nichts steht. */
async function settingsTabBereit(cdp: Cdp): Promise<boolean> {
  await cdp.send('Page.bringToFront');
  const da = await pollUntil<boolean>(cdp, `
    const g = [...document.querySelectorAll(".setting-group")]
      .filter((e) => e.getBoundingClientRect().height > 1);
    return g.length >= 5;
  `, 15_000, 300);
  if (!da) {
    const lage = await cdp.evaluate<string>(`
      const c = document.querySelector(".vertical-tab-content");
      return JSON.stringify({
        sichtbar: document.visibilityState,
        container: c ? Math.round(c.getBoundingClientRect().height) : null,
        gruppen: document.querySelectorAll(".setting-group").length,
        zeilen: document.querySelectorAll(".setting-item").length,
        aktiverTab: (document.querySelector(".vertical-tab-nav-item.is-active")?.textContent ?? "").trim(),
      });
    `);
    console.log(`      · Settings-Tab nicht gezeichnet — ${lage}`);
  }
  return Boolean(da);
}

/** Notiz links, erzeugtes PDF rechts. Das Kernbild dieses Plugins.
 *
 *  Gewartet wird auf eine **gezeichnete PDF-Seite**, nicht auf das geöffnete Blatt:
 *  Obsidians Viewer legt sein DOM sofort an und rendert die Seite Frames später — wer auf
 *  das Blatt wartet, fotografiert eine weiße Fläche und sieht das erst im Bild. */
async function splitNotizUndPdf(cdp: Cdp, notiz: string, pdf: string): Promise<boolean> {
  await closeExtraLeaves(cdp);
  if (!(await openExisting(cdp, notiz, 'preview'))) {
    console.log(`      · ${notiz} ließ sich nicht öffnen`);
    return false;
  }
  const geoeffnet = await cdp.evaluate<boolean>(`
    const file = app.vault.getAbstractFileByPath(${JSON.stringify(pdf)});
    if (!file) return false;
    const leaf = app.workspace.getLeaf("split", "vertical");
    await leaf.openFile(file);
    await new Promise((r) => setTimeout(r, 600));
    return true;
  `);
  if (!geoeffnet) {
    console.log(`      · ${pdf} nicht im Vault`);
    return false;
  }
  const gezeichnet = await pollUntil<boolean>(cdp, `
    const seiten = [...document.querySelectorAll("canvas")]
      .filter((c) => c.width > 50 && c.getBoundingClientRect().width > 50);
    return seiten.length > 0;
  `, 20_000, 400);
  await schliesseLeereBlaetter(cdp);
  if (!gezeichnet) {
    const lage = await cdp.evaluate<string>(`
      return JSON.stringify({
        blaetter: app.workspace.getLeavesOfType("pdf").length,
        canvas: document.querySelectorAll("canvas").length,
        embedFehler: (document.querySelector(".file-embed-message")?.textContent ?? "").trim(),
      });
    `);
    console.log(`      · PDF-Viewer hat nichts gezeichnet — ${lage}`);
  }
  return Boolean(gezeichnet);
}

/** Ausschnitt über beide Blätter des Hauptbereichs — ohne Sidebars, mit etwas Luft. */
async function hauptbereich(cdp: Cdp): Promise<Rect | null> {
  return boxOf(cdp, '.workspace-split.mod-root', PADDING);
}

/**
 * Einen Ausschnitt aufnehmen, der **höher ist als jedes Fenster** — in Kacheln, im
 * Renderer zusammengesetzt.
 *
 * Warum es diesen Umweg braucht, mit drei gemessenen Sackgassen davor: Obsidians
 * Settings-Tab ist 1754 px hoch, der Bildschirm gibt 949 her. Es half **nicht**,
 * (a) den Viewport zu emulieren (`withMetrics` vergrößert die Fläche nicht, die gezeichnet
 * wird), (b) hineinzuzoomen (`webFrame.setZoomLevel(-4)` verkleinert das Layout, ändert
 * aber nichts am Compositing-Surface) und (c) den Scroll-Container per DOM aufzuklappen,
 * obwohl `capture()` `captureBeyondViewport: true` setzt. Alle drei ergaben dasselbe Bild:
 * die obere Fensterhöhe mit Inhalt, darunter Schwarz. Der harte Grund ist Electron — die
 * gezeichnete Fläche eines BrowserWindow IST das Fenster.
 *
 * Also: scrollen, mehrfach aufnehmen, stapeln. Der Versatz kommt aus dem **tatsächlichen**
 * `scrollTop` nach jedem Schritt, nicht aus dem angeforderten: die letzte Kachel wird von
 * Chromium gekappt und überlappt die vorige, und wer die angeforderte Position verrechnet,
 * bekommt ein Bild mit einem doppelt gezeichneten Streifen in der Mitte.
 */
async function langerAusschnitt(cdp: Cdp, selector: string): Promise<Buffer | null> {
  const mass = await cdp.evaluate<{ sichtbar: number; gesamt: number } | null>(`
    const c = document.querySelector(${JSON.stringify(selector)});
    if (!c) return null;
    c.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 300));
    return { sichtbar: c.clientHeight, gesamt: c.scrollHeight };
  `);
  if (!mass) {
    console.log(`      · kein Element für "${selector}" — Ausschnitt nicht bestimmbar`);
    return null;
  }
  console.log(`      · ${mass.gesamt} px Inhalt in ${mass.sichtbar} px Fenster — stapele`);
  const kacheln = Math.max(1, Math.ceil(mass.gesamt / mass.sichtbar));
  const teile: { b64: string; versatz: number }[] = [];

  for (let i = 0; i < kacheln; i++) {
    const pos = await cdp.evaluate<{ scrollTop: number; box: Rect } | null>(`
      const c = document.querySelector(${JSON.stringify(selector)});
      if (!c) return null;
      // Weiches Scrollen abschalten, sonst liest die Messung gleich den ZIELWERT, während
      // gezeichnet noch die alte Position steht — die Kacheln sitzen dann versetzt und im
      // fertigen Bild fehlen ganze Zeilen (erste Fassung: unter "Page" standen die Zeilen
      // von "Typography"). Und danach auf zwei Frames warten, nicht auf eine Pauschale.
      c.style.scrollBehavior = "auto";
      c.scrollTop = ${i} * ${mass.sichtbar};
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 400));
      const r = c.getBoundingClientRect();
      return { scrollTop: c.scrollTop, box: { x: r.x, y: r.y, width: r.width, height: r.height } };
    `);
    if (!pos) return null;
    const png = await capture(cdp, pos.box, 2);
    teile.push({ b64: png.toString('base64'), versatz: pos.scrollTop });
  }

  // Zusammensetzen im Renderer: dort liegt der einzige Canvas, den die Brücke ohnehin
  // benutzt (`scaleTo`). Eine Bildbibliothek auf der Node-Seite wäre eine Abhängigkeit
  // für dreißig Zeilen.
  const b64 = await cdp.evaluate<string>(`
    const teile = ${JSON.stringify(teile)};
    const dpr = 2;
    const bilder = await Promise.all(teile.map((t) => new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => fail(new Error("Kachel nicht ladbar"));
      im.src = "data:image/png;base64," + t.b64;
    })));
    const breite = bilder[0].width;
    const gesamt = Math.round(${mass.gesamt} * dpr);
    const cv = document.createElement("canvas");
    cv.width = breite;
    cv.height = gesamt;
    const ctx = cv.getContext("2d");
    for (let i = 0; i < bilder.length; i++) {
      const y = Math.round(teile[i].versatz * dpr);
      ctx.drawImage(bilder[i], 0, y);
    }
    return cv.toDataURL("image/png").split(",")[1];
  `);
  return Buffer.from(b64, 'base64');
}

/* ------------------------------------------------------------------ Rezept */

interface Shot {
  name: string;
  klasse: 'hero' | 'feature' | 'detail';
  /** Braucht das Motiv Obsidians Einstellungen-Fenster (ab 1.13 ein eigenes Dokument)? */
  imSettingsFenster?: boolean;
  /** Ausschnitt zum Aufnehmen — oder ein **fertiges** Bild, wenn das Motiv größer ist als
   *  jedes Fenster und aus mehreren Aufnahmen entsteht. */
  run(cdp: Cdp): Promise<Rect | { png: Buffer } | null>;
}

const SHOTS: Shot[] = [
  {
    name: 'hero.png',
    klasse: 'hero',
    async run(cdp) {
      await grundzustand(cdp);
      if (!(await openExisting(cdp, NOTIZ, 'preview'))) return null;
      await closeExtraLeaves(cdp);
      if (!(await exportieren(cdp, PDF))) return null;
      if (!(await splitNotizUndPdf(cdp, NOTIZ, PDF))) return null;
      await clearNotices(cdp);
      return hauptbereich(cdp);
    },
  },
  {
    name: 'degradation.png',
    klasse: 'feature',
    async run(cdp) {
      await grundzustand(cdp);
      if (!(await openExisting(cdp, NOTIZ_DEGRADATION, 'preview'))) return null;
      await closeExtraLeaves(cdp);
      if (!(await exportieren(cdp, PDF_DEGRADATION))) return null;
      if (!(await splitNotizUndPdf(cdp, NOTIZ_DEGRADATION, PDF_DEGRADATION))) return null;
      // Die Notice ZULETZT erzeugen: sie verschwindet nach wenigen Sekunden, und sie ist
      // hier die eigentliche Aussage — nicht dass vereinfacht wird, sondern dass es
      // gezählt wird. Der erneute Export überschreibt dasselbe PDF.
      await clearNotices(cdp);
      await cdp.evaluate(`
        const blatt = app.workspace.getLeavesOfType("markdown")[0];
        if (blatt) app.workspace.setActiveLeaf(blatt, { focus: true });
        await new Promise((r) => setTimeout(r, 200));
        app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:export-pdf`)});
        return true;
      `);
      const notice = await pollUntil<string>(
        cdp,
        'const t = [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).filter((t) => /simplified|vereinfacht/i.test(t)).join(" | "); return t || null;',
        10_000,
        200,
      );
      if (!notice) console.log('      · keine Vereinfachungs-Notice erschienen');
      else console.log(`      · Notice: ${notice}`);
      return hauptbereich(cdp);
    },
  },
  {
    name: 'filename-versions.png',
    klasse: 'feature',
    async run(cdp) {
      await grundzustand(cdp);
      await setPluginSetting(cdp, PLUGIN_ID, 'filenameTemplate', '{title} v{version}');
      if (!(await openExisting(cdp, NOTIZ, 'preview'))) return null;
      await closeExtraLeaves(cdp);
      if (!(await exportieren(cdp, PDF_V1))) return null;
      if (!(await exportieren(cdp, PDF_V2))) return null;
      // Den Datei-Explorer zeigen: dort steht die Aussage — zweimal exportieren
      // überschreibt NICHT, es zählt hoch.
      await cdp.evaluate(`
        const blatt = app.workspace.getLeavesOfType("file-explorer")[0];
        if (blatt) app.workspace.revealLeaf(blatt);
        await new Promise((r) => setTimeout(r, 500));
        return true;
      `);
      if (!(await splitNotizUndPdf(cdp, NOTIZ, PDF_V2))) return null;
      await clearNotices(cdp);
      // Mit der linken Seitenleiste, sonst fehlt der Explorer im Bild.
      return boxOf(cdp, '.workspace', PADDING);
    },
  },
  {
    name: 'settings-output.png',
    klasse: 'feature',
    imSettingsFenster: true,
    async run(cdp) {
      if (!(await settingsTabBereit(cdp))) return null;
      // Die erste Gruppe IST „Output" — `SECTIONS` in src/obsidian/settings.ts führt sie
      // zuerst, und das ist kein Zufall, sondern die Lehre aus 0.3.0: das Ausgabeziel gab
      // es seit 0.1.0 und war in einer flachen Liste unauffindbar.
      const box = await boxOf(cdp, '.setting-group', PADDING);
      return box ?? boxOf(cdp, '.vertical-tab-content', PADDING);
    },
  },
  {
    name: 'settings-all.png',
    klasse: 'detail',
    imSettingsFenster: true,
    async run(cdp) {
      if (!(await settingsTabBereit(cdp))) return null;
      // Der ganze Tab ist höher als jedes Fenster (1754 px Inhalt, 949 px Bildschirm), also
      // in Kacheln aufnehmen und stapeln. Warum nicht anders — drei gemessene Sackgassen
      // stehen im Kopf von `langerAusschnitt`.
      const png = await langerAusschnitt(cdp, '.vertical-tab-content');
      return png ? { png } : null;
    },
  },
];

/* -------------------------------------------------------------------- Lauf */

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

/** Das Einstellungen-Fenster öffnen und dorthin verbinden.
 *
 *  Ab Obsidian 1.13 sind die Einstellungen ein **eigenes Fenster** mit URL `about:blank`;
 *  darunter ein Modal im Hauptfenster. Beide Fälle offenhalten und aus der **Sache**
 *  ableiten, welcher vorliegt — nie über den Fenstertitel, der ist lokalisiert. */
async function settingsVerbinden(cdp: Cdp, port: number): Promise<{ ziel: Cdp; eigenes: boolean }> {
  // Auslieferungszustand HERSTELLEN, bevor der Tab gezeichnet wird — und zwar im
  // Hauptfenster, wo `app.plugins` lebt. Die Settings-Motive bekommen später das
  // Settings-Fenster als Ziel und kämen dort gar nicht mehr an die Einstellungen heran.
  //
  // Warum das nötig ist: `data.json` überlebt den Obsidian-Neustart. Die erste Fassung von
  // `settings-output.png` zeigte deshalb `{title} v{version}` — den Wert, den das Motiv
  // `filename-versions` zwei Läufe vorher gesetzt hatte. Ein Bild, das eine Einstellung
  // zeigt, die so nie ausgeliefert wird, behauptet etwas Falsches über das Plugin, und
  // kein Check der Welt merkt es.
  await grundzustand(cdp);
  await cdp.evaluate(`
    app.setting.open();
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 900));
    return true;
  `);
  const imHauptfenster = await cdp.evaluate<boolean>(
    'return Boolean(document.querySelector(".modal.mod-settings .vertical-tab-content"));',
  );
  if (imHauptfenster) return { ziel: cdp, eigenes: false };
  const settings = await attachTo('settings', port);
  if (!settings) {
    throw new Error(
      'Einstellungen weder als Modal im Hauptfenster noch als eigenes Fenster gefunden.\n' +
      'Beides ist möglich (1.13 trennt sie ab) — hier war keines von beiden da.',
    );
  }
  return { ziel: settings, eigenes: true };
}

async function main(): Promise<void> {
  const repoRoot = cwd();
  const outDir = join(repoRoot, OUT_DIR);

  if (argv.includes('--list')) {
    for (const s of SHOTS) {
      console.log(`  ${s.klasse.padEnd(8)} ${s.name}${s.imSettingsFenster ? '  (Einstellungen)' : ''}`);
    }
    return;
  }

  if (argv.includes('--setup')) {
    const vaultDir = stagingVaultDir(REPO_NAME);
    console.log(`Aufnahme-Vault: ${vaultDir}`);
    for (const zeile of buildVault({
      repoRoot,
      vaultDir,
      fixtureDir: join(repoRoot, 'docs/images/fixture'),
      generator: 'make-assets.mjs',
      pluginId: PLUGIN_ID,
    })) {
      console.log(`  ${zeile}`);
    }
    console.log(
      '\n⚠️  Lief Obsidian während dieses Setups, muss es JETZT neu starten. --setup hat\n' +
      '   Notizen, Layout und Plugin-Einstellungen ersetzt; ein laufendes Obsidian hält den\n' +
      '   alten Stand im Speicher und schreibt ihn zurück.\n' +
      '\n⚠️  Dieser Vault ist derselbe, den scripts/gui-smoke.ts benutzt — er trägt jetzt die\n' +
      '   Schau-Notizen. Vor dem nächsten Smoke dessen eigenes --setup fahren.\n' +
      '\n⚠️  Erst prüfen, wer sonst an Obsidian hängt — ein Quit zerstört fremden Zustand,\n' +
      '   und der eigene Lauf ist danach trotzdem grün:\n' +
      '     lsof -nP -iTCP:9222 -sTCP:LISTEN\n' +
      '   Hängt jemand dran: Zweitinstanz mit eigenem --user-data-dir starten (Kopf dieser\n' +
      '   Datei), nicht quitten.\n' +
      `\n   open "obsidian://open?path=${encodeURIComponent(join(vaultDir, NOTIZ))}"\n` +
      '\n   Danach `npm run deploy` — der Treiber nimmt auf, was im Vault liegt.',
    );
    return;
  }

  const port = Number(flag('--port') ?? env.SHOTS_PORT ?? 9222);
  const nur = flag('--only');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const cdp = await attachTo('workspace', port, REPO_NAME);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.\n` +
      `  open "obsidian://open?vault=${REPO_NAME}"`,
    );
  }
  console.log(`Verbunden auf Port ${port}.\n`);
  await cdp.mitschnitt((zeile) => console.log(`      » ${zeile}`));
  await cdp.send('Page.bringToFront');

  const lage = await cdp.evaluate<{ version: string; sprache: string; pluginAn: boolean }>(`
    let version = "?";
    try { version = require("electron").ipcRenderer.sendSync("version"); } catch (e) { /* egal */ }
    return {
      version,
      sprache: window.localStorage.getItem("language") || "en",
      pluginAn: !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}],
    };
  `);
  console.log(`Obsidian ${lage.version} · Sprache ${lage.sprache} · Plugin ${lage.pluginAn ? 'aktiv' : 'NICHT aktiv'}`);

  if (!lage.pluginAn) {
    throw new Error(
      'Das Plugin ist im Aufnahme-Vault nicht aktiv. Beim ersten Öffnen fragt Obsidian, ob\n' +
      'es dem Vault-Autor vertraut — und die Zustimmung trägt KEINE Klasse, während\n' +
      '`mod-cancel` die Ablehnung ist. Im Zweifel von Hand bestätigen; ohne sie bleibt der\n' +
      'eingeschränkte Modus, und jedes Bild zeigte eine Oberfläche ohne Paperize.',
    );
  }
  if (lage.sprache !== 'en') {
    throw new Error(
      `Die Oberfläche steht auf "${lage.sprache}", die Bilder müssen englisch sein:\n` +
      '`README.md` ist die kanonische Fassung, und `README.de.md` bettet dieselben Bilder\n' +
      'ein. Sprache app-weit stellen (localStorage["language"] = "en" UND "language": "en"\n' +
      'in der obsidian.json des Profils), dann neu starten.',
    );
  }
  if (!lage.version.startsWith('1.13')) {
    console.log(
      `\n⚠️  Obsidian ${lage.version}: die Settings-Bilder zeigen dann den FALLBACK-Pfad\n` +
      '   (einklappbare Gruppen), nicht das, was die Mehrheit sieht. Für die README-Bilder\n' +
      '   die .asar aus dem regulären Profil ins Testprofil kopieren (Kopf dieser Datei).\n',
    );
  }

  await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);

  let settingsCdp: Cdp | null = null;
  const geplant = SHOTS.filter((s) => !nur || s.name === nur || s.name === `${nur}.png`);
  if (!geplant.length) throw new Error(`Kein Motiv namens "${nur}". --list zeigt den Vertrag.`);

  const fehlend: string[] = [];
  try {
    for (const shot of geplant) {
      console.log(`  ${shot.name} …`);
      let ziel = cdp;
      if (shot.imSettingsFenster) {
        if (!settingsCdp) {
          const s = await settingsVerbinden(cdp, port);
          settingsCdp = s.ziel;
          console.log(`      · Einstellungen ${s.eigenes ? 'als eigenes Fenster' : 'als Modal im Hauptfenster'}`);
        }
        ziel = settingsCdp;
        await ziel.send('Page.bringToFront');
      } else if (settingsCdp) {
        // Zurück ins Hauptfenster, sonst misst der nächste Shot im falschen Dokument.
        await cdp.evaluate('app.setting.close(); return true;');
        await cdp.send('Page.bringToFront');
        if (settingsCdp !== cdp) settingsCdp.close();
        settingsCdp = null;
      }

      const box = await shot.run(ziel);
      if (!box) {
        console.log('      ✗ Zustand kam nicht zustande — kein Bild geschrieben');
        fehlend.push(shot.name);
        continue;
      }
      const png = 'png' in box ? box.png : await capture(ziel, box, 2);
      const hinweis = await writeShot(ziel, shot.name, png, {
        outDir,
        captureWidth: CAPTURE_WIDTH,
        thumbWidth: THUMB_WIDTH,
        thumb: shot.klasse === 'detail',
      });
      console.log(`      ✓ ${hinweis}`);
    }
  } finally {
    if (settingsCdp && settingsCdp !== cdp) settingsCdp.close();
    try { await cdp.evaluate('app.setting.close(); return true;'); } catch { /* Fenster evtl. schon zu */ }
    cdp.close();
  }

  if (fehlend.length) {
    console.log(
      `\n${fehlend.length} Motiv(e) ohne Bild: ${fehlend.join(', ')}\n` +
      'Fehlschlag ist kein Abbruch — aber ein fehlendes Bild gehört MIT BEGRÜNDUNG in\n' +
      'docs/images/README.md, nicht stillschweigend gestrichen. Und die erste Frage ist\n' +
      'nicht „welcher Ausschnitt stimmt nicht", sondern ob der Prüfling gerade antwortet.',
    );
    exit(1);
  }
  console.log('\nJedes Bild jetzt SELBST ansehen: Zuschnitt, Lesbarkeit, nichts Privates,');
  console.log('und ob es den Auslieferungszustand zeigt statt eines vom Treiber gesetzten Werts.');
}

main().catch((err: Error) => {
  console.error(`\nABBRUCH: ${err.message}`);
  exit(2);
});
