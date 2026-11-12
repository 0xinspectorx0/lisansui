#!/usr/bin/env bash
# lib/contentCopy.ts sözleşme testi — sahte Firestore REST, ağ gerekmez.
# Çalıştır: npm run test:copy
set -e
cd "$(dirname "$0")/.."
npx esbuild lib/contentCopy.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/copyBundle.mjs --log-level=warning \
  --alias:react-native=./scripts/auth-shims/react-native.ts \
  --alias:@react-native-async-storage/async-storage=./scripts/auth-shims/async-storage.ts \
  --alias:expo-secure-store=./scripts/auth-shims/expo-secure-store.ts \
  --alias:expo-constants=./scripts/auth-shims/expo-constants.ts \
  --define:process.env.EXPO_PUBLIC_FIRESTORE_PROJECT='"DST"' \
  --define:process.env.EXPO_PUBLIC_FIRESTORE_ROOT='"."' \
  --define:process.env.EXPO_PUBLIC_FIRESTORE_DATABASE='""' \
  --define:process.env.EXPO_PUBLIC_FIRESTORE_HOST='""' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_API_KEY='""' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN='""' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID='""' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_APP_ID='""'
node scripts/copy-contract.test.mjs
