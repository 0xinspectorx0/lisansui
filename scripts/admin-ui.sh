#!/usr/bin/env bash
# Admin ekranlarının SSR duman testi — gölge dosyalar üretilir, render edilir, silinir.
# Çalıştır: npm run test:ui
set -e
cd "$(dirname "$0")/.."
node scripts/admin-ui.test.mjs
