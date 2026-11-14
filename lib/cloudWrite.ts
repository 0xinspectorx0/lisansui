/**
 * Anlık bulut yazıları — panel düzenlemeleri ve üyelik politikası için tek yol.
 *
 * Kural: hiçbir şey cihazda "sonra gönderilmek üzere" bekletilmez. Panelde bir
 * soru/profil listesi değiştiği anda ilgili Supabase belgesine yazılır; politika
 * (kayıt açık mı, onay zorunlu mu, kotada kaç test) değiştiği anda
 * `meta/membership_policy` belgesine yazılır. Yazma başarısızsa ekranın üstünde
 * tek satır gerçek neden yazar ve "Yeniden dene" ile aynı işekrarlanır — böylece
 * "yalnızca bu cihazda var olan" veri birikmez.
 *
 * Yarış koruması: aynı belgeye üst üste gelen yazmalar bir zincirde
 * SIRAYA alınır (eşzamanlı PUT son yazanı belirsizleştirirdi). Gecikme yok,
 * yalnızca sıralama var.
 */
import { CourseId, Question, TopicMeta } from './types';
import {
  arr,
  bool,
  CloudOutcome,
  int,
  metaDocPaths,
  deleteDocument,
  putDocument,
  readDocument,
  str,
} from './cloudApi';
import { collectionPath } from './supabaseConfig';
import { topicDocFields, topicDocPathFor } from './contentDoc';
import { fetchTopicQuestions } from './kpssApi';
import { DEFAULT_MEMBERSHIP, MembershipConfig } from './adminStore';

/**
 * Politika belgesi: `meta` altında, okuması herkese açık. Kurulum kök ya da legacy
 * yolunda olabilir — `metaDocPaths` ikisini de verir; yazma yapılandırılan yola,
 * okuma sırayla ikisine de bakılır (kilit belgeyle aynı davranış).
 */
export const MEMBERSHIP_POLICY_NAME = 'meta/membership_policy';
export const MEMBERSHIP_POLICY_PATH = collectionPath(MEMBERSHIP_POLICY_NAME);

export type CloudWriteKind = 'policy' | 'topic' | 'tips';

export interface CloudWriteStatus {
  /** Kuyrukta sıra bekleyen/şu an yazan iş var mı? */
  busy: boolean;
  /** Son hatanın tek cümlelik metni (null = son yazma başarılı). */
  error: string | null;
  /** Hatanın sınıfı: kural reddi mi, ulaşılamazlık mı. */
  reason: 'denied' | 'offline' | 'error' | null;
  /** Son başarılı yazmanın ISO zamanı. */
  lastOkAt: string | null;
  /** Kaç iş bekliyor/başarısız durumda (panelde tek sayı). */
  failed: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();
const chains = new Map<string, Promise<void>>();
const lastJobs = new Map<string, { kind: CloudWriteKind; label: string; run: () => Promise<CloudOutcome<true>> }>();
const failures = new Map<string, string>();

let status: CloudWriteStatus = { busy: false, error: null, reason: null, lastOkAt: null, failed: 0 };

function emit(): void {
  const failed = failures.size;
  status = {
    ...status,
    busy: chains.size > 0,
    error: failed ? `${[...failures.values()][0]}` : null,
    reason: failed ? (status.error ? status.reason : null) : null,
    failed,
  };
  for (const l of listeners) l();
}

export function subscribeCloudWrite(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getCloudWriteStatus(): CloudWriteStatus {
  return status;
}

/** Bir işi aynı belge için sıraya koyar; anında başlar, sadece üst üste binmez. */
function enqueue(key: string, kind: CloudWriteKind, label: string, run: () => Promise<CloudOutcome<true>>): Promise<CloudOutcome<true>> {
  lastJobs.set(key, { kind, label, run });
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(async () => {
    let res: CloudOutcome<true> = { ok: false, reason: 'error', error: 'yazma çalıştırılamadı' };
    try {
      res = await run();
    } catch (e) {
      res = { ok: false, reason: 'error', error: String(e) };
    }
    if (res.ok) {
      failures.delete(key);
      status = { ...status, lastOkAt: new Date().toISOString() };
    } else {
      failures.set(
        key,
        `${label} → Supabase’e yazılamadı (${res.reason || 'bilinmiyor'}): ${res.error || 'neden ölçülemedi'}`
      );
      status = { ...status, reason: res.reason === 'offline' ? 'offline' : 'denied' };
    }
    emit();
    return res;
  });
  const tracked = next.then(
    () => undefined,
    () => undefined
  );
  chains.set(key, tracked);
  void tracked.finally(() => {
    // ancak kendi sırası bittiğinde çıkart: araya yeni bir iş girdiyse
    // `busy` bayrağı o iş bitene kadar doğru kalmalı.
    if (chains.get(key) === tracked) chains.delete(key);
    emit();
  });
  emit();
  return next;
}

/** Son HATALI işleri aynı sırayla yeniden dener (kural yayınlandıktan sonra tek dokunuş). */
export async function retryFailedWrites(): Promise<{ retried: number; ok: number }> {
  const keys = [...failures.keys()];
  let ok = 0;
  for (const key of keys) {
    const job = lastJobs.get(key);
    if (!job) continue;
    const res = await enqueue(key, job.kind, job.label, job.run);
    if (res.ok) ok += 1;
  }
  return { retried: keys.length, ok };
}

export function hasFailedWrites(): boolean {
  return failures.size > 0;
}

/* ------------------------------------------------------------------ topic */

/**
 * Konu belgesini anında yaz: `courses/{courseId}/topics/{docId}`.
 * Alan seti tohumlama ile BİREBİR aynıdır (`topicDocFields`) — iki yol arasında
 * biçim farkı olursa kurallar (`contentWriteOk`) ikinci yazmayı reddeder.
 */
export function writeTopicDoc(
  courseId: CourseId,
  docId: string,
  topic: TopicMeta | undefined,
  list: Question[],
  order: number
): Promise<CloudOutcome<true>> {
  const run = () => putDocument(topicDocPath(courseId, docId), topicDocFields(courseId, docId, topic, list, order));
  return enqueue(`topic:${courseId}/${docId}`, 'topic', `${courseId}/${docId} (${list.length} soru)`, run);
}

export function topicDocPath(courseId: CourseId, docId: string): string {
  return topicDocPathFor(courseId, docId);
}

/**
 * Konu BELGESİNİN metadata alanlarını (ad/sıra) günceller. Soru listesine
 * dokunmaz — listeyi önce buluttan okur, sonra aynı içerikle geri yazar; aksi
 * halde `topicDocFields` boş listeyle PUT yapıp soruları silerdi.
 */
export function writeTopicMeta(
  courseId: CourseId,
  docId: string,
  topic: TopicMeta | undefined,
  order: number
): Promise<CloudOutcome<true>> {
  const run = async (): Promise<CloudOutcome<true>> => {
    const list = await fetchTopicQuestions(courseId, docId, topic?.name).catch(() => [] as Question[]);
    return putDocument(topicDocPath(courseId, docId), topicDocFields(courseId, docId, topic, list, order));
  };
  return enqueue(`topicmeta:${courseId}/${docId}`, 'topic', `${courseId}/${docId} konu başlığı`, run);
}

/** Konu silindi: buluttaki belge de silinir (yerel liste kaynak değildir). */
export function deleteTopicDoc(courseId: CourseId, docId: string): Promise<CloudOutcome<true>> {
  const run = () => deleteDocument(topicDocPath(courseId, docId));
  return enqueue(`topicdel:${courseId}/${docId}`, 'topic', `${courseId}/${docId} konusu silindi`, run);
}

/** Ders belgesi (başlık/ikon/sıra/gizli) — panelde değiştiği anda yazılır. */
export function writeCourseDoc(
  courseId: CourseId,
  cfg: { title: string; icon: string; order: number; hidden: boolean }
): Promise<CloudOutcome<true>> {
  const fields = {
    id: str(courseId),
    title: str(cfg.title),
    icon: str(cfg.icon),
    order: int(cfg.order),
    hidden: bool(cfg.hidden),
    updatedAt: str(new Date().toISOString()),
    schemaVersion: int(1),
  };
  const path = `${collectionPath('courses')}/${courseId}`;
  return enqueue(`course:${courseId}`, 'topic', `${courseId} dersi`, () => putDocument(path, fields));
}

/* ------------------------------------------------------------------- tips */

export function writeTipsDoc(tips: string[]): Promise<CloudOutcome<true>> {
  const fields = {
    list: arr(tips.map(t => str(t))),
    updatedAt: str(new Date().toISOString()),
    schemaVersion: int(1),
  };
  return enqueue(
    'tips:main',
    'tips',
    `hap bilgiler (${tips.length} madde)`,
    () => putDocument(collectionPath('daily_tips/main'), fields)
  );
}

/* ----------------------------------------------------------------- policy */

export const POLICY_FIELDS = [
  'enforce',
  'freeTestsPerCourse',
  'cloudVip',
  'cloudMembers',
  'defaultTrialDays',
  'requireApproval',
  'registrationOpen',
  'updatedAt',
  'schemaVersion',
] as const;

export function policyToFields(cfg: MembershipConfig & { registrationOpen: boolean }): Record<string, any> {
  return {
    enforce: bool(cfg.enforce),
    freeTestsPerCourse: int(cfg.freeTestsPerCourse),
    cloudVip: bool(cfg.cloudVip),
    cloudMembers: bool(cfg.cloudMembers),
    defaultTrialDays: int(cfg.defaultTrialDays),
    requireApproval: bool(cfg.requireApproval),
    registrationOpen: bool(cfg.registrationOpen),
    updatedAt: str(new Date().toISOString()),
    schemaVersion: int(1),
  };
}

function readBool(f: Record<string, any>, key: string, fallback: boolean): boolean {
  const v = f?.[key]?.booleanValue;
  return typeof v === 'boolean' ? v : fallback;
}
function readNum(f: Record<string, any>, key: string, fallback: number): number {
  const raw = f?.[key]?.integerValue ?? f?.[key]?.doubleValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export interface PolicyRead {
  ok: boolean;
  /** Belge yoksa null; varsa alanları çözümlenmiş politik. */
  policy: (MembershipConfig & { registrationOpen: boolean }) | null;
  reason?: string;
  error?: string;
}

/**
 * Kayıt/giriş akışının doğru politikayı görmesi için tek okuma: bulut kazanır,
 * bulutta belge yoksa cihaz varsayılanı kullanılır (ve panelde "yalnız bu cihaz"
 * uyarısı çıkar).
 */
export async function readMembershipPolicy(): Promise<PolicyRead> {
  let last: PolicyRead = { ok: false, policy: null, reason: 'offline', error: 'politika okunamadı' };
  for (const path of metaDocPaths(MEMBERSHIP_POLICY_NAME)) {
    const res = await readDocument(path);
    if (res.ok && res.data) return { ok: true, policy: decodePolicy(res.data) };
    if (res.ok) last = { ok: true, policy: null };
    else last = { ok: false, policy: null, reason: res.reason, error: res.error };
  }
  return last;
}

function decodePolicy(
  f: Record<string, any>
): MembershipConfig & { registrationOpen: boolean } {
  return {
    enforce: readBool(f, 'enforce', DEFAULT_MEMBERSHIP.enforce),
    freeTestsPerCourse: readNum(f, 'freeTestsPerCourse', DEFAULT_MEMBERSHIP.freeTestsPerCourse),
    cloudVip: readBool(f, 'cloudVip', DEFAULT_MEMBERSHIP.cloudVip),
    cloudMembers: readBool(f, 'cloudMembers', DEFAULT_MEMBERSHIP.cloudMembers),
    defaultTrialDays: readNum(f, 'defaultTrialDays', DEFAULT_MEMBERSHIP.defaultTrialDays),
    requireApproval: readBool(f, 'requireApproval', DEFAULT_MEMBERSHIP.requireApproval),
    registrationOpen: readBool(f, 'registrationOpen', true),
  };
}

/** Politika değiştiği anda yazılır (debounce yok) — tüm cihazlar aynı kuralı görür. */
export function writeMembershipPolicy(
  cfg: MembershipConfig & { registrationOpen: boolean }
): Promise<CloudOutcome<true>> {
  const run = async () => {
    const paths = metaDocPaths(MEMBERSHIP_POLICY_NAME);
    let res: CloudOutcome<true> = { ok: false, reason: 'error', error: 'yol denenmedi' };
    for (const path of paths) {
      res = await putDocument(path, policyToFields(cfg));
      if (res.ok) return res;
      // 404/okuma-benzeri bir neden değilse (yani kural/yol uyuşmazlığıysa) diğer
      // aday yolu da deneriz: legacy kurulumlarda `meta` altı ikinci yolda durur.
      if (res.reason !== 'denied' && res.reason !== 'notfound') break;
    }
    return res;
  };
  return enqueue(
    'policy',
    'policy',
    `üyelik politikası (onay ${cfg.requireApproval ? 'zorunlu' : 'gerekmiyor'}, kayıt ${cfg.registrationOpen ? 'açık' : 'kapalı'})`,
    run
  );
}
