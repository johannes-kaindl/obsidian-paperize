---
paths:
  - "src/core/filename.ts"
  - "src/obsidian/output.ts"
  - "src/vendor/kit/filename-template.ts"
  - "src/vendor/kit/vault-path.ts"
  - "tests/core/filename.test.ts"
  - "tests/obsidian/output.test.ts"
---

# Dateiname-Schema und Vault-Pfade — Gotchas

- **`src/core/filename.ts` ist pure und rechnet nur; die `{version}`-Zählung braucht Vault-Zugriff** und lebt deshalb in `resolveVersionedOutputPath` (`output.ts`). `hasVersionPlaceholder` ist **load-bearing**: Ohne diesen Guard würde die Suchschleife bei einem Schema ohne `{version}` denselben Namen endlos neu bauen. Im Anhang-Modus bleibt `{version}` wirkungslos — dort löst Obsidian Kollisionen selbst auf, zwei Zähler übereinander ergäben `Bericht v1 1.pdf`.
- **`src/core/filename.ts` ist ein Shim, keine Eigenimplementierung** (seit dem Kit-Anschluss 0.27.0): Sanitisierung und Platzhalter-Auflösung liegen in `src/vendor/kit/filename-template.ts` (dort aus yijing-oracle, paperize und letterhead zusammengeführt); lokal bleiben nur `DEFAULT_FILENAME_TEMPLATE`, `FilenameValues` und `hasVersionPlaceholder` — die drei Dinge, die im Kit bewusst keine Entsprechung haben. Wer die Regel ändern will, ändert sie im Kit und re-vendort.
- ⚠️ **Die Zeichenklasse `INVALID` ist load-bearing** und steht byte-identisch in drei veröffentlichten Plugins: ein zusätzliches oder fehlendes Zeichen benennt bestehende Exporte **still** um. Die engere `sanitizeBase`-Klasse `[\\/:*?"<>|]` aus epub-exporter/apple-health/paperless-storage gehört ausdrücklich **nicht** hierher.
- **Ordner normalisieren, fügen und zerlegen kommt aus `src/vendor/kit/vault-path.ts`** (`normalizeVaultDir`/`joinVaultPath`/`vaultDirname`), nicht aus lokalen Inline-Rechnungen. Das Freitext-Feld „Eigener Ordner“ reicht seinen Wert **roh** dorthin durch — die Normalisierung ist damit der Schutz und keine Kosmetik.
- ⚠️ **Das schützt nur den ORDNER-Anteil.** `joinVaultPath` hängt den Dateinamen unverändert an (das sagt auch der Modulkopf des Kits: „KEIN Ersatz für das Säubern“). Der zweite Freitext-Weg — das Schema-Feld — läuft deshalb **nicht** hier durch, sondern über `src/core/filename.ts` → `src/vendor/kit/filename-template.ts`; `sanitizeBase`/`sanitizeFilename` bleiben dafür zuständig und dürfen nicht mit dem Argument „macht doch `joinVaultPath`“ wegfallen.
- **`vaultDirname` fängt die `-1`-Falle:** `slice(0, lastIndexOf('/'))` schneidet bei einer Datei in der Vault-Wurzel das letzte Zeichen des *Dateinamens* ab und legt daneben einen Phantom-Ordner an.
- **`src/obsidian/main.ts` baut den Anhang-Pfad weiterhin über Obsidians `normalizePath`** — anderer Mechanismus, bewusst nicht umgestellt.
