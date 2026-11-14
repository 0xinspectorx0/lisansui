#!/usr/bin/env bash
# lib/contentCopy.ts sözleşme testi — sahte Supabase REST, ağ gerekmez.
# Çalıştır: npm run test:copy
set -e
cd "$(dirname "$0")/.."
# Hedef proje = deponun kendi ref'i (testte sahte sunucu bu adresi dinliyor).
bundle() {
  npx esbuild "$1" --bundle --format=esm --platform=neutral \
    --outfile="$2" --log-level=warning \
    --alias:react-native=./scripts/auth-shims/react-native.ts \
    --alias:@react-native-async-storage/async-storage=./scripts/auth-shims/async-storage.ts \
    --alias:expo-secure-store=./scripts/auth-shims/expo-secure-store.ts \
    --alias:expo-constants=./scripts/auth-shims/expo-constants.ts \
    --define:process.env.EXPO_PUBLIC_SUPABASE_URL='"https://kpssdemo.supabase.co"' \
    --define:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY='"eyJTESTANONKEY.abcdef.0123456789"' \
    --define:process.env.EXPO_PUBLIC_SUPABASE_SCHEMA='"public"'
}
bundle lib/contentCopy.ts /tmp/copyBundle.mjs
bundle lib/authClient.ts /tmp/authBundle.mjs
node scripts/copy-contract.test.mjs
