# Firestore kurulumu — sıfırdan yeni proje

Bu depo Firebase SDK **kullanmaz**: hem içerik (soru bankası, hap bilgiler) hem de
üyelikler Firestore **REST API** üzerinden okunur/yazılır. Yeni bir Firestore
hesabı/projesi kurduğunda yapman gereken iki şey var: **projeyi uygulamaya
tanıtmak** ve **güvenlik kurallarını yayımlamak**.

Kimlik doğrulama iki moddan birinde çalışır (otomatik seçilir, kod değişikliği yok):

| Mod | Ne zaman | Parola nerede | Firestore isteği |
| --- | --- | --- | --- |
| **Firebase Auth** | anahtar tanımlıysa — sırası: cihaz kaydı → `.env.local` → **`config/firebaseApp.ts`** | Firebase'de (belgede yalnızca `algo: 'firebase-auth'` + `authUid` işaretçisi) | `Authorization: Bearer <idToken>` |
| **Yerel** (fallback) | hiçbir kaynakta anahtar yoksa | cihazda PBKDF2-SHA256 hash, belgede `verifier/salt/iterations` | anonim |

Anahtar **kullanıcıdan istenmez**: bir kez `config/firebaseApp.ts` içine yazılır ve
commit'lenir; uygulama onu otomatik kullanır. `.env.local` yalnız geliştirici için
opsiyonel override'dır. Anahtarsız da başlayabilirsin; sonra tek satırla Auth'a
geçersin (aşağıda **2b**). İki modda da çalışma anında Firestore belgesindeki veri aynıdır.

| Dosya | Ne yapar |
| --- | --- |
| `lib/firebaseConfig.ts` | Proje/veritabanı/yol öneki tek karar noktası (env → app.json → varsayılan) |
| `firestore.rules` | Hem kök düzeni (`/courses`, `/memberships`) hem legacy düzen (`/artifacts/{proje}/public/data/...`) destekler |
| `firebase.json` + `.firebaserc` | `npx firebase-tools deploy --only firestore:rules` için |

## 0) Mevcut durum
- `app.json → expo.extra.firestore` artık **`kpssasistani-01`** veritabanı **kökünü**
  gösteriyor (`{ projectId: 'kpssasistani-01', databaseId: '(default)', root: '' }`),
  yani taze bir klon hiçbir env dosyası olmadan yeni projeyi kullanır.
- Kod tarafındaki `DEFAULT_TARGET` (repo varsayılanı) **eski** `kpss-asistani` +
  `artifacts/.../public/data` düzeninde duruyor; `app.json` bloğunu silersen
  uygulama eskisine döner (geri alma yolu bu).
- **Önemli:** yeni projede henüz veri yok → içeriği boş görürsün. Doldurmak için tek
  komut: `npm run migrate:content` (aşağıda **7**). Sıra: 1c → 2b → `migrate:content`.

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

## 1c) “Your apps — There are no apps” durumu
`apiKey`, **Project settings → General → Your apps** altındaki web kaydından gelir;
proje yeni kurulduysa o liste boştur ve anahtar da yoktur. Tek seferlik kayıt:
1. **Add app → Web** (ikon: `</>`), bir ad ver (ör. `kpss-web`) → **Register app**.
2. Çıkan ekranda `const firebaseConfig = { ... }` bloğu görünür → **`apiKey`** değerini
   kopyala. `npm install firebase` / `firebase init` adımlarını **atla** (bu depo SDK
   kullanmıyor), `google-services.json` da **gerekmiyor** (biz REST + web anahtarı
   kullanıyoruz; native anahtarı sadece Firebase SDK kuran derlemeler ister).
3. “Close” ile çık. Artık **Project settings → General → Your apps** altında
   `Web app / kpss-web` ve onun `API key` satırı durur.

Anahtarın **tek kalıcı yeri depodur**: `config/firebaseApp.ts` içindeki
`FIREBASE_WEB_CONFIG.apiKey` satırı. Yaz → commit'le → `npx expo start --clear`.
Uygulamada/panelde hiçbir yere anahtar yapıştırılmaz (panelde giriş alanı yok).
- **Komutla yazdırmak istersen:** `npm run setup:firestore -- <proje> --root . --api-key <ANAHTAR>`
  hem `config/firebaseApp.ts` hem `.env.local` günceller.
- **`.env.local` (yalnızca override):** aşağıdaki **2** adımı; değeri varsa config'i gölgede bırakır.
- **Eski kurulumlar:** bir zamanlar panele girilmiş cihaz anahtarı (`AsyncStorage`,
  `kpss.firebaseAuth.config.v1`) hâlâ önceliklidir; Admin → Ayarlar → “Kaldır” ile
  silinir ve depodaki değer devreye girer.

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
6. **Web'e yayın (Vercel)** — repo kökündeki `vercel.json` her şeyi anlatıyor; Vercel
   proje ayarlarına dokunmana gerek yok (vercel.json, dashboard'daki Build/Output
   ayarlarını ezer):
   `installCommand: npm ci` → `buildCommand: npm run build`
   (= `expo export --platform web --output-dir dist`) → `outputDirectory: dist`.
   - `dist/` **gitignore'da**dır. Build emri eksik kalırsa (`buildCommand: null` gibi)
     Vercel'in servis edeceği hiçbir şey olmaz ve depo kaynak dosyalarına düşer;
     belirti: site açılmaz, tarayıcı `app.json` benzeri bir dosya indirir. Bu ayarı
     bozma; build komutu her zaman `npm run build` kalsın.
   - Proje kimliği pakette `app.json`'dan gelir, bu yüzden Vercel'de **environment
     variable tanımlaman gerekmez**. `.env.local`'ı Vercel'e de vermen şart değil.
   - Build'i yerelde gör: `npm run build` → `npm run build:serve`
     (`npx serve dist -s -l 8081`; dev sunucusu çalışıyorsa portu değiştir).
   - Yayın sonrası tek satırlık kontrol:
     `curl -sI https://<ad>.vercel.app/ | grep -i '^content-type'` → `text/html` olmalı.
     `application/json` ya da `octet-stream` dönüyorsa build alınmamıştır.
   - `apiKey`'i kısıtlı kullanacaksan (Console → Google Cloud → APIs → Credentials →
     API key → Application restrictions) `*.vercel.app` referrer'ını ekle; Vercel
     domain'i Firebase'in "Authorized domains" listesini ancak popup/redirect ile
     giriş yaparsan gerektirir — biz doğrudan REST kullandığımız için gerektirmiyor.

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
Ayrıntılı sıra yukarıda **2b)** bölümünde. Kalıcı yer **`config/firebaseApp.ts`** —
depoğa yaz, commit'le, uygulama kendiliğinden Firebase Auth'a geçer; panele/ekrana
hiçbir şey yapıştırılmaz:
```ts
export const FIREBASE_WEB_CONFIG: FirebaseWebConfig = {
  apiKey: 'AIza...',                                   // Console → Your apps → SDK config
  projectId: 'kpssasistani-01',
  authDomain: '',                                      // boşsa <projectId>.firebaseapp.com türetilir
  appId: '',                                           // opsiyonel
};
```
Aynı değerleri `.env.local` ile geçici olarak gölgede bırakabilirsin
(`EXPO_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`) —
geliştirici akışı için, şart değil. Bunlar public web yapılandırmasıdır
(pakete gömülür, gizli değil; asıl koruma `firestore.rules`).
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
npm run setup:firestore -- kpssasistani-01 --root . --api-key AIza...   # config/firebaseApp.ts + .env.local
npm run deploy:rules
npx expo start --clear
npm run check:firestore     # "Firebase Auth testi: API anahtarı geçerli ve sağlayıcı açık"
#   (anahtarı sırasıyla --api-key, .env.local ve config/firebaseApp.ts’ten okur)
```
4. Panelde **Uygulama Ayarları → Firebase Auth (kimlik doğrulama) → Test et**:
   mod rozeti `firebase-auth` ve “Kaynak: depoya gömülü config” satırı görünmeli;
   kart, bu cihazdaki oturumu da gösterir. Anahtar giriş alanı yoktur — gerekmez.

Ne değişir:
- **Eski (yerel PBKDF2) hesaplar kaybolmaz.** Anahtar sonradan eklendiğinde bir üyenin
  Firebase hesabı yoktur; girişte Firebase `EMAIL_NOT_FOUND` derse uygulama üyelik
  belgesini okuyup parolayı belgedeki hash ile doğrular ve üyeyi içeri alır (Firestore
  yazmaları yine kurallara tabidir). **Profil → Şifremi değiştir** ise hesabı kalıcı
  olarak Firebase’e taşır: yeni parolayla Firebase kullanıcısı açılır, belge
  `algo: 'firebase-auth'` + `authUid` olur. Kayıt verisine dokunulmaz.
- Üyelik belgesine parola hash'i **yazılmaz**; `lib/crypto.ts` yalnızca yerel modda kullanılır.
- Kayıt/giriş `identitytoolkit.googleapis.com` üzerinden yapılır (`lib/authClient.ts`);
  hata mesajları Türkçeye çevrilir (`EMAIL_EXISTS`, `INVALID_LOGIN_CREDENTIALS`,
  `OPERATION_NOT_ALLOWED` → "Email/Password açık değil" gibi).
- Oturum native'de `expo-secure-store`, web'de `AsyncStorage` içinde durur; idToken
  süresi dolunca `refresh_token` ile sessizce yenilenir. Uygulama açılışında
  `SESSION_KEY` akışı aynen çalışmaya devam eder.
- Panel → “Şifremi unuttum” (giriş ekranında) `PASSWORD_RESET` e-postası gönderir.
- Yönetici listesi ve kilit **veride** durur, kod bayrağı yok:
  - `meta/admins { emails: [küçük harf e-posta], updatedAt, schemaVersion }` → panelin
    “Kendimi ekle” düğmesi bu belgeyi oluşturur/günceller (Admin SDK, custom claim
    gerekmez). Kilit açılana kadar uygulama yazabilir; sonrası yalnız Console.
  - `meta/membership_lockdown` **varsa** kimliksiz istekler üyelik belgesi
    okuyamaz/yazamaz (yalnızca kendi e-postasıyla eşleşen token). Console'da oluştur,
    silince anında geri alınır — kuralı yeniden yayımlamana gerek yok.
  Sıra: önce giriş akışını Auth ile bir kez dene (senin e-postan `meta/admins` içinde
  olsun), sonra kilidi aç. Kilit açıkken panelden anonim üye düzenleyemezsin.
- Panelde **Uygulama Ayarları → Firebase Auth** kartında “Yönetici listesi” ve
  “Üyelik kilidi” satırları canlı durumu gösterir (Yenile ile tekrar okur).

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

## 5b) Sıralama (kısayol)
```bash
# 1) Console: Add app → Web → Register app → apiKey kopyala (1c)
# 2) Console: Authentication → Sign-in method → Email/Password → Enable
# 3) Terminal (repo kökünde, bir kez):
npm run setup:firestore -- kpssasistani-01 --root . --api-key <ANAHTAR>   # anahtar depoya yazılır
npm run deploy:rules
npm run migrate:content            # eski projeden soru bankası + hap bilgiler
npm run check:firestore            # hepsi yeşil mi
npx expo start --clear
```
Anahtar 3. adımda `config/firebaseApp.ts` içine yazılır; uygulamanın içinde hiçbir
yerden anahtar istenmez (bkz. 1c). `deploy:rules` yerine Console →
Firestore → Rules → yapıştır → Publish da olur.
Soru bankası boşsa uygulama repodaki seed verisine düşer (`lib/seedData.ts`:
`INITIAL_TOPIC_CATALOG`, `FALLBACK_QUESTIONS`, `INITIAL_DAILY_TIPS`) — uygulama açılır,
konu listesi ve örnek sorularla çalışır. Yani içerik taşımayı sonraya bırakabilirsin.

## 6b) Tohumlama sonrası: yazma penceresini kapat
Panel “yazılabilir” durumunu `meta/content_lock` belgesine bakarak anlıyor. Kurulum
bitince Console'da şu belgeyi oluştur: koleksiyon `meta`, belge `content_lock`,
alan `note` = `kilitli`. Bu andan itibaren uygulama içeriğe yazamaz (rules), kilit
belgesini de uygulama yazamaz/silemez — açmak yine Console işidir.

## 7) Eski projeden veri taşımak
**Kolay yol (terminal yok):** panel → **Uygulama Ayarları → “Eski projeden içeriği
kopyala”** → kaynak proje kimliği (`kpss-asistani`) → **Kaynağı tara** → **Bu projeye
kopyala**. Aynı işi uygulamanın içinden yapar: kaynağı anonim okur, hedefe panel
tohumlamasıyla **aynı kurallarla** yazar, ilerlemeyi ve hataları kartta gösterir.
“Var olanları atla” açıkken yarıda kesersen tekrar basmak eksikleri tamamlar.

**Terminal yolu (aynı mantık, büyük bankada daha rahat):** `npm run migrate:content`
`scripts/migrate-content.mjs` eski projedeki belgeyi **olduğu gibi** (fields bloğu
dönüştürülmeden) yeni projeye kopyalar; yani soru formatı, alan adları ve konu
içeriği birebir aynı kalır. Admin SDK, servis hesabı anahtarı veya Console veri
ekranı gerekmez — panelin tohumlama akışıyla **aynı** kuralları kullanır.

```bash
npm run test:copy                                 # 0) kopyalama mantığının testi (27 kontrol)
npm run migrate:content -- --limit 2 --dry-run   # 1) pilot: ne olacak, görsel onay
npm run migrate:content                            # 2) tamamını taşı (yarıda kesilirse devam eder)
npm run migrate:content -- --force                 #    hepsini yeniden yaz
npm run migrate:content:selftest                   #    script'in kendi testi (16 kontrol, ağ gerekmez)
```

Seçenekler: `--from <proje>` (varsayılan `kpss-asistani`), `--from-root <yol>`
(varsayılan `artifacts/kpss-asistani/public/data`), `--to <proje>` ve `--to-root`
(varsayılanlar `.env.local`'dan), `--only courses,tips`, `--limit N`,
`--concurrency 6`, `--state .migrate-state.json`, `--dry-run`, `--force`.

Nasıl çalışır:
1. `courses` listesini sayfa sayfa okur, her ders için `topics` listesini çeker
   (REST liste yanıtı belge gövdesini de taşıdığı için konu başına istek atmaz).
2. Her belgeyi hedefe `POST ?documentId=…` ile yazar; 409 alırsa `PATCH` ile
   üzerine yazar. `daily_tips/main` doğrudan `PATCH` ile taşınır.
3. Yazma yanıtındaki `questions` uzunluğunu kaynakla karşılaştırır; uyuşmazlık
   sonunda listelenir ve komut **hata koduyla** çıkar (yani “bitti” sanmazsın).
4. `.migrate-state.json` yazılan belgeleri tutar → kesinti/`Ctrl+C` sonrası
   tekrar çalıştırınca atlar. `--force` hepsini yeniden yazar.

Sonrası: Console → `meta/content_lock` oluştur (içerik yazma penceresi kapanır) ve
isteyen `meta/membership_lockdown` ile üyelik kilidini açar.

## 7b) Üyelik verisi cihazda BEKLETİLMEZ — her yazma anında Firestore’a

Kasıtlı tasarım: `memberships/*` için tek kaynak Firestore. Uygulama reddedilen bir
yazmayı cihazda kuyruğa almaz, yerel hesap/profil oluşturmaz; yazma ya gider ya da
işlem net bir nedenle döner (ve açılan Firebase hesabı geri alınır ki tekrar deneme
`EMAIL_EXISTS`e dönmesin). Sayaçlar da bekletilmez: test biter bitmez
`patchMemberDoc` ile anında yazılır.

Bunun çalışması için kurallar **kimlik doğrulama olmadan da kendi belgesini
oluşturmaya** izin verir (`firestore.rules → selfCreateOk`):

| Koşul | Neden |
| --- | --- |
| `meta/membership_lockdown` yoksa (kilit kapalı) | Kilit AÇIKKEN kimliksiz create yok — kilit tam olarak “yeni kayıt akışı dursun” demek. |
| Belge kimliği = istenen e-posta (`memberId == request.resource.data.email.lower()`) | Kimlik, yolun kendisi; başkasının belgesi yerine geçilemez. |
| `role == 'user'`, `status in [active, pending]`, tam `memberShapeOk` biçimi | Yetki kaçışı yok: admin/editörlük, `authUid` (yalnız kendi uid’n), hak alanları create’ta geçmez. |

Ayrıca uygulama **bayat oturum token’ını kendisi tazeler**: yanıt
`TOKEN_EXPIRED`/`AUTHENTICATION_FAILED` gibi görünüyorsa aynı istek taze token’la
bir kez daha gönderilir (`lib/firestoreApi.ts`). Bu, “okuma serbest, yazma reddediliyor”
şeklinde görünen sessiz 403’lerin en yaygın nedeni; kullanıcıya işlem baştan
denetmez, tek cümleyle bildirilir.

Panelde tanılama/kuyruk satırı yok; kalan tek bilgi “Üyelik koleksiyonu” satırının
altında yol + `kod member-…` (cihazdaki derleme etiketi).

> Kalıcı yayın adımı geliştiricide: Console → Firestore → Rules → `firestore.rules`
> metnini yapıştır → **Publish**. Bu depoda CI yok; `git push` kuralları yayınlamaz
> ve `dist` üretmez. Yayınlanana kadar yeni üyeler yazma redliyse kayıt açılmaz
> (bilerek: cihazda kopya bırakmıyoruz) ve ekranda tek cümlelik neden yazar.

## 8) Sık karşılaşılan hatalar
| Belirti | Sebep / çözüm |
| --- | --- |
| “Firestore kurallı yazmayı reddetti” | Kurallar yayında değil → 3. adım. |
| `NOT_FOUND: Database (default) does not exist` | Veritabanını farklı isimle açtın → `EXPO_PUBLIC_FIRESTORE_DATABASE` ile doğru ismi ver veya `(default)` DB oluştur. |
| Kayıt var ama panel listesi boş | `root` ayarı belge yoluyla uyuşmuyor (kök ↔ artifacts). Kartta görünen “Üyelik koleksiyonu” yolunu Console yoluyla kıyasla. |
| “Üye ol” derken **“okuma/yazma kuralı engellendi”** | Bilerek: üyelik verisi cihazda bekletilmez, bu yüzden red = kayıt açılmaz (yarım hesap da bırakılmaz, Firebase hesabı geri alınır). Onarım geliştiricide: Console → Firestore → Rules → kural metnini yapıştır → **Publish**; veritabanı yoksa önce **Create database** (Native, `(default)`). Kuralın E-posta/Parola kapalıyken de create kabul etmesi için 7b’deki `selfCreateOk` dalı yayında olmalı. |
| Üye olurken okuma serbest, yazma reddediliyor | Uygulama artık red nedenini **yazmadan önce** biliyor: `lib/memberShape.ts`, `firestore.rules` içindeki `memberShapeOk` denetiminin aynası. Kuralın tolere edemediği sapmalar (bozuk/boş `verifier/salt/iterations` üçlüsü, 80 karakteri aşan ad, `31.12.2030` biçiminde tarih, 12'den çok `courseUsage` girdisi) **düzeltildikten sonra** gönderilir; düzeltilemeyen şey alan adıyla (`email: ...`) bildirilir. |
| Kısmi güncelleme reddediliyor, tam belge yazılıyor | Firestore REST'te `PATCH`, belge **yokken** create sayar ve `memberShapeOk` eksik alanları reddeder. `lib/firestoreApi.ts → writeMemberDoc` bunu kademe kademe çözer: create → 409 ise kabul edilen alanlarla güncelle (benimsenme) → create reddedildiyse önce belgenin varlığına bak, varsa kısmi yaz. |
| Panel üyeye VIP verirken yazma reddedildi | `memberUpdateOk` tek PATCH'te **ya** `usageOnlyChange` **ya** `entitlementChange` listesinde kalmayı istiyor. `authUid` yalnız birinci, `vip/vipPlan/vipExpiresAt/status` yalnız ikinci listede → `upsertMemberDoc` bunları **iki ayrı PATCH**'te yazar; `createdAt/id/email/role` hiç PATCH'lenmez. |
| Kilit "yok" görünüyor ama yazmalar engelli | `meta/membership_lockdown` belgesi **legacy yolda** (`artifacts/kpss-asistani/public/data/...`) duruyor olabilir; kurallar iki yolu da denetliyor. İstemci de öyle: `readLockdownInfo()` / `metaDocPaths()` iki yolu birden yoklar ve panel **silinecek belgenin tam yolunu** söyler (kopyalanabilir). |
| Kayıt olurken “hesap açılamadı / başka proje” | Firebase anahtarı ile Firestore hedefi farklı projeleri gösteriyor. `config/firebaseApp.ts` içindeki `projectId` ile `app.json → expo.extra.firestore.projectId` (veya `EXPO_PUBLIC_FIRESTORE_PROJECT`) eşit olmalı. |
| Kayıt açılırken “yazma reddedildi” | Sırayla: (1) kural yayında mı → 3. adım; (2) `meta/membership_lockdown` var mı → silince kimliksiz create açılır (7b); (3) E-posta/Parola sağlayıcısı kapalıysa (`OPERATION_NOT_ALLOWED`) → Console → Authentication → Sign-in method → **Email/Password → Enable** — ama kural 7b’deki gibi yayındaysa sağlayıcı kapalıyken de üyelik yazılır. |
| Üyelik yazması bir ara `TOKEN_EXPIRED`/403 verip sonra geçiyor | Beklenen durum: uygulama bayat token’ı kendiliğinden yenileyip aynı isteği tekrar gönderiyor (`lib/firestoreApi.ts`). Kullanıcıya “işlemi yeniden dene” denmez; tek cümlelik bilgi yeter. |
| Cihazda derlemenin hangisi çalıştığından şüphe | Panel → Firestore bağlantısı kartındaki `kod member-…` satırına bak; beklenen etiketle farklıysa paket eski: `npx expo start --clear` + Ctrl/Cmd+Shift+R (Vercel sürümü kullanıyorsan yeniden deploy şart — CI yok). |
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
