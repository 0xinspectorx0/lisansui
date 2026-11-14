/**
 * Firebase Authentication (Email/Password) istemcisi — Firebase SDK'sız.
 *
 * Firestore tarafında olduğu gibi doğrudan REST kullanılıyor
 * (`identitytoolkit.googleapis.com/v1/accounts:*`), böylece Expo Go'da, web'de ve
 * native derlemelerde aynı kod çalışıyor ve yeni bir bağımlılık eklenmiyor.
 *
 * Yapılandırma KULLANICIDAN İSTENMEZ: normal kurulumda anahtar depodaki
 * `config/firebaseApp.ts` içinden okunur (bir kez yazılır, commit'lenir).
 * Geliştirici istersen override edebilir:
 *   EXPO_PUBLIC_FIREBASE_API_KEY=...      Console → Project settings → Web app SDK config
 *   EXPO_PUBLIC_FIRESTORE_PROJECT=...     (yoksa projeyi oradan alıyoruz)
 *   EXPO_PUBLIC_FIREBASE_PROJECT_ID=...   (opsiyonel override)
 *
 * Hiçbir kaynakta anahtar yoksa `isAuthConfigured()` false döner ve üyelikler
 * eski yerel doğrulama (PBKDF2 + Firestore belgesi) ile çalışmaya devam eder.
 *
 * Oturum native'de expo-secure-store, web'de AsyncStorage içinde saklanır;
 * idToken ~1 saat sonra `refresh_token` ile sessizce yenilenir.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { firestoreTarget } from './firebaseConfig';
import { FIREBASE_WEB_CONFIG } from '../config/firebaseApp';

const IK_API = 'https://identitytoolkit.googleapis.com/v1/accounts';
const SESSION_KEY = 'kpss.firebaseAuth.session.v1';
const REFRESH_MARGIN_MS = 60_000;

/* ------------------------------------------------------------- config */

const ENV_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

function envValue(name: (typeof ENV_KEYS)[number]): string {
  // Metro yalnızca literal `process.env.X` erişimini gömer.
  switch (name) {
    case 'EXPO_PUBLIC_FIREBASE_API_KEY':
      return process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '';
    case 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN':
      return process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '';
    case 'EXPO_PUBLIC_FIREBASE_PROJECT_ID':
      return process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';
    case 'EXPO_PUBLIC_FIREBASE_APP_ID':
      return process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '';
    default:
      return '';
  }
}

export interface AuthConfig {
  apiKey: string;
  projectId: string;
  authDomain: string;
  appId: string;
  /** 'repo' = depoya gömülü config, 'env' = .env.local, 'device' = eski cihaz kaydı */
  source: 'env' | 'device' | 'repo';
}

/**
 * Tek birleştirme noktası: eksik alanları Firestore hedefinden/proje adından
 * tamamlar. `apiKey` boşsa null döner (yani o kaynak devre dışı).
 */
export function buildAuthConfig(
  raw: Partial<Pick<AuthConfig, 'apiKey' | 'projectId' | 'authDomain' | 'appId'>> | null | undefined,
  source: AuthConfig['source']
): AuthConfig | null {
  const apiKey = String(raw?.apiKey || '').trim();
  if (!apiKey) return null;
  const projectId = String(raw?.projectId || '').trim() || firestoreTarget().projectId;
  return {
    apiKey,
    projectId,
    authDomain: String(raw?.authDomain || '').trim() || `${projectId}.firebaseapp.com`,
    appId: String(raw?.appId || '').trim(),
    source,
  };
}

/** Depoya gömülü yapılandırma (config/firebaseApp.ts) — kullanıcının bir şey girmesi gerekmez. */
export function repoAuthConfig(): AuthConfig | null {
  return buildAuthConfig(FIREBASE_WEB_CONFIG, 'repo');
}

/**
 * Panelde girilen anahtar bu anahtarla saklanır (cihaza özel, `--clear` gerekmez).
 * Public web anahtarı olduğu için depolama güvenlik açısından sorun değil; yine de
 * üretim derlemelerinde `.env.local`/EAS değişkeni tercih edilir.
 */
const CONFIG_KEY = 'kpss.firebaseAuth.config.v1';

let cachedConfig: AuthConfig | null | undefined;
let deviceOverride: AuthConfig | null = null;
let deviceConfigLoaded = false;

function fromEnv(): AuthConfig | null {
  return buildAuthConfig(
    {
      apiKey: envValue('EXPO_PUBLIC_FIREBASE_API_KEY').trim(),
      projectId: envValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID').trim(),
      authDomain: envValue('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN').trim(),
      appId: envValue('EXPO_PUBLIC_FIREBASE_APP_ID').trim(),
    },
    'env'
  );
}

/** Modül yüklendiğinde bir kez oku; `ensureAuthConfigLoaded()` ile beklenebilir. */
export async function ensureAuthConfigLoaded(): Promise<void> {
  if (deviceConfigLoaded) return;
  const raw = await storeGet(CONFIG_KEY);
  deviceConfigLoaded = true;
  cachedConfig = undefined; // cihaz değeri geldiyse çözümü tazele
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { apiKey?: string };
      const key = String(parsed?.apiKey || '').trim();
      if (key) {
        const projectId = firestoreTarget().projectId;
        deviceOverride = {
          apiKey: key,
          projectId,
          authDomain: `${projectId}.firebaseapp.com`,
          appId: '',
          source: 'device',
        };
      }
    } catch {
      deviceOverride = null;
    }
  }
}

/**
 * Çözümleme sırası: eski cihaz kaydı → `.env.local` → depoya gömülü config.
 * (Cihazda elle girilen değer yalnız geriye dönük uyumluluk için en üstte
 * durur; “Kaldır” ile config değerine dönülür.)
 */
export function resolveAuthConfig(): AuthConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  cachedConfig = deviceOverride ?? fromEnv() ?? repoAuthConfig();
  return cachedConfig;
}

export function resetAuthConfigCache(): void {
  cachedConfig = undefined;
}

/** Panel → “Kaydet”. Boş/geçersiz değer reddedilir. */
export async function setDeviceApiKey(
  apiKey: string
): Promise<{ ok: boolean; error?: string }> {
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, error: 'Boş bırakma; Console’daki apiKey değerini yapıştır.' };
  if (/\s/.test(key)) return { ok: false, error: 'Anahtar boşluk içeremez — tamamını kopyala.' };
  if (key.length < 20) return { ok: false, error: 'Anahtar kısa görünüyor (genelde 39 karakter).' };
  if (!/^[A-Za-z0-9_-]+$/.test(key))
    return { ok: false, error: 'Anahtar beklenmeyen karakter içeriyor (yalnız harf/rakam/-/_).' };
  const projectId = firestoreTarget().projectId;
  deviceOverride = {
    apiKey: key,
    projectId,
    authDomain: `${projectId}.firebaseapp.com`,
    appId: '',
    source: 'device',
  };
  cachedConfig = undefined;
  deviceConfigLoaded = true;
  await storeSet(CONFIG_KEY, JSON.stringify({ apiKey: key, projectId, savedAt: new Date().toISOString() }));
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

/** Çözümlenmiş web API anahtarı (yoksa boş string). Firestore REST isteklerinin
 *  `?key=` yoklaması için — kullanıcıya asla sorulmaz, kaynak yine config/.env. */
export function webApiKey(): string {
  return resolveAuthConfig()?.apiKey || '';
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
  /** `iss: https://securetoken.google.com/<projectId>` — okunamazsa null. */
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
    const fromIss = iss.match(/securetoken\.google\.com\/([^/]+)/);
    const pid = fromIss
      ? fromIss[1]
      : typeof payload.project_id === 'string'
        ? payload.project_id
        : null;
    return {
      projectId: pid || null,
      email: String(payload.email || ''),
      uid: String(payload.user_id || payload.local_id || ''),
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

/** Firestore hedefiyle oturum token'ının projesi farklı mı? */
export function tokenProjectMismatches(projectId: string | null): boolean {
  if (!projectId) return false;
  return projectId !== firestoreTarget().projectId;
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
  const data = await postJson(`${IK_API}:token?key=${encodeURIComponent(cfg.apiKey)}`, {
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });
  if (data.error) {
    if (data.error.message === 'TOKEN_EXPIRED' || data.error.message === 'USER_DISABLED') {
      await persist(null);
    }
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

/** Firestore isteklerine eklenecek bearer token; oturum yoksa null. */
export async function currentIdToken(opts?: { forceRefresh?: boolean }): Promise<string | null> {
  await ensureAuthConfigLoaded();
  const session = await restoreSession();
  if (!session) return null;
  if (!opts?.forceRefresh && session.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return session.idToken;
  }
  const next = await refresh(session);
  if (next) return next.idToken;
  // Yenileme olmadı: TOKEN_EXPIRED/USER_DISABLED'da oturum kapatıldı → token verme,
  // ağ hatası gibi geçici durumlarda mevcut (muhtemelen hâlâ geçerli) token'ı kullan.
  const still = await restoreSession();
  return still?.idToken ?? null;
}

/* ------------------------------------------------------------ REST call */

interface IkError {
  message: string;
  errors?: { message?: string }[];
}

async function postJson(url: string, body: unknown): Promise<any> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? safeParse(text) : {};
    if (!res.ok) {
      return { error: { message: String(json?.error?.message || `HTTP ${res.status}`) } as IkError };
    }
    return json ?? {};
  } catch (e) {
    return { error: { message: 'NETWORK_REQUEST_FAILED' } as IkError, thrown: String(e) };
  }
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function toSession(data: any, fallbackEmail: string): AuthSession {
  return {
    uid: String(data.localId || ''),
    email: String(data.email || fallbackEmail || ''),
    idToken: String(data.idToken || ''),
    refreshToken: String(data.refreshToken || ''),
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
  };
}

/**
 * Kimlik doğrulama hata mesajlarını kullanıcı diline çevirir.
 * Panelde ve formlarda aynı metinler kullanılıyor.
 */
export function authErrorMessage(raw: string): string {
  const code = (raw || '').split(' : ')[0].trim().toUpperCase();
  switch (code) {
    case 'EMAIL_NOT_FOUND':
      return 'Bu e-posta ile kayıtlı bir hesap yok. Önce üye ol.';
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'WRONG_PASSWORD':
    case 'INVALID_PASSWORD':
    case 'PASSWORD_MISMATCH':
    case 'MISSING_PASSWORD':
      return 'E-posta veya parola hatalı.';
    case 'EMAIL_EXISTS':
      return 'Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı dene.';
    case 'WEAK_PASSWORD':
    case 'WEAK_PASSWORD_PASSWORD_TOO_WEAK':
      return 'Parola çok zayıf (en az 6 karakter).';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Çok fazla deneme. Bir süre sonra tekrar dene (Firebase hesabı geçici olarak kilitledi).';
    case 'USER_DISABLED':
      return 'Hesap devre dışı bırakılmış. Yönetici ile iletişime geç.';
    case 'OPERATION_NOT_ALLOWED':
      return 'Firebase Console → Authentication → Sign-in method → “Email/Password” açık değil. Önce onu etkinleştir.';
    case 'NETWORK_REQUEST_FAILED':
      return 'Firebase Auth sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.';
    case 'API_KEY_INVALID':
    case 'KEY_INVALID':
    case 'INVALID_ARGUMENT':
      return 'Firebase web API anahtarı geçersiz görünüyor. Depoda `config/firebaseApp.ts` (yoksa .env.local) içindeki apiKey değerini kontrol et.';
    case 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN':
    case 'TOKEN_EXPIRED':
      return 'Oturum süresi doldu. Yeniden giriş yap.';
    default:
      return `Kimlik doğrulama hatası: ${raw || 'bilinmiyor'}`;
  }
}

/* ------------------------------------------------------------ operations */

export interface AuthResult {
  ok: boolean;
  session?: AuthSession;
  error?: string;
  code?: string;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  if (!cfg) return { ok: false, code: 'NOT_CONFIGURED', error: 'Firebase Auth yapılandırılmamış — config/firebaseApp.ts içindeki apiKey boş.' };
  const data = await postJson(`${IK_API}:signUp?key=${encodeURIComponent(cfg.apiKey)}`, {
    email,
    password,
    returnSecureToken: true,
  });
  if (data.error) return { ok: false, code: String(data.error.message).split(' : ')[0], error: authErrorMessage(data.error.message) };
  const session = toSession(data, email);
  await persist(session);
  return { ok: true, session };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  if (!cfg) return { ok: false, code: 'NOT_CONFIGURED', error: 'Firebase Auth yapılandırılmamış — config/firebaseApp.ts içindeki apiKey boş.' };
  const data = await postJson(`${IK_API}:signInWithPassword?key=${encodeURIComponent(cfg.apiKey)}`, {
    email,
    password,
    returnSecureToken: true,
  });
  if (data.error) return { ok: false, code: String(data.error.message).split(' : ')[0], error: authErrorMessage(data.error.message) };
  const session = toSession(data, email);
  await persist(session);
  return { ok: true, session };
}

/** Parola değişimi: önce Firebase'de güncelle, sonra belgeyi senkron tut. */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  const session = await restoreSession();
  if (!cfg || !session) return { ok: false, code: 'NO_SESSION', error: 'Oturum bulunamadı.' };
  const data = await postJson(`${IK_API}:update?key=${encodeURIComponent(cfg.apiKey)}`, {
    idToken: session.idToken,
    password: newPassword,
    returnSecureToken: true,
  });
  if (data.error) return { ok: false, code: String(data.error.message).split(' : ')[0], error: authErrorMessage(data.error.message) };
  await persist({
    ...session,
    idToken: String(data.idToken || session.idToken),
    refreshToken: String(data.refreshToken || session.refreshToken),
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
  });
  return { ok: true };
}

/** Console → Authentication → Email link template'i üzerinden sıfırlama maili. */
export async function sendPasswordResetEmail(email: string): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  if (!cfg) return { ok: false, code: 'NOT_CONFIGURED', error: 'Firebase Auth yapılandırılmamış — config/firebaseApp.ts içindeki apiKey boş.' };
  const data = await postJson(`${IK_API}:sendOobCode?key=${encodeURIComponent(cfg.apiKey)}`, {
    requestType: 'PASSWORD_RESET',
    email,
  });
  if (data.error) return { ok: false, code: String(data.error.message).split(' : ')[0], error: authErrorMessage(data.error.message) };
  return { ok: true };
}

export async function deleteAccount(): Promise<AuthResult> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  const session = await restoreSession();
  if (!cfg || !session) return { ok: false, code: 'NO_SESSION', error: 'Oturum bulunamadı.' };
  const data = await postJson(`${IK_API}:delete?key=${encodeURIComponent(cfg.apiKey)}`, {
    idToken: session.idToken,
  });
  await persist(null);
  if (data.error) return { ok: false, code: String(data.error.message).split(' : ')[0], error: authErrorMessage(data.error.message) };
  return { ok: true };
}

/** Panel “test et” düğmesi: anahtar geçerli mi, Email/Password açık mı? */
export async function probeAuth(): Promise<{ ok: boolean; note: string }> {
  await ensureAuthConfigLoaded();
  const cfg = resolveAuthConfig();
  if (!cfg)
    return {
      ok: false,
      note: 'API anahtarı tanımlı değil — `config/firebaseApp.ts` içine yazılınca kendiliğinden aktifleşir (kullanıcıdan bir şey istenmez).',
    };
  // E-posta biçimi geçerli, parola kasıtlı zayıf → kullanıcı OLUŞMAZ; ama yanıt
  // kodu hem anahtarı hem Email/Password sağlayıcısını ayırt ettirir.
  const data = await postJson(`${IK_API}:signUp?key=${encodeURIComponent(cfg.apiKey)}`, {
    email: 'baglanti-testi@example.com',
    password: 'x',
    returnSecureToken: true,
  });
  const message = String(data?.error?.message || '');
  if (!data.error) return { ok: true, note: 'Beklenmedik: test kullanıcısı oluştu, hemen sil.' };
  const code = message.split(' : ')[0].trim().toUpperCase();
  if (code === 'WEAK_PASSWORD' || code === 'INVALID_PASSWORD') {
    return { ok: true, note: `API anahtarı geçerli, Email/Password sağlayıcısı açık (yanıt: ${code}).` };
  }
  if (code === 'INVALID_EMAIL') {
    return { ok: true, note: 'API anahtarı geçerli; sağlayıcı durumu bu yanıttan anlaşılmıyor.' };
  }
  return { ok: false, note: authErrorMessage(message) };
}

/** idToken'ı doğrula ve uid/e-posta bilgisini döndür (panel durumu için). */
export async function lookupSelf(): Promise<{ ok: boolean; uid?: string; email?: string; emailVerified?: boolean; error?: string }> {
  const cfg = resolveAuthConfig();
  const session = await restoreSession();
  if (!cfg || !session) return { ok: false, error: 'Oturum yok.' };
  const token = (await currentIdToken()) || session.idToken;
  const data = await postJson(`${IK_API}:lookup?key=${encodeURIComponent(cfg.apiKey)}`, { idToken: token });
  if (data.error) return { ok: false, error: authErrorMessage(data.error.message) };
  const user = Array.isArray(data.users) ? data.users[0] : null;
  if (!user) return { ok: false, error: 'Kullanıcı bulunamadı (silinmiş olabilir).' };
  return { ok: true, uid: String(user.localId || ''), email: String(user.email || ''), emailVerified: !!user.emailVerified };
}
