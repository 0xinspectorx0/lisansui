#!/usr/bin/env bash
# Supabase tesisatının sözleşme testi (ağ gerekmez: GoTrue + PostgREST/RPC taklidi).
# Çalıştır: npm run test:db
set -e
cd "$(dirname "$0")/.."

# Metro/Expo yalnız YAZILI `process.env.X` ifadelerini derleme zamanında gömer;
# bundle'da tanımlı değer gerçek kurulumu taklit eder, tanımsız kalan boş kalır.
ESBUILD_ALIASES="\
  --alias:react-native=./scripts/auth-shims/react-native.ts \
  --alias:@react-native-async-storage/async-storage=./scripts/auth-shims/async-storage.ts \
  --alias:expo-secure-store=./scripts/auth-shims/expo-secure-store.ts \
  --alias:expo-constants=./scripts/auth-shims/expo-constants.ts"

# Not: define değerleri satırda YAZILI olmalı — değişkene koyulan tırnaklar
# bash tarafından yenilmez ve esbuild değeri tırnaklı metin olarak görür.
bundle () {
  # $1 = kaynak dosya, $2 = çıktı, $3 = "noenv" ise hedef tanımsız
  if [ "$3" = "noenv" ]; then
    npx esbuild "$1" --bundle --format=esm --platform=neutral \
      --outfile="$2" --log-level=warning $ESBUILD_ALIASES \
      --define:process.env.EXPO_PUBLIC_SUPABASE_URL='""' \
      --define:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY='""' \
      --define:process.env.EXPO_PUBLIC_SUPABASE_SCHEMA='""'
    return
  fi
  npx esbuild "$1" --bundle --format=esm --platform=neutral \
    --outfile="$2" --log-level=warning $ESBUILD_ALIASES \
    --define:process.env.EXPO_PUBLIC_SUPABASE_URL='"https://kpssdemo.supabase.co"' \
    --define:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY='"eyJTESTANONKEY.abcdef.0123456789"' \
    --define:process.env.EXPO_PUBLIC_SUPABASE_SCHEMA='"public"'
}

# 1) Kimlik istemcisi, HEDEF ORTAMDA: GoTrue akışları (kayıt/giriş/token/panel).
bundle lib/authClient.ts /tmp/authBundle.mjs

# 2) Aynı modül, ANAHTARSIZ: çözümleme depoya gömülü config'ten olmalı
#    (kullanıcıdan hiçbir şey istenmiyor) — boş env, boş config = yerel mod.
bundle lib/authClient.ts /tmp/authBundleNoEnv.mjs "" noenv

# 3) Bulut okuma/yazma katmanı (geçit + belge API'si) ve kullanıcı verisi eşi.
bundle lib/cloudApi.ts /tmp/cloudApiBundle.mjs
bundle lib/userDataSync.ts /tmp/userDataSyncBundle.mjs

# 4) Anlık bulut yazıları (politika + konu/hap bilgi belgeleri).
bundle lib/cloudWrite.ts /tmp/cloudWriteBundle.mjs

# 5) Yerel doğrulama primitifleri + belge biçimi + hak hesabı.
npx esbuild lib/memberShape.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/memberShapeBundle.mjs --log-level=warning
npx esbuild lib/membership.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/membershipBundle.mjs --alias:@react-native-async-storage/async-storage=./scripts/auth-shims/async-storage.ts --log-level=warning
npx esbuild lib/crypto.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/cryptoBundle.mjs --log-level=warning

# 6) Üretilen SQL kopyası (panelin “SQL — tablolar ve RLS” satırı) + derleme damgası.
npx esbuild config/supabaseSqlCopy.ts --bundle --format=esm --platform=neutral \
  --outfile=/tmp/sqlCopyBundle.mjs --log-level=warning
bundle lib/buildTag.ts /tmp/buildTagBundle.mjs

node scripts/db-contract.test.mjs
