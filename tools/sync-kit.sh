#!/bin/sh
# Re-vendor the pure kit modules from obsidian-kit. Run after kit updates.
set -e
cp ../obsidian-kit/src/pure/pdf/*.ts src/vendor/kit/pdf/
echo "vendored obsidian-kit/pure/pdf → src/vendor/kit/pdf"

# i18n: copy then prepend the vendor header (the kit source has no such marker), so a
# re-vendor keeps the "do not hand-edit" note instead of silently dropping it.
cp ../obsidian-kit/src/pure/i18n.ts src/vendor/kit/i18n.ts
header='// vendored from obsidian-kit, src/pure/i18n.ts — do not hand-edit; re-vendor via tools/sync-kit.sh'
printf '%s\n' "$header" | cat - src/vendor/kit/i18n.ts > src/vendor/kit/i18n.ts.tmp
mv src/vendor/kit/i18n.ts.tmp src/vendor/kit/i18n.ts
echo "vendored obsidian-kit/pure/i18n.ts → src/vendor/kit/i18n.ts"
