import { Question } from './types';

function capitalizeTurkish(text: string): string {
  if (!text) return '';
  const first = text.charAt(0);
  return first.toLocaleUpperCase('tr-TR') + text.slice(1);
}

/**
 * Cleans AI/source-material artifacts found in kpssasistani.com question & explanation texts
 * (e.g. "Kaynak metne göre", "Metinde geçen", etc.) so questions read like clean ÖSYM items.
 */
export function cleanKpssText(raw: string | undefined | null): string {
  if (!raw) return '';
  const lines = raw
    .split('\n')
    .map(line => {
      const stripped = line
        .replace(
          /^[\s""«»\u201c\u201d]*(Kaynak metinde geçen|Kaynak metinde belirtilen|Kaynak metne göre|Kaynak metin'de|Kaynak metinde|Kaynak metin\s*,?|Metinde yer alan bilgilere göre|Metinde bahsedilen|Metinde geçen|Metne göre|Kaynağa göre)[\s""«»\u201c\u201d,:]*/i,
          ''
        )
        .replace(
          /\s*(kaynak metne göre|kaynak metinde belirtilen|kaynak metinde geçen|metne göre|kaynağa göre)\s*/gi,
          ' '
        )
        .replace(/\s{2,}/g, ' ')
        .trim();
      return stripped ? capitalizeTurkish(stripped) : '';
    })
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''));

  return lines.join('\n').trim();
}

export function cleanOptionText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/^[A-Ea-e][\)\.\-]\s*/, '')
    .replace(/\*\*$/g, '')
    .trim();
}

/**
 * KPSS Standard Net Formula: Doğru - (Yanlış / 4)
 */
export function calcKpssNet(correct: number, wrong: number): number {
  const raw = correct - wrong * 0.25;
  return Math.round(raw * 100) / 100;
}

export function formatNet(net: number): string {
  if (Number.isInteger(net)) return String(net);
  return net.toFixed(2).replace(/\.?0+$/, '');
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function shuffleQuestionOptions(q: Question): Question {
  if (!q.options || q.options.length === 0) return q;
  const cleanedOptions = q.options.map(cleanOptionText).filter(Boolean);
  if (cleanedOptions.length === 0) return q;
  const safeAnswerIdx =
    q.answer >= 0 && q.answer < cleanedOptions.length ? q.answer : 0;
  const correctText = cleanedOptions[safeAnswerIdx];
  const shuffled = [...cleanedOptions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const newAnswer = shuffled.indexOf(correctText);
  return {
    ...q,
    question: cleanKpssText(q.question),
    explanation: cleanKpssText(q.explanation),
    options: shuffled,
    answer: newAnswer >= 0 ? newAnswer : 0,
  };
}

export function prepareQuizQuestions(
  questions: Question[],
  shuffleOrder = true,
  shuffleOpts = true
): Question[] {
  const valid = questions.filter(
    q => q && q.question && Array.isArray(q.options) && q.options.filter(Boolean).length >= 2
  );
  const ordered = shuffleOrder
    ? [...valid].sort(() => Math.random() - 0.5)
    : [...valid];
  return ordered.map(q =>
    shuffleOpts
      ? shuffleQuestionOptions(q)
      : {
          ...q,
          question: cleanKpssText(q.question),
          explanation: cleanKpssText(q.explanation),
          options: q.options.map(cleanOptionText),
        }
  );
}
