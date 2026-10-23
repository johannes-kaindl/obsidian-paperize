---
paths:
  - "scripts/gui-smoke.ts"
  - "scripts/shots.ts"
  - "docs/SMOKE.md"
---

# GUI-Smoke — Gegenprobe

Allgemeine Treiber-Regeln stehen im Dach (`../.claude/rules/gui-smoke-treiber.md`, Instanz und Lock: `../.claude/rules/obsidian-instanz.md`, `../.claude/rules/cdp-lock.md`), das Rezept und die Prüfpunkte in `docs/SMOKE.md`.

- **Ein grüner GUI-Smoke ist erst nach einer Gegenprobe eine Aussage — und die Gegenprobe braucht ihrerseits einen Beleg, dass der Rückbau ankam.** `requireEigenerBuild` liefert den nicht: es prüft, ob Vault-Build und Repo-Build **gleich** sind, nicht ob sie **aktuell** sind. Bricht der Deploy im `tsc`-Schritt ab, bleibt der alte `main.js` in beiden liegen, der Guard ist zufrieden, und der Smoke meldet 29/29 über Code, den man gerade kaputtgemacht hat (gemessen 2026-09-02, zweimal hintereinander). Deshalb bei jeder Gegenprobe den sha1 von `main.js` **vor und nach** dem Deploy vergleichen und bei Gleichstand abbrechen — `docs/SMOKE.md` führt das Rezept.
