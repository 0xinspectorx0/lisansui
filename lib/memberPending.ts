/**
 * Bulut kuyruğu — Firestore yazması reddedilen ÜYELİK BELGESİNİN bekletildiği yer.
 *
 * Neden var: `firestore.rules` yayınlanmadığında (ya da cihazda bayat bir paket
 * çalışırken) kendi belgesini oluşturmak isteyen istek `permission-denied` alır.
 * Bu, kullanıcının hatası değildir ve kullanıcının yapabileceği bir şey de değildir;
 * ama üyeliği sonsuza dek engellememelidir. Buradaki çözüm kalıcıdır:
 *
 *   1) Yazma reddedilirse belge cihazda bekletilir, oturum AÇILIR (üyelik kullanılır).
 *   2) Uygulama her açılışta/odaklandığında ve kuyruk doluyken periyodik olarak
 *      yazmayı YENİDEN dener — kural bir kez yayınlandığı anda kuyruk kendiliğinden
 *      boşalır, bulut gerçek kaynak olur.
 *   3) Kuyruk yalnızca KENDİ belgesini taşır; hak alanlarında bulutla çelişirse
 *      bulut kazanır (aşağıda `mergeAfterPush`).
 *
 * Bu modül saf depolama + zamanlama mantığıdır: ağ çağrısı çağıran tarafa
 * enjekte edilir (`syncPending(write)`), böylece testler sahte depoyla çalışır.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MemberDoc, normalizeEmail } from './membership';

export const PENDING_KEY = '@kpss_member_pending_v1';

export interface PendingMemberWrite {
  /** Belge kimliği = normalize e-posta. */
  email: string;
  /** Buluta yazılmak istenen tam belge (kuralın istediği biçimde). */
  doc: MemberDoc;
  /** Kuyruğa alınma zamanı (ISO). */
  queuedAt: string;
  /** Son denemenin hatası — panelde tek satır gösterilir, kullanıcıya değil geliştiriciye. */
  lastError: string;
  /** Kaç kez denendi (geri çekilme gecikmesini belirler). */
  attempts: number;
  /** Bu zamana kadar denetlenmez (ms). */
  nextTryAt: number;
  /** Bağlanacak Firebase Auth uid'si; kuyruk boşalınca belgeye yazılır. */
  authUid?: string;
  /** Neden bekletiliyor: kural reddi mi, ulaşılamazlık mı. */
  reason: 'denied' | 'offline';
  /** `delete` = belgeyi buluttan kaldırmayı dener; yoksa yazma (create/patch). */
  kind?: 'write' | 'delete';
}

/** Deneme sayısı → beklenecek gecikme. Sonsuza dek uzamaz, 6 saatte bir yeniden dener. */
export const PENDING_BACKOFF_MS = [0, 20_000, 60_000, 3 * 60_000, 10 * 60_000, 30 * 60_000, 6 * 3600_000];

export function pendingDelayMs(attempts: number): number {
  const i = Math.max(0, Math.floor(attempts));
  return PENDING_BACKOFF_MS[Math.min(i, PENDING_BACKOFF_MS.length - 1)];
}

function sane(raw: unknown): PendingMemberWrite[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is PendingMemberWrite =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as any).email === 'string' &&
        // silme girdisi belge taşımaz; yazma girdisi taşımak zorunda
        ((e as any).kind === 'delete' || !!(e as any).doc)
    )
    .map(e => ({
      ...e,
      email: normalizeEmail(String(e.email)),
      attempts: Number.isFinite(e.attempts) ? Math.max(0, Math.floor(e.attempts)) : 0,
      nextTryAt: Number.isFinite(e.nextTryAt) ? e.nextTryAt : 0,
      lastError: typeof e.lastError === 'string' ? e.lastError : '',
      reason: e.reason === 'offline' ? 'offline' : 'denied',
    }));
}

export async function loadPending(): Promise<PendingMemberWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? sane(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

async function savePending(list: PendingMemberWrite[]): Promise<void> {
  try {
    if (!list.length) await AsyncStorage.removeItem(PENDING_KEY);
    else await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    /* depolama yoksa ( gizli sekme ) kuyruk uçucu kalır — üyelik yine de açılır */
  }
}

/** Kuyruğa alır; aynı e-posta için giriş tek kalır, sayaç sıfırlanmaz. */
export async function enqueuePendingWrite(
  doc: MemberDoc,
  opts: { reason: 'denied' | 'offline'; authUid?: string; error?: string }
): Promise<PendingMemberWrite[]> {
  const email = normalizeEmail(String(doc.email || doc.id || ''));
  const list = await loadPending();
  const prev = list.find(e => e.email === email);
  const entry: PendingMemberWrite = {
    email,
    doc,
    queuedAt: prev?.queuedAt || new Date().toISOString(),
    attempts: prev?.attempts || 0,
    nextTryAt: Date.now() + pendingDelayMs(prev?.attempts || 0),
    lastError: opts.error || (opts.reason === 'offline' ? 'ulaşılamadı' : 'kural reddi'),
    authUid: opts.authUid || prev?.authUid,
    reason: opts.reason,
  };
  const next = [entry, ...list.filter(e => e.email !== email)];
  await savePending(next);
  return next;
}

/**
 * Silinen hesabın buluttaki belgesi de silinememişse (kural reddi) bu kuyruğa
 * alınır — aksi halde “sildim” denen hesap bir sonraki kural yayınında geri çıkar.
 */
export async function enqueuePendingDelete(
  email: string,
  opts: { reason: 'denied' | 'offline'; error?: string } = { reason: 'denied' }
): Promise<PendingMemberWrite[]> {
  const key = normalizeEmail(String(email || ''));
  const list = await loadPending();
  const entry: PendingMemberWrite = {
    email: key,
    doc: { id: key, email: key } as MemberDoc,
    kind: 'delete',
    queuedAt: new Date().toISOString(),
    attempts: 0,
    nextTryAt: Date.now(),
    lastError: opts.error || '',
    reason: opts.reason,
  };
  const next = [entry, ...list.filter(e => e.email !== key)];
  await savePending(next);
  return next;
}

export async function clearPendingWrite(email: string): Promise<PendingMemberWrite[]> {
  const key = normalizeEmail(String(email || ''));
  const list = await loadPending();
  if (!list.some(e => e.email === key)) return list;
  const next = list.filter(e => e.email !== key);
  await savePending(next);
  return next;
}

export async function findPending(email: string): Promise<PendingMemberWrite | null> {
  const key = normalizeEmail(String(email || ''));
  const list = await loadPending();
  return list.find(e => e.email === key) || null;
}

/** Vadesi gelmiş girdiler (yazmayı denemek için). */
export function duePending(list: PendingMemberWrite[], now = Date.now()): PendingMemberWrite[] {
  return list.filter(e => Number(e.nextTryAt || 0) <= now);
}

export interface PendingSyncResult {
  /** Başarıyla buluta yazılan e-postalar. */
  pushed: string[];
  /** Kuyrukta kalan girdi sayısı. */
  held: number;
  /** Kuyruk tamamen boşaldı mı (panel/bildirim için). */
  drained: boolean;
  lastError: string;
  /** Son hata bir kural reddi mi (yayınlama gerekiyor demek). */
  denied: boolean;
}

/**
 * Kuyruğu boşaltmayı dener. `write` ağ işini yapar; `ok:false` dönerse girdi
 * geri çekilme gecikmesiyle kuyrukta kalır, `ok:true` dönerse silinir.
 */
export async function syncPending(
  write: (entry: PendingMemberWrite) => Promise<{ ok: boolean; reason?: string; error?: string }>,
  opts: { now?: number; onlyDue?: boolean } = {}
): Promise<PendingSyncResult> {
  const now = opts.now ?? Date.now();
  const list = await loadPending();
  const targets = opts.onlyDue === false ? list : duePending(list, now);
  const pushed: string[] = [];
  const failures: Record<string, { reason?: string; error?: string }> = {};
  for (const entry of targets) {
    let res: { ok: boolean; reason?: string; error?: string } = { ok: false, error: 'denenemedi' };
    try {
      res = await write(entry);
    } catch (e) {
      res = { ok: false, error: String(e) };
    }
    if (res.ok) pushed.push(entry.email);
    else failures[entry.email] = { reason: res.reason, error: res.error };
  }
  let held = list.length - pushed.length;
  if (targets.length) {
    const next = (await loadPending())
      .filter(e => !pushed.includes(e.email))
      .map(e => {
        const f = failures[e.email];
        if (!f) return e;
        const attempts = (Number(e.attempts) || 0) + 1;
        return {
          ...e,
          attempts,
          nextTryAt: now + pendingDelayMs(attempts),
          lastError: f.error || f.reason || 'yazma reddedildi',
          reason: (f.reason === 'offline' ? 'offline' : 'denied') as PendingMemberWrite['reason'],
        };
      });
    await savePending(next);
    held = next.length;
  }
  const firstFail = Object.values(failures)[0];
  return {
    pushed,
    held,
    drained: held === 0,
    lastError: pushed.length ? '' : firstFail?.error || '',
    denied: !pushed.length && firstFail?.reason !== 'offline',
  };
}
