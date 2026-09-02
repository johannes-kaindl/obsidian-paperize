#!/bin/sh
# Re-vendor the pure kit modules from obsidian-kit. Run after kit updates.
set -e

KIT=../obsidian-kit
# Zweite Quelle seit obsidian-kit 2ab1bb5 ("domaenenfreie pure-Teilmenge zieht nach code-kit"):
# i18n.ts, settings.ts und filename-template.ts liegen NICHT mehr unter obsidian-kit/src/pure/,
# sondern in einem eigenen Repo. Bis 2026-09-02 kopierte dieses Skript sie weiter von der alten
# Stelle, scheiterte an `cp: No such file` — und riss durch `set -e` den Rest mit: die
# obsidian-gekoppelte Schicht lief nicht mehr mit, und BEIDE VENDOR.json wurden nicht mehr
# geschrieben. Der Vendor-Stand blieb dadurch auf 0.27.0 stehen, waehrend pdf/ schon 0.30.0 war
# — eine Datei, die ueber sich selbst die Unwahrheit sagt.
CODE_KIT=../../code-kit
VER=$(node -p "require('$KIT/package.json').version")
CODE_VER=$(node -p "require('$CODE_KIT/package.json').version" 2>/dev/null || echo "?")
# Der Pin zeigt auf den TAG-Commit der Kit-Version, nicht auf den HEAD des Kit-Arbeitsbaums:
# der HEAD traegt oft Commits nach dem Tag (am 2026-08-20 einen Doku-Commit, fbb42d4 statt
# 548041b), und ein Pin auf einen Commit, den es unter keinem Tag gibt, ist nicht
# nachvollziehbar. Der bisherige Pin c10f6f4 IST der Tag-Commit von 0.26.1 — das ist die hier
# gelebte Konvention, die aber bis 2026-08-20 nur durch Handarbeit nach dem Lauf entstand.
# Fallback auf HEAD, damit ein Lauf gegen einen noch ungetaggten Kit-Stand nicht abbricht.
SHA=$(git -C "$KIT" rev-parse --short "$VER^{commit}" 2>/dev/null || git -C "$KIT" rev-parse --short HEAD)

# Prepend the "do not hand-edit" marker to a vendored file. The kit sources carry no such
# marker, so a plain `cp` silently drops it — which is how pdf/*.ts would have lost their
# headers (found 2026-08-04: only the i18n branch stamped, the pdf branch did not). The header
# also records the version, so a drifted pin is visible in the file itself, not only in
# VENDOR.json.
stamp() { # stamp <vendored-file> <kit-relative-path> [<quelle> <version>]
  quelle=${3:-obsidian-kit}
  version=${4:-$VER}
  header="// vendored from $quelle@$version, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

# Eine fehlende Quelle ist ein Aufbaufehler und wird als solcher gemeldet — nicht als
# `cp: No such file` mitten im Lauf. Wer das Skript fährt, soll VOR dem ersten Kopieren
# wissen, ob es vollständig laufen kann.
for verlangt in "$KIT/src/pure/pdf" "$KIT/src/pure/vault-path.ts" "$KIT/src/obsidian" \
                "$CODE_KIT/src/ts/pure/i18n.ts"; do
  if [ ! -e "$verlangt" ]; then
    echo "FEHLER: $verlangt fehlt." >&2
    echo "  obsidian-kit liefert pdf/, vault-path.ts und die obsidian-gekoppelte Schicht;" >&2
    echo "  code-kit liefert i18n.ts, settings.ts und filename-template.ts (seit 2ab1bb5)." >&2
    echo "  Beide Repos muessen neben obsidian-plugins/ liegen." >&2
    exit 2
  fi
done

for f in "$KIT"/src/pure/pdf/*.ts; do
  base=$(basename "$f")
  cp "$f" "src/vendor/kit/pdf/$base"
  stamp "src/vendor/kit/pdf/$base" "src/pure/pdf/$base"
done
echo "vendored obsidian-kit@$VER/pure/pdf → src/vendor/kit/pdf"

for m in vault-path; do
  cp "$KIT/src/pure/$m.ts" "src/vendor/kit/$m.ts"
  stamp "src/vendor/kit/$m.ts" "src/pure/$m.ts"
  echo "vendored obsidian-kit@$VER/pure/$m.ts → src/vendor/kit/$m.ts"
done

for m in i18n settings filename-template; do
  cp "$CODE_KIT/src/ts/pure/$m.ts" "src/vendor/kit/$m.ts"
  stamp "src/vendor/kit/$m.ts" "src/ts/pure/$m.ts" "code-kit" "$CODE_VER"
  echo "vendored code-kit@$CODE_VER/ts/pure/$m.ts → src/vendor/kit/$m.ts"
done

# Obsidian-gekoppelte Kit-Module. Sie liegen bewusst NICHT unter src/vendor/kit/ (das ist die
# pure Schicht, die check:pure bewacht), sondern in src/vendor/kit-obsidian/ — der einzigen
# benannten Ausnahme in scripts/check-pure.mjs. Bis 2026-08-14 zog dieses Skript sie gar nicht
# nach, obwohl ihr Header "re-vendor via tools/sync-kit.sh" versprach: collapsible.ts hing
# deshalb auf 0.16.0 fest. Ein Header, der auf ein Skript zeigt, das die Datei nicht kennt,
# ist keine Anweisung, sondern eine stille Unwahrheit.
for m in collapsible folder-suggest settings_walker; do
  cp "$KIT/src/obsidian/$m.ts" "src/vendor/kit-obsidian/$m.ts"
  stamp "src/vendor/kit-obsidian/$m.ts" "src/obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts → src/vendor/kit-obsidian/$m.ts"
done

cat > src/vendor/kit-obsidian/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "collapsible.ts, folder-suggest.ts, settings_walker.ts",
  "note": "Verbatim snapshot der obsidian-GEKOPPELTEN Kit-Schicht. Never hand-edit. Re-vendor via tools/sync-kit.sh. Von check:pure ausgenommen (benannte EXCLUDED-Konstante in scripts/check-pure.mjs). settings_walker.ts importiert folder-suggest.ts — beide muessen zusammen mitlaufen."
}
JSON
echo "kit-obsidian/VENDOR.json → $VER ($SHA)"

# VENDOR.json answers "which kit is this?" without diffing the sources.
cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "pdf/*.ts, vault-path.ts (aus obsidian-kit@$VER)",
  "code_kit_version": "$CODE_VER",
  "code_kit_vendored": "i18n.ts, settings.ts, filename-template.ts (aus code-kit@$CODE_VER)",
  "note": "Verbatim snapshot aus ZWEI Quellen. Never hand-edit. Re-vendor via tools/sync-kit.sh. Seit obsidian-kit 2ab1bb5 liegt die domaenenfreie pure-Teilmenge in code-kit; der Kopf jeder Datei nennt ihre Herkunft. Seit 0.22.0 laufen pdf/layout.ts und pdf/options.ts mit. obsidian/collapsible.ts liegt in ../kit-obsidian/, siehe dortige VENDOR.json."
}
JSON
echo "VENDOR.json → $VER ($SHA)"
