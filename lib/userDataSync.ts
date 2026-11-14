/**
 * Kullanıcı verisinin bulutla eşzamanlanması — “cihazda kopya kalmasın” kuralının
 * uygulandığı yer.
 *
 * Kural: telefon/tablet tek kaynak DEĞİLDİR. Uygulama içindeki her kullanıcı
 * verisi (çözülen testler, yanlış defteri, favoriler, çalışılan konular, seri,
 * günlük istatistik, odak süresi, kaydedilen/öğrenilen haplar, ayarlar) değiştiği
 * AN Supabase'e yazılır; `AsyncStorage` yalnız okuma önbelleğidir. Yazma
 * reddedilirse işlem reddedilmiş sayılır ve panel/uygulama bunu gösterir —
 * “sonra gönderilir” diyen bir kuyruk burada YOKTUR (ve isteyerek yoktur).
 *
 * Kimlik: `user_data` satırları `auth.uid()` ile, `user_tests` satırları oturum
 * e-postası ile bağlanır (RLS). Supabase Auth hesabı olmayan (yalnız-ca-cihaz
 * PBKDF2) oturumlarda `canSync` false kalır: veri yerelde durur ve bu dürüstçe
 * bildirilir; kimseye “buluta yazıldı” denmez.
 */

import { restFetch } from './sbGateway';
import type { TestResult } from './types';

/* ------------------------------------------------------------ türler/eşlemeler */

export type UserDataKind =
  | 'favorites'
  | 'mistakes'
  | 'studiedTopics'
  | 'streak'
  | 'dailyStats'
  | 'focusTotal'
  | 'learnedTips'
  | 'savedTips'
  | 'settings';

/** AppContext'in AsyncStorage anahtarları → bulut `kind` değeri. */
export const STORAGE_KIND: Record<string, UserDataKind> = {
  '@kpss_favorites_v2': 'favorites',
  '@kpss_mistakes_v2': 'mistakes',
  '@kpss_studied_topics_v2': 'studiedTopics',
  '@kpss_streak_v2': 'streak',
  '@kpss_daily_stats_v2': 'dailyStats',
  '@kpss_focus_total_v2': 'focusTotal',
  '@kpss_learned_tips_v2': 'learnedTips',
  '@kpss_saved_tips_v2': 'savedTips',
  '@kpss_settings_v2': 'settings',
};

export interface UserDataStatus {
  /** Bir üye bağlandı mı (bulut satırları ona yazılır). */
  bound: boolean;
  email: string;
  /** Supabase Auth uid'si var mı — yoksa user_data yazılamaz. */
  canSync: boolean;
  busy: boolean;
  error: string | null;
  pushed: number;
  failed: number;
  pulledAt: string | null;
}

/* ------------------------------------------------------------- durum akışı */

let status: UserDataStatus = {
  bound: false,
  email: '',
  canSync: false,
  busy: false,
  error: null,
  pushed: 0,
  failed: 0,
  pulledAt: null,
};
const listeners = new Set<() => void>();

function emit(patch: Partial<UserDataStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach(l => {
    try {
      l();
    } catch {
      /* dinleyici hatası akışı bozmasın */
    }
  });
}

export function getUserDataStatus(): UserDataStatus {
  return status;
}

export function subscribeUserData(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* --------------------------------------------------------------- bağlama */

export interface MemberBinding {
  email: string;
  userId?: string | null;
}

let bound: MemberBinding | null = null;

/** Üyelik oturumu açıldığında çağrılır (MembershipContext bunu bildirir). */
export function bindMember(next: MemberBinding | null): void {
  bound = next && next.email ? { email: next.email.toLowerCase(), userId: next.userId || null } : null;
  emit({
    bound: !!bound,
    email: bound?.email || '',
    canSync: !!bound?.userId,
    error: null,
    pushed: 0,
    failed: 0,
  });
}

export function currentBinding(): MemberBinding | null {
  return bound;
}

/* ------------------------------------------------- yol başına sıralı yazım */

const chains = new Map<string, Promise<unknown>>();

/**
 * Aynı anahtara gelen yazmaları SIRAYA koyar (birbirini ezmesin), ama BEKLETMEZ:
 * istek hemen yola çıkar; yalnız sıralama için önceki istek beklenir.
 */
function enqueue<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(job, job);
  const tail = next.then(
    () => undefined,
    () => undefined
  );
  chains.set(key, tail);
  emit({ busy: true });
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
    emit({ busy: chains.size > 0 });
  });
  return next;
}

function bumpOk(): void {
  emit({ pushed: status.pushed + 1, error: null });
}
function bumpFail(err: string): void {
  emit({ failed: status.failed + 1, error: err });
}

/* -------------------------------------------------------------- user_data */

function userDataRows(): string {
  return `userId=eq.${encodeURIComponent(bound?.userId || '')}`;
}

/** Tek anahtarı buluta yazar (upsert). Hata durumunda { ok:false } döner. */
export function pushUserData(kind: UserDataKind, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  const binding = bound;
  if (!binding?.userId) return Promise.resolve({ ok: false, error: 'no-cloud-identity' });
  return enqueue(`data:${kind}`, async () => {
    try {
      const res = await restFetch('user_data', `on_conflict=userId,kind`, {
        method: 'POST',
        headers: {
          Prefer: 'return=minimal,resolution=merge-duplicates',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: binding.userId, kind, payload: payload ?? null }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const message = `Supabase kullanıcı verisini reddetti (HTTP ${res.status})${text ? ` — ${text.slice(0, 160)}` : ''}`;
        bumpFail(message);
        return { ok: false, error: message };
      }
      bumpOk();
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      bumpFail(message);
      return { ok: false, error: message };
    }
  });
}

/** Buluttaki tüm anahtarları + test satırlarını çeker (giriş sonrası bir kez). */
export async function pullUserData(): Promise<{
  ok: boolean;
  data?: Partial<Record<UserDataKind, unknown>> & { results?: TestResult[] };
  error?: string;
}> {
  const binding = bound;
  if (!binding) return { ok: false, error: 'Bağlı üye yok' };
  try {
    const [rows, tests] = await Promise.all([
      binding.userId
        ? restFetch('user_data', `select=kind,payload,updatedAt&${userDataRows()}`, { method: 'GET' })
        : Promise.resolve(null),
      restFetch('rpc/kpss_pull_tests', '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_member_email: binding.email }),
      }),
    ]);
    const out: Partial<Record<UserDataKind, unknown>> & { results?: TestResult[] } = {};
    if (rows && rows.ok) {
      const json = await rows.json();
      for (const row of Array.isArray(json) ? json : []) {
        const kind = String(row?.kind || '') as UserDataKind;
        if (kind) out[kind] = row?.payload;
      }
    }
    if (tests && tests.ok) {
      const json = await tests.json();
      const list = Array.isArray(json) ? json[0]?.rows ?? json[0] : json?.rows;
      out.results = Array.isArray(list) ? (list as TestResult[]) : [];
    }
    emit({ pulledAt: new Date().toISOString() });
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Çözülen testleri bütünüyle değiştirir (listede olmayan satır silinir). */
export function pushUserTests(results: TestResult[]): Promise<{ ok: boolean; error?: string }> {
  const binding = bound;
  if (!binding) return Promise.resolve({ ok: false, error: 'no-cloud-identity' });
  return enqueue('tests', async () => {
    try {
      const res = await restFetch('rpc/kpss_replace_tests', '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_member_email: binding.email, p_rows: results }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const message = `Supabase test listesini reddetti (HTTP ${res.status})${text ? ` — ${text.slice(0, 160)}` : ''}`;
        bumpFail(message);
        return { ok: false, error: message };
      }
      bumpOk();
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      bumpFail(message);
      return { ok: false, error: message };
    }
  });
}

/** Başarısız yazmaları tekrar dener (panel/uygulama tek dokunuş). */
export async function retryUserData(pending: Record<string, unknown>): Promise<{ retried: number; failed: number }> {
  let retried = 0;
  let failed = 0;
  for (const [key, value] of Object.entries(pending || {})) {
    const kind = STORAGE_KIND[key];
    if (!kind) continue;
    const res = await pushUserData(kind, value);
    retried += 1;
    if (!res.ok) failed += 1;
  }
  if (failed === 0) emit({ failed: 0, error: null });
  return { retried, failed };
}

/** Sayaçları sıfırlar (oturum değişiminde). */
export function resetUserDataStatus(): void {
  chains.clear();
  emit({ busy: false, error: null, pushed: 0, failed: 0, pulledAt: null });
}

/** Test/derleme kapısı: bekletme zamanlayıcısı ve yerel kaynak kullanılmıyor. */
export function __chainCount(): number {
  return chains.size;
}
