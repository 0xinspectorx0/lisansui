/**
 * Supabase Auth (GoTrue, e-posta/parola) istemcisi — Supabase SDK'sız.
 *
 * Veri tarafında olduğu gibi doğrudan REST kullanılıyor (`/auth/v1/*`), böylece
 * Expo Go'da, web'de ve native derlemelerde aynı kod çalışır ve yeni bir bağımlılık
 * eklenmez. Parola HİÇBİR ZAMAN Postgres'e yazılmaz: `members` satırında yalnız
 * `authUid` işaretçisi durur. Eski Supabase Auth döneminden kalan cihaz hesapları
 * için yerel PBKDF2 doğrulaması (lib/crypto.ts) yalnızca burada yapılandırma
 * YOKKEN devreye girer.
 *
 * Yapılandırma KULLANICIDAN İSTENMEZ: normal kurulumda değerler depodaki
 * `config/supabaseApp.ts` içinden okunur (bir kez yazılır, commit'lenir):
 *   npm run setup:supabase -- --url https://xxxx.supabase.co --anon-key eyJ...
 * Geliştirici istersen override edebilir:
 *   EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * Hiçbir kaynakta hedef yoksa `isAuthConfigured()` false döner ve üyelikler eski
 * yerel doğrulama (PBKDF2 + bulut belgesi) ile çalışmaya devam eder.
 *
 * Oturum native'de expo-secure-store, web'de AsyncStorage içinde saklanır;
 * access token ~1 saat sonra `refresh_token` ile sessizce yenilenir.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { cloudTarget } from './supabaseConfig';
import { SUPABASE_APP_CONFIG } from '../config/supabaseApp';

/** GoTrue kökü: https://<ref>.supabase.co/auth/v1 */
function authRoot(): string {
  const url = resolveAuthConfig()?.url || cloudTarget().url || '';
  return `${String(url).replace(/\/+$/, '')}/auth/v1`;
}

const SESSION_KEY = 'kpss.supabaseAuth.session.v1';
const REFRESH_MARGIN_MS = 60_000;

/* ------------------------------------------------------------- config */

const ENV_KEYS = [
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_SCHEMA',
] as const;

function envValue(name: (typeof ENV_KEYS)[number]): string {
  // Metro yalnızca literal `process.env.X` erişimini gömer.
  switch (name) {
    case 'EXPO_PUBLIC_SUPABASE_ANON_KEY':
      return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    case 'EXPO_PUBLIC_SUPABASE_URL':
      return process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    default:
      return process.env.EXPO_PUBLIC_SUPABASE_SCHEMA ?? '';
  }
}

/**
 * `apiKey` alanı GERİYE DÖNÜK olarak durur ve Supabase `anon` anahtarını taşır
 * (public key — RLS korur). `url` ise proje adresidir.
 */
export interface AuthConfig {
  apiKey: string;
  /** https://<ref>.supabase.co */
  url: string;
  projectId: string;
  authDomain: string;
  appId: string;
  /** 'repo' = depoya gömülü config, 'env' = .env.local, 'device' = eski kurulum kaydı (yalnız yedek) */
  source: 'env' | 'device' | 'repo';
}

/** `https://abc123.supabase.co` → `abc123` */
export function refOfUrl(url: string): string {
  const host = String(url || '').replace(/^https?:\/\//, '').split('.')[0];
  return host || '';
}

/**
 * Tek birleştirme noktası: eksik alanlar Supabase hedefinden tamamlanır.
 * `url` ya da `anonKey` yoksa null döner (yani o kaynak devre dışı).
 */
export function buildAuthConfig(
  raw: (Partial<Pick<AuthConfig, 'apiKey' | 'url' | 'projectId' | 'authDomain' | 'appId'>> & {
    anonKey?: string;
  }) | null | undefined,
  source: AuthConfig['source']
): AuthConfig | null {
  const url = String(raw?.url || '').trim().replace(/\/+$/, '');
  const apiKey = String(raw?.anonKey || raw?.apiKey || '').trim();
  if (!url || !apiKey) return null;
  return {
    apiKey,
    url,
    projectId: String(raw?.projectId || '').trim() || refOfUrl(url),
    authDomain: String(raw?.authDomain || '').trim() || url,
    appId: String(raw?.appId || '').trim(),
    source,
  };
}

/** Depoya gömülü yapılandırma (config/supabaseApp.ts) — kullanıcının bir şey girmesi gerekmez. */
export function repoAuthConfig(): AuthConfig | null {
  return buildAuthConfig(
    { url: SUPABASE_APP_CONFIG.url, anonKey: SUPABASE_APP_CONFIG.anonKey },
    'repo'
  );
}

/**
 * Panelde girilen değer bu anahtarla saklanır (cihaza özel, `--clear` gerekmez).
 * `anon` anahtar public olduğu için depolama güvenlik açısından sorun değil; yine de
 * üretim derlemelerinde `.env.local`/EAS değişkeni tercih edilir.
 */
const CONFIG_KEY = 'kpss.supabaseAuth.config.v1';

let cachedConfig: AuthConfig | null | undefined;
let deviceOverride: AuthConfig | null = null;
let deviceConfigLoaded = false;

function fromEnv(): AuthConfig | null {
  // Yalnız GERÇEKTEN ortam değişkeni varsa 'env' de. Eskiden `|| cloudTarget()`
  // ile depodaki değerleri de 'env' olarak etiketliyordu; panel "kaynak:
  // .env.local" diyordu ve kişi olmayan dosyayı arıyordu.
  const url = envValue('EXPO_PUBLIC_SUPABASE_URL').trim();
  const anonKey = envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY').trim();
  if (!url || !anonKey) return null;
  return buildAuthConfig({ url, anonKey }, 'env');
}

/** Değerler hangimizde duruyor? Panel bu dosya adını gösterir (yanlış dosya aratma). */
export function repoConfigFile(): string {
  const src = cloudTarget().source;
  if (src === 'app.json') return 'app.json → expo.extra.supabase';
  if (src === 'env') return '.env.local';
  return 'config/supabaseApp.ts';
}

/** Modül yüklendiğinde bir kez oku; `ensureAuthConfigLoaded()` ile beklenebilir. */
export async function ensureAuthConfigLoaded(): Promise<void> {
  if (deviceConfigLoaded) return;
  const raw = await storeGet(CONFIG_KEY);
  deviceConfigLoaded = true;
  cachedConfig = undefined; // cihaz değeri geldiyse çözümü tazele
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { apiKey?: string; anonKey?: string; url?: string };
      const built = buildAuthConfig(
        {
          url: parsed?.url || '',
          anonKey: parsed?.anonKey || parsed?.apiKey || '',
        },
        'device'
      );
      if (built) deviceOverride = built;
    } catch {
      deviceOverride = null;
    }
  }
}

/**
 * Çözümleme sırası: `.env.local`/derleme ortamı → depoya gömülü config → cihaz kaydı.
 *
 * Cihazda kayıtlı değer EN SONDA gelir: eski kurulumlarda (depo config'i boşken
 * panele bir kez yapıştırılmış) oturumların çalışmaya devam etmesi için tutulur,
 * ama depoda hedef varken hiçbir zaman onu gölgelemez. Böylece "cihazda kalmış
 * yanlış anahtar" sınıfı hata yapısal olarak mümkün değildir; uygulama kimseye
 * anahtar sormaz.
 */
export function resolveAuthConfig(): AuthConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  cachedConfig = fromEnv() ?? repoAuthConfig() ?? deviceOverride;
  return cachedConfig;
}

export function resetAuthConfigCache(): void {
  cachedConfig = undefined;
}

/**
 * Panel → “Kaydet”. `value` tek başına anon anahtar, `url` ile birlikte de
 * "https://…supabase.co <anonKey>" biçiminde verilebilir. Boş/red.
 */
export async function setDeviceApiKey(
  value: string,
  url?: string
): Promise<{ ok: boolean; error?: string }> {
  const parts = String(value || '').trim().split(/[\s,;]+/).filter(Boolean);
  let key = '';
  let host = String(url || '').trim();
  for (const p of parts) {
    if (/^https?:\/\//i.test(p) && !host) host = p;
    else if (!key) key = p;
  }
  if (!key) return { ok: false, error: 'Boş bırakma; Dashboard → Settings → API → `anon public` değerini yapıştır.' };
  if (!host) host = String(cloudTarget().url || '').trim();
  if (!/^https?:\/\//i.test(host))
    return { ok: false, error: 'Proje adresi de gerekli: https://<ref>.supabase.co' };
  const built = buildAuthConfig({ url: host, anonKey: key }, 'device');
  if (!built) return { ok: false, error: 'Adres ya da anahtar çözümlenemedi — ikisini de tam kopyala.' };
  deviceOverride = built;
  cachedConfig = undefined;
  deviceConfigLoaded = true;
  await storeSet(CONFIG_KEY, JSON.stringify({ url: built.url, anonKey: built.apiKey, savedAt: new Date().toISOString() }));
  return { ok: true };
}

/** Panel → “Kaldır”: cihaz kaydı silinir; env/depodaki config değeri devreye girer. */
export async function clearDeviceApiKey(): Promise<void> {
  deviceOverride = null;
  cachedConfig = undefined;
  deviceConfigLoaded = true;
  await storeSet(CONFIG_KEY, null);
}

/** Panel kartı için: cihazda kayıtlı anahtar var mı? */
export async function readDeviceApiKey(): Promise<string | null> {
  await ensureAuthConfigLoaded();
  return deviceOverride?.apiKey ?? null;
}

/** Çözümlenmiş public anahtar (yoksa boş string) — her isteğin `apikey` başlığı. */
export function webApiKey(): string {
  return resolveAuthConfig()?.apiKey || '';
}

/** Çözümlenmiş Supabase projesi (yoksa boş string). */
export function cloudUrl(): string {
  return resolveAuthConfig()?.url || '';
}

export function authConfigSource(): AuthConfig['source'] | null {
  const cfg = resolveAuthConfig();
  return cfg ? cfg.source : null;
}

export function isAuthConfigured(): boolean {
  return resolveAuthConfig() != null;
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return `${key.slice(0, 2)}••••`;
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}

/* -------------------------------------------------------------- session */

export interface AuthSession {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  userMetadata?: {
    displayName?: string;
    city?: string;
    exam?: string;
  };
}

let memory: AuthSession | null = null;
let loading: Promise<AuthSession | null> | null = null;

async function storeGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return await AsyncStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function storeSet(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value == null) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, value);
      return;
    }
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* depolama yoksa bellekte kalır */
  }
}

async function persist(session: AuthSession | null): Promise<void> {
  memory = session;
  await storeSet(SESSION_KEY, session ? JSON.stringify(session) : null);
}

export async function restoreSession(): Promise<AuthSession | null> {
  if (memory) return memory;
  if (!loading) {
    loading = (async () => {
      const raw = await storeGet(SESSION_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as AuthSession;
        if (!parsed?.idToken || !parsed?.refreshToken) return null;
        memory = parsed;
        return parsed;
      } catch {
        return null;
      }
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

export async function currentSession(): Promise<AuthSession | null> {
  return restoreSession();
}

export async function signOut(): Promise<void> {
  await persist(null);
}

/* ------------------------------------------------- token'ın projesi (koruma) */

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64url → UTF-8 metin (atob/Hermes farkı gözetmeyen küçük çözümleyici). */
function b64urlDecode(input: string): string {
  const clean = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    if (ch === '=') break;
    const idx = B64_CHARS.indexOf(ch);
    if (idx < 0) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  let text = '';
  for (let i = 0; i < bytes.length; ) {
    const c = bytes[i];
    if (c < 0x80) {
      text += String.fromCharCode(c);
      i += 1;
    } else if (c < 0xe0) {
      text += String.fromCharCode(((c & 31) << 6) | (bytes[i + 1] & 63));
      i += 2;
    } else if (c < 0xf0) {
      text += String.fromCharCode(((c & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63));
      i += 3;
    } else {
      const cp =
        ((c & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63);
      const v = cp - 0x10000;
      text += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 1023));
      i += 4;
    }
  }
  return text;
}

export interface IdTokenInfo {
  /**
   * Token'ı VEREN proje. Supabase JWT'lerinde `iss: https://<ref>.supabase.co`.
   * Yanlış projeden bir oturumla tüm istekleri reddedilir hâlde dolaşmamak için
   * kullanılır. Okunamazsa null.
   */
  projectId: string | null;
  email: string;
  uid: string;
  exp: number | null;
}

/** İmzayı DOĞRULAMAZ — yalnızca içindeki alanları okur (tanı/eşleştirme için yeterli). */
export function decodeIdToken(token: string): IdTokenInfo {
  const empty: IdTokenInfo = { projectId: null, email: '', uid: '', exp: null };
  const parts = String(token || '').split('.');
  if (parts.length < 2) return empty;
  try {
    const payload = JSON.parse(b64urlDecode(parts[1])) as Record<string, unknown>;
    const iss = String(payload.iss || '');
    const fromIss = iss.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)$/i);
    const pid = fromIss
      ? fromIss[1]
      : typeof payload.project_id === 'string'
        ? payload.project_id
        : null;
    return {
      projectId: pid || null,
      email: String(payload.email || ''),
      uid: String(payload.sub || payload.user_id || payload.local_id || ''),
      exp: typeof payload.exp === 'number' ? payload.exp : null,
    };
  } catch {
    return empty;
  }
}

/** Oturum token'ı + projesi (ağ çağrısı YOK — depodaki token çözülür). */
export async function sessionIdTokenInfo(): Promise<IdTokenInfo & { token: string | null }> {
  const session = await restoreSession().catch(() => null);
  const token = session?.idToken || null;
  if (!token) return { token: null, projectId: null, email: '', uid: '', exp: null };
  return { token, ...decodeIdToken(token) };
}

/** Supabase hedefiyle oturum token'ının projesi (ref) farklı mı? */
export function tokenProjectMismatches(projectId: string | null): boolean {
  if (!projectId) return false;
  const want = refOfUrl(cloudTarget().url || resolveAuthConfig()?.url || '');
  if (!want) return false;
  return String(projectId).toLowerCase() !== want.toLowerCase();
}

let foreignCheckedToken: string | null = null;
let foreignFlag = false;
let foreignNotice = false;

/** Yanlış projeden token tespit edildiyse istekler kimliksiz gönderilir (eski davranış). */
export async function isForeignSessionToken(): Promise<boolean> {
  const { token, projectId } = await sessionIdTokenInfo();
  if (!token) return false;
  if (foreignCheckedToken === token) return foreignFlag;
  foreignCheckedToken = token;
  foreignFlag = tokenProjectMismatches(projectId);
  if (foreignFlag) foreignNotice = true;
  return foreignFlag;
}

/** Panel/akışlar için: “yabancı token yakalandı” bayrağını oku ve temizle. */
export function consumeForeignTokenNotice(): boolean {
  const v = foreignNotice;
  foreignNotice = false;
  return v;
}

/**
 * Cihazda kayıtlı ESKİ anahtar başka bir projeye aitse oturumu kapatır ve o kaydı
 * siler; böylece depoya gömülü doğru config devreye girer. Kullanıcıdan bir şey
 * istenmez — kendi kendine iyileşen tek durum budur.
 */
export async function healForeignAuthProject(): Promise<{ healed: boolean; note?: string }> {
  const { token, projectId } = await sessionIdTokenInfo();
  if (!token || !tokenProjectMismatches(projectId)) return { healed: false };
  const cfg = resolveAuthConfig();
  await signOut();
  let keyDropped = false;
  if (cfg?.source === 'device') {
    await clearDeviceApiKey();
    resetAuthConfigCache();
    keyDropped = true;
  }
  foreignCheckedToken = null;
  foreignFlag = false;
  return {
    healed: true,
    note: keyDropped
      ? `Token “${projectId}” projesindendi; cihazdaki eski anahtar kaydı silindi, depodaki config kullanılıyor.`
      : `Token “${projectId}” projesindendi; oturum kapatıldı (anahtar .env/config kaynaklı — projeyi kontrol et).`,
  };
}

/** Test/panel desteği: oturumun depolandığı anahtar. */
export const AUTH_SESSION_KEY = SESSION_KEY;

async function refresh(session: AuthSession): Promise<AuthSession | null> {
  const cfg = resolveAuthConfig();
  if (!cfg) return null;
  const data = await postJson(`${cfg.url.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`, {
    refresh_token: session.refreshToken,
  });
  if (data.error) {
    const msg = String(data.error.message || '');
    if (/invalid refresh token|expired|user not found/i.test(msg)) await persist(null);
    return null;
  }
  const next: AuthSession = {
    ...session,
    idToken: String(data.access_token || session.idToken),
    refreshToken: String(data.refresh_token || session.refreshToken),
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  await persist(next);
  return next;
}

/** Supabase isteklerine eklenecek bearer token; oturum yoksa null. */
export async function currentIdToken(opts?: { forceRefresh?: boolean }): Promise<string | null> {
  await ensureAuthConfigLoaded();
  const session = await restoreSession();
  if (!session) return null;
  if (!opts?.forceRefresh && session.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return session.idToken;
  }
  const next = await refresh(session);
  if (next) return next.idToken;
  // Yenileme olmadı: token geçersizse oturum kapatıldı → token verme; ağ hatası gibi
  // geçici durumlarda mevcut (muhtemelen hâlâ geçerli) token'ı kullan.
  const still = await restoreSession();
  return still?.idToken ?? null;
}

/** `currentIdToken` eş anlamlısı: geçiş katmanı bu adı kullanıyor. */
export const currentAccessToken = currentIdToken;

/* ------------------------------------------------------------ REST call */

interface IkError {
  message: string;
  errors?: { message?: string }[];
}

async function postJson(url: string, body: unknown, extra?: { method?: string; bearer?: string }): Promise<any> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: webApiKey(),
    };
    if (extra?.bearer) headers.Authorization = `Bearer ${extra.bearer}`;
    const res = await fetch(url, {
      method: extra?.method || 'POST',
      headers,
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? safeParse(text) : {};
    if (!res.ok) {
      // GoTrue hataları birkaç biçimde gelir: {msg}, {message}, {error:{message}},
      // {error_description}, {error: "kısa_kod"} — hepsini tek metinde topla.
      const msg = String(
        json?.error_msg ||
          json?.error?.message ||
          json?.message ||
          json?.msg ||
          json?.error_description ||
          json?.error_code ||
          (typeof json?.error === 'string' ? json.error : '') ||
          `HTTP ${res.status}`
      );
      return { error: { message: msg } as GoTrueError, status: res.status };
    }
    return json ?? {};
  } catch (e) {
    return { error: { message: 'NETWORK_REQUEST_FAILED' } as GoTrueError, thrown: String(e) };
  }
}

interface GoTrueError {
  message: string;
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** GoTrue yanıtından oturum; `user` yoksa (e-posta doğrulama açık) boş döner. */
function toSession(data: any, fallbackEmail: string): AuthSession {
  const user = data?.user || {};
  const meta = user?.user_metadata || data?.user_metadata || {};
  return {
    uid: String(user.id || data?.uid || ''),
    email: String(user.email || data?.email || fallbackEmail || ''),
    idToken: String(data.access_token || ''),
    refreshToken: String(data.refresh_token || ''),
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    userMetadata: {
      ...(meta.display_name ? { displayName: String(meta.display_name) } : {}),
      ...(meta.city ? { city: String(meta.city) } : {}),
      ...(meta.exam ? { exam: String(meta.exam) } : {}),
    },
  };
}

/** GoTrue hata metnini kısa koda çevirir (authErrorMessage ikisini de tanır). */
function codeOf(message: unknown): string {
  return String(message ?? '').split(':')[0].trim();
}

/**
 * Kimlik doğrulama hata mesajlarını kullanıcı diline çevirir.
 * Panelde ve formlarda aynı metinler kullanılıyor.
 */
export function authErrorMessage(raw: string): string {
  const text = String(raw || '');
  const lower = text.toLowerCase();
  if (/user already registered|already been registered|email already/i.test(lower))
    return 'Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı dene.';
  if (/invalid login credentials|invalid credentials|wrong password|password is invalid/i.test(lower))
    return 'E-posta veya parola hatalı.';
  if (/email not confirmed|confirm.*email|verification/i.test(lower))
    return 'E-posta adresiniz henüz onaylanmamış. Lütfen e-posta kutunuza (ve spam klasörüne) gelen onay bağlantısına tıklayın.';
  if (/rate limit|too many requests/i.test(lower))
    return 'Çok fazla deneme. Bir süre sonra tekrar dene (Supabase Auth geçici olarak kilitledi).';
  if (/unauthorized|api key|apikey|invalid jwt|jwt expired/i.test(lower))
    return 'Oturum ya da public anahtar reddedildi. `npm run setup:supabase` ile hedefi yenile.';
  if (/for security purposes|recent login|required/i.test(lower))
    return 'Bu işlem için yeniden giriş yapman gerekiyor.';
  if (/at least 6 characters|weak password/i.test(lower))
    return 'Parola en az 6 karakter olmalı.';
  if (/user not found|invalid email/i.test(lower)) return 'Bu e-posta ile kayıtlı bir hesap yok. Önce üye ol.';
  if (/network_request_failed/i.test(lower))
    return 'Supabase Auth sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.';
  if (/disabled|banned/i.test(lower)) return 'Hesap devre dışı bırakılmış. Yönetici ile iletişime geç.';
  const code = codeOf(text).toUpperCase();
  if (code === 'NOT_CONFIGURED') return 'Supabase hedefi tanımlı değil — `npm run setup:supabase` gerekir.';
  return `Kimlik doğrulama hatası: ${text || 'bilinmiyor'}`;
}

/* ------------------------------------------- e-posta yönlendirme (redirect) */

export interface AuthRedirectState {
  kind: 'signup' | 'recovery' | 'error';
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenHash?: string;
  rawType?: string;
  error?: string;
}

/** Tarayıcıda uygulamanın kendi kök adresi (örn. https://site.vercel.app). */
export function appRedirectUrl(): string {
  const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
  const origin = String(win?.location?.origin || '').trim();
  if (origin && /^https?:\/\//i.test(origin)) return origin;
  return resolveAuthConfig()?.url || '';
}

function parseUrlParams(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const clean = String(raw || '').replace(/^[#?]+/, '');
  if (!clean) return out;
  for (const part of clean.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq < 0 ? part : part.slice(0, eq);
    const v = eq < 0 ? '' : part.slice(eq + 1);
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function detectInitialAuthRedirect(): AuthRedirectState | null {
  const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
  if (!win?.location) return null;
  const hashParams = parseUrlParams(win.location.hash || '');
  const queryParams = parseUrlParams(win.location.search || '');
  const params = { ...queryParams, ...hashParams };

  const hasAuthError = Boolean(params.error && (params.error_code || params.error_description || win.location.hash?.includes('error=')));
  const accessToken = params.access_token || '';
  const tokenHash = params.token_hash || '';
  const rawType = String(params.type || '').toLowerCase();

  if (!hasAuthError && !accessToken && !tokenHash && rawType !== 'signup' && rawType !== 'recovery' && rawType !== 'email') {
    return null;
  }

  try {
    win.history?.replaceState?.(null, '', win.location.pathname || '/');
  } catch {
    /* ignore */
  }

  if (hasAuthError) {
    return {
      kind: 'error',
      error: 'E-posta bağlantısının süresi dolmuş veya geçersiz. Lütfen tekrar deneyin.',
    };
  }

  const kind: 'signup' | 'recovery' = rawType === 'recovery' ? 'recovery' : 'signup';
  const decoded = accessToken ? decodeIdToken(accessToken) : { email: '', uid: '', projectId: null, exp: null };
  const expiresIn = Number(params.expires_in || 3600) || 3600;
  const refreshToken = params.refresh_token || '';

  if (kind === 'recovery' && accessToken) {
    void persist({
      uid: decoded.uid || '',
      email: decoded.email || '',
      idToken: accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });
  } else if (kind === 'signup') {
    // E-posta onaylandığında doğrudan içeri sokmak yerine Giriş ekranına yönlendiriyoruz.
    void persist(null);
  }

  return {
    kind,
    email: decoded.email || params.email || '',
    accessToken: accessToken || undefined,
    refreshToken: refreshToken || undefined,
    expiresIn,
    tokenHash: tokenHash || undefined,
    rawType: rawType || kind,
  };
}

let pendingAuthRedirect: AuthRedirectState | null = detectInitialAuthRedirect();

/** Uygulama e-posta onay veya şifre sıfırlama bağlantısından mı açıldı? */
export function hasPendingAuthRedirect(): boolean {
  return pendingAuthRedirect !== null;
}

/** Yakalanan e-posta yönlendirmesini bir kez okur (token_hash varsa doğrular) ve temizler. */
export async function consumeAuthRedirect(): Promise<AuthRedirectState | null> {
  const current = pendingAuthRedirect;
  pendingAuthRedirect = null;
  if (!current) return null;
  if (current.tokenHash) {
    await ensureAuthConfigLoaded();
    const data = await postJson(`${authRoot()}/verify`, {
      token_hash: current.tokenHash,
      type: current.rawType || (current.kind === 'recovery' ? 'recovery' : 'signup'),
    });
    if (data?.error) {
      return {
        kind: 'error',
        error: 'E-posta bağlantısının süresi dolmuş veya geçersiz. Lütfen tekrar deneyin.',
      };
    }
    const session = toSession(data, current.email || '');
    if (current.kind === 'recovery' && data?.access_token) {
      await persist(session);
    } else if (current.kind === 'signup') {
      await persist(null);
    }
    return {
      ...current,
      email: session.email || current.email || '',
    };
  }
  return current;
}

/* ------------------------------------------------------------ operations */

export interface AuthResult {
  ok: boolean;
  session?: AuthSession;
  error?: string;
  code?: string;
  /** E-posta doğrulama maili gönderildi; kullanıcı linke tıkladıktan sonra giriş yapacak. */
  confirmationRequired?: boolean;
}

export interface SignUpMeta {
  displayName?: string;
  city?: string;
  exam?: string;
}

/** Üyelik = Auth hesabı + `members` satırı; bu fonksiyon yalnız hesabı açar. */
export async function signUp(email: string, password: string, meta?: SignUpMeta): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  if (!cfg)
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      error: 'Supabase hedefi tanımlı değil — `npm run setup:supabase` ile url + anon anahtarı bir kez yaz.',
    };
  const redirectTo = appRedirectUrl();
  const signupUrl = redirectTo
    ? `${authRoot()}/signup?redirect_to=${encodeURIComponent(redirectTo)}`
    : `${authRoot()}/signup`;
  const data = await postJson(signupUrl, {
    email,
    password,
    ...(redirectTo ? { email_redirect_to: redirectTo, options: { emailRedirectTo: redirectTo } } : {}),
    data: {
      ...(meta?.displayName ? { display_name: meta.displayName } : {}),
      ...(meta?.city ? { city: meta.city } : {}),
      ...(meta?.exam ? { exam: meta.exam } : {}),
    },
  });
  if (data.error)
    return { ok: false, code: codeOf(data.error.message), error: authErrorMessage(String(data.error.message)) };
  const identities = data?.user?.identities ?? data?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return {
      ok: false,
      code: 'USER_ALREADY_REGISTERED',
      error: authErrorMessage('user already registered'),
    };
  }
  if (!data.access_token) {
    const uid = String(data?.user?.id || data?.id || '');
    const userEmail = String(data?.user?.email || data?.email || email || '');
    return {
      ok: true,
      confirmationRequired: true,
      code: 'EMAIL_CONFIRMATION_REQUIRED',
      session: {
        uid,
        email: userEmail,
        idToken: '',
        refreshToken: '',
        expiresAt: 0,
      },
    };
  }
  const session = toSession(data, email);
  await persist(session);
  return { ok: true, session };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  if (!cfg)
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      error: 'Supabase hedefi tanımlı değil — `npm run setup:supabase` ile url + anon anahtarı bir kez yaz.',
    };
  const data = await postJson(`${authRoot()}/token?grant_type=password`, { email, password });
  if (data.error)
    return { ok: false, code: codeOf(data.error.message), error: authErrorMessage(String(data.error.message)) };
  const session = toSession(data, email);
  await persist(session);
  return { ok: true, session };
}

/** Parola değişimi: önce Supabase Auth'ta güncelle, sonra üyeyi senkron tut. */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const session = await restoreSession();
  if (!session) return { ok: false, code: 'NO_SESSION', error: 'Oturum bulunamadı.' };
  const token = (await currentIdToken()) || session.idToken;
  const data = await postJson(
    `${authRoot()}/user`,
    { password: newPassword },
    { method: 'PUT', bearer: token }
  );
  if (data.error)
    return { ok: false, code: codeOf(data.error.message), error: authErrorMessage(String(data.error.message)) };
  const merged = { ...session, ...(data.access_token ? toSession(data, session.email) : {}) };
  await persist(merged);
  return { ok: true };
}

/** Supabase → Authentication → URL Configuration → redirect template'i üzerinden sıfırlama maili. */
export async function sendPasswordResetEmail(email: string): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  if (!cfg)
    return { ok: false, code: 'NOT_CONFIGURED', error: 'Supabase hedefi tanımlı değil.' };
  const redirectTo = appRedirectUrl() || cfg.url;
  const recoverUrl = redirectTo
    ? `${authRoot()}/recover?redirect_to=${encodeURIComponent(redirectTo)}`
    : `${authRoot()}/recover`;
  const data = await postJson(recoverUrl, {
    email,
    redirect_to: redirectTo,
  });
  if (data.error)
    return { ok: false, code: codeOf(data.error.message), error: authErrorMessage(String(data.error.message)) };
  return { ok: true };
}

/**
 * Hesap kapatma: `members` satırını uygulama silebilir (RLS: yalnız yönetici),
 * Auth kaydını silmek ise service_role ister. Service key istemcide bulunmadığı
 * için burada oturum kapatılır ve Admin'in Dashboard → Authentication → Users
 * üzerinden hesabı kaldırması gerekir; panel bu yüzden bu işlemi "yönetici onayında"
 * olarak işaretler. (Yerel kopya bırakılmıyor.)
 */
export async function deleteAccount(): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const session = await restoreSession();
  if (!session) return { ok: false, code: 'NO_SESSION', error: 'Oturum bulunamadı.' };
  await persist(null);
  return {
    ok: false,
    code: 'ADMIN_REQUIRED',
    error: 'Oturum kapatıldı. Auth hesabı Supabase Dashboard → Authentication → Users içinden silinir.',
  };
}

/** Panel “test et” düğmesi: hedef erişilebilir mi, auth açıksa yanıt alınıyor mu? */
export async function probeAuth(): Promise<{ ok: boolean; note: string }> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  if (!cfg)
    return {
      ok: false,
      note: 'Supabase hedefi tanımlı değil — `npm run setup:supabase` çalıştırılınca kendiliğinden aktifleşir (kullanıcıdan bir şey istenmez).',
    };
  const res = await fetch(`${authRoot()}/health`, { headers: { apikey: cfg.apiKey } })
    .then(r => ({ status: r.status, ok: r.ok }))
    .catch(() => ({ status: 0, ok: false }));
  if (res.ok) return { ok: true, note: `Supabase Auth erişilebilir (HTTP ${res.status}); anon anahtar kabul ediliyor.` };
  if (res.status === 401 || res.status === 403)
    return { ok: false, note: `Hedef erişildi ama anon anahtar reddedildi (HTTP ${res.status}).` };
  return { ok: false, note: `Supabase Auth yanıt vermedi (HTTP ${res.status || 'ağ hatası'}).` };
}

/** Oturum token'ını doğrula ve uid/e-posta bilgisini döndür (panel durumu için). */
export async function lookupSelf(): Promise<{
  ok: boolean;
  uid?: string;
  email?: string;
  emailVerified?: boolean;
  error?: string;
}> {
  const cfg = resolveAuthConfig();
  const session = await restoreSession();
  if (!cfg || !session) return { ok: false, error: 'Oturum yok.' };
  const token = (await currentIdToken()) || session.idToken;
  const data = await postJson(`${authRoot()}/user`, null, { method: 'GET', bearer: token });
  if (data.error) return { ok: false, error: authErrorMessage(String(data.error.message)) };
  const user = data?.user || data;
  if (!user?.id) return { ok: false, error: 'Kullanıcı bulunamadı (silinmiş olabilir).' };
  return {
    ok: true,
    uid: String(user.id),
    email: String(user.email || ''),
    emailVerified: user.email_confirmed_at != null || !!user.email_verified,
  };
}
