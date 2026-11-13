/**
 * Toplu soru ayrıştırıcısı (admin paneli → Soru Havuzu → "Toplu ekle").
 *
 * İki format kabul edilir:
 *  1) JSON: [{ "question": "...", "options": ["A","B","C","D"], "answer": 1, "explanation": "..." }, ...]
 *     `answer` sayı (0 tabanlı — uygulamanın kendi şeması), harf ("B") veya şıkkın metni
 *     olabilir; `options`
 *     dizi ya da { A: "...", B: "..." } nesnesi ya da satırlara bölünmüş metin olabilir.
 *     Sarmalama serbest: [{...}] , {"questions":[{...}]}, {"sorular":[...]}, {"items":[...]}.
 *  2) Düz metin: soru blokları boş satırla ayrılır
 *       Hangi şık...?
 *       A) ilk
 *       B) ikinci
 *       C) üçüncü
 *       D) dördüncü
 *       Doğru: B
 *       Açıklama: burada kısa gerekçe
 *     "Doğru:" yerine "Cevap/Answer/Yanıt" da olur. Şık işareti A-E harfi, "1)" veya
 *     madde imi (-, *, •) olabilir. Şıkkın başındaki * / ✓ işareti doğru cevabı belirtir.
 *
 * Bu dosya bilinçli olarak React Native hiçbir şey import etmiyor:
 * scripts/bulk-contract.sh ile doğrudan node'da test ediliyor.
 */

export interface BulkQuestion {
  /** JSON'dan geldiyse korunur; ekran çakışan/boş id'leri kendisi üretir. */
  id: string;
  question: string;
  options: string[];
  /** 0 tabanlı doğru şık indeksi. */
  answer: number;
  explanation: string;
}

export interface BulkIssue {
  /** 1 tabanlı blok/satır sıra numarası. */
  block: number;
  message: string;
  excerpt?: string;
}

export interface BulkParseResult {
  format: 'json' | 'text' | 'empty';
  items: BulkQuestion[];
  issues: BulkIssue[];
  /** Okunan blok sayısı (hatalılar dahil). */
  blocks: number;
  /** Aynı soru metni tekrarlıysa atlanan kayıt sayısı. */
  duplicates: number;
  /** maxItems aşıldıysa true. */
  truncated: boolean;
}

export const BULK_LETTERS = ['A', 'B', 'C', 'D', 'E'];
export const BULK_DEFAULT_MAX = 500;

// A-H aralığında yakalanır: 6+ şık gelirse buildQuestion 'en fazla 5 şık' diye
// reddetsin (yalnız A-E'ye baksa idi, F şıkkı hiç görülmeden kaybolurdu).
const OPTION_LETTER = /^\s*([A-Ha-h])\s*[).:\-–—]\s*(.*)$/;
const OPTION_DIGIT = /^\s*([1-5])\s*[).:\-–—]\s*(.*)$/;
const OPTION_BULLET = /^\s*[•\-*–]\s+(.*)$/;
const ANSWER_LINE = /^\s*(doğru|dogru|cevap|answer|yanıt|yanit|correct|correctAnswer)\s*[:=]\s*(.*)$/i;
const EXPLAIN_LINE = /^\s*(açıklama|aciklama|explanation|solution|çözüm|cozum|gerekçe|gerekce|ipucu|hint)\s*[:=]\s?(.*)$/i;
const QUESTION_PREFIX = /^\s*(?:soru|question)\s*[:#-]?\s*/i;
const NUM_PREFIX = /^\s*\d{1,4}\s*[).]\s*/;

const trim = (s: string) => s.replace(/\s+/g, ' ').trim();
const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

/** "a)" / "A - " / "1." gibi önekleri ve tırnak/nokta farklarını yok eden karşılaştırma anahtarı. */
function norm(s: string): string {
  return lower(
    s
      .replace(OPTION_LETTER, '$2')
      .replace(OPTION_DIGIT, '$2')
      .replace(/[.,;:!?'’"“”()\[\]\s]+/g, '')
  );
}

/** Şıkkın başındaki/sonundaki * ✓ işareti doğru cevabı söyler; metinden temizlenir. */
function takeStarMarker(raw: string): { text: string; marked: boolean } {
  const s = raw.trim();
  if (/^[*✓✔†]/.test(s)) return { text: s.slice(1).trim(), marked: true };
  if (/[*✓✔]$/.test(s)) return { text: s.slice(0, -1).trim(), marked: true };
  return { text: s, marked: false };
}

/**
 * "Doğru: B" / "Cevap: 2" satırındaki değeri şık indeksine çevirir.
 * El yazımı metinde sayı 1 tabanlı okunur ("Cevap: 2" → B şıkkı); JSON'da ise 0 tabanlı
 * kabul edilir (aşağıdaki parseJsonObject).
 */
export function resolveAnswerToken(token: string, options: string[]): number | null {
  const t = trim(token).replace(/[.:]$/, '');
  if (!t) return null;
  const letter = /^([A-Ea-e])(?:\s*(?:şıkk|secenek|şık))?[.]?$/.exec(t);
  if (letter) {
    const i = BULK_LETTERS.indexOf(letter[1].toUpperCase());
    if (i >= 0 && i < options.length) return i;
  }
  if (/^[0-5]$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= options.length) return n - 1; // "2" → 1. şık
    if (n === 0 && options.length > 0) return 0; // "0" → A şıkkı
  }
  if (/^[0-5][0-9]+$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= options.length) return n - 1;
  }
  const key = norm(t);
  if (key.length > 1) {
    const hit = options.findIndex(o => norm(o) === key);
    if (hit >= 0) return hit;
    const partial = options.findIndex(o => norm(o).includes(key) || key.includes(norm(o)));
    if (partial >= 0 && options.filter(o => norm(o).includes(key) || key.includes(norm(o))).length === 1) return partial;
  }
  return null;
}

function cleanOptions(input: unknown): { options: string[]; marked: number | null } {
  let raw: string[] = [];
  if (Array.isArray(input)) {
    raw = input.map(v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''));
  } else if (typeof input === 'string') {
    raw = input.split(/\r?\n|;|\u2022/);
  } else if (input && typeof input === 'object') {
    const rec = input as Record<string, unknown>;
    const byLetter = BULK_LETTERS.filter(k => typeof rec[k] === 'string' || typeof rec[k] === 'number').map(
      k => String(rec[k])
    );
    raw = byLetter.length >= 2 ? byLetter : Object.values(rec).map(v => (typeof v === 'string' ? v : ''));
  }
  const options: string[] = [];
  let marked: number | null = null;
  for (const entry of raw) {
    const noLetter = entry.replace(OPTION_LETTER, '$2').replace(OPTION_DIGIT, '$2');
    const star = takeStarMarker(noLetter);
    const text = trim(star.text);
    if (!text) continue;
    if (star.marked && marked === null) marked = options.length;
    options.push(text);
    // 6. şıkta dur: böylece buildQuestion "en fazla 5 şık" uyarısını verebilir
    // (sessizce kırpıp yanlış cevap üretmektense bloğu reddetmek daha iyi).
    if (options.length > BULK_LETTERS.length) break;
  }
  return { options, marked };
}

function buildQuestion(
  block: number,
  parts: { id?: string; question: string; options: string[]; answer: number | null; explanation: string },
  issues: BulkIssue[]
): BulkQuestion | null {
  const excerpt = trim(parts.question).slice(0, 60);
  if (!parts.question) {
    issues.push({ block, message: 'Soru metni boş', excerpt });
    return null;
  }
  if (parts.options.length < 2) {
    issues.push({ block, message: `En az 2 şık gerekli (bulunan: ${parts.options.length})`, excerpt });
    return null;
  }
  if (parts.options.length > BULK_LETTERS.length) {
    issues.push({ block, message: `En fazla ${BULK_LETTERS.length} şık olur`, excerpt });
    return null;
  }
  if (parts.answer === null) {
    issues.push({ block, message: 'Doğru şık işaretlenmemiş — "Doğru: B" satırı veya şıkta * işareti gerekir', excerpt });
    return null;
  }
  if (parts.answer < 0 || parts.answer >= parts.options.length) {
    issues.push({ block, message: `Doğru şık numarası şık sayısından büyük (${parts.answer + 1}/${parts.options.length})`, excerpt });
    return null;
  }
  return {
    id: trim(parts.id || ''),
    question: parts.question,
    options: parts.options,
    answer: parts.answer,
    explanation: parts.explanation,
  };
}

function parseJsonObject(obj: any, block: number, issues: BulkIssue[]): BulkQuestion | null {
  const q = trim(String(obj?.question ?? obj?.text ?? obj?.soru ?? obj?.q ?? obj?.soruMetni ?? ''));
  const { options, marked } = cleanOptions(obj?.options ?? obj?.secenekler ?? obj?.siklar ?? obj?.şıklar ?? obj?.choices);
  let answer: number | null = null;
  const token = obj?.answer ?? obj?.correct ?? obj?.answerIndex ?? obj?.dogru ?? obj?.doğru ?? obj?.cevap;
  // JSON'daki sayı aynen uygulamanın şeması: 0 tabanlı (Question.answer). Aralıkta değilse
  // 1 tabanlı yazılmış olabileceği varsayılır (answer: 4 / 4 şık → 3. indeks).
  if (typeof token === 'number' && Number.isInteger(token)) {
    if (token >= 0 && token < options.length) answer = token;
    else if (token >= 1 && token <= options.length) answer = token - 1;
  }
  else if (typeof token === 'string') answer = resolveAnswerToken(token, options);
  if (answer === null && marked !== null) answer = marked;
  const explanation = trim(
    String(obj?.explanation ?? obj?.aciklama ?? obj?.açıklama ?? obj?.solution ?? obj?.hint ?? obj?.ipucu ?? obj?.gerekce ?? obj?.gerekçe ?? '')
  );
  return buildQuestion(block, { id: obj?.id != null ? String(obj.id) : '', question: q, options, answer, explanation }, issues);
}

function parseTextBlock(block: number, text: string, issues: BulkIssue[]): BulkQuestion | null {
  const lines = text.split(/\r?\n/);
  const qParts: string[] = [];
  const optLines: string[] = [];
  const seenOpt = { any: false, digit: 0, letter: 0 };
  let answerToken: string | null = null;
  let marked: number | null = null;
  const expParts: string[] = [];
  let inExplanation = false;

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;
    const ans = ANSWER_LINE.exec(line);
    if (ans) {
      answerToken = ans[2];
      inExplanation = false;
      continue;
    }
    const exp = EXPLAIN_LINE.exec(line);
    if (exp) {
      inExplanation = true;
      if (exp[2]) expParts.push(exp[2]);
      continue;
    }
    const letter = OPTION_LETTER.exec(line);
    if (letter && letter[2].trim()) {
      seenOpt.any = true;
      seenOpt.letter++;
      const st = takeStarMarker(letter[2]);
      if (st.marked && marked === null) marked = optLines.length;
      optLines.push(st.text);
      inExplanation = false;
      continue;
    }
    const starOpt = /^\s*[*✓✔]\s+(.*)$/.exec(line);
    if (starOpt && starOpt[1].trim()) {
      // "* Ankara" tek başına madde imi değil, "doğru şık" işaretidir.
      seenOpt.any = true;
      if (marked === null) marked = optLines.length;
      optLines.push(starOpt[1]);
      inExplanation = false;
      continue;
    }
    const bullet = OPTION_BULLET.exec(line);
    if (bullet && bullet[1].trim()) {
      seenOpt.any = true;
      const st = takeStarMarker(bullet[1]);
      if (st.marked && marked === null) marked = optLines.length;
      optLines.push(st.text);
      inExplanation = false;
      continue;
    }
    const digit = OPTION_DIGIT.exec(line);
    if (digit && digit[2].trim()) {
      // "1)" şık işareti olabilir, "1." soru numarasi da: numara şıklar başladiktan sonra
      // ve sırayla geliyorsa şık say.
      if (seenOpt.any && optLines.length + 1 === Number(digit[1])) {
        seenOpt.any = true;
        seenOpt.digit++;
        const st = takeStarMarker(digit[2]);
        if (st.marked && marked === null) marked = optLines.length;
        optLines.push(st.text);
        inExplanation = false;
        continue;
      }
    }
    if (inExplanation) {
      expParts.push(line);
      continue;
    }
    if (!seenOpt.any) qParts.push(line);
  }

  const question = trim(qParts.join(' ').replace(QUESTION_PREFIX, '').replace(NUM_PREFIX, ''));
  const { options } = cleanOptions(optLines);
  // "Doğru:" satırı öncelikli; yoksa şıkkın * / ✓ işareti kullanılır.
  const answer = answerToken != null ? resolveAnswerToken(answerToken, options) : marked;
  if (answerToken != null && answer === null) {
    issues.push({
      block,
      message: `“${trim(answerToken)}” şık listesinde yok`,
      excerpt: trim(question).slice(0, 60),
    });
    return null;
  }
  return buildQuestion(block, { question, options, answer, explanation: trim(expParts.join(' ')) }, issues);
}

/** Metni boş satıra göre bloklara böler; boş satır yoksa "1." / "Soru:" başlangıçlarından böler. */
function splitBlocks(text: string): string[] {
  const byBlank = text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map(b => b.trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    const starts = /^\s*(?:\d{1,4}\s*[).]\s*|soru\s*[:#-]\s*)/i.test(line);
    const hasOptions = cur.some(l => OPTION_LETTER.test(l) && OPTION_LETTER.exec(l)![2].trim());
    if (starts && hasOptions && cur.length) {
      out.push(cur.join('\n'));
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length) out.push(cur.join('\n'));
  const cleaned = out.map(b => b.trim()).filter(Boolean);
  return cleaned.length > 1 ? cleaned : (byBlank.length ? byBlank : cleaned);
}

export function parseQuestionBulk(raw: string, opts?: { maxItems?: number }): BulkParseResult {
  const maxItems = opts?.maxItems ?? BULK_DEFAULT_MAX;
  const text = (raw || '').trim();
  const issues: BulkIssue[] = [];
  if (!text) {
    return { format: 'empty', items: [], issues, blocks: 0, duplicates: 0, truncated: false };
  }

  const items: BulkQuestion[] = [];
  let format: 'json' | 'text' = 'text';
  let blocks = 0;
  let truncated = false;

  if (text.startsWith('[') || text.startsWith('{')) {
    format = 'json';
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        format: 'json',
        items: [],
        issues: [{ block: 0, message: `JSON çözümlenemedi: ${msg}`, excerpt: text.slice(0, 60) }],
        blocks: 0,
        duplicates: 0,
        truncated: false,
      };
    }
    const rec = parsed as Record<string, unknown>;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(rec?.questions)
      ? (rec.questions as unknown[])
      : Array.isArray(rec?.sorular)
      ? (rec.sorular as unknown[])
      : Array.isArray(rec?.items)
      ? (rec.items as unknown[])
      : null;
    if (!list) {
      return {
        format: 'json',
        items: [],
        issues: [{ block: 0, message: 'JSON dizisi bulunamadı — [{...}] veya {"questions":[{...}]} biçiminde ver', excerpt: text.slice(0, 60) }],
        blocks: 0,
        duplicates: 0,
        truncated: false,
      };
    }
    blocks = list.length;
    list.forEach((entry, i) => {
      if (items.length >= maxItems) {
        truncated = true;
        return;
      }
      const q = parseJsonObject(entry, i + 1, issues);
      if (q) items.push(q);
    });
  } else {
    const blocksArr = splitBlocks(text);
    blocks = blocksArr.length;
    blocksArr.forEach((b, i) => {
      if (items.length >= maxItems) {
        truncated = true;
        return;
      }
      const q = parseTextBlock(i + 1, b, issues);
      if (q) items.push(q);
    });
  }

  const seen = new Set<string>();
  const unique: BulkQuestion[] = [];
  let duplicates = 0;
  for (const q of items) {
    const key = norm(q.question);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    unique.push(q);
  }

  if (truncated) {
    issues.push({ block: 0, message: `Üst sınır ${maxItems} soru — kalanı ikinci bir part halinde yapıştır`, excerpt: '' });
  }

  return { format, items: unique, issues, blocks, duplicates, truncated };
}

/** Panelde gösterilecek tek satırlık özet. */
export function formatBulkSummary(res: BulkParseResult): string {
  if (res.format === 'empty') return 'Henüz bir şey yapıştırılmadı';
  const bits = [`${res.items.length} soru hazır`];
  if (res.issues.length) bits.push(`${res.issues.length} kayıt atlandı`);
  if (res.duplicates) bits.push(`${res.duplicates} tekrar ayıklandı`);
  if (res.format === 'text') bits.push(`${res.blocks} blok okundu`);
  return bits.join(' · ');
}

/** "Örnek" düğmesinin doldurduğu metin. */
export function sampleBulkText(): string {
  return [
    'Türkiye Cumhuriyeti’nin ilk başkenti aşağıdakilerden hangisidir?',
    'A) İstanbul',
    'B) Ankara',
    'C) İzmir',
    'D) Sivas',
    'Doğru: B',
    'Açıklama: 13 Ekim 1923’te başkent Ankara olmuştur.',
    '',
    'Lozan Antlaşması hangi yılda imzalanmıştır?',
    'A) 1920',
    'B) 1922',
    'C) 1923',
    'D) 1924',
    'Doğru: C',
    'Açıklama: 24 Temmuz 1923.',
  ].join('\n');
}
