/**
 * Üyelik/erişim kodunun derleme damgası.
 *
 * Neden var: “üyelik olmuyor” ihbarlarında en sık karşılaşılan ikinci durum,
 * cihazda ESKİ bir derlemenin çalışıyor olmasıdır (web çıktısı yenilenmemiş,
 * telefon önbelleği tutmuş). Eski kod yeni düzeltmeyi yapmaz ve bu, kural
 * reddiyle aynı hatayı üretir — ayırt etmenin tek dürüst yolu kodun kendisinin
 * hangi derleme olduğunu söylemesidir.
 *
 * Kural: `lib/cloudApi.ts`, `lib/sbGateway.ts`, `lib/authClient.ts`,
 * `lib/memberShape.ts`, `lib/membership.ts`, `lib/userDataSync.ts` veya
 * `supabase/migrations/*.sql` dosyalarına dokunan her değişiklikte son harf
 * ilerletilir (`…a` → `…b`). Damga yalnızca tanılama amaçlıdır; davranıştan
 * bağımsızdır, bu yüzden hiçbir akışı kırmaz.
 */
export const MEMBERSHIP_BUILD_TAG = 'member-2026-11-15a';

/** Rapor satırı/panel etiketi için tek biçimli metin. */
export function membershipBuildLabel(): string {
  return MEMBERSHIP_BUILD_TAG;
}
