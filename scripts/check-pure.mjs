// `src/core/` und der vendored Kit-Code muessen frei von obsidian-Importen bleiben —
// das ist die Zusicherung, dass die Rechenlogik in Node/vitest testbar ist.
//
// Bewusst ein Script statt eines grep-Einzeilers in package.json: der Einzeiler
// hatte nur `from '…'` mit einfachen Anfuehrungszeichen erfasst und war damit
// blind fuer genau den Fremdcode, den er pruefen soll — das Kit schreibt doppelte.
// (Muster uebernommen von 3d-codeblocks, das denselben Defekt so geloest hat.)
//
// `src/vendor/kit-obsidian/` ist die bewusst obsidian-gekoppelte Vendor-Schicht und
// deshalb ausgenommen. Die Grenze verlaeuft bei „pure", nicht bei „vendored":
// ein neues gekoppeltes Kit-Modul gehoert in diesen Ordner, nicht in eine weitere
// Ausnahme hier.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/core", "src/vendor"];
const EXCLUDED = ["src/vendor/kit-obsidian"];
const FORBIDDEN = /(?:from|import)\s*\(?\s*["']obsidian(\/[^"']*)?["']/;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (EXCLUDED.includes(full)) return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const offenders = ROOTS.flatMap(walk)
  .filter((file) => file.endsWith(".ts"))
  .filter((file) => FORBIDDEN.test(readFileSync(file, "utf8")));

if (offenders.length > 0) {
  console.error("obsidian-Import in pure Code gefunden:");
  for (const file of offenders) console.error(`  ${file}`);
  process.exit(1);
}

console.log(`check:pure: ${ROOTS.join(" + ")} sind frei von obsidian-Importen`);
