#!/usr/bin/env bash
# Firebase Auth tesisatının sözleşme testi (ağ gerekmez, sahte Identity Toolkit).
# Çalıştır: npm run test:auth
set -e
cd "$(dirname "$0")/.."
npx esbuild lib/authClient.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/authBundle.mjs --log-level=warning \
  --alias:react-native=./scripts/auth-shims/react-native.ts \
  --alias:@react-native-async-storage/async-storage=./scripts/auth-shims/async-storage.ts \
  --alias:expo-secure-store=./scripts/auth-shims/expo-secure-store.ts \
  --alias:expo-constants=./scripts/auth-shims/expo-constants.ts \
  --define:process.env.EXPO_PUBLIC_FIREBASE_API_KEY='"AIzaTEST-KEY"' \
  --define:process.env.EXPO_PUBLIC_FIRESTORE_PROJECT='"kpssasistani-01"' \
  --define:process.env.EXPO_PUBLIC_FIRESTORE_ROOT='"."' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN='""' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID='""' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_APP_ID='""'
# Aynı modül, ANAHTARSIZ: EXPO_PUBLIC_* boş → çözümleme depoya gömülü
# config/firebaseApp.ts üzerinden olmalı (kullanıcıdan hiçbir şey istenmiyor).
npx esbuild lib/authClient.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/authBundleNoEnv.mjs --log-level=warning \
  --alias:react-native=./scripts/auth-shims/react-native.ts \
  --alias:@react-native-async-storage/async-storage=./scripts/auth-shims/async-storage.ts \
  --alias:expo-secure-store=./scripts/auth-shims/expo-secure-store.ts \
  --alias:expo-constants=./scripts/auth-shims/expo-constants.ts \
  --define:process.env.EXPO_PUBLIC_FIREBASE_API_KEY='""' \
  --define:process.env.EXPO_PUBLIC_FIRESTORE_PROJECT='"kpssasistani-01"' \
  --define:process.env.EXPO_PUBLIC_FIRESTORE_ROOT='"."' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN='""' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID='""' \
  --define:process.env.EXPO_PUBLIC_FIREBASE_APP_ID='""'
node scripts/auth-contract.test.mjs
