# Sicherheitsrichtlinie

> [🇬🇧 English](SECURITY.md) · 🇩🇪 Deutsch

## Unterstützte Versionen
Die jeweils zuletzt veröffentlichte Version erhält Sicherheits-Updates.

## Sicherheitslücke melden
Sicherheitslücken bitte **nicht** öffentlich als Issue melden, sondern per E-Mail an
**code@jkaindl.de** (gerne PGP-verschlüsselt). Du bekommst zeitnah eine Rückmeldung und
wirst über den Fix-Verlauf auf dem Laufenden gehalten.

## Auditierbarkeit & Lieferkette
Paperize ist ein kleiner, abhängigkeitsfreier Markdown-zu-PDF-Exporter. Hier steht genau,
was das Plugin tut — und was nicht:

- **Gebaut, nicht Zero-Build.** Anders als manche Nachbar-Plugins ist Paperize TypeScript,
  kompiliert mit esbuild: Das ausgelieferte `main.js` ist ein Bundle aus `src/`
  (Anwendungscode) und `src/vendor/kit/pdf/` (die vendorte pure PDF-Engine, aus
  `obsidian-kit@0.8.0`) — **keine** committete, direkt lesbare Datei. `main.js` steht in
  `.gitignore` und wird bei jedem Release frisch aus dem getaggten Commit erzeugt (`npm run
  build`, also `tsc --noEmit && esbuild --production`). Es gibt keinen Minifizierungs-/
  Verschleierungs-Schritt über esbuilds eigenes Production-Bundling hinaus; jede Zeile
  Logik ist in `src/` lesbar.
- **Keine Netzwerkzugriffe, keine Telemetrie.** Kein `fetch`/`XMLHttpRequest`, keine
  Remote-Endpunkte, kein Tracking. Alles passiert lokal in deinem Vault.
- **Keine dynamische Code-Ausführung.** Kein `eval`, kein `new Function`, kein
  dynamisches `import()`. Der einzige Modul-Import zur Laufzeit ist die Obsidian-API
  selbst.
- **Externe Assets nur als `data:`-/lokale Ressourcen-URLs.** In der Notiz referenzierte
  Bilder werden lokal dekodiert (über Obsidians `app://`-Ressourcenpfad oder eine
  eingebettete `data:`-URL) und als JPEG-Bytes fürs PDF neu kodiert — es wird nichts aus
  dem Web geladen.
- **Minimaler Vault-Zugriff.** Liest die aktive Notiz (und ihre lokal verlinkten Bilder)
  über die Obsidian-API und schreibt ausschließlich das exportierte PDF — an genau den
  einen Ort, den der gewählte Ausgabemodus vorgibt (neben der Notiz, Obsidian-
  Anhangordner, eigener Ordner, oder ein einmaliger Teilen/Öffnen-Aufruf beim
  Vault-externen Modus).
- **Zur Laufzeit abhängigkeitsfrei.** Keine Drittanbieter-Laufzeitbibliothek — der
  PDF-Writer ist eine kleine, pure Engine unter `src/vendor/kit/pdf/`. TypeScript,
  esbuild und vitest sind **nur zur Build-Zeit** nötig (`devDependencies`); keines davon
  landet in `main.js`.

### Hinweis zum Community-Scorecard
Weil Paperize kompiliert wird, sagt dir das direkte Lesen von `main.js` nicht, was
läuft — lies stattdessen `src/` und vertraue der Build-Pipeline, dass sie diese Quelle
in das Bundle überführt. Um diese Vertrauenslücke zu schließen, tragen alle Releases
eine **GitHub Artifact Attestation** (Sigstore/SLSA-Build-Provenance): GitHub Actions
checkt genau den getaggten Commit aus, führt dasselbe Gate aus, das auch lokal laufen
kann (`npm run gate` — Typecheck, Tests, Pure-Check, Build), und signiert das
entstandene `main.js`, `manifest.json` und `styles.css`. Die Attestation belegt, dass
die veröffentlichten Bytes von diesem Workflow aus diesem Commit erzeugt wurden — sie
behauptet **nicht**, dass das Bundle byte-identisch mit einer einzelnen Quelldatei ist
(ist es auch nicht, das ist bewusst ein Build-Ergebnis).

### Release verifizieren
Jeder Release wird über GitHub Actions veröffentlicht und signiert die gebauten Dateien
mit einer Sigstore/SLSA-Build-Provenance-Attestation. Du kannst bestätigen, dass das
laufende `main.js` vom Release-Workflow dieses Repositorys aus der getaggten Quelle
gebaut wurde:

```sh
gh attestation verify main.js --repo johannes-kaindl/obsidian-paperize
```

Das belegt Provenienz (welcher Workflow, welcher Commit hat gebaut) — für eine
zeilengenaue Prüfung des Verhaltens lies `src/` (insbesondere `src/core/` und
`src/vendor/kit/pdf/`, die Obsidian-frei und unit-getestet sind).
