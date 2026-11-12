# Firestore kurulumu — sıfırdan yeni proje

Bu depo Firebase SDK **kullanmaz**: hem içerik (soru bankası, hap bilgiler) hem de
üyelikler Firestore **REST API** üzerinden, anonim (API anahtarsız) okunur/yazılır.
Yeni bir Firestore hesabı/projesi kurduğunda yapman gereken iki şey var:
**projeyi uygulamaya tanıtmak** ve **güvenlik kurallarını yayımlamak**.

| Dosya | Ne yapar |
| --- | --- |
| `lib/firebaseConfig.ts` | Proje/veritabanı/yol öneki tek karar noktası (env → app.json → varsayılan) |
| `firestore.rules` | Hem kök düzeni (`/courses`, `/memberships`) hem legacy düzen (`/artifacts/{proje}/public/data/...`) destekler |
| `firebase.json` + `.firebaserc` | `npx firebase-tools deploy --only firestore:rules` için |

## 0) Mevcut durum
`kpss-asistani` projesi ve `artifacts/kpss-asistani/public/data` düzeni **varsayılan**
olarak duruyor. Hiçbir şey değiştirmezsen uygulama bugünkü gibi çalışmaya devam eder.

## 1) Firebase projesi + Firestore veritabanı
1. https://console.firebase.google.com/ → **Add project** (ör. `kpss-prod`), Analytics kapalı olabilir.
2. Sol menü → **Build → Firestore Database → Create database**
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

## 2) Uygulamayı yeni projeye bağla
Üç yoldan biri (öncelik: env > app.json > varsayılan). Yeni projede koleksiyonları
**köke** açmanı öneririm → `root: ""`.

**A) `.env` (kod değişikliği yok, tavsiye edilen)**
```bash
# repo köküne .env.local yaz (.env de olur; repoya commit'leme)
EXPO_PUBLIC_FIRESTORE_PROJECT=kpss-prod
EXPO_PUBLIC_FIRESTORE_ROOT=
# opsiyonel:
EXPO_PUBLIC_FIRESTORE_DATABASE=(default)
# EXPO_PUBLIC_FIRESTORE_HOST=http://localhost:8080/v1   # emulator'de test için
```
Değiştirdikten sonra Metro'yu **yeniden başlat** (env, derleme zamanında gömülür):
`npx expo start --clear`.

**B) `app.json` → `expo.extra.firestore`**
```json
"extra": {
  "firestore": {
    "projectId": "kpss-prod",
    "databaseId": "(default)",
    "root": ""
  }
}
```
**C) `lib/firebaseConfig.ts` içindeki `DEFAULT_TARGET`** — kalıcı tek proje kullanacaksan en basiti.

Panelde doğrula: **Yönetim Paneli → Uygulama Ayarları → “Firestore bağlantısı”** kartı
çözümlenen proje/kök yolunu ve kaynak (env/app.json/default) gösterir;
**Test et** butonu `memberships` ve `daily_tips` okumalarını dener (yazma denemez).

## 3) Kuralları yayımla
```bash
# .firebaserc içindeki projectId'i kendi projenle değiştir:
#   { "projects": { "default": "kpss-prod" } }
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
| Env değişikliği etkili olmadı | Metro'yu `--clear` ile yeniden başlat (env/build-time). |
| İçerik Console'da var, app boş gösteriyor | Koleksiyon/yol birebir `courses/{courseId}/topics/{docId}` olmalı; `questions` bir **array of map**. |

## 9) Güvenlik notu
Firebase Auth olmadığı için kurallar istemciyi UID ile ayıramaz; yalnızca veri
şeklini denetler. Bu set `role` değiştirmeyi kapatır (kendi kendine yöneticilik
engeli), şifre alanlarının biçimini zorunlu kılar ve içeriği anonim yazıma kapatır.
Sertleştirme seçenekleri `firestore.rules` dosyasının altındaki notlarda:
“sadece Console” varyantı ve Firebase Auth ile `request.auth.token.email == memberId`
eşleştirmesi.
