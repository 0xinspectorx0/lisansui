#!/usr/bin/env bash
# Firebase Auth tesisatının sözleşme testi (ağ gerekmez, sahte Identity Toolkit).
# Çalıştır: npm run test:auth
set -e
cd "$(dirname "$0")/.."

ESBUILD_ALIASES="\
  --alias:react-native=./scripts/auth-shims/react-native.ts \
  --alias:@react-native-async-storage/async-storage=./scripts/auth-shims/async-storage.ts \
  --alias:expo-secure-store=./scripts/auth-shims/expo-secure-store.ts \
  --alias:expo-constants=./scripts/auth-shims/expo-constants.ts"

bundle () {
  # $1 = kaynak dosya, $2 = çıktı, $3 = API anahtarı define değeri ('""' = yok)
  npx esbuild "$1" --bundle --format=esm --platform=neutral \
    --outfile="$2" --log-level=warning $ESBUILD_ALIASES \
    --define:process.env.EXPO_PUBLIC_FIREBASE_API_KEY="$3" \
    --define:process.env.EXPO_PUBLIC_FIRESTORE_PROJECT='"kpssasistani-01"' \
    --define:process.env.EXPO_PUBLIC_FIRESTORE_ROOT='"."' \
    --define:process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN='""' \
    --define:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID='""' \
    --define:process.env.EXPO_PUBLIC_FIREBASE_APP_ID='""'
}

# 1) Anahtar ORTAMDA tanımlı: klasik auth akışları (kayıt/giriş/token/panel).
bundle lib/authClient.ts /tmp/authBundle.mjs '"AIzaTEST-KEY"'

# 2) Aynı modül, ANAHTARSIZ: EXPO_PUBLIC_* boş → çözümleme depoya gömülü
#    config/firebaseApp.ts üzerinden olmalı (kullanıcıdan hiçbir şey istenmiyor).
bundle lib/authClient.ts /tmp/authBundleNoEnv.mjs '""'

# 3) Erişim tanısı + firestore istemcisi (Authorization başlığı davranışı).
bundle lib/accessDiag.ts /tmp/accessDiagBundle.mjs '""'
bundle lib/firestoreApi.ts /tmp/firestoreApiBundle.mjs '""'

# 3b) Kural aynası + belge kodlayıcısı (yazmadan önce biçim denetimi).
npx esbuild lib/memberShape.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/memberShapeBundle.mjs --log-level=warning
npx esbuild lib/membership.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/membershipBundle.mjs --log-level=warning

# 4) firestore.rules kopyası (paneldeki “Kuralları kopyala” düğmesinin kaynağı).
npx esbuild config/firestoreRulesCopy.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/rulesCopyBundle.mjs --log-level=warning

# 5) Yerel doğrulama primitifleri — sahiplenme (claim) eşiğinin dayandığı kod.
npx esbuild lib/crypto.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/cryptoBundle.mjs --log-level=warning

node scripts/auth-contract.test.mjs
