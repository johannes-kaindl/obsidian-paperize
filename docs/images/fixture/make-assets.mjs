// Erzeugt die Bild-Beilage des Aufnahme-Fixtures.
//
// Als Generator statt als eingecheckte Binärdatei: ein Balkendiagramm ist Daten plus
// Regel, und beides ist hier lesbar und diffbar. Wer die Zahlen der Notiz ändert, ändert
// sie hier mit — ein PNG im Repo würde still auseinanderlaufen.
//
// Aufruf über VaultSpec.generator: `node make-assets.mjs <vaultDir>`.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 640, H = 320;
const BALKEN = [
  { label: "Birch Hollow", wert: 4.1, farbe: [90, 140, 200] },
  { label: "Cedar Flats", wert: 6.8, farbe: [90, 170, 140] },
  { label: "Elm Crossing", wert: 5.2, farbe: [200, 160, 80] },
];
const MAX = 8;

const px = new Uint8Array(W * H * 3).fill(255);
const setzen = (x, y, [r, g, b]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = r; px[i + 1] = g; px[i + 2] = b;
};

// Gitterlinien alle 2 mg/l, damit die Balken eine Skala haben statt nur Länge.
const BODEN = H - 48, KOPF = 24;
for (let t = 0; t <= MAX; t += 2) {
  const y = Math.round(BODEN - (t / MAX) * (BODEN - KOPF));
  for (let x = 56; x < W - 24; x++) setzen(x, y, [222, 226, 232]);
}
for (let x = 56; x < W - 24; x++) setzen(x, BODEN, [120, 128, 140]);

const breite = 96, luecke = 64;
BALKEN.forEach((b, i) => {
  const x0 = 96 + i * (breite + luecke);
  const hoehe = Math.round((b.wert / MAX) * (BODEN - KOPF));
  for (let y = BODEN - hoehe; y < BODEN; y++) {
    for (let x = x0; x < x0 + breite; x++) setzen(x, y, b.farbe);
  }
});

const chunk = (typ, daten) => {
  const laenge = Buffer.alloc(4); laenge.writeUInt32BE(daten.length);
  const koerper = Buffer.concat([Buffer.from(typ, "latin1"), daten]);
  const crcTabelle = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xFFFFFFFF;
  for (const byte of koerper) crc = crcTabelle[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  const pruef = Buffer.alloc(4); pruef.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0);
  return Buffer.concat([laenge, koerper, pruef]);
};

const roh = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) {
  roh[y * (W * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * W * 3, W * 3).copy(roh, y * (W * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(roh, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]);

const ziel = join(process.argv[2], "assets");
mkdirSync(ziel, { recursive: true });
writeFileSync(join(ziel, "chart.png"), png);
console.log(`\n   chart.png (${W}x${H}, ${png.length} Bytes)`);
