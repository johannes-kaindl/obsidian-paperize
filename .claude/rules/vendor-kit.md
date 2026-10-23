---
paths:
  - "src/vendor/**"
  - "tools/kit-sync.json"
  - "tools/sync-kit.sh"
  - "scripts/check-pure.mjs"
---

# Vendor und Kit — Gotchas

Das Vendoring läuft über das zentrale Werkzeug im Dach: `sh tools/sync-kit.sh` ruft `../tools/kit-sync/kit-sync.mjs` (`--check` vergleicht nur). Pins und Modulliste stehen in `tools/kit-sync.json`, den gemessenen Stand nennen die beiden `VENDOR.json`. Nie von Hand nachziehen; Änderungen gehören stromaufwärts ins Kit.

- **Ein Kit-Modul, das ein weiteres importiert, bringt die Kante mit.** `kit-sync` bricht dann vor dem Schreiben mit „Hülle“ ab und nennt das fehlende Modul; die Konfig bekommt das Modul und ggf. ein `rewrite` (`share-export` → `rel-path` ab obsidian-kit 0.63: `"rewrite": [["../vendor/code-kit/pure/", "../kit/"]]` am `kit-obsidian`-Ziel). Beleg: 2026-10-23, Hebung auf obsidian-kit 0.66.1.
- **Nach jedem Lauf `git status --short` prüfen und den gesamten Stand committen:** das Werkzeug meldet nur, was man angefordert hat, schreibt aber für jeden Eintrag der Konfig.
- **Der Herkunftsstempel in Zeile 1 jeder Vendor-Datei nennt Quelle und Version,** und `VENDOR.json` führt beide Versionen (obsidian-kit und code-kit). Ein Header, der auf ein Skript zeigt, das die Datei nicht kennt, ist keine Anweisung (die gekoppelte Schicht lief bis 2026-08-14 nicht mit und hing auf 0.16.0 fest).
- **`check:pure` ist ein Script, kein grep-Einzeiler** (`scripts/check-pure.mjs`, seit 2026-08-03): Der frühere Einzeiler matchte nur `from 'obsidian'` — einfache Anführungszeichen sind der *Paperize*-Stil, das vendored Kit schreibt doppelte. Das Gate war damit blind für genau den Fremdcode, den es prüfen soll, und hätte nie einen vendored Obsidian-Import gemeldet. **Regel:** Ein Gate gegen *fremden* Code darf nicht auf *eigene* Konventionen matchen. Das Script fängt beide Quote-Stile, `import()` und Subpath-Importe, nennt die Fundstellen und trägt die `kit-obsidian`-Ausnahme explizit. Wer es anfasst: gegen einen echten Verstoß in **beiden** Quote-Stilen laufen lassen und den Exit-Code prüfen, nicht nur den Grün-Lauf ansehen — ein Gate, das nie rot wird, ist kein Gate.
- **Nach jeder Hebung die `INVALID`-Zeile in `src/vendor/kit/filename-template.ts` im Diff ansehen:** sie ist byte-gleich zu yijing-oracle und letterhead, und kein Test pinnt sie — eine geänderte Zeichenklasse benennt bestehende Exporte still um, ein grünes Gate sagt darüber nichts (gemessen bei der Umstellung auf code-kit 0.5.0: inhaltlich byte-gleich). Siehe `.claude/rules/dateiname-und-pfade.md`.
- **Ein neues gekoppeltes Kit-Modul (mit `obsidian`-Import) gehört nach `src/vendor/kit-obsidian/`,** nicht in eine weitere Skript-Ausnahme: `EXCLUDED` in `check-pure.mjs` trägt nur diesen einen Ordner. `settings_walker.ts` importiert `folder-suggest.ts`, beide laufen zusammen mit.
