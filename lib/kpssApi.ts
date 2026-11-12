import { CourseId, Question, TopicMeta } from './types';
import {
  FALLBACK_QUESTIONS,
  INITIAL_DAILY_TIPS,
  INITIAL_TOPIC_CATALOG,
} from './seedData';
import { cleanKpssText, cleanOptionText } from './textUtils';

const FIRESTORE_PUBLIC_BASE =
  'https://firestore.googleapis.com/v1/projects/kpss-asistani/databases/(default)/documents/artifacts/kpss-asistani/public/data';

// Fast in-memory session caches
const topicQuestionsCache = new Map<string, Question[]>();
const catalogCache = new Map<CourseId, TopicMeta[]>();

function parseFirestoreQuestions(
  rawValues: any[],
  courseId: CourseId,
  topicDocId: string,
  topicName: string
): Question[] {
  const parsed: Question[] = [];
  for (let idx = 0; idx < rawValues.length; idx++) {
    const fields = rawValues[idx]?.mapValue?.fields;
    if (!fields) continue;
    const rawQuestion = fields.question?.stringValue;
    const optValues = fields.options?.arrayValue?.values;
    if (!rawQuestion || !Array.isArray(optValues)) continue;

    const options = optValues
      .map((v: any) => cleanOptionText(v?.stringValue || ''))
      .filter((s: string) => s.length > 0);

    if (options.length < 2) continue;

    const rawAns =
      fields.answer?.integerValue ??
      fields.answer?.doubleValue ??
      fields.answer?.stringValue ??
      0;
    const answer = Number.parseInt(String(rawAns), 10);
    const rawId =
      fields.id?.doubleValue ??
      fields.id?.integerValue ??
      fields.id?.stringValue ??
      `${topicDocId}_${idx}`;

    parsed.push({
      id: String(rawId),
      question: cleanKpssText(rawQuestion),
      options,
      answer: !Number.isNaN(answer) && answer >= 0 && answer < options.length ? answer : 0,
      explanation: cleanKpssText(fields.explanation?.stringValue || ''),
      courseId,
      topicDocId,
      topicName,
    });
  }
  return parsed;
}

export function getInitialCatalog(): Record<CourseId, TopicMeta[]> {
  return {
    tarih: catalogCache.get('tarih') || INITIAL_TOPIC_CATALOG.tarih || [],
    cografya: catalogCache.get('cografya') || INITIAL_TOPIC_CATALOG.cografya || [],
    turkce: catalogCache.get('turkce') || INITIAL_TOPIC_CATALOG.turkce || [],
    vatandaslik: catalogCache.get('vatandaslik') || INITIAL_TOPIC_CATALOG.vatandaslik || [],
    guncel: catalogCache.get('guncel') || INITIAL_TOPIC_CATALOG.guncel || [],
  };
}

/**
 * Fetches questions for a single topic document from kpssasistani.com live Firestore (~100ms),
 * caching in memory and falling back gracefully to bundled authentic questions if offline.
 */
export async function fetchTopicQuestions(
  courseId: CourseId,
  topicDocId: string,
  topicName?: string
): Promise<Question[]> {
  const cacheKey = `${courseId}:${topicDocId}`;
  const cached = topicQuestionsCache.get(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const url = `${FIRESTORE_PUBLIC_BASE}/courses/${courseId}/topics/${encodeURIComponent(
      topicDocId
    )}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    const fields = doc?.fields || {};
    const resolvedName = topicName || fields.name?.stringValue || topicDocId;
    const rawValues = fields.questions?.arrayValue?.values || [];
    const questions = parseFirestoreQuestions(
      rawValues,
      courseId,
      topicDocId,
      resolvedName
    );
    if (questions.length > 0) {
      topicQuestionsCache.set(cacheKey, questions);
      return questions;
    }
  } catch {
    // Offline fallback
  }

  const fallback = (FALLBACK_QUESTIONS[courseId] || []).map(q => ({
    ...q,
    courseId,
    question: cleanKpssText(q.question),
    explanation: cleanKpssText(q.explanation),
    options: q.options.map(cleanOptionText),
  }));
  return fallback;
}

/**
 * Refreshes topic list & live question counts for a course from kpssasistani.com
 */
export async function refreshCourseTopics(courseId: CourseId): Promise<TopicMeta[]> {
  try {
    const url = `${FIRESTORE_PUBLIC_BASE}/courses/${courseId}/topics?pageSize=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const docs = json?.documents || [];
    const topics: TopicMeta[] = docs.map((d: any) => {
      const docId = String(d.name || '').split('/').pop() || '';
      const f = d.fields || {};
      const id = f.id?.stringValue || docId;
      const name = f.name?.stringValue || docId;
      const rawValues = f.questions?.arrayValue?.values || [];
      if (rawValues.length > 0) {
        const parsed = parseFirestoreQuestions(rawValues, courseId, docId, name);
        if (parsed.length > 0) {
          topicQuestionsCache.set(`${courseId}:${docId}`, parsed);
        }
      }
      return {
        docId,
        id,
        name,
        questionCount: rawValues.length,
      };
    });

    topics.sort((a, b) =>
      a.name.localeCompare(b.name, 'tr', { numeric: true, sensitivity: 'base' })
    );

    if (topics.length > 0) {
      catalogCache.set(courseId, topics);
      return topics;
    }
  } catch {
    // Keep cached/seed catalog
  }
  return catalogCache.get(courseId) || INITIAL_TOPIC_CATALOG[courseId] || [];
}

/**
 * Builds a balanced mixed quiz across active topics of a single course
 */
export async function buildCourseMixedQuestions(
  courseId: CourseId,
  topics: TopicMeta[],
  count = 20
): Promise<Question[]> {
  const activeTopics = topics.filter(t => t.questionCount > 0);
  if (activeTopics.length === 0) {
    return (FALLBACK_QUESTIONS[courseId] || []).map(q => ({
      ...q,
      courseId,
      question: cleanKpssText(q.question),
      explanation: cleanKpssText(q.explanation),
    }));
  }

  // Pick up to 5 random active topics in parallel for fast <250ms loading
  const sampledTopics = [...activeTopics]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(5, activeTopics.length));

  const pools = await Promise.all(
    sampledTopics.map(t => fetchTopicQuestions(courseId, t.docId, t.name))
  );

  const combined = pools.flat();
  if (combined.length === 0) {
    return (FALLBACK_QUESTIONS[courseId] || []).map(q => ({
      ...q,
      courseId,
      question: cleanKpssText(q.question),
      explanation: cleanKpssText(q.explanation),
    }));
  }

  return [...combined].sort(() => Math.random() - 0.5).slice(0, count);
}

/**
 * Builds a KPSS Karma Deneme across all 5 courses (Tarih, Coğrafya, Türkçe, Vatandaşlık, Güncel)
 */
export async function buildGeneralMixedExam(
  catalog: Record<CourseId, TopicMeta[]>,
  totalQuestions = 25
): Promise<Question[]> {
  const courseIds: CourseId[] = ['tarih', 'turkce', 'cografya', 'vatandaslik', 'guncel'];
  const perCourse = Math.max(3, Math.ceil(totalQuestions / courseIds.length));

  const courseResults = await Promise.all(
    courseIds.map(async cid => {
      const active = (catalog[cid] || []).filter(t => t.questionCount > 0);
      if (active.length === 0) {
        return (FALLBACK_QUESTIONS[cid] || []).slice(0, perCourse).map(q => ({
          ...q,
          courseId: cid,
        }));
      }
      const chosenTopic = active[Math.floor(Math.random() * active.length)];
      const qs = await fetchTopicQuestions(cid, chosenTopic.docId, chosenTopic.name);
      return [...qs].sort(() => Math.random() - 0.5).slice(0, perCourse);
    })
  );

  return courseResults
    .flat()
    .sort(() => Math.random() - 0.5)
    .slice(0, totalQuestions);
}

/**
 * Syncs daily Hap Bilgiler from kpssasistani.com live Firestore
 */
export async function fetchLiveDailyTips(): Promise<string[]> {
  try {
    const res = await fetch(`${FIRESTORE_PUBLIC_BASE}/daily_tips/main`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const values = json?.fields?.list?.arrayValue?.values || [];
    const tips = values
      .map((v: any) => String(v?.stringValue || '').trim())
      .filter((s: string) => s.length > 3);
    if (tips.length > 0) return tips;
  } catch {
    // Offline fallback
  }
  return INITIAL_DAILY_TIPS;
}
