/**
 * Firestore içerik tohumlaması (bootstrap).
 *
 * Yeni bir projede klasör/koleksiyon isimlerini Console'da tek tek açmak yerine
 * yapıyı uygulama yazar:
 *
 *   {root}/courses                     → bir belge/ders (başlık, ikon, sıra)
 *   {root}/courses/{courseId}/topics   → bir belge/konu (ad + soru dizisi)
 *   {root}/daily_tips/main             → hap bilgi listesi
 *   {root}/memberships/{e-posta}       → üyeliği UYGULAMA oluşturur (kayıt anında)
 *
 * Yazma yetkisi `firestore.rules` içindeki `contentWriteOk` ile sınırlandırılmıştır:
 * `meta/content_lock` belgesi Console'dan oluşturulana kadar içerik koleksiyonlarına
 * yazılabilir, sonra kilitlenir. Kilit belgesini uygulama YAZAMAZ (rules izin vermez),
 * bu yüzden buton yalnızca yolu gösterir.
 *
 * Yazılan sorular "uygulamanın şu anda gördüğü" içeriklerdir: paneldeki
 * override'lar → canlı Firestore → repodaki yedek sorular (seçmeli).
 */
import { COURSES } from './theme';
import {
  ALL_COURSE_IDS,
  applyAdminTips,
  getAdminState,
  getQuestionsOverride,
} from './adminStore';
import { fetchLiveDailyTips, fetchTopicQuestions, getInitialCatalog } from './kpssApi';
import { FALLBACK_QUESTIONS } from './seedData';
import {
  arr,
  bool,
  documentExists,
  fbMap,
  int,
  putDocument,
  str,
  type CloudOutcome,
  type FbValue,
} from './firestoreApi';
import { collectionPath, firestoreTarget } from './firebaseConfig';
import type { CourseId, TopicMeta } from './types';

export const CONTENT_LOCK_PATH = collectionPath('meta/content_lock');
export const COURSES_COLLECTION = collectionPath('courses');
export const TIPS_DOC_PATH = collectionPath('daily_tips/main');

export interface SeedDoc {
  /** Tam belge yolu (root dahil) — Firestore REST yolu. */
  path: string;
  label: string;
  kind: 'course' | 'topic' | 'tips';
  fields: Record<string, FbValue>;
}

export interface SeedPlan {
  docs: SeedDoc[];
  courses: number;
  topics: number;
  questions: number;
  tips: number;
  /** İçerik yazımı açık mı (kilit yok mu)? null = kontrol edilemedi. */
  unlocked: boolean | null;
  target: string;
  notes: string[];
}

export interface SeedProgress {
  done: number;
  total: number;
  current: string;
}

export interface SeedResult {
  written: number;
  failed: { path: string; error: string }[];
}

export interface SeedOptions {
  /** Panelden hiç dokunulmamış konulara repodaki örnek soruları da yaz. */
  includeFallbackQuestions?: boolean;
  /** Sadece bu dersleri tohumla (varsayılan: görünen tüm dersler). */
  courseIds?: CourseId[];
  /** `courses/{id}` üst belgelerini yazma. */
  skipCourseDocs?: boolean;
}

async function contentUnlocked(): Promise<boolean | null> {
  const state = await documentExists(CONTENT_LOCK_PATH);
  return state === null ? null : state === false;
}

function questionFields(
  topicDocId: string,
  index: number,
  q: { question: string; options: string[]; answer: number; explanation?: string; id?: string }
): FbValue {
  return fbMap({
    // Konu kimliğiyle adlandır: aynı yedek soru birden fazla konuya yazılsa bile
    // uygulama genelinde soru kimlikleri çakışmaz.
    id: str(`${topicDocId}::${q.id || index}`),
    question: str(q.question),
    options: arr((q.options || []).map(o => str(o))),
    answer: int(q.answer ?? 0),
    explanation: str(q.explanation || ''),
  });
}

/** Yazılacak belge listesini hazırlar; hiçbir ağ yazımı yapmaz. */
export async function buildSeedPlan(opts: SeedOptions = {}): Promise<SeedPlan> {
  const notes: string[] = [];
  const target = firestoreTarget();
  const catalog = getInitialCatalog();
  const state = getAdminState();
  const titles = state.content.courseTitles || {};
  const hidden = state.content.hiddenCourses || [];
  const ordered = (state.content.courseOrder || ALL_COURSE_IDS).filter(id => !!catalog[id]);
  const courseIds = (opts.courseIds && opts.courseIds.length ? opts.courseIds : ordered).filter(
    id => !!catalog[id]
  );
  if (!opts.courseIds?.length && hidden.length) {
    notes.push(`panelde gizli ${hidden.length} ders de plana dahil (Firestore listesi görünür)`);
  }

  const docs: SeedDoc[] = [];
  let questions = 0;

  if (!opts.skipCourseDocs) {
    courseIds.forEach((id, index) => {
      const cfg = (COURSES as Record<CourseId, { title: string; icon: string }>)[id];
      const order = ordered.indexOf(id) >= 0 ? ordered.indexOf(id) : index;
      docs.push({
        path: `${COURSES_COLLECTION}/${id}`,
        label: `ders • ${cfg?.title || id}`,
        kind: 'course',
        fields: {
          id: str(id),
          title: str(titles[id] || cfg?.title || id),
          icon: str(cfg?.icon || 'book-outline'),
          order: int(order),
          hidden: bool(hidden.includes(id)),
          updatedAt: str(new Date().toISOString()),
          schemaVersion: int(1),
        },
      });
    });
  }

  for (const courseId of courseIds) {
    const topics: TopicMeta[] = catalog[courseId] || [];
    if (!topics.length) {
      notes.push(`${courseId}: konu listesi boş, atlandı`);
      continue;
    }
    for (let index = 0; index < topics.length; index++) {
      const topic = topics[index];
      const override = getQuestionsOverride(courseId, topic.docId);
      let list = override;
      if (!list) {
        // Uygulamanın gördüğü set: panel override'ı → canlı → repo yedeği.
        const live = await fetchTopicQuestions(courseId, topic.docId, topic.name);
        list = live.length ? live : [];
      }
      if (!list.length && opts.includeFallbackQuestions) {
        list = (FALLBACK_QUESTIONS[courseId] || []) as unknown as typeof list;
      }
      if (!list.length) {
        notes.push(`${courseId}/${topic.docId}: soru yok (sadece konu başlığı yazılacak)`);
      }
      questions += list.length;
      docs.push({
        path: `${COURSES_COLLECTION}/${courseId}/topics/${encodeURIComponent(topic.docId)}`,
        label: `konu • ${topic.name || topic.docId} (${list.length} soru)`,
        kind: 'topic',
        fields: {
          id: str(topic.id || topic.docId),
          name: str(topic.name || topic.docId),
          courseId: str(courseId),
          order: int(index),
          questionCount: int(list.length),
          questions: arr(list.map((q, i) => questionFields(topic.docId, i, q))),
          updatedAt: str(new Date().toISOString()),
          schemaVersion: int(1),
        },
      });
    }
  }

  const tips = applyAdminTips(await fetchLiveDailyTips());
  docs.push({
    path: TIPS_DOC_PATH,
    label: `hap bilgiler • ${tips.length} madde`,
    kind: 'tips',
    fields: {
      list: arr(tips.map(t => str(t))),
      updatedAt: str(new Date().toISOString()),
      schemaVersion: int(1),
    },
  });

  return {
    docs,
    courses: courseIds.length,
    topics: docs.filter(d => d.kind === 'topic').length,
    questions,
    tips: tips.length,
    unlocked: await contentUnlocked(),
    target: `${target.projectId}${target.root ? ` • ${target.root}` : ' • (kök)'}`,
    notes: notes.slice(0, 12),
  };
}

/** Planı sınırlı eşzamanlılıkla Firestore'a yazar. */
export async function runSeed(
  docs: SeedDoc[],
  onProgress?: (p: SeedProgress) => void
): Promise<SeedResult> {
  const result: SeedResult = { written: 0, failed: [] };
  const queue = [...docs];
  const workers = Array.from({ length: Math.min(6, queue.length || 1) }, async () => {
    for (;;) {
      const doc = queue.shift();
      if (!doc) return;
      onProgress?.({
        done: result.written + result.failed.length,
        total: docs.length,
        current: doc.label,
      });
      const res: CloudOutcome<true> = await putDocument(doc.path, doc.fields);
      if (res.ok) result.written++;
      else result.failed.push({ path: doc.path, error: res.error });
    }
  });
  await Promise.all(workers);
  onProgress?.({ done: docs.length, total: docs.length, current: 'bitti' });
  return result;
}

/** `meta/content_lock` durumu: 'open' = yazılabilir, 'locked' = dondurulmuş. */
export async function readLockState(): Promise<'open' | 'locked' | 'unknown'> {
  const state = await documentExists(CONTENT_LOCK_PATH);
  if (state === null) return 'unknown';
  return state ? 'locked' : 'open';
}

/** Plan hazırlarken kullanılan kök açıklaması (panelde gösterilir). */
export const SEED_TARGET_DESCRIPTION = `${COURSES_COLLECTION} + ${TIPS_DOC_PATH}`;

/** Boyut uyarıları: REST tek istekte çok büyük gövde kabul etmeyebilir. */
export function planWarnings(plan: SeedPlan): string[] {
  const out: string[] = [];
  if (plan.docs.length > 400) {
    out.push(
      `${plan.docs.length} belge yazılacak — panelde ders ders ilerletmen daha güvenli.`
    );
  }
  if (plan.unlocked === false) {
    out.push('İçerik kilidi aktif: meta/content_lock belgesini silmeden yazamazsın.');
  }
  if (plan.unlocked === null) {
    out.push('Kilit durumu okunamadı (ağ/rules). Yine de yazmayı deneyebilirsin.');
  }
  const biggest = plan.docs
    .map(d => ({
      label: d.label,
      n: (((d.fields.questions as any)?.arrayValue?.values as unknown[]) || []).length,
    }))
    .sort((a, b) => b.n - a.n)[0];
  if (biggest && biggest.n > 1500) {
    out.push(`En kalabalık belge ${biggest.n} soru içeriyor (${biggest.label}).`);
  }
  return out;
}

/** Toplam soru/ad belgesi sayısını tek satırda özetler (panel alt başlığı). */
export function describePlan(plan: SeedPlan): string {
  return `${plan.courses} ders • ${plan.topics} konu • ${plan.questions} soru • ${plan.tips} hap bilgi`;
}
