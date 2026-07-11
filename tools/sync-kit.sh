#!/bin/sh
# Re-vendor the pure PDF engine from obsidian-kit. Run after kit updates.
set -e
cp ../obsidian-kit/src/pure/pdf/*.ts src/vendor/kit/pdf/
echo "vendored obsidian-kit/pure/pdf → src/vendor/kit/pdf"
