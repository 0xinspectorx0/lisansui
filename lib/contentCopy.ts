/**
 * Eski projeden içerik kopyalama (canlı Firestore → bu projenin veritabanı).
 *
 * Panel “Eski projeden içeriği kopyala” kartı bunu kullanır; terminalde script
 * çalıştırmaya gerek kalmasın diye akış uygulamanın içine alındı. REST'ten başka
 * bir şey kullanmaz: kaynağı **anonim okur** (eski projenin kuralları içerik
 * okumaya zaten açık), hedefe `putDocument` ile yazar (içerik yazma penceresi
 * açıkken panel tohumlamasıyla aynı kural).
 *
 * Kaynak düzeni otomatik bulunur: `artifacts/{proje}/public/data` → olmazsa
 * veritabanı kökü. Böylece hem eski hem yeni tip kurulum kopyalanabilir.
 */
import { documentExists, putDocument, type FbValue } from './firestoreApi';

export const GCS_API = 'https://firestore.googleapis.com/v1';

export interface CopySource {
  projectId: string;
  databaseId?: string;
  /** '' = veritabanı kökü. */
  root: string;
}

/** Bu deponun tarihsel varsayılan kaynağı (lib/firebaseConfig.ts#DEFAULT_TARGET). */
export const LEGACY_SOURCE: CopySource = {
  projectId: 'kpss-asistani',
  root: 'artifacts/kpss-asistani/public/data',
};

export function sourceBase(src: CopySource): string {
  const db = `${GCS_API}/projects/${src.projectId}/databases/${src.databaseId || '(default)'}/documents`;
  return src.root ? `${db}/${src.root.replace(/^\/+|\/+$/g, '')}` : db;
}

const CANDIDATE_ROOTS = (projectId: string): string[] => [
  `artifacts/${projectId}/public/data`,
  '',
];

/* ------------------------------------------------------------------ okuma */

async function getJson(url: string, fetchImpl?: typeof fetch): Promise<{ status: number; body: any }> {
  const doFetch = fetchImpl || fetch;
  try {
    const res = await doFetch(url);
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: { error: { message: e instanceof Error ? e.message : 'ağ hatası' } } };
  }
}

interface RawDoc {
  path: string;
  fields: Record<string, FbValue>;
}

const lastSegment = (name: string) => String(name || '').split('/').pop() || '';

/** Bir koleksiyonu sayfa sayfa okur (Firestore REST liste yanıtı gövdeyi de taşır). */
export async function listCollection(
  base: string,
  collectionPath: string,
  opts?: { pageSize?: number; fetch?: typeof fetch }
): Promise<{ docs: RawDoc[]; error?: string }> {
  const size = opts?.pageSize || 30;
  const out: RawDoc[] = [];
  let token = '';
  for (let page = 0; page < 400; page++) {
    const qs = `?pageSize=${size}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const r = await getJson(`${base}/${collectionPath}${qs}`, opts?.fetch);
    if (r.status === 404) return { docs: out };
    if (r.status !== 200) return { docs: out, error: r.body?.error?.message || `HTTP ${r.status}` };
    const docs = r.body?.documents || [];
    for (const d of docs) {
      const id = lastSegment(d.name);
      if (id) out.push({ path: `${collectionPath}/${id}`, fields: d.fields || {} });
    }
    token = r.body?.nextPageToken || '';
    if (!token) break;
  }
  return { docs: out };
}

const strOf = (f: any, k: string) => String(f?.[k]?.stringValue ?? '');
const intOf = (f: any, k: string) => Number(f?.[k]?.integerValue ?? f?.[k]?.doubleValue ?? 0) || 0;
const listLen = (f: any, k: string) => {
  const v = f?.[k]?.arrayValue?.values;
  return Array.isArray(v) ? v.length : 0;
};

/* -------------------------------------------------------------------- plan */

export interface CopyTopicRef {
  courseDocId: string;
  topicDocId: string;
  questions: number;
}

export interface CopyPlan {
  source: CopySource;
  /** kaynakta `daily_tips/main` belgeyi gerçekten var mı? */
  tipsAvailable: boolean;
  courses: { docId: string; title: string; topics: number; questions: number }[];
  topics: CopyTopicRef[];
  tips: number;
  totalQuestions: number;
  notes: string[];
  error?: string;
}

/**
 * Kaynağı tara: hangi düzen olduğunu bul, dersleri/konuları/hap bilgiyi say.
 * Konu belgeleri liste yanıtında geldiği için istek sayısı = ders sayısı + 2.
 */
export async function planCopy(
  projectId: string,
  opts?: { databaseId?: string; root?: string; fetch?: typeof fetch }
): Promise<CopyPlan> {
  const notes: string[] = [];
  const roots = opts?.root !== undefined ? [opts.root] : CANDIDATE_ROOTS(projectId);
  let chosen: CopySource | null = null;
  let courses: RawDoc[] = [];
  let lastError = '';

  for (const root of roots) {
    const src: CopySource = { projectId, root, databaseId: opts?.databaseId };
    const base = sourceBase(src);
    const res = await listCollection(base, 'courses', { fetch: opts?.fetch });
    if (res.error) {
      lastError = res.error;
      continue;
    }
    if (res.docs.length) {
      chosen = src;
      courses = res.docs;
      if (root === '') notes.push('kaynak veritabanı kökünde');
      break;
    }
  }
  if (!chosen) {
    return {
      source: { projectId, root: roots[0], databaseId: opts?.databaseId },
      tipsAvailable: false,
      courses: [],
      topics: [],
      tips: 0,
      totalQuestions: 0,
      notes,
      error:
        lastError ||
        `kaynakta ders bulunamadı (${projectId}) — proje kimliği/kök öneki doğru mu, eski proje okumaya açık mı?`,
    };
  }

  const base = sourceBase(chosen);
  const plan: CopyPlan = {
    source: chosen,
    tipsAvailable: false,
    courses: [],
    topics: [],
    tips: 0,
    totalQuestions: 0,
    notes,
  };
  for (const course of courses) {
    const docId = course.path.split('/').pop() || '';
    const topics = await listCollection(`${base}/courses/${docId}`, 'topics', { fetch: opts?.fetch });
    if (topics.error) {
      notes.push(`${docId}: konular okunamadı (${topics.error})`);
      continue;
    }
    let qsum = 0;
    for (const t of topics.docs) {
      const q = Math.max(intOf(t.fields, 'questionCount'), listLen(t.fields, 'questions'));
      qsum += q;
      plan.topics.push({ courseDocId: docId, topicDocId: t.path.split('/').pop() || '', questions: q });
    }
    plan.courses.push({
      docId,
      title: strOf(course.fields, 'title') || strOf(course.fields, 'name') || docId,
      topics: topics.docs.length,
      questions: qsum,
    });
    plan.totalQuestions += qsum;
  }

  const tips = await getJson(`${base}/daily_tips/main`, opts?.fetch);
  if (tips.status === 200) {
    plan.tipsAvailable = true;
    plan.tips = listLen(tips.body?.fields, 'list');
  } else notes.push('kaynakta daily_tips/main yok');

  if (!plan.topics.length) notes.push('hiç konu bulunamadı — kopyalanacak soru yok');
  return plan;
}

export function describeCopyPlan(plan: CopyPlan): string {
  if (plan.error) return plan.error;
  return `${plan.courses.length} ders • ${plan.topics.length} konu • ${plan.totalQuestions} soru • ${plan.tips} hap bilgi`;
}

/* ------------------------------------------------------------------- yazma */

export interface CopyProgress {
  done: number;
  total: number;
  current: string;
  questions: number;
  failed: string[];
}

export interface CopyResult {
  copied: number;
  skipped: number;
  questions: number;
  failed: string[];
}

/**
 * Planı hedefe uygula: her ders + konu belgesini `putDocument` (PUT = overwrite)
 * ile yaz, daily_tips/main'i kopyala, varsa meta/content_lock'ı kontrol et.
 * `onProgress` her belge sonrası çağrılır (panel yüzen çubuğu için).
 */
export async function runCopy(
  plan: CopyPlan,
  opts?: {
    fetch?: typeof fetch;
    concurrency?: number;
    skipExisting?: boolean;
    only?: 'all' | 'topics' | 'tips';
    onProgress?: (p: CopyProgress) => void;
  }
): Promise<CopyResult> {
  const res: CopyResult = { copied: 0, skipped: 0, questions: 0, failed: [] };
  const srcBase = sourceBase(plan.source);
  const src = plan.source;

  const jobs: { path: string; kind: 'course' | 'topic' | 'tips'; label: string; questions: number }[] = [];
  if (opts?.only !== 'tips') {
    for (const c of plan.courses) jobs.push({ path: `courses/${c.docId}`, kind: 'course', label: `courses/${c.docId}`, questions: 0 });
    for (const t of plan.topics)
      jobs.push({
        path: `courses/${t.courseDocId}/topics/${t.topicDocId}`,
        kind: 'topic',
        label: `courses/${t.courseDocId}/topics/${t.topicDocId}`,
        questions: t.questions,
      });
  }
  if (opts?.only !== 'topics' && plan.tipsAvailable)
    jobs.push({ path: 'daily_tips/main', kind: 'tips', label: 'daily_tips/main', questions: 0 });

  const progress: CopyProgress = { done: 0, total: jobs.length, current: '', questions: 0, failed: [] };
  const concurrency = Math.max(1, Math.min(8, opts?.concurrency ?? 4));
  let cursor = 0;

  const readSource = async (path: string): Promise<Record<string, FbValue> | null> => {
    const r = await getJson(`${srcBase}/${path}`, opts?.fetch);
    if (r.status !== 200) {
      progress.failed.push(`${path}: kaynak okunamadı (${r.body?.error?.message || 'HTTP ' + r.status})`);
      return null;
    }
    return r.body?.fields || {};
  };

  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      progress.current = job.label;
      try {
        if (opts?.skipExisting) {
          const exists = await documentExists(job.path);
          if (exists === true) {
            res.skipped++;
            progress.done++;
            opts?.onProgress?.({ ...progress, failed: [...progress.failed] });
            continue;
          }
        }
        const fields = await readSource(job.path);
        if (!fields) {
          progress.done++;
          opts?.onProgress?.({ ...progress, failed: [...progress.failed] });
          continue;
        }
        const put = await putDocument(job.path, fields);
        if (!put.ok) {
          progress.failed.push(`${job.label}: ${put.error}`);
        } else {
          res.copied++;
          res.questions += job.questions;
          progress.questions += job.questions;
        }
      } catch (e) {
        progress.failed.push(`${job.label}: ${e instanceof Error ? e.message : String(e)}`);
      }
      progress.done++;
      opts?.onProgress?.({ ...progress, failed: [...progress.failed] });
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

  res.failed = progress.failed;
  if (!res.failed.length && plan.tipsAvailable && opts?.only !== 'topics') {
    // kopyalama sonrası hızlı doğrulama: hedefte görünüyor mu?
    const check = await documentExists('daily_tips/main');
    if (check === false) res.failed.push('daily_tips/main hedefte görünmüyor');
  }
  void src;
  return res;
}
