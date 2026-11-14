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

**Ajana söylenen adres/anahtar kullanıcının işi değildir:** `https://<ref>.supabase.co` ve
anon anahtarı mesajda yaz; kurulum komutunu ajana çalıştırır. `--anon-key` verilmeden
çalıştırılan kurulum `config/supabaseApp.ts`'i olduğu gibi (boş) bırakırdı — yazıcı artık
hem `export const X = ''` hem `export const X: string = ''` biçimini tanır, adı tekrar
deklare etmez, **bulamazsa hata verir** ve yazdıktan sonra dosyayı geri okuyup doğrular
(`✓ config/supabaseApp.ts doğrulandı (ref:…, anon … karakter)`).

Anahtarın doğru projeye ait olduğu da dosyadan denetleniyor: JWT biçimindeyse `payload.ref`
adresi, `payload.role` `anon`'u olmak zorunda (`bash scripts/db-contract.sh`, blok [1b]).
`service_role`/secret anahtarı hiçbir yere yazılmaz; **elle** yazılırsa panel uyarır
(`Kaynak: … • YANLIŞ ANAHTAR: service_role`), cihazda yazılırsa Auth istemcisini kurcalamadan
dururur (`Bu anahtar yalnızca doğrulama komutları içindir`).

`npm run check:supabase` adres/anahtar sormaz: `.env.local` → `config/supabaseApp.ts`
sırasıyla okur; hiçbir kurulum yoksa tek komutu gösterir ve 2 ile çıkar.

Secret anahtarı yanlışlıkla **yazmak** da mümkün değil: `--anon-key sb_secret_…` ya da
`payload.role = service_role` taşıyan JWT verilirse kurulum hiçbir dosyaya dokunmadan
çıkar (2) ve “Client sekmesindeki public/anon anahtarı ver” der; aynı kontrol
`config/supabaseApp.ts` yazıldıktan sonra dosya geri okunarak tekrarlanır ve
`npm run check:supabase` bozuk depoyla yoklama yapmaz.

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

Beklenen dört satır:

```
✓ erişim: HTTP 200 (anon anahtar kabul edildi)
✓ içerik okuma: SQL kurulmuş, içerik kilizi kapalı (yazılabilir)
✓ Auth (GoTrue): HTTP 200
✓ RLS denetimi: kimliksiz üyelik yazması reddedildi (beklenen)
```

`POST /rest/v1/members` `201` dönerse RLS **çalışmıyor** demektir. `relation does not exist`
ise SQL hiç uygulanmamış demek.

**Gözle SQL okuma listesi yok** — üç kırılgan nokta kodda garanti edildi ve `bash
scripts/db-contract.sh` ile kilitlendi: (1) membership yazımında kolon listesi gövdede
**bulunan** anahtarlardan üretilir, eksik kolon `NULL` yazılıp `not null`u patlatmaz ve
varsayılanları tablonun `DEFAULT`u verir; (2) `boolean/int/numeric` dönüşümleri
`kpss_as_bool/kpss_as_int/kpss_as_num` üzerinden yapılır, `"1"`/`true`/`2.7` gibi
kaynaklar yazmayı kesmez, tip uyuşmazlığı **sessizce yok sayılmaz**; (3) `select "x".*`
kullanılan yolda tabloya eklenen kolon `p_doc`'ta zorla aranmaz.

Yine de sunucu tarafından emin olmak istersen SQL Editor'de çalıştır (hepsi yalnız okuma):

```sql
-- 1) dokuz tablo var mı?
select tablename from pg_tables where schemaname='public' order by 1;
-- 2) hepsinde RLS açık mı?
select relname, relrowsecurity from pg_class
 where relname in ('members','admins','membership_policy','courses','topics','questions','user_tests','tips','user_data')
 order by 1;
-- 3) politika sayısı
select count(*) from pg_policies where schemaname='public';
-- 4) geçit gerçekten varsayılanları veriyor mu? (kısmi gövde → tam kayıt)
select * from public.kpss_write_doc('memberships/deneme@ornek.com','{"displayName":"Deneme"}'::jsonb,'merge');
-- 5) temizlik
delete from public.members where email='deneme@ornek.com';
```

Beklenen: (1) dokuz tablo adı, (2) dokuz satırın hepsi `true`, (3) `19`,
(4) `status=pending` + `vip=true` + `exam='KPSS Lisans (GY-GK)'` + `testsCompleted=0`
(boş alanları sunucu veriyor), (5) `DELETE 1`.
Davranış denemeleri (kota, rol, yönetici-only alan) Admin → **Denetimler** panelinde ve
`scripts/db-contract-fake.mjs` sahte sunucusunda zaten yapılıyor.

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

## SQL'ü panele hiç girmeden alma

Uygulamanın adresinin sonuna `?sql=1` ekle (ör. `https://…/?sql=1`): PIN sormayan,
hiçbir yere yazmayan salt-okunur bir sayfa açılır ve çalıştırılacak SQL'i olduğu gibi
basar. Panel bozuksa/erişemiyorsan kurulum yine tamamlanabilir. İçerik yedeği için
`?seed=` diye ayrı bir sayfa yok — panel "Ayarlar" ekranında `admin.exportJson()`
züccaciyesi zaten düz metin olarak basılıyor, kopyala → `yedek.json` olarak kaydet.

## Testler

```bash
npm run verify                     # hepsi bir arada (aşağıdaki kapıların tamamı)
npm run test:db                    # Supabase sözleşmesi (GoTrue + RPC + RLS metni)
npm run test:bulk && npm run test:copy && npm run test:ui
npm run migrate:content:selftest   # göç script'i sahte sunucuyla
npm run sync:sql -- --check        # paneldeki SQL kopyası bayatlamış mı?
```
