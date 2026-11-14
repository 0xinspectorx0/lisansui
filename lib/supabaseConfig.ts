/**
 * Supabase hedefi (proje URL'i + anon anahtar + şema) — tek karar noktası.
 *
 * Öncelik sırası:
 *   1. Derleme zamanı ortam değişkenleri
 *      EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
 *      EXPO_PUBLIC_SUPABASE_SCHEMA
 *   2. app.json → expo.extra.supabase { url, anonKey, schema }
 *   3. config/supabaseApp.ts — depoya gömülü değerler (`npm run setup:supabase`)
 *
 * Cihazda tutulan bir hedef ÖNEKİ yok: yanlış projeye bakmış bir kurulum, tüm
 * isteklerin reddedilmesine yol açıyordu. Ayar nerede durur? Depoda (bu üçü).
 *
 * Supabase'daki `projectId / databaseId / root` üçlüsü burada yok: tek bir URL
 * ve tek bir şema var, belge yolları da düz (`courses/…`, `memberships/…`).
 * Bu yüzden `collectionPath()` artık önek eklemiyor — arayüz korunuyor ki
 * çağıran taraflar (panel, tohumlama, okuma katmanı) aynı kalsın.
 *
 * Not: Expo/Metro yalnızca YAZILI üye ifadelerini derleme zamanına gömer; bu
 * dosyada asla `process.env[name]` biçiminde dolaylı okuma yapma.
 */

import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_SCHEMA,
  DEFAULT_SUPABASE_URL,
} from '../config/supabaseApp';

export interface CloudTarget {
  /** https://<proje>.supabase.co */
  url: string;
  /**
   * Türetilmiş uyumluluk alanları: panel satırları ve eski tanı kodları bu adları
   * kullanıyor. Supabase'de “proje” = URL'in ilk etiketi (ref), “veritabanı” =
   * Postgres şeması, “yol öneki” = yok.
   */
  projectId: string;
  databaseId: string;
  root: string;
  /** Public anon key (RLS korur; gizli değildir). Boşsa bulut kapalıdır. */
  anonKey: string;
  /** Postgres şeması; Supabase'de varsayılan `public`. */
  schema: string;
  /** Ayarın nereden geldiği (panelde gösterilir). */
  source: 'env' | 'app.json' | 'embedded' | 'none';
}

/** Bu deponun beklentisi: değerler config/supabaseApp.ts içinde durur. */
export const DEFAULT_TARGET: Omit<CloudTarget, 'source'> = {
  url: DEFAULT_SUPABASE_URL,
  anonKey: DEFAULT_SUPABASE_ANON_KEY,
  schema: DEFAULT_SUPABASE_SCHEMA || 'public',
  // türetilmiş alanlar cloudTarget() içinde hesaplanır; burada yalnız biçim var
  projectId: '',
  databaseId: DEFAULT_SUPABASE_SCHEMA || 'public',
  root: '',
};

/** `https://abc123.supabase.co` → `abc123` */
export function refOfUrl(url: string | undefined | null): string {
  return String(url || '').replace(/^https?:\/\//, '').split('.')[0] || '';
}

function clean(v: string | undefined | null): string {
  return String(v ?? '').trim().replace(/\/+$/g, '');
}

function envRaw(
  name: 'EXPO_PUBLIC_SUPABASE_URL' | 'EXPO_PUBLIC_SUPABASE_ANON_KEY' | 'EXPO_PUBLIC_SUPABASE_SCHEMA'
): string | undefined {
  try {
    switch (name) {
      case 'EXPO_PUBLIC_SUPABASE_URL':
        return process.env.EXPO_PUBLIC_SUPABASE_URL;
      case 'EXPO_PUBLIC_SUPABASE_ANON_KEY':
        return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      default:
        return process.env.EXPO_PUBLIC_SUPABASE_SCHEMA;
    }
  } catch {
    return undefined;
  }
}

function fromEnv(): Partial<CloudTarget> | null {
  const url = clean(envRaw('EXPO_PUBLIC_SUPABASE_URL'));
  const anonKey = clean(envRaw('EXPO_PUBLIC_SUPABASE_ANON_KEY'));
  const schema = clean(envRaw('EXPO_PUBLIC_SUPABASE_SCHEMA'));
  if (!url && !anonKey && !schema) return null;
  return {
    ...(url ? { url } : {}),
    ...(anonKey ? { anonKey } : {}),
    ...(schema ? { schema } : {}),
  };
}

function fromAppJson(): Partial<CloudTarget> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants');
    const mod: any = (Constants as any)?.default ?? Constants;
    const extra: any =
      mod?.expoConfig?.extra ?? mod?.manifest2?.extra ?? mod?.manifest?.extra ?? {};
    const cfg = extra?.supabase ?? extra?.eas?.supabase;
    if (!cfg) return null;
    const out: Partial<CloudTarget> = {};
    if (cfg.url) out.url = clean(String(cfg.url));
    if (cfg.anonKey) out.anonKey = clean(String(cfg.anonKey));
    if (typeof cfg.schema === 'string' && cfg.schema.trim()) out.schema = clean(String(cfg.schema));
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

let cached: CloudTarget | null = null;

/** Çözümlenmiş hedef. Sonuç modül ömrü boyunca sabittir. */
export function cloudTarget(): CloudTarget {
  if (cached) return cached;
  const env = fromEnv();
  const json = fromAppJson();
  const embedded = DEFAULT_TARGET.url || DEFAULT_TARGET.anonKey ? DEFAULT_TARGET : null;
  const merged = { ...DEFAULT_TARGET, ...(embedded || {}), ...(json || {}), ...(env || {}) };
  const url = clean(merged.url);
  cached = {
    url,
    projectId: refOfUrl(url),
    databaseId: clean(merged.schema) || 'public',
    root: '',
    anonKey: clean(merged.anonKey),
    schema: clean(merged.schema) || 'public',
    source: env ? 'env' : json ? 'app.json' : embedded ? 'embedded' : 'none',
  };
  return cached;
}

/** URL ve anon anahtar birlikte var mı? Yoksa uygulama yerel modda çalışır. */
export function isCloudConfigured(target: CloudTarget = cloudTarget()): boolean {
  return !!clean(target.url) && !!clean(target.anonKey);
}

/** `https://<proje>.supabase.co/rest/v1` */
export function restBase(target: CloudTarget = cloudTarget()): string {
  const url = clean(target.url) || 'https://localhost.supabase.co';
  return `${url}/rest/v1`;
}

/** `https://<proje>.supabase.co/auth/v1` (GoTrue). */
export function authBase(target: CloudTarget = cloudTarget()): string {
  const url = clean(target.url) || 'https://localhost.supabase.co';
  return `${url}/auth/v1`;
}

/**
 * Belge okumalarının temeli. Supabase'de kök öneki (`artifacts/...`) yoktur; bu
 * fonksiyon yalnız eski çağrı yerlerini ayakta tutmak için restBase() döndürür.
 */
export function contentBase(target: CloudTarget = cloudTarget()): string {
  return restBase(target);
}

/** Koleksiyon yolu — Supabase'de önek yok, adı neyse odur. */
export function collectionPath(name: string, _target: CloudTarget = cloudTarget()): string {
  return name;
}

/** Üyelik koleksiyonu: `memberships/{e-posta}` (belge kimliği = e-posta). */
export const MEMBERSHIPS_COLLECTION_NAME = 'memberships';

/** Panelde gösterilecek tek satırlık özet. */
export function describeTarget(target: CloudTarget = cloudTarget()): string {
  if (!clean(target.url)) return 'bulut bağlı değil • Supabase hedefi tanımlı değil';
  const host = clean(target.url).replace(/^https?:\/\//, '');
  return `supabase • ${host} • şema:${target.schema || 'public'}`;
}

/** Kurulum listesinin kök adı (panelde “kök” satırı olarak gösterilir). */
export const CLOUD_ROOT_LABEL = 'public';

/** Config'i değiştirmeden kontrol listesi için kullanılan RPC adresleri. */
export function probeUrls(target: CloudTarget = cloudTarget()) {
  const base = `${restBase(target)}/rpc`;
  return {
    memberships: `${base}/kpss_list_docs`,
    tips: `${base}/kpss_read_doc`,
    topics: (courseId: string) => `${base}/kpss_list_docs?course=${encodeURIComponent(courseId)}`,
    document: (path: string) => `${base}/kpss_read_doc?path=${encodeURIComponent(path)}`,
  };
}

/** Eski REST biçimi: belge URL'lerinin öneki (geçit bunu yol çözümlemek için kullanır). */
export function documentsBase(target: CloudTarget = cloudTarget()): string {
  return `${restBase(target)}/documents`;
}

/** Eski ad; panel/uygulama `CloudTarget` kullanıyor, takma ad yalnız geçiş için. */
export type SupabaseTarget = CloudTarget;

/** Test/hatalı kurulum senaryoları için cache'i sıfırlar. */
export function __resetCloudTargetCache(): void {
  cached = null;
}
