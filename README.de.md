# Paperize – sauberes Markdown → PDF

> [🇬🇧 English](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/README.md) · 🇩🇪 Deutsch

Ein Obsidian-Plugin, das die aktive Notiz als sauberes, textselektierbares **Vektor-PDF**
exportiert — kein Briefkopf, keine Marke, nur die Notiz. Funktioniert identisch auf
Desktop, iPhone und iPad.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/LICENSE)
![Platform](https://img.shields.io/badge/platform-Obsidian%20(Desktop%20%7C%20iOS)-lightgrey)

## Funktionen

- **Ein Befehl, ein PDF:** **Aktive Notiz als PDF exportieren** ausführen (Befehlspalette
  oder Ribbon-Icon) — die aktive Notiz wird zu einem echten, textselektierbaren
  Vektor-PDF. Kein Druckdialog des Browsers, kein Screenshot-Umweg.
- **Standard-Markdown-Umfang:** Überschriften, Absätze, Bold/Italic/Inline-Code,
  verschachtelte geordnete und ungeordnete Listen, Blockquotes, Trennlinien, Links,
  Bilder (zu JPEG re-encodiert), Codeblöcke und einfache Tabellen.
- **Graceful Degradation, nie ein gescheiterter Export:** Elemente außerhalb dieses
  Umfangs (Callouts, Mathe, Embeds und andere Obsidian-spezifische Renderings) werden
  nicht kommentarlos verworfen, sondern als reiner Text vereinfacht dargestellt — der
  Export scheitert nie. Eine Zusammenfassungs-Notice nach dem Export zeigt, wie viele
  Elemente vereinfacht wurden, damit du bei Bedarf gegen die Notiz prüfen kannst.
- **Vier Ausgabeziele**, wählbar in den Einstellungen: neben der Notiz (Standard), der
  Obsidian-Anhangordner, ein eigener Ordner, oder Teilen/Öffnen außerhalb des Vaults
  (mobiles Teilen-Menü bzw. Standard-App des Betriebssystems am Desktop).
- **Desktop und iPhone/iPad, identisch.** `main.js` erzeugt die Vektor-PDF-Bytes selbst
  — kein `window.print()`, keine WebView-Druck-Pipeline nötig, derselbe Codepfad läuft
  überall (`isDesktopOnly: false`).
- **Zur Laufzeit abhängigkeitsfrei, keine Netzwerkzugriffe, keine Telemetrie.** Der
  PDF-Writer ist eine kleine, pure Engine, vendort unter `src/vendor/kit/pdf/` (aus
  `obsidian-kit@0.8.0`) — keine Drittanbieter-PDF-Bibliothek, kein `fetch`, nichts
  verlässt dein Gerät. Vollständige Erklärung:
  [`SECURITY.de.md`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/SECURITY.de.md).

## Schnellstart

Repository: [github.com/johannes-kaindl/obsidian-paperize](https://github.com/johannes-kaindl/obsidian-paperize)
(Quell-Mirror: [codeberg.org/jkaindl/obsidian-paperize](https://codeberg.org/jkaindl/obsidian-paperize))

### Installation aus Obsidian (sobald im Community-Verzeichnis gelistet)

1. **Einstellungen → Community-Plugins → Durchsuchen** öffnen.
2. Nach **„Paperize"** suchen und **Installieren** wählen.
3. Paperize **aktivieren** — keine Konfiguration nötig, die Standardwerte funktionieren
   sofort.

### Manuelle Installation

```bash
# Plugin in den Vault kopieren
cp manifest.json main.js styles.css \
   "<dein-vault>/.obsidian/plugins/paperize/"

# …oder mit gesetztem OBSIDIAN_PLUGIN_DIR:
npm run deploy
```

Dann: Obsidian → Einstellungen → Community-Plugins → neu laden → **Paperize** aktivieren.

## Nutzung

1. Beliebige Markdown-Notiz öffnen.
2. **Aktive Notiz als PDF exportieren** ausführen (Befehlspalette) oder das
   Ribbon-Icon klicken.
3. Das PDF erscheint am konfigurierten Ausgabeziel (siehe **Einstellungen →
   Ausgabeziel** unten). Wurden Elemente beim Export vereinfacht, meldet eine Notice
   die Anzahl.

Das Frontmatter wird im exportierten PDF standardmäßig entfernt (einstellbar). Die
erste Überschrift (oder der Dateiname, falls keine vorhanden ist) wird zum Titel.

## Einstellungen

| Einstellung | Beschreibung | Standard |
| --- | --- | --- |
| **Schriftfamilie** | Basis-Schriftart — Sans (Helvetica), Serif (Times) oder Mono (Courier). Nur Adobe-Core-14-Standardschriften, siehe [Schriften](#schriften--die-core-14-grenze) unten. | Sans |
| **Schriftgröße (pt)** | Basis-Textgröße, 6–24 pt. | 11 pt |
| **Seitenmaß** | A4 oder Letter. | A4 |
| **Ränder (mm)** | Seitenrand auf allen vier Seiten, 12–50 mm. | 20 mm |
| **Frontmatter entfernen** | Entfernt das YAML-Frontmatter aus dem exportierten Inhalt. | An |
| **Titel oben** | Zeigt einen abgeleiteten Titel (erste Überschrift oder Dateiname) oben im PDF. | An |
| **Seitenzahlen** | Druckt eine Seitenzahl auf jede Seite. | An |
| **Laufende Fußzeile** | Wiederholt Titel und heutiges Datum in der Fußzeile jeder Seite. | Aus |
| **Ausgabeziel** | Wohin das PDF geschrieben wird: *neben der Notiz*, *Obsidian-Anhangordner*, *eigener Ordner* oder *Teilen/Öffnen außerhalb des Vaults*. | Neben der Notiz |
| **Eigener Ausgabe-Ordner** | Vault-relativer Ordner, nur bei Ausgabeziel *eigener Ordner* verwendet. | *(leer)* |

Die Bildbreite ist intern begrenzt (`imageMaxWidthPct`, Standard 100 % der
Inhaltsbreite), aber noch nicht als eigener Regler im Einstellungen-Tab verfügbar —
das steht auf der Roadmap.

## Standard-Markdown-Umfang & Graceful Degradation

Paperize deckt einen bewusst begrenzten, gut getesteten Markdown-Umfang ab, siehe
**Funktionen** oben. Alles, was Obsidian rendert und außerhalb dieses Umfangs liegt —
Callouts, Mathe-Blöcke, Embeds und andere Plugin- oder Obsidian-spezifische Widgets —
wird nicht kommentarlos verworfen: Der Textinhalt wird extrahiert und als reiner Text im
PDF dargestellt, der Export läuft immer durch. Nach dem Export meldet eine Notice, wie
viele Elemente auf diese Weise vereinfacht wurden, damit du weißt, wann sich ein
Abgleich mit der Notiz lohnt.

## Schriften & die Core-14-Grenze

Paperize nutzt ausschließlich die **Adobe-Core-14-PDF-Standardschriften** (die
Helvetica-, Times- und Courier-Familien) — die Schriften, die jeder PDF-Reader ohne
eingebettete Schriftdatei darstellen kann. Das ist eine bewusste Abwägung, kein
fehlendes Feature:

- PDFs bleiben winzig (keine eingebetteten Schriftdaten).
- Keine Custom-Fonts, keine Theme-Schriften, keine nicht-lateinischen Schriften über die
  WinAnsi-Abdeckung hinaus.
- Jedes PDF öffnet identisch in jedem Viewer, auf jeder Plattform.

Wer eingebettete Custom-Fonts oder volle Unicode-Abdeckung braucht, ist bei Paperize an
der falschen Adresse.

## Datenschutz & Sicherheit

Paperize läuft vollständig auf deinem Gerät: keine Netzwerkaufrufe, keine Telemetrie,
kein Tracking. Bilder werden lokal dekodiert und neu kodiert; nichts wird aus dem Web
geladen. Die PDF-Engine ist ein kleines, abhängigkeitsfreies Modul, das ins Plugin
vendort wurde — vollständige Erklärung inklusive Build- und Attestations-Verfahren
(das ausgelieferte `main.js` ist ein esbuild-Bundle aus `src/`, keine committete
Quelldatei — die Attestation deckt das gebaute Artefakt ab) in
[`SECURITY.de.md`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/SECURITY.de.md).

## Entwicklung

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run --passWithNoTests
npm run check:pure  # verweigert 'obsidian'-Imports in src/core + src/vendor
npm run build       # typecheck + esbuild --production → main.js
npm run gate        # typecheck + test + check:pure + build — vor jedem Commit
npm run deploy      # build + cp manifest.json main.js styles.css → $OBSIDIAN_PLUGIN_DIR
```

Architektur-Hinweise und Release-Prozess:
[`AGENTS.md`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/AGENTS.md).

## Lizenz

Code: **AGPL-3.0-or-later** — siehe
[`LICENSE`](https://github.com/johannes-kaindl/obsidian-paperize/blob/main/LICENSE).
