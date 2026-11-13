#!/usr/bin/env bash
# lib/questionBulk.ts sözleşme testi — saf ayrıştırıcı, ağ gerekmez.
# Çalıştır: npm run test:bulk
set -e
cd "$(dirname "$0")/.."
npx esbuild lib/questionBulk.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/bulkBundle.mjs --log-level=warning
node scripts/bulk-contract.test.mjs
