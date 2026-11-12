# Firestore entegrasyonu (üyelik + içerik)

Uygulama Firebase SDK **kullanmaz** — üyelik ve içerik işlemleri Firestore REST API
üzerinden, anonim (API anahtarsız) yapılır. Bu yüzden tek yapman gereken şey
**güvenlik kurallarını yayımlamak**. Depo zaten hazır:

| Dosya | İçerik |
| --- | --- |
| `firestore.rules` | İçerik koleksiyonları (salt okunur) + `memberships` (biçim denetimli oku/yaz) |
| `firebase.json` | `firestore.rules` dosyasını CLI'a bildirir |
| `.firebaserc` | Varsayılan proje: `kpss-asistani` |

## 1. Gerekli altyapı

- Firebase projesi: `kpss-asistani` (içerik zaten bu projede).
- Firestore veritabanı adı: `(default)` — kod `databases/(default)` kullanıyor,
  farklı bir isimle DB açtıysan `lib/firestoreApi.ts` içindeki `FIRESTORE_DATABASE`
  değerini değiştir.
- İçerik yolu: `artifacts/kpss-asistani/public/data/...`
  (`courses/{courseId}/topics`, `daily_tips/main`, …).
- Üyelik yolu: `artifacts/kpss-asistani/public/data/memberships/{e-posta}`.
  Koleksiyonu elle oluşturmana gerek yok — **ilk kayıtta otomatik oluşur**.

Başka bir proje kullanacaksan iki yeri güncelle:

- `lib/firestoreApi.ts` → `FIRESTORE_PROJECT`, `FIRESTORE_DATABASE`, `MEMBERSHIPS_COLLECTION`
- `lib/kpssApi.ts` → `FIRESTORE_PUBLIC_BASE` (satır 14-15)

## 2. Kuralları yayımla (iki yoldan biri)

**A) Console (en hızlı)**
1. https://console.firebase.google.com/project/kpss-asistani/firestore/rules
2. Bu depodaki `firestore.rules` dosyasının içeriğini yapıştır → **Publish**.
3. Yayın sonrası 1–2 dakika bekle (kural sürümü önbelleğe alınabilir).

**B) Firebase CLI**
```bash
npm i -g firebase-tools          # veya: npx firebase-tools
firebase login
firebase deploy --only firestore:rules
```
`.firebaserc` içindeki proje doğru değilse önce:
`firebase use --add` → proje seç → isim `default`.

> Not: `--only firestore:rules` kullan; `--only firestore` dersen ve projede
> index'lerin varsa `firestore.indexes.json` olmadığı için index'ler silinmez
> ama yine de dar hedeflemek daha güvenli.

## 3. Doğrula

**Okuma** — tarayıcıda aç (boş koleksiyon için `documents: []` veya 404 döner, ikisi de normaldir):

```
https://firestore.googleapis.com/v1/projects/kpss-asistani/databases/(default)/documents/artifacts/kpss-asistani/public/data/memberships?pageSize=10
```

İçerik kuralının çalıştığını görmek için:

```
https://firestore.googleapis.com/v1/projects/kpss-asistani/databases/(default)/documents/artifacts/kpss-asistani/public/data/daily_tips/main
```

**Yazma** — uygulamada (önizleme: `http://localhost:8081`) ana ekranın sağ üstündeki
kişi ikonu (veya *Misafir* rozeti) → **Kayıt ol** ile üye oluştur. Sonra Console → Firestore Data → `…/public/data/memberships` altında
belgeyi gör. Alanlar: `email`, `verifier`, `salt`, `iterations`, `algo`, `role`,
`status`, `vip`, `vipPlan`, `vipExpiresAt`, `testsCompleted`, `questionsSolved`,
`netSum`, `courseUsage` (map), `schemaVersion`.

**Panel** — Ana ekran → kalkan ikonu → PIN `2468` → *Üyelik Paneli*. Liste
Firestore'dan doldurulur; plan/durum/silme işlemleri doğrudan belgeye yazar.

## 4. Sık karşılaşılan hatalar

| Belirti | Sebep / çözüm |
| --- | --- |
| Uygulama “Firestore kurallı yazmayı reddetti” diyor | Kurallar henüz yayınlanmadı veya eski sürüm aktif → Console'da Rules → Publish. |
| `permission-denied` ama kurallar yayında | Kurallar `memberships` yolunu kapsamıyor: belge yolu `artifacts/kpss-asistani/public/data/memberships/{id}` olmalı; `memberId` ile `email` alanı **birebir aynı** (küçük harf, boşluksuz). |
| Kayıt “Bu e-posta zaten kayıtlı” diyor, Console'da belge yok | Belge `memberships/{farkli-id}` altına oluşturulmuş. Panelde *Üyelik Paneli → Yenile* ile listeyi çek, id'yi düzelt. |
| Giriş “Şifre hatalı” diyor ama şifre doğru | Belge elle/Console'dan oluşturulduysa `verifier/salt/iterations` alanları eksik olabilir. Panelde *Düzenle → şifreyi yeniden gir* (PBKDF2 ile yazılır). |
| Liste boş ama kayıt var | `allow list` için `read` yeterlidir; koleksiyon yolu yazım hatası içeriyor olabilir. `?pageSize=10` URL'sini tarayıcıda dene. |
| Ağ hatası (`offline`) | Kurumsal/filtreli ağda `firestore.googleapis.com` erişimi; ya da çevrimdışı. Uygulama bu durumda kayıt yapmaz (bilinçli: yerel yedek üyelik deposu yok). |

Index oluşturmana gerek yok: giriş, `id = normalizeEmail(e-posta)` olduğu için
doğrudan belge okumasıyla başlar; liste sorgusu `pageSize`/`pageToken` ile sayfalı.

## 5. Güvenlik notu (önemli)

Firebase Auth olmadığı için kurallar istemciyi **UID ile ayıramaz**; yalnızca veri
şeklini denetleyebilir. Bu dosyadaki set:

- `role` alanının hiçbir istemci tarafından değiştirilmesini engeller
  (kimse kendini yönetici yapamaz) — rol değişimi Console/Admin SDK işidir,
- `id == email`, `verifier` 64 hex, `salt` 32 hex, `iterations >= 100`,
  sayaç sınırları ve `courseUsage` üst sınırını zorlar,
- içerik koleksiyonlarını salt-okunur yapar (uygulama içeriğe yazamaz).

VIP/durum değişikliklerinin uygulama içinden yapılmasını da kapatmak istersen
`firestore.rules` dosyasının en altındaki **“Sadece Console” varyantını**
kullan (tek satır değişikliği). Uygulama o zaman panelde “Firestore reddetti”
uyarısı gösterir.

Gerçek kimlik doğrulama istenirse: Firebase Auth'u etkinleştir,
`request.auth.uid != null` ve `request.auth.token.email == memberId` şartlarını
ekle; böylece her üye yalnızca kendi belgesini okuyup yazar.
