# Supabase kurulumu (Firestore bırakıldı)

Uygulamanın **tüm** verisi ve **tüm** ayarı Supabase'de: üyeler, onay/kota politikası,
ders/konu/soru içeriği, test sonuçları ve kişisel ilerleme. Firestore, `firestore.rules`,
`firebase.json` ve Console'dan "Publish" akışı depodan kaldırıldı; yetki kuralları artık
`supabase/migrations/0001_init.sql` içinde (RLS + bekçi fonksiyonları).

## 1) Bir kez: hedefi depoya yaz

```bash
npm run setup:supabase -- --url https://<ref>.supabase.co --anon-key <anon>
```

Komut üç yere yazar ve hepsi aynı değeri taşır:

| Dosya | Ne tutar |
| --- | --- |
| `.env.local` | `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `_SCHEMA` |
| `config/supabaseApp.ts` | depoya gömülü değerler (commit'lenir) |
| `app.json` → `expo.extra.supabase` | EAS/web derlemelerinin okuduğu kopya |

Kullanıcıdan hiçbir şey **yapıştırması istenmez**. Yalnızca **public/anon** anahtarı
kullanılır; `service_role` anahtarı uygulamanın hiçbir sürümünde yoktur (koruma RLS'dir).

## 2) Bir kez: tablolar ve RLS

```bash
npm run sync:sql          # config/supabaseSqlCopy.ts üretir (panel bu metni gösterir)
```

Supabase Dashboard → **SQL Editor** → içeriği yapıştır → **Run**. Ya da CLI ile:

```bash
supabase link --project-ref <ref> && supabase db push
```

Kurulanlar: `membership_policy`, `admins`, `members`, `courses`, `topics`, `questions`,
`user_tests`, `tips`, `user_data` + `kpss_*` geçit fonksiyonları + 19 politika.
Panelde de aynı metin tek tuşla kopyalanabilir: **Admin → Ayarlar → Supabase bağlantısı →
"SQL — tablolar ve RLS" → Kopyala**.

Doğrulama:

```bash
npm run check:supabase    # erişim, içerik okuma, Auth, RLS red davranışı
```

## 3) Uygulamayı çalıştır

```bash
npx expo start --clear
```

* İlk yönetici: uygulamada **Admin → Ayarlar → Yönetici listesi → Kendimi ekle**
  (`public.admins` satırını panel yazar; sunucu anahtarı gerekmez).
* İçerik: Admin → İçerik → **Tohumla** (repo'daki başlangıç soruları) — ya da
  "Boş başla, sonra doldururum" diyerek hiçbir şey yazma.
* Başka projeden içerik: Admin → Ayarlar → **Diğer projeden içeriği kopyala**
  (kaynak yalnız okunur) veya `npm run migrate:content -- --in yedek.json`.

## Veri akışı kuralları (tasarım)

* **Anlık yazma.** Her düzenleme/üyelik işlemi doğrudan Supabase'e gider. Kuyruk,
  "sonra gönderilir", "Şimdi dene" yok.
* **Red = işlem yok.** Yazma reddedilirse işlem yapılmamış sayılır; tek cümlelik sebep
  ve **Yeniden dene** gösterilir. Cihazda bekleyen kopya bırakılmaz.
* **Cihaz yalnız önbellek.** `AsyncStorage` okuma içindir; üyelik önbelleğinde hak
  alanları (`vip`, `vipPlan`, `vipExpiresAt`, sayaçlar) **tutulmaz**. Hak, Supabase'den
  okunmadan verilmez.
* **Onay sunucuda.** `membership_policy.requireApproval` açıkken yeni üye `pending`
  doğar ve kendini `active`/VIP yapamaz — bunu `members_write_guard` tetikleyicisi
  (`kpss_guard_member_write` fonksiyonu) engeller, ara yüz değil.
* **Hak kararı istemciden gelmez.** Yeni üyenin deneme VIP'ini `defaultTrialDays`
  belirler: sunucu `vip/vipPlan/vipExpiresAt` alanlarını **yazma anında kendisi
  doldurur**, kullanıcının gönderdiği değer yok sayılır. Yani "VIP açan istemci"
  mümkün değil; `vipPlan` süresi `YYYY-MM-DD` biçiminde yazılır (`daysLeft` bunu okur).
* **Parola alanları kapalı.** `verifier/salt/iterations` kendi satırından yazılamaz;
  doğrulama GoTrue'dadır, o alanlar yalnız yönetici/tohumlama verisidir.
* **Ücretsiz kota.** Üye olmayan/ücretsiz üye ders başına `freeTestsPerCourse` test çözer.

## Üye hesabı ve parola

Kimlik doğrulama Supabase Auth'dadır; uygulamada parola hash'i tutulmaz.
Firestore döneminde oluşturulmuş hesaplarda parola bizim hash'imizdi; o üyeler
**bir kez** "Parolamı unuttum" ile Supabase Auth hesabı açar, üyelik satırı
(`status`, `vip`, sayaçlar) olduğu gibi kalır.

## Kapasite notları (ücretsiz plan)

* ~500 MB veritabanı; 7 gün hiç istek gelmezse proje **pause** olur → Dashboard'dan
  yeniden başlat, uygulama otomatik devam eder.
* Sorular satır satır `questions` tablosundadır; konu belgeleri yalnız meta taşır.

## Testler

```bash
npm run verify                     # hepsi bir arada (aşağıdaki kapıların tamamı)
npm run test:db                    # Supabase sözleşmesi (GoTrue + RPC + RLS metni)
npm run test:bulk && npm run test:copy && npm run test:ui
npm run migrate:content:selftest   # göç script'i sahte sunucuyla
npm run sync:sql -- --check        # paneldeki SQL kopyası bayatlamış mı?
```
