# Fixture-Vault für den GUI-Smoke

`scripts/gui-smoke.ts --setup` baut daraus den Staging-Vault
(`$STAGING_VAULTS_DIR/obsidian-paperize`) — der Vault ist Wegwerfware, dieses
Verzeichnis ist die Quelle.

- `notes/` → Vault-Wurzel. Die Marker (`MARK…`) sind der Zweck: sie machen im
  erzeugten PDF mechanisch entscheidbar, welches Markdown-Element den Weg durch
  `dom-to-ir` überstanden hat.
- `obsidian/` → `.obsidian/` des Vaults. Nur Paperize aktiv, helles Theme, keine
  fremden Post-Prozessoren, die das Export-DOM verändern würden.

**Warum ein eigener Vault und nicht der Arbeitsvault:** dort läge (a) womöglich der
Store-Build statt des Repo-Stands und (b) fremdes Prüfmaterial. Beides macht einen
Lauf unbelegt — `manifest.version` ist gegen den ersten Fall strukturell blind, weil
Store- und Repo-Build dieselbe Nummer tragen.
