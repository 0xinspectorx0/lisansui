/**
 * Başka bir Supabase projesinden içerik kopyalama.
 * ==========================================================================
 * Panel "Diğer projeden içeriği kopyala" kartı bunu kullanır; terminalde script
 * çalıştırmaya gerek kalmasın diye akış uygulamanın içine alındı.
 *
 * Kapsam: aynı şemaya sahip İKİ Supabase projesi arasında taşımadır (geliştirme → üretim).
 * Hedef her zaman `config/supabaseApp.ts`'teki projedir; kaynak adresi panele
 * yazılır ve YALNIZ OKUMA için kullanılır. Kaynağın anon anahtarı gerekmez:
 * içerik satırları RLS'de herkese açık okunur (yazma değil).
 *
 * `fields` bloğu dönüştürülmez — soru formatı ve alan adları olduğu gibi taşınır.
 */
import { jsonToFields } from './sbGateway';
import { restBase } from './supabaseConfig';
import { putDocument, readDocument, listDocuments, type FbValue } from './cloudApi';
import { cloudTarget } from './supabaseConfig';

export interface CopySource {
  /** https://<ref>.supabase.co (ya da yalnız <ref>) */
  url: string;
}

/** Kaynak seçilmediğinde kullanılan varsayılan: deponun kendi ref'i (kendi kendine test). */
export const LEGACY_SOURCE: CopySource = { url: '' };

/** `https://x.supabase.co` / `x` → `https://x.supabase.co` */
export function normalizeSourceUrl(input: string): string {
  const raw = String(input || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9-]+$/i.test(raw)) return `https://${raw}.supabase.co`;
  return `https://${raw}`;
}

export function refOf(url: string): string {
  return String(url || '').replace(/^https?:\/\//, '').split('.')[0] || '';
}

/** Kaynağın REST tabanı — panelde "kaynak" satırı olarak gösterilir. */
export function sourceBase(src: CopySource): string {
  return restBase({ url: src.url } as any);
}

export function targetLabel(): string {
  const t = cloudTarget();
  return t.url ? `${refOf(t.url)} • şema:${t.schema || 'public'}` : '(bulut bağlı değil)';
}

export interface CopyDoc {
  /** `courses/{id}` | `courses/{id}/topics/{docId}` | `daily_tips/main` */
  path: string;
  json: Record<string, any>;
}

export interface CopyPlan {
  source: CopySource;
  courses: number;
  topics: number;
  tips: number;
  docs: CopyDoc[];
  notes: string[];
  error?: string;
}

export interface CopyProgress {
  done: number;
  total: number;
  questions: number;
  current: string;
}

export interface CopyResult {
  copied: number;
  questions: number;
  skipped: number;
  failed: string[];
  error?: string;
}

/* ------------------------------------------------------------------ okuma */

async function readSource(src: CopySource, path: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`${sourceBase(src)}/rpc/kpss_read_doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ p_path: path }),
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    if (Number(body?.status) !== 200 || !body?.fields) return null;
    return body.fields as Record<string, any>;
  } catch {
    return null;
  }
}

async function listSource(src: CopySource, prefix: string): Promise<CopyDoc[]> {
  const out: CopyDoc[] = [];
  let token = '';
  for (let page = 0; page < 20; page++) {
    let body: any = null;
    try {
      const res = await fetch(`${sourceBase(src)}/rpc/kpss_list_docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ p_prefix: prefix, p_page_size: 200, p_page_token: token }),
      });
      if (!res.ok) return out;
      body = await res.json();
    } catch {
      return out;
    }
    for (const d of Array.isArray(body?.documents) ? body.documents : []) {
      if (d?.name && d?.fields) out.push({ path: String(d.name), json: d.fields });
    }
    token = String(body?.nextPageToken || '');
    if (!token) break;
  }
  return out;
}

/**
 * Kaynağı tarar: dersler + her dersin konuları (sorularla birlikte) + hap bilgiler.
 * Okunamayan satır planı bozmaz; not olarak eklenir.
 */
export async function planCopy(input: string | CopySource): Promise<CopyPlan> {
  const src: CopySource = {
    url: typeof input === 'string' ? normalizeSourceUrl(input) : normalizeSourceUrl(input.url),
  };
  const notes: string[] = [];
  const docs: CopyDoc[] = [];
  const empty: CopyPlan = { source: src, courses: 0, topics: 0, tips: 0, docs, notes };
  if (!src.url) return { ...empty, error: 'Kaynak adresi boş.' };
  if (refOf(src.url) === refOf(cloudTarget().url)) {
    notes.push('Kaynak = hedef proje; kopyalanacak bir şey yok.');
  }

  const listed = await listSource(src, 'courses');
  if (!listed.length) {
    return { ...empty, error: 'Kaynak okunamadı ya da içerik boş.' };
  }
  for (const course of listed) {
    docs.push(course);
    const courseId = String(course.json?.id || course.path.split('/').pop() || '');
    const topics = await listSource(src, `courses/${courseId}/topics`);
    for (const t of topics) {
      const full = await readSource(src, t.path);
      docs.push({ path: t.path, json: full || t.json });
    }
    if (!topics.length) notes.push(`${courseId}: konu yok.`);
  }
  const tips = await readSource(src, 'daily_tips/main');
  if (tips) docs.push({ path: 'daily_tips/main', json: tips });
  else notes.push('hap bilgiler boş/okunamadı.');

  const plan: CopyPlan = {
    source: src,
    courses: docs.filter(d => /^courses\/[^/]+$/.test(d.path)).length,
    topics: docs.filter(d => /^courses\/[^/]+\/topics\/[^/]+$/.test(d.path)).length,
    tips: docs.filter(d => d.path === 'daily_tips/main').length,
    docs,
    notes,
  };
  return plan;
}

/* ------------------------------------------------------------------ yazma */

export function countQuestions(json: Record<string, any> | undefined): number {
  const arr = json?.questions;
  return Array.isArray(arr) ? arr.length : 0;
}

/**
 * Planı uygular. `skipExisting` açıkken hedefte satırları bulunan konu yeniden
 * yazılmaz (yarıda kesilen işi devam ettirmek için). Hedef yazımı RLS'e tabiidir:
 * içerik kilizi kapalı olmalı ya da yönetici oturumu gerekir.
 */
export async function runCopy(
  plan: CopyPlan,
  opts: { concurrency?: number; skipExisting?: boolean; onProgress?: (p: CopyProgress) => void } = {}
): Promise<CopyResult> {
  const jobs = plan.docs.slice().sort((a, b) => a.path.localeCompare(b.path));
  const out: CopyResult = { copied: 0, questions: 0, skipped: 0, failed: [] };
  if (!jobs.length) return { ...out, error: 'Kopyalanacak belge yok.' };

  const concurrency = Math.max(1, Math.min(8, opts.concurrency ?? 4));
  let cursor = 0;
  let done = 0;
  const tick = (current: string) =>
    opts.onProgress?.({ done, total: jobs.length, questions: out.questions, current });

  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      tick(job.path);
      try {
        if (opts.skipExisting) {
          const existing = await readDocument(job.path);
          if (existing.ok && existing.data) {
            out.skipped++;
            done++;
            tick(job.path);
            continue;
          }
        }
        const res = await putDocument(job.path, jsonToFields(job.json) as Record<string, FbValue>);
        if (res.ok) {
          out.copied++;
          out.questions += countQuestions(job.json);
        } else {
          out.failed.push(`${job.path} — ${res.error || res.reason || 'yazılamadı'}`);
        }
      } catch (e) {
        out.failed.push(`${job.path} — ${e instanceof Error ? e.message : 'hata'}`);
      }
      done++;
      tick(job.path);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (out.failed.length) {
    out.error = `${out.failed.length} belge yazılamadı — içerik kilizi kapalıyken ya da yönetici oturumuyla tekrar dene.`;
  }
  return out;
}

/** Panelde gösterilecek tek satırlık özet. */
export function describeCopyPlan(plan: CopyPlan): string {
  return (
    `${refOf(plan.source.url) || '(?)'} → ${targetLabel()} • ` +
    `${plan.courses} ders • ${plan.topics} konu • ${plan.tips} hap bilgi`
  );
}

/** Kopyalama sonrası doğrulama: hedefteki soru sayısı kaynakla aynı mı? */
export function verifyCopy(plan: CopyPlan, result: CopyResult): string {
  const planned = plan.docs.reduce((n, d) => n + countQuestions(d.json), 0);
  if (result.error) return `Doğrulanamadı: ${result.error}`;
  return result.questions === planned
    ? `Doğrulandı: ${result.copied}/${plan.docs.length} belge, ${result.questions} soru (kaynakla aynı).`
    : `Eksik: kaynak ${planned} soru, hedef ${result.questions} soru — "Var olanları atla" kapalıyken tekrar dene.`;
}

/** Listeleme yardımı (test:copy bunu sayı doğrulamasında kullanıyor). */
export async function countTargetTopics(courseId: string): Promise<number> {
  const res = await listDocuments(`courses/${courseId}/topics`, { pageSize: 200 });
  return res.ok ? res.data.length : -1;
}
