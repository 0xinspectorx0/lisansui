/**
 * `courses/{courseId}/topics/{docId}` belgesinin BİÇİMİ — tek tanım.
 *
 * Tohumlama (`contentSeed`) ile panel düzenlemelerinin anlık yazması
 * (`cloudWrite`) aynı builder'ı kullanır: biçim iki yerde ayrı ayrı tanımlanırsa
 * `kpss_doc_keys_ok` ikinci yazmayı reddeder ve panel
 * düzenlemesi buluta hiç düşmez. Bu modül RN/Expo'ya dokunmaz; hafiftir.
 */
import { collectionPath } from './supabaseConfig';
import { arr, fbMap, FbValue, int, str } from './cloudApi';

const COURSES_COLLECTION_PATH = collectionPath('courses');

export interface QuestionLike {
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
  id?: string;
}

export interface TopicLike {
  id?: string;
  name?: string;
}

export function questionFields(topicDocId: string, index: number, q: QuestionLike): FbValue {
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

/** Konu belgesinin yolu — kurulum kök ya da legacy olabilir, ikisini de bilir. */
export function topicDocPathFor(courseId: string, docId: string): string {
  return `${COURSES_COLLECTION_PATH}/${courseId}/topics/${encodeURIComponent(docId)}`;
}

export function topicDocFields(
  courseId: string,
  docId: string,
  topic: TopicLike | undefined,
  list: QuestionLike[],
  order: number
): Record<string, FbValue> {
  return {
    id: str(topic?.id || docId),
    name: str(topic?.name || docId),
    courseId: str(courseId),
    order: int(order),
    questionCount: int(list.length),
    questions: arr(list.map((q, i) => questionFields(docId, i, q))),
    updatedAt: str(new Date().toISOString()),
    schemaVersion: int(1),
  };
}
