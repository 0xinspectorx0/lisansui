/**
 * Depoya gömülü Supabase yapılandırması.
 *
 * AMAÇ: kullanıcıdan asla anahtar istememek. Değerler bir kez buraya yazılır ve
 * commit'lenir; uygulama `.env.local` olmadan, panelde bir yere yapıştırma
 * gerektirmeden Supabase'i otomatik kullanır. Doldurmanın güvenli yolu:
 *
 *   npm run setup:supabase -- --url https://xxxx.supabase.co --anon-key eyJ...
 *
 * (komut bu dosyayı ve .env.local'ı yazar; anahtarı elle hiçbir yere yapıştırmazsın.)
 *
 * Nereden alınır: Supabase Dashboard → Project Settings → API → Project URL
 * + `anon` public key.
 *
 * Güvenlik notu: `anon` anahtar GİZLİ DEĞİLDİR — pakete gömülür ve istemcide
 * görünür. Veriyi koruyan şey anahtar değil, satır düzeyi güvenliktir (RLS):
 * supabase/migrations/0001_init.sql. `service_role` anahtarını ASLA buraya,
 * .env.local'a ya da depoya yazma — o anahtar yalnız senin terminalinde, göç
 * script'inin çevresinde durur (SUPABASE_SERVICE_ROLE_KEY).
 *
 * Çözümleme sırası (lib/supabaseConfig.ts → cloudTarget):
 *   1) .env.local / derleme ortamı (EXPO_PUBLIC_*)  2) app.json extra  3) BU DOSYA
 */

export interface SupabaseAppConfig {
  /** https://<proje-ref>.supabase.co — boşsa bulut kapalıdır (yerel mod). */
  url: string;
  /** Dashboard → API → anon public key. Boşsa kimlik doğrulama kapalı kalır. */
  anonKey: string;
  /** Boş bırakılırsa `public` kullanılır. */
  schema: string;
}

/** Kurulum sırasında `npm run setup:supabase` doldurur; boş = yerel mod. */
export const DEFAULT_SUPABASE_URL = 'https://ahkasuppmferkremltxp.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoa2FzdXBwbWZlcmtyZW1sdHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NDk0NDIsImV4cCI6MjExMDIyNTQ0Mn0.Oj0GdxllNho9U2P_83VXSQ1EMHIY9kvc_AJ4ZZExQwY';
export const DEFAULT_SUPABASE_SCHEMA = 'public';

export const SUPABASE_APP_CONFIG: SupabaseAppConfig = {
  url: DEFAULT_SUPABASE_URL,
  anonKey: DEFAULT_SUPABASE_ANON_KEY,
  schema: DEFAULT_SUPABASE_SCHEMA,
};

/** Depoya gömülü değer kullanılabiliyor mu? (panel kartının “config” rozeti) */
export function hasRepoApiKey(): boolean {
  return !!DEFAULT_SUPABASE_URL && !!DEFAULT_SUPABASE_ANON_KEY;
}
