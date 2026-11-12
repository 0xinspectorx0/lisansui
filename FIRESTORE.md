# Firestore kurulumu — sıfırdan yeni proje

Bu depo Firebase SDK **kullanmaz**: hem içerik (soru bankası, hap bilgiler) hem de
üyelikler Firestore **REST API** üzerinden okunur/yazılır. Yeni bir Firestore
hesabı/projesi kurduğunda yapman gereken iki şey var: **projeyi uygulamaya
tanıtmak** ve **güvenlik kurallarını yayımlamak**.

Kimlik doğrulama iki moddan birinde çalışır (otomatik seçilir, kod değişikliği yok):

| Mod | Ne zaman | Parola nerede | Firestore isteği |
| --- | --- | --- | --- |
| **Firebase Auth** | `.env.local` içinde `EXPO_PUBLIC_FIREBASE_API_KEY` varsa | Firebase'de (belgede yalnızca `algo: 'firebase-auth'` + `authUid` işaretçisi) | `Authorization: Bearer <idToken>` |
| **Yerel** (bugünkü) | anahtar tanımlı değilse | cihazda PBKDF2-SHA256 hash, belgede `verifier/salt/iterations` | anonim |

İstersen anahtarı vermeden başlayabilirsin; sonra tek satırla Auth'a geçersin
(aşağıda **2b**). İki modda da çalışma anında Firestore belgesindeki veri aynıdır.

| Dosya | Ne yapar |
| --- | --- |
| `lib/firebaseConfig.ts` | Proje/veritabanı/yol öneki tek karar noktası (env → app.json → varsayılan) |
| `firestore.rules` | Hem kök düzeni (`/courses`, `/memberships`) hem legacy düzen (`/artifacts/{proje}/public/data/...`) destekler |
| `firebase.json` + `.firebaserc` | `npx firebase-tools deploy --only firestore:rules` için |

## 0) Mevcut durum
`kpss-asistani` projesi ve `artifacts/kpss-asistani/public/data` düzeni **varsayılan**
olarak duruyor. Hiçbir şey değiştirmezsen uygulama bugünkü gibi çalışmaya devam eder.

> **Senin projen (bu oturumda verildi):** ad `kpssasistani`,
> Project ID **`kpssasistani-01`**, proje numarası `674719983447`.
> Bu depodaki `.env.example` ve aşağıdaki komutlar bu kimliği kullanıyor.

## 1) Firebase projesi + Firestore veritabanı
1. https://console.firebase.google.com/ → **Add project** (ör. `kpssasistani-01`), Analytics kapalı olabilir.
2. Sol menü → **Build → Firestore Database → Create database** (bu proje için tamamlandıysa atla)
   - **Native mode** seç (Datastore mode REST `/v1/projects/.../documents` akışıyla uyumsuz olabilir).
   - Region: `europe-west1` (Belçika) Türkiye için iyi bir seçim.
   - Database ID: **`(default)`** olmalı — kod `databases/(default)` kullanıyor.
3. Mod: başlangıçta **Test mode** bırakabilirsin; 30 gün sonra kural yayımlaman istenir.
   Kalıcı çözüm aşağıdaki 3. adım.

> **Klasör/koleksiyon isimlerini senin açman gerekmiyor:**
> - `memberships/{e-posta}` → ilk kayıtta uygulama tarafından oluşturulur.
> - `courses/{courseId}/topics/{docId}` ve `daily_tips/main` → **Yönetim Paneli →
>   Uygulama Ayarları → “Firestore klasörlerini oluştur (tohumlama)”** akışı oluşturur
>   (planı çıkar → Firestore’a yaz). Panelde düzenlediğin konu/soru/tip listeleri
>   olduğu gibi kopyalanır; repodaki örnek soruları da dahil edebilirsin.
> - Kalıcı içerik (tam soru bankası) için 4. adımdaki şemayı kullan.

## 1b) Tek komut: `npm run setup:firestore`
Kod tarafında gereken her şeyi tek satır yapar (`.env.local` + `.firebaserc`),
sonra sana kalan Console işlerini sırayla sayar:
```bash
npm run setup:firestore -- kpssasistani-01 --root .   # dosyaları yaz
npm run check:firestore                          # kuralları/okumayı dene
npm run deploy:rules                             # npx firebase-tools ile yayınla
```
`scripts/setup-firestore.mjs` seçenekleri: `--root <önec>` (kök düzen için `.`),
`--dir <yol>`, `--dry-run`, `--check`, `--deploy`. `--check` şunları dener: içerik
okuma, `memberships` listeleme, **kurallara uygun geçici bir üye belgesi yazma ve
silme**, (legacy düzen seçiliyse) yol öneki. Ağın engelli olduğu bir makinede
“erişilemedi” der ve seni uyarır — gerçek sonucu kendi makinende verir.

## 2) Uygulamayı yeni projeye bağla (adım adım)
Öncelik sırası: **env → app.json → repo varsayılanı**. Üç yoldan birini seç.

### A) `.env.local` — tavsiye edilen, kod değişikliği yok
1. **Repo köküne** dosya aç (yani `package.json` ile aynı klasöre):
   ```bash
   cd <repo>            # package.json'un olduğu klasör
   cp .env.example .env.local
   open -e .env.local   # macOS · Linux: xdg-open/ nano, Windows: notepad
   ```
2. İçini doldur — **iki satarı birlikte ver**, tek başına proje kimliği yetmez:
   ```bash
   EXPO_PUBLIC_FIRESTORE_PROJECT=kpssasistani-01
   EXPO_PUBLIC_FIRESTORE_ROOT=.
   # opsiyonel: EXPO_PUBLIC_FIRESTORE_DATABASE=(default)
   # emulator:   EXPO_PUBLIC_FIRESTORE_HOST=http://localhost:8080/v1
   ```
   - `EXPO_PUBLIC_` ön eki zorunlu: bu önek olmayan değişkenler derlenen pakete
     gömülmez (Expo kuralı).
   - `EXPO_PUBLIC_FIRESTORE_ROOT=.` → koleksiyonlar veritabanının **kökünde**
     (`/courses`, `/daily_tips`, `/memberships`). Boş bırakmak da aynı işi görür;
     `.` yazman tavsiye edilir (bazı araçlar boş değeri düşürür).
     Kök yerine eski düzeni kullanmak istersen: `artifacts/kpssasistani-01/public/data`.
3. **Metro'yu temiz önbellekle yeniden başlat** (env, derleme zamanında pakete
   gömülür; canlı yeniden yükleme ile değişmez):
   ```bash
   npx expo start --clear
   # web export alacaksan: CI=1 npx expo export --platform web
   ```
   > **Tuzak:** `expo export`/`expo start --port` aynı Metro önbelleğini paylaşır.
   > Yalnızca `.env.local` değiştiyse eski transform kullanılabilir ve pakete **eski**
   > proje kimliği gömülür. `expo export`'un `--clear` bayrağı yoktur; önbelleği sil:
   > `rm -rf "$TMPDIR/metro-cache" /tmp/metro-cache`. Kontrol:
   > `grep -c "kpssasistani-01" <export>/_expo/static/js/web/*.js` > 0 olmalı.
4. Doğrula (iki yerden):
   - Uygulama: kalkan ikonu → PIN `2468` → **Uygulama Ayarları → “Firestore bağlantısı”**
     kartında `Proje kimliği: kpssasistani-01`, `Yol öneki: (kök)`, `Ayar kaynağı: env`
     yazmalı. Kart, proje ile root birbirine uymuyorsa **uyarı satırı** gösterir.
   - **Test et** düğmesi → `memberships: OK | 404 (koleksiyon henüz yok — normal)` ve
     `daily_tips: …` satırlarını döndürür.
5. `.env.local` repoya girmesin: depoda `.gitignore` var (`.env`, `.env.*`,
   `!.env.example`). `.env.example` şablonu commit'lenebilir, içinde kendi değerlerin
   olmamalı.

### B) `app.json` → `expo.extra.firestore`
```json
"extra": {
  "firestore": {
    "projectId": "kpssasistani-01",
    "databaseId": "(default)",
    "root": "."
  }
}
```
Repoda görüneceği için yalnızca proje kimliği gibi sır olmayan değerler için
kullan; `root` için `.` ya da tam önek yazılabilir (boş string de kabul).

### C) `lib/firebaseConfig.ts` → `DEFAULT_TARGET`
Tek projeyle uzun vadeli çalışacaksan en basiti: varsayılanı kendi projen yap,
`.env` ile uğraşma.

### D) Firebase Auth’a geçiş için hazırlık
Ayrıntılı sıra yukarıda **2b)** bölümünde; özetle `.env.local`'a şu dört satır eklenir
(değerler Console → Project settings → Your apps → SDK config):
```bash
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=kpssasistani-01.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=kpssasistani-01
EXPO_PUBLIC_FIREBASE_APP_ID=1:...:web:...
```
Bunlar public web yapılandırmasıdır (pakete gömülür, gizli değil).
**Servis hesabı JSON’ı / OAuth token’ı `.env`e yazılmaz ve panele/repo'ya
konulmaz** — o yalnızca Admin SDK script'leri içindir.

### EAS/üretim derlemeleri
`.env.local` EAS'a otomatik yüklenmez. İkiden biri:
```bash
eas build --platform all --env-file .env.local
```
veya EAS dashboard → Variables → **`EXPO_PUBLIC_FIRESTORE_PROJECT`,
`EXPO_PUBLIC_FIRESTORE_ROOT`** (+ Auth kullanıyorsan `EXPO_PUBLIC_FIREBASE_API_KEY`)
değerlerini Production/Preview değişkeni olarak ekle
(EAS, build sırasında bunları da paketin içine gömer).

## 2b) Firebase Auth'a geç (önerilen, ~2 dakika)
1. **Console → Authentication → Sign-in method → Email/Password → Enable.**
2. **Project settings → General → Your apps → Add app → Web** → `SDK config` içindeki
   `apiKey` değerini kopyala (public web anahtarı; servis hesabı JSON'u **değil**).
3. Tek komutla yazdır:
```bash
npm run setup:firestore -- kpssasistani-01 --root . --api-key AIza...
npm run deploy:rules
npx expo start --clear
npm run check:firestore     # "Firebase Auth testi: API anahtarı geçerli ve sağlayıcı açık"
```
4. Panelde **Uygulama Ayarları → Firebase Auth (kimlik doğrulama) → Test et**:
   mod rozeti `firebase-auth` olmalı; kart, bu cihazdaki oturumu da gösterir.

Ne değişir:
- Üyelik belgesine parola hash'i **yazılmaz**; `lib/crypto.ts` yalnızca yerel modda kullanılır.
- Kayıt/giriş `identitytoolkit.googleapis.com` üzerinden yapılır (`lib/authClient.ts`);
  hata mesajları Türkçeye çevrilir (`EMAIL_EXISTS`, `INVALID_LOGIN_CREDENTIALS`,
  `OPERATION_NOT_ALLOWED` → "Email/Password açık değil" gibi).
- Oturum native'de `expo-secure-store`, web'de `AsyncStorage` içinde durur; idToken
  süresi dolunca `refresh_token` ile sessizce yenilenir. Uygulama açılışında
  `SESSION_KEY` akışı aynen çalışmaya devam eder.
- Panel → “Şifremi unuttum” (giriş ekranında) `PASSWORD_RESET` e-postası gönderir.
- Katı mod: `firestore.rules` içinde `authRequired()` → `true` yaparsan kimliksiz
  istekler üyelik belgesi **okuyamaz/yazamaz** olur (yalnızca kendi e-postasıyla
  eşleşen token). Panelin tam yetkili kalması için Admin SDK ile şu komut yeterli:
  `firebase auth:setCustomClaim <uid> kpss_admin true` (claim adı `kpss_admin`).
  Bunu yapmadan `authRequired()` = true, paneli de kilitler — sırayı bozma.

## 3) Kuralları yayımla
```bash
# .firebaserc içindeki projectId'i kendi projenle değiştir:
#   { "projects": { "default": "kpssasistani-01" } }
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```
veya Console → **Firestore → Rules** → `firestore.rules` içeriğini yapıştır → **Publish**.

Kural dosyası her iki yol düzenini de içerir; kullanmadığın bloğu silebilirsin:
- yeni kurulum → `match /{collection}/...` + `match /memberships/{memberId}`
- legacy kurulum → `match /artifacts/{artifact}/public/data/...`

## 4) İçerik şeması (tohumlama da bu yapıyı yazar)
Kurs kimlikleri: `tarih`, `cografya`, `turkce`, `vatandaslik`, `guncel`.

**4.1 Konular** — `courses/{courseId}/topics` koleksiyonuna belge ekle,
belge kimliği serbest (ör. `ilk_cag`):

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | string | opsiyonel; yoksa belge kimliği kullanılır |
| `name` | string | Konu başlığı (listede görünür) |
| `questions` | **array** | her eleman bir **map** |

`questions[]` haritasının alanları:

| Alan | Tip | Not |
| --- | --- | --- |
| `question` | string | zorunlu — boşsa soru atlanır |
| `options` | array&lt;string&gt; | en az 2 şık |
| `answer` | integer | 0 tabanlı şık indeksi (string de kabul edilir) |
| `explanation` | string | çözüm metni |
| `id` | string/number | ops.; yoksa `{topicDocId}_{index}` üretilir |

Aynı belgeyi tek seferde okumak için URL: `…/documents/courses/tarih/topics/ilk_cag`.

**4.2 Hap bilgiler** — `daily_tips` koleksiyonunda `main` kimliğiyle tek belge:

| Alan | Tip |
| --- | --- |
| `list` | array&lt;string&gt; |

**4.3 Üyelikler** — `memberships/{e-posta}` belgelerini uygulama oluşturur; elle
oluşturacaksan şu alanlar **zorunlu** (firestore.rules biçimi denetliyor):
`id` (=küçük harf e-posta), `email`, `emailNormalized`, `displayName`, `verifier`
(64 hex), `salt` (32 hex), `iterations` (≥100), `algo` (`pbkdf2-sha256`), `role`,
`status`, `vip` (bool), `vipPlan`, `vipExpiresAt`, `createdAt`, `lastLoginAt`,
`city`, `exam`, `note`, `testsCompleted`, `questionsSolved`, `netSum`,
`courseUsage` (map), `schemaVersion` (=1).
Şifre hash'ini elle üretmek yerine **panelde Üyelik Paneli → Yeni üye** akışını kullan
(PBKDF2 cihazda hesaplanır).

## 5) Doğrulama
```bash
npm run test:auth      # sahte Identity Toolkit ile 59 kontrol (ağ gerekmez)
```
`{P}` = proje kimliğin, `{R}` = kök öneki (kök düzen için boş, `{R}/` kısmını atla):

```
https://firestore.googleapis.com/v1/projects/{P}/databases/(default)/documents/{R}memberships?pageSize=10
https://firestore.googleapis.com/v1/projects/{P}/databases/(default)/documents/{R}daily_tips/main
https://firestore.googleapis.com/v1/projects/{P}/databases/(default)/documents/{R}courses/tarih/topics?pageSize=100
```
- `{"documents":[]}` veya 404 → koleksiyon yok (normal, uygulama ilk yazımda oluşturur).
- `PERMISSION_DENIED` → kurallar yayında değil / yol düzeni uyuşmuyor (`root` ayarını kontrol et).

Uçtan uca: önizlemede **kişi ikonu → Kayıt ol**, sonra Console'da belgeyi gör,
**Üyelik Paneli**'nde listele/plan değiştir, uygulamada **her ders 1 test** kuralının
işlediğini doğrula.

## 6) Boş içerikte uygulama ne yapar?
Soru bankası boşsa uygulama repodaki seed verisine düşer (`lib/seedData.ts`:
`INITIAL_TOPIC_CATALOG`, `FALLBACK_QUESTIONS`, `INITIAL_DAILY_TIPS`) — uygulama açılır,
konu listesi ve örnek sorularla çalışır. Yani içerik taşımayı sonraya bırakabilirsin.

## 6b) Tohumlama sonrası: yazma penceresini kapat
Panel “yazılabilir” durumunu `meta/content_lock` belgesine bakarak anlıyor. Kurulum
bitince Console'da şu belgeyi oluştur: koleksiyon `meta`, belge `content_lock`,
alan `note` = `kilitli`. Bu andan itibaren uygulama içeriğe yazamaz (rules), kilit
belgesini de uygulama yazamaz/silemez — açmak yine Console işidir.

## 7) Eski projeden veri taşımak (istersek)
Tohumlama akışı yalnızca **kilit yokken** ve izinli koleksiyonlara yazar; canlı
projede eski soru bankasının tamamını (9.5k+ soru) kopyalamak için iki pratik yol:
- **Admin SDK script'i** (kendi makinende): `npm i @google-cloud/firestore`,
  servis hesabı anahtarıyla eski projeden REST oku → yeni projeye `set()`.
- **Emulator + JSON**: `firebase emulators:start --only firestore --project demo-kpss`
  ve `EXPO_PUBLIC_FIRESTORE_HOST=http://localhost:8080/v1` ile önce yerel doğrula.

## 8) Sık karşılaşılan hatalar
| Belirti | Sebep / çözüm |
| --- | --- |
| “Firestore kurallı yazmayı reddetti” | Kurallar yayında değil → 3. adım. |
| `NOT_FOUND: Database (default) does not exist` | Veritabanını farklı isimle açtın → `EXPO_PUBLIC_FIRESTORE_DATABASE` ile doğru ismi ver veya `(default)` DB oluştur. |
| Kayıt var ama panel listesi boş | `root` ayarı belge yoluyla uyuşmuyor (kök ↔ artifacts). Kartta görünen “Üyelik koleksiyonu” yolunu Console yoluyla kıyasla. |
| Env değişikliği etkili olmadı | `.env.local` repo kökünde mi, ad `EXPO_PUBLIC_` ile mi başlıyor, ve Metro'yu `npx expo start --clear` ile yeniden başlattın mı? |
| Panel “root hâlâ legacy” uyarısı veriyor | Sadece proje kimliğini verdin; `EXPO_PUBLIC_FIRESTORE_ROOT=.` satırını ekle (B seçeneğinde `root: "."`). |
| İçerik Console'da var, app boş gösteriyor | Koleksiyon/yol birebir `courses/{courseId}/topics/{docId}` olmalı; `questions` bir **array of map**. |

## 9) Güvenlik notu
Auth anahtarı tanımlıysa kurallar `request.auth.uid`/`request.auth.token.email` ile
istemciyi tanır ve `authRequired()` bayrağıyla yalnızca kendi belgesine erişim
verilebilir. Anahtarsız (yerel) modda kurallar istemciyi UID ile ayıramaz; yalnızca
veri şeklini denetler. Bu set `role` değiştirmeyi kapatır (kendi kendine yöneticilik
engeli), şifre alanlarının biçimini zorunlu kılar ve içeriği anonim yazıma kapatır.
Sertleştirme seçenekleri `firestore.rules` dosyasının altındaki notlarda:
“sadece Console” varyantı ve Firebase Auth ile `request.auth.token.email == memberId`
eşleştirmesi.
