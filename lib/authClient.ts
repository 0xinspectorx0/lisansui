/**
 * Firebase Authentication (Email/Password) istemcisi — Firebase SDK'sız.
 *
 * Firestore tarafında olduğu gibi doğrudan REST kullanılıyor
 * (`identitytoolkit.googleapis.com/v1/accounts:*`), böylece Expo Go'da, web'de ve
 * native derlemelerde aynı kod çalışıyor ve yeni bir bağımlılık eklenmiyor.
 *
 * Yapılandırma (tek satır yeterli):
 *   EXPO_PUBLIC_FIREBASE_API_KEY=...      Console → Project settings → Web app SDK config
 *   EXPO_PUBLIC_FIRESTORE_PROJECT=...     (yoksa projeyi oradan alıyoruz)
 *   EXPO_PUBLIC_FIREBASE_PROJECT_ID=...   (opsiyonel override)
 *
 * Anahtar yoksa `isAuthConfigured()` false döner ve üyelikler eski yerel
 * doğrulama (PBKDF2 + Firestore belgesi) ile çalışmaya devam eder.
 *
 * Oturum native'de expo-secure-store, web'de AsyncStorage içinde saklanır;
 * idToken ~1 saat sonra `refresh_token` ile sessizce yenilenir.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { firestoreTarget } from './firebaseConfig';

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
}

let cachedConfig: AuthConfig | null | undefined;

/** `.env.local` değişebildiği için panel `resetAuthConfigCache()` çağırır. */
export function resolveAuthConfig(): AuthConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const apiKey = envValue('EXPO_PUBLIC_FIREBASE_API_KEY').trim();
  const projectId =
    envValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID').trim() || firestoreTarget().projectId;
  cachedConfig = apiKey
    ? {
        apiKey,
        projectId,
        authDomain: envValue('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN').trim() || `${projectId}.firebaseapp.com`,
        appId: envValue('EXPO_PUBLIC_FIREBASE_APP_ID').trim(),
      }
    : null;
  return cachedConfig;
}

export function resetAuthConfigCache(): void {
  cachedConfig = undefined;
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
      return 'EXPO_PUBLIC_FIREBASE_API_KEY geçersiz görünüyor. Console → Project settings → Web app SDK config değerini kontrol et.';
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
  const cfg = resolveAuthConfig();
  if (!cfg) return { ok: false, code: 'NOT_CONFIGURED', error: 'Firebase Auth yapılandırılmamış.' };
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
  const cfg = resolveAuthConfig();
  if (!cfg) return { ok: false, code: 'NOT_CONFIGURED', error: 'Firebase Auth yapılandırılmamış.' };
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
  const cfg = resolveAuthConfig();
  if (!cfg) return { ok: false, code: 'NOT_CONFIGURED', error: 'Firebase Auth yapılandırılmamış.' };
  const data = await postJson(`${IK_API}:sendOobCode?key=${encodeURIComponent(cfg.apiKey)}`, {
    requestType: 'PASSWORD_RESET',
    email,
  });
  if (data.error) return { ok: false, code: String(data.error.message).split(' : ')[0], error: authErrorMessage(data.error.message) };
  return { ok: true };
}

export async function deleteAccount(): Promise<AuthResult> {
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
  const cfg = resolveAuthConfig();
  if (!cfg) return { ok: false, note: 'API anahtarı tanımlı değil (EXPO_PUBLIC_FIREBASE_API_KEY).' };
  const data = await postJson(`${IK_API}:signUp?key=${encodeURIComponent(cfg.apiKey)}`, {
    email: 'baglanti-testi@localhost',
    password: 'x',
    returnSecureToken: true,
  });
  const message = String(data?.error?.message || '');
  if (!data.error) return { ok: true, note: 'Beklenmedik: test kullanıcısı oluştu, hemen sil.' };
  const code = message.split(' : ')[0].trim().toUpperCase();
  if (code === 'WEAK_PASSWORD' || code === 'INVALID_PASSWORD' || code === 'INVALID_EMAIL') {
    return { ok: true, note: `API anahtarı ve Email/Password sağlayıcısı çalışıyor (yanıt: ${code}).` };
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
