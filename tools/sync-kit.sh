#!/bin/sh
# Re-vendor the pure kit modules from obsidian-kit. Run after kit updates.
set -e

KIT=../obsidian-kit
VER=$(node -p "require('$KIT/package.json').version")
SHA=$(git -C "$KIT" rev-parse --short HEAD)

# Prepend the "do not hand-edit" marker to a vendored file. The kit sources carry no such
# marker, so a plain `cp` silently drops it — which is how pdf/*.ts would have lost their
# headers (found 2026-08-04: only the i18n branch stamped, the pdf branch did not). The header
# also records the version, so a drifted pin is visible in the file itself, not only in
# VENDOR.json.
stamp() { # stamp <vendored-file> <kit-relative-path>
  header="// vendored from obsidian-kit@$VER, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

for f in "$KIT"/src/pure/pdf/*.ts; do
  base=$(basename "$f")
  cp "$f" "src/vendor/kit/pdf/$base"
  stamp "src/vendor/kit/pdf/$base" "src/pure/pdf/$base"
done
echo "vendored obsidian-kit@$VER/pure/pdf → src/vendor/kit/pdf"

for m in i18n settings; do
  cp "$KIT/src/pure/$m.ts" "src/vendor/kit/$m.ts"
  stamp "src/vendor/kit/$m.ts" "src/pure/$m.ts"
  echo "vendored obsidian-kit@$VER/pure/$m.ts → src/vendor/kit/$m.ts"
done

# VENDOR.json answers "which kit is this?" without diffing the sources.
cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "i18n.ts, settings.ts, pdf/*.ts",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. Seit 0.22.0 laufen pdf/layout.ts und pdf/options.ts mit, statt separat nachhinkend gepinnt zu sein. obsidian/collapsible.ts liegt in ../kit-obsidian/, siehe dortige VENDOR.json."
}
JSON
echo "VENDOR.json → $VER ($SHA)"
