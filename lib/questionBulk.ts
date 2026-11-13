/** "a)" / "A - " / "1." gibi önekleri ve nokta/tırnak farklarını yok eden karşılaştırma anahtarı. */
function norm(s: string): string {
  return lower(
    s
      .replace(OPTION_LETTER, '$2')
      .replace(OPTION_DIGIT, '$2')
      .replace(/[.,;:!?'’"“”()\[\]\s]+/g, '')
  );
}

function lower(s: string): string {
  return s.toLocaleLowerCase('tr-TR');
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
  const t = oneLine(token).replace(/[.:]$/, '');
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
    // Yalnız çift işaretli markdown'ı soy: tek `*` doğru şık işareti olabilir.
    const noLetter = entry
      .replace(OPTION_LETTER, '$2')
      .replace(OPTION_DIGIT, '$2')
      .replace(/\*\*|_{2,}|~~|`+/g, '')
      .trim();
    const star = takeStarMarker(noLetter);
    const text = oneLine(star.text);
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
  parts: {
    id?: string;
    no?: number | null;
    question: string;
    options: string[];
    answer: number | null;
    explanation: string;
  },
  issues: BulkIssue[]
): BulkQuestion | null {
  const excerpt = oneLine(parts.question).slice(0, 60);
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
    issues.push({
      block,
      message: 'Doğru şık işaretlenmemiş — “Cevap: B” satırı veya şıkta * işareti gerekir',
      excerpt,
    });
    return null;
  }
  if (parts.answer < 0 || parts.answer >= parts.options.length) {
    issues.push({
      block,
      message: `Doğru şık numarası şık sayısından büyük (${parts.answer + 1}/${parts.options.length})`,
      excerpt,
    });
    return null;
  }
  return {
    id: oneLine(parts.id || ''),
    no: parts.no && parts.no > 0 ? parts.no : block,
    question: parts.question,
    options: parts.options,
    answer: parts.answer,
    explanation: parts.explanation,
  };
}

function parseJsonObject(obj: any, block: number, issues: BulkIssue[]): BulkQuestion | null {
  const q = joinParas(
    String(obj?.question ?? obj?.text ?? obj?.soru ?? obj?.q ?? obj?.soruMetni ?? '')
      .split(/\r?\n/)
      .map(l => stripMd(l.trim()))
  );
  const { options, marked } = cleanOptions(obj?.options ?? obj?.secenekler ?? obj?.siklar ?? obj?.şıklar ?? obj?.choices);
  let answer: number | null = null;
  const token = obj?.answer ?? obj?.correct ?? obj?.answerIndex ?? obj?.dogru ?? obj?.doğru ?? obj?.cevap;
  // JSON'daki sayı aynen uygulamanın şeması: 0 tabanlı (Question.answer). Aralıkta değilse
  // 1 tabanlı yazılmış olabileceği varsayılır (answer: 4 / 4 şık → 3. indeks).
  if (typeof token === 'number' && Number.isInteger(token)) {
    if (token >= 0 && token < options.length) answer = token;
    else if (token >= 1 && token <= options.length) answer = token - 1;
  } else if (typeof token === 'string') answer = resolveAnswerToken(token, options);
  if (answer === null && marked !== null) answer = marked;
  const explanation = joinParas(
    String(
      obj?.explanation ?? obj?.aciklama ?? obj?.açıklama ?? obj?.solution ?? obj?.hint ?? obj?.ipucu ?? obj?.gerekce ?? obj?.gerekçe ?? ''
    )
      .split(/\r?\n/)
      .map(l => stripMd(l.trim()))
  );
  const rawNo = Number(obj?.no ?? obj?.soruNo ?? obj?.soru_no ?? obj?.num ?? 0);
  return buildQuestion(
    block,
    { id: obj?.id != null ? String(obj.id) : '', no: Number.isFinite(rawNo) ? rawNo : null, question: q, options, answer, explanation },
    issues
  );
}

/** `A) x B) y C) z` gibi tek satıra yazılmış şık dizilerini ayırır. */
function expandInline(line: string): string[] {
  const marks = [...line.matchAll(/(^|\s)([A-Ea-e])\s*[).]/g)];
  if (marks.length < 2) return [line];
  const start = marks[0].index ?? 0;
  const head = line.slice(0, start).trim();
  const out: string[] = [];
  for (let i = 0; i < marks.length; i++) {
    const from = (marks[i].index ?? 0) + marks[i][0].length;
    const to = i + 1 < marks.length ? (marks[i + 1].index ?? line.length) : line.length;
    const text = line.slice(from, to).trim();
    if (text) out.push(`${marks[i][2]}) ${text}`);
  }
  return head || !out.length ? [head, ...out].filter(Boolean) : out;
}

interface TextRec {
  qParts: string[];
  optLines: string[];
  marked: number | null;
  answerToken: string | null;
  expParts: string[];
  no: number | null;
}

const newRec = (no: number | null = null): TextRec => ({
  qParts: [],
  optLines: [],
  marked: null,
  answerToken: null,
  expParts: [],
  no,
});


/** Satır bir şık listesi başlatır mı: 2 = kesin (`A)`), 1 = madde imi/yıldız, 0 = hayır. */
function optionish(line: string): 0 | 1 | 2 {
  const m = LINE_LETTER.exec(line);
  if (m && m[2].trim() && OPTION_RANK.indexOf(m[1].toUpperCase()) === 0) return 2;
  if (STAR_MARK.test(line) || OPTION_BULLET.test(line)) return 1;
  return 0;
}

/** İleride (ilk `n` dolu satırda) bir şık listesi başlıyor mu? */
function optionRunAhead(lines: string[], from: number, n = 8): boolean {
  let run = 0;
  let seen = 0;
  for (let i = from; i < lines.length && seen < n; i++) {
    const l = stripMd((lines[i] || '').trim());
    if (!l) continue;
    seen++;
    const hit = optionish(l);
    if (hit === 2) return true;
    if (hit) run++;
    else if (run) break;
  }
  return run >= 2;
}

/**
 * Toplu soru ayrıştırıcısı (admin paneli → Soru Havuzu → "Toplu ekle").
 *
 * İki format kabul edilir:
 *  1) JSON: [{ "question": "...", "options": ["A","B","C","D"], "answer": 1, "explanation": "..." }, ...]
 *     `answer` sayı (0 tabanlı — uygulamanın kendi şeması), harf ("B") veya şıkkın metni
 *     olabilir; `options` dizi ya da { A: "...", B: "..." } nesnesi ya da ayraçlı metin.
 *     Sarmalama serbest: [{...}] , {"questions":[{...}]}, {"sorular":[...]}, {"items":[...]}.
 *  2) Düz metin — panodan/Word'den/Markdown çıktısından gelen kalıp. ÖRNEK:
 *
 *        1. IV. Mehmet dönemindeki Osmanlı-Lehistan ilişkileri önemli kazanımlar
 *           içermektedir.
 *
 *           I. Bucaş Antlaşması IV. Mehmet döneminde yapılmıştır.
 *
 *           II. Bu antlaşmayla Podolya ve Ukrayna Osmanlı topraklarına katılmıştır.
 *
 *           **Yukarıdaki öncüllerden hangileri ... doğrudur?**
 *
 *        A) Yalnız I
 *
 *        B) I ve II
 *
 *        C) I ve III
 *
 *        D) II ve III
 *
 *        E) I, II ve III
 *
 *        Cevap: E
 *
 *        Açıklama: Bucaş Antlaşması IV. Mehmet döneminde yapılmıştır...
 *
 *     Yani: soru bölümü birden çok PARAGRAFTAN oluşabilir (öncüller,Roman rakam
 *     maddeler, kalın vurgulu soru cümlesi) ve paragraflar arasında boş satır
 *     olabilir — boş satır burada BLOK ayıracı DEĞİLDİR. Bloğu asıl ayıran şey
 *     sorunun başındaki NUMARADIR (`1.`, `2)`, `Soru 3:`). Numara yoksa veya
 *     atlanmışsa sıralama bozulmaz: kayıtlar geldiği sırayla korunur, numarasız
 *     olanlar sıra numarasıyla tamamlanır (`no` alanı). Şıklar `A)`–`E)` (veya
 *     `A.`, `A -`, `1)`, madde imi); doğru cevap `Cevap:` / `Doğru:` / `Answer:`
 *     satırı ya da şıkkın başındaki `*`/`✓` işareti ile verilir; `Açıklama:`
 *     satırı (devam satırları dahil) açıklama olur.
 *
 *     Markdown/RTF artıkları temizlenir: `**kalın**`, `__`, `# başlık`, kaçışlı
 *     `\*\*`, satır arası `---` ayraçları, `&nbsp;`, sıfır genişlikli karakterler.
 *     Soru metnindeki paragraf yapısı `\n\n` olarak KORUNUR (test ekranında
 *     öncüller alt alta görünür).
 *
 * Bu dosya bilinçli olarak React Native'den hiçbir şey import etmiyor:
 * scripts/bulk-contract.sh ile doğrudan node'da test ediliyor.
 */

export interface BulkQuestion {
  /** JSON'dan geldiyse korunur; ekran çakışan/boş id'leri kendisi üretir. */
  id: string;
  /**
   * Soru numarası: kaynakta yazılı olan; numara yoksa/tekrarlıyken sıra numarası.
   * Panel önizlemesinde gösterilir — hangi sorunun atlandığını anlamak için.
   */
  no: number;
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
  /** Okunan kayıt sayısı (hatalılar dahil). */
  blocks: number;
  /** Aynı soru metni tekrarlıysa atlanan kayıt sayısı. */
  duplicates: number;
  /** maxItems aşıldıysa true. */
  truncated: boolean;
  /** Kullanıcıya gösterilecek bilgi notları (numara tamamlama, yama önerisi vb.). */
  notes: string[];
}

export const BULK_LETTERS = ['A', 'B', 'C', 'D', 'E'];
export const BULK_DEFAULT_MAX = 500;

/**
 * Şık harfi sırası. A-E gerçek şıklar; F-H yalnızca "6+ şık" hatasını yakalamak için
 * tolere edilir (sessizce kırpılıp yanlış cevap üretilmesin). Roman rakamları (I, II, III)
 * ve "IV. Mehmet" gibi satır başları bu yüzden şık SANILMAZ.
 */
const OPTION_RANK = 'ABCDEFGH';
/** Satır içindeki şık işareti (A-H aralığında tek harf + ayraç). */
const LINE_LETTER = /^\s*([A-Ha-h])\s*[).:\-–—]\s*(.*)$/;
/** Şık metninden sıyrılacak önek: yalnız A-E (romani rakamlara dokunmaz). */
const OPTION_LETTER = /^\s*([A-Ea-e])\s*[).:\-–—]\s*(.*)$/;
const OPTION_DIGIT = /^\s*([1-9])\s*[).:\-–—]\s*(.*)$/;
const OPTION_BULLET = /^\s*[•◦●‣]\s+(.*)$|^\s*[-–]\s+(.*)$/;
const STAR_MARK = /^\s*[*✓✔†]\s*(.*)$/;
/** Satırı sonundaki `*`/`✓` = doğru şık işareti (Word/PDF çıktılarında görülüyor). */
const ANSWER_LINE =
  /^\s*(doğru\s*cevap|dogru\s*cevap|cevap\s*anahtarı|cevap|doğru\s*şık|doğru\s*şik|doğru|answer|correct(?:\s*answer)?|yanıt|yanit|key)\s*[:=]\s*(.*)$/i;
/** `Cevap E` / `Doğru Cevap B` — ayraçsız yazım (kısa oldığında kabul edilir). */
const ANSWER_LOOSE = /^\s*(?:doğru\s*cevap|dogru\s*cevap|cevap|doğru|answer|yanıt|yanit)\s+([A-Ha-h1-9][A-Za-z0-9şıçöüğ ]{0,18})$/i;
const EXPLAIN_LINE =
  /^\s*(açıklama|aciklama|aclarama|explanation|solution|çözüm|cozum|gerekçe|gerekce|ipucu|hint|not|açıklamalar)\s*[:=]\s?(.*)$/i;
/** `1.` `12)` `Soru 3:` `Soru No 4 -` — kaydı bölen soru numarası. */
const QNUM = /^\s*(?:(?:soru|question|problem)\s*(?:no\.?|numarası|#)?\s*[:.\-–—]?\s*)?(\d{1,3})\s*(?:[.)\]]|:|\s)\s*(.*)$/i;
const QUESTION_PREFIX = /^\s*(?:soru|question|problem)\s*[:#.\-–—]?\s*/i;
/** Satır başında kalabilecek `12)` / `Soru 3:` öneki (rakam + ayraç şart). */
const QNUM_STRIP = /^\s*(?:(?:soru|question)\s*\d{1,3}\s*[:.\-–—]?\s*)?\d{1,3}\s*[.)]\s*/i;
/** Markdown yatay çizgi: `---`, `***`, `___` */
const HR_LINE = /^\s*(?:[-*_]\s*){3,}$/;

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Satırları/paragrafları tek metne çevirir: `''` girdisi paragraf boşluğu (\n\n). */
function joinParas(parts: string[]): string {
  const paras: string[][] = [[]];
  for (const part of parts) {
    if (!part) {
      if (paras[paras.length - 1].length) paras.push([]);
      continue;
    }
    paras[paras.length - 1].push(part.replace(/\s+/g, ' ').trim());
  }
  return paras
    .filter(par => par.length)
    .map(par => par.join(' '))
    .join('\n\n')
    .trim();
}

/**
 * Markdown/RTF artıklarını temizler: `\*\*` kaçışları, `**kalın**`, `# başlık`,
 * `> alıntı`, `__vurgu__`. Satır başındaki `* Ankara` biçimi DOĞRU ŞIK işareti
 * olduğundan aynen korunur (STAR_MARK onu yakalar).
 */
function stripMd(line: string): string {
  const base = line
    .trim()
    .replace(/\\([*_`~#>\[\]()|\\])/g, '$1')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>+\s?/, '')
    .trim();
  if (/^[*✓✔†]\s+\S/.test(base)) return base;
  return base.replace(/\*{1,3}|_{2,}|~~|`+/g, '').trim();
}

/** Yapıştırmada gelen HTML varlıkları ve görünmez karakterler. */
function sanitize(raw: string): string {
  return (raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/**
 * Metin akışını satır satır tarayıp kayıtlara böler. Boş satır = paragraf sonu,
 * soru numarası (veya tamamlanmış kayıttan sonraki yeni bir şık listesi) = kayıt sonu.
 */
function scanTextRecords(text: string): { records: TextRec[]; numberingFixed: number } {
  const lines = sanitize(text).split('\n');
  const records: TextRec[] = [];
  let rec = newRec();
  let inExplanation = false;
  let lastKind: 'q' | 'opt' | 'ans' | 'expl' | 'other' = 'q';
  let numberingFixed = 0;

  const flush = () => {
    if (rec.qParts.length || rec.optLines.length || rec.answerToken != null) {
      records.push(rec);
      if (rec.no == null) {
        rec.no = records.length;
        numberingFixed++;
      }
    }
    rec = newRec();
    inExplanation = false;
    lastKind = 'q';
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) {
      // Boş satır: yalnızca soru bölümündeyken paragraf boşluğudur.
      if (!inExplanation && rec.optLines.length === 0 && rec.qParts.length && rec.qParts[rec.qParts.length - 1] !== '') {
        rec.qParts.push('');
      }
      continue;
    }
    let line = stripMd(rawLine.trim());
    if (!line || HR_LINE.test(line)) continue;

    // 1) Soru numarası: kaydın kendi numarası olur ya da yeni kayıt başlatır.
    const num = QNUM.exec(line);
    if (num) {
      const n = Number(num[1]);
      const hasBody = rec.qParts.some(Boolean) || rec.optLines.length > 0;
      const finished = rec.optLines.length > 0 || rec.answerToken != null || rec.expParts.length > 0;
      if (!hasBody) {
        rec.no = rec.no ?? n;
        line = (num[2] || '').trim();
        if (!line) continue;
      } else if (finished) {
        flush();
        rec.no = n;
        line = (num[2] || '').trim();
        if (!line) continue;
      } else {
        // Şıklar başlamadan gelen numaralı satır: gövdedeki madde numarası (1., 2. madde).
        rec.qParts.push(line);
        lastKind = 'q';
        continue;
      }
    }

    // 2) Cevap / açıklama etiketleri
    const ans = ANSWER_LINE.exec(line);
    if (ans) {
      rec.answerToken = ans[2].trim() || null;
      inExplanation = false;
      lastKind = 'ans';
      continue;
    }
    const exp = EXPLAIN_LINE.exec(line);
    if (exp) {
      inExplanation = true;
      lastKind = 'expl';
      if (exp[2].trim()) rec.expParts.push(exp[2].trim());
      continue;
    }
    if (rec.answerToken != null && !inExplanation && rec.optLines.length >= 2) {
      const loose = ANSWER_LOOSE.exec(line);
      if (loose && line.length <= 26) {
        rec.answerToken = loose[1].trim();
        lastKind = 'ans';
        continue;
      }
    }

    // 3) Şıklar — tek satırda birden fazla ise parçala
    for (const piece of expandInline(line)) {
      const p = piece.trim();
      if (!p) continue;
      const letterM = LINE_LETTER.exec(p);
      if (letterM && letterM[2].trim()) {
        const rank = OPTION_RANK.indexOf(letterM[1].toUpperCase());
        const startsFresh = rank === 0 && rec.optLines.length > 0;
        if (rank >= 0 && (rank === rec.optLines.length || (rec.optLines.length === 0 && rank < BULK_LETTERS.length))) {
          const st = takeStarMarker(stripMd(letterM[2]));
          if (st.marked && rec.marked === null) rec.marked = rec.optLines.length;
          rec.optLines.push(st.text.trim());
          inExplanation = false;
          lastKind = 'opt';
          continue;
        }
        // `A)` tekrar göründüyse ve listede en az 2 şık varsa → yeni soru
        if (startsFresh && rec.optLines.length >= 2) {
          flush();
          const st = takeStarMarker(stripMd(letterM[2]));
          if (st.marked && rec.marked === null) rec.marked = 0;
          rec.optLines.push(st.text.trim());
          lastKind = 'opt';
          continue;
        }
      }
      const starM = STAR_MARK.exec(p);
      if (starM && starM[1].trim() && (rec.optLines.length > 0 || optionRunAhead(lines, i + 1, 3))) {
        // "* Ankara" — madde imi değil, işaretli DOĞRU ŞIK.
        if (rec.marked === null) rec.marked = rec.optLines.length;
        rec.optLines.push(stripMd(starM[1]).trim());
        inExplanation = false;
        lastKind = 'opt';
        continue;
      }
      const bulletM = OPTION_BULLET.exec(p);
      if (bulletM && (bulletM[1] || bulletM[2] || '').trim()) {
        const body = (bulletM[1] || bulletM[2] || '').trim();
        if (rec.optLines.length > 0 || optionRunAhead(lines, i + 1, 2)) {
          const st = takeStarMarker(stripMd(body));
          if (st.marked && rec.marked === null) rec.marked = rec.optLines.length;
          rec.optLines.push(st.text.trim());
          inExplanation = false;
          lastKind = 'opt';
          continue;
        }
      }
      const digitM = OPTION_DIGIT.exec(p);
      if (digitM && digitM[2].trim()) {
        // "1)" şık işareti olabilir, "1." soru numarası da: yalnız şıklar başladıysa ve
        // sırayla geliyorsa şık sayılır.
        if (rec.optLines.length > 0 && Number(digitM[1]) === rec.optLines.length + 1) {
          const st = takeStarMarker(stripMd(digitM[2]));
          if (st.marked && rec.marked === null) rec.marked = rec.optLines.length;
          rec.optLines.push(st.text.trim());
          lastKind = 'opt';
          continue;
        }
      }
      handleText(p, i);
    }
  }
  flush();
  return { records, numberingFixed };

  function handleText(p: string, at: number) {
    // Şık listesi görülüp cevap/açıklama aşamasına geçildiyse ve yeni bir soru cümlesi
    // geliyorsa bu SIRADAKİ sorudur — açıklamanın devamı sanılmaz.
    if (rec.optLines.length >= 2 && /\?\s*$/.test(p)) {
      flush();
      rec.qParts.push(p);
      lastKind = 'q';
      return;
    }
    if (inExplanation || lastKind === 'expl') {
      rec.expParts.push(p);
      lastKind = 'expl';
      return;
    }
    if (lastKind === 'ans' && rec.answerToken != null && optionRunAhead(lines, at + 1, 4)) {
      // Numarasız yapıştırma: cevap görülmüş ve önümüzde yeni bir şık listesi var.
      flush();
      rec.qParts.push(p);
      lastKind = 'q';
      return;
    }
    if (lastKind === 'ans') {
      // "Cevap: E" satırının devamı / sarmalanmış açıklama satırı.
      rec.expParts.push(p);
      inExplanation = true;
      lastKind = 'expl';
      return;
    }
    if (lastKind === 'opt' && rec.optLines.length && p.length <= 90 && !/[?:]$/.test(p)) {
      // Sarılmış şık metni: son şıkka eklenir.
      rec.optLines[rec.optLines.length - 1] = `${rec.optLines[rec.optLines.length - 1]} ${p}`;
      return;
    }
    rec.qParts.push(p);
    lastKind = 'q';
  }
}

/**
 * Metni kayıtlara böler ve doğrular. Not: blok ayıracı boş satır değil, soru
 * numarasıdır — böylece çok paragraflı (öncüllü) sorular tek kayıtta kalır.
 */
function parseTextLabelized(
  text: string,
  issues: BulkIssue[]
): { items: BulkQuestion[]; blocks: number; notes: string[] } {
  const { records, numberingFixed } = scanTextRecords(text);
  const items: BulkQuestion[] = [];
  const notes: string[] = [];

  records.forEach((r, idx) => {
    const question = joinParas(r.qParts).replace(QUESTION_PREFIX, '').replace(QNUM_STRIP, '').trim();
    const { options } = cleanOptions(r.optLines);
    const answer = r.answerToken != null ? resolveAnswerToken(r.answerToken, options) : r.marked;
    const explanation = joinParas(r.expParts);
    if (r.answerToken != null && answer === null && options.length >= 2) {
      issues.push({
        block: idx + 1,
        message: `“${oneLine(r.answerToken)}” şık listesinde yok`,
        excerpt: oneLine(question).slice(0, 60),
      });
      return;
    }
    const q = buildQuestion(idx + 1, { no: r.no, question, options, answer, explanation }, issues);
    if (q) items.push(q);
  });

  // Numarayı "mantıken tamamla": numarasız/tekrar eden numaralar sıra numarasıyla doldurulur.
  const used = new Set<number>();
  let patched = 0;
  items.forEach((it, i) => {
    if (it.no < 1 || used.has(it.no)) {
      it.no = i + 1;
      patched++;
    }
    used.add(it.no);
  });
  if (numberingFixed || patched) {
    notes.push(`${numberingFixed || patched} sorunun numarası eksikti — sıraya göre tamamlandı`);
  }
  const nos = items.map(it => it.no).sort((a, b) => a - b);
  if (nos.length > 1) {
    let gaps = 0;
    for (let n = nos[0]; n <= nos[nos.length - 1]; n++) if (!used.has(n)) gaps++;
    if (gaps) notes.push(`${gaps} soru numarası atlanmış — kayıtlar geldiği sırayla eklendi`);
  }

  return { items, blocks: records.length, notes };
}

export function parseQuestionBulk(raw: string, opts?: { maxItems?: number }): BulkParseResult {
  const maxItems = opts?.maxItems ?? BULK_DEFAULT_MAX;
  const text = sanitize(raw).trim();
  const issues: BulkIssue[] = [];
  const notes: string[] = [];
  if (!text) {
    return { format: 'empty', items: [], issues, blocks: 0, duplicates: 0, truncated: false, notes };
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
        notes,
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
        issues: [
          {
            block: 0,
            message: 'JSON dizisi bulunamadı — [{...}] veya {"questions":[{...}]} biçiminde ver',
            excerpt: text.slice(0, 60),
          },
        ],
        blocks: 0,
        duplicates: 0,
        truncated: false,
        notes,
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
    const res = parseTextLabelized(text, issues);
    blocks = res.blocks;
    notes.push(...res.notes);
    // Üst sınır: fazlası eklenmez, ikinci part olarak yapıştırması söylenir.
    if (res.items.length > maxItems) truncated = true;
    items.push(...res.items.slice(0, maxItems));
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
  if (!unique.length && blocks > unique.length && !issues.length) {
    notes.push('Hiç kayıt alınamadı — her sorunun başında numara ve şıklardan sonra “Cevap:” satırı olsun');
  }

  return { format, items: unique, issues, blocks, duplicates, truncated, notes };
}

/** Panelde gösterilecek tek satırlık özet. */
export function formatBulkSummary(res: BulkParseResult): string {
  if (res.format === 'empty') return 'Henüz bir şey yapıştırılmadı';
  const bits = [`${res.items.length} soru hazır`];
  if (res.issues.length) bits.push(`${res.issues.length} kayıt atlandı`);
  if (res.duplicates) bits.push(`${res.duplicates} tekrar ayıklandı`);
  if (res.format === 'text') bits.push(`${res.blocks} kayıt tarandı`);
  if (res.notes.length) bits.push(res.notes[0]);
  return bits.join(' · ');
}

/** "Örnek biçimi doldur" düğmesinin doldurduğu metin — panelde kullanılan kalıp. */
export function sampleBulkText(): string {
  return [
    '1. IV. Mehmet dönemindeki Osmanlı-Lehistan ilişkileri önemli kazanımlar ve tartışmalı',
    'gelişmeler içermektedir.',
    '',
    'I. Bucaş Antlaşması IV. Mehmet döneminde yapılmıştır.',
    '',
    'II. Bu antlaşmayla Podolya ve Ukrayna Osmanlı topraklarına katılmıştır.',
    '',
    'III. Antlaşmadaki vergi maddesi Lehistan Diyet Meclisi tarafından iptal edilmiştir.',
    '',
    '**Yukarıdaki öncüllerden hangileri doğru bilgiler içermektedir?**',
    '',
    'A) Yalnız I',
    '',
    'B) I ve II',
    '',
    'C) I ve III',
    '',
    'D) II ve III',
    '',
    'E) I, II ve III',
    '',
    'Cevap: E',
    '',
    'Açıklama: Bucaş Antlaşması IV. Mehmet döneminde yapılmış, Podolya ve Ukrayna',
    'Osmanlı’ya katılmış, vergi maddesi ise Diyet Meclisi tarafından iptal edilmiştir.',
    '',
    '2. Aşağıdaki antlaşmalardan hangisi ile Osmanlı Devleti, Karadeniz’in bir Türk',
    'gölü olmaktan çıktığını kabul etmiştir?',
    '',
    'A) Küçük Kaynarca',
    'B) Londra',
    'C) Paris',
    'D) Berlin',
    '',
    'Cevap: A',
    '',
    'Açıklama: Küçük Kaynarca ile Karadeniz ticaretine Rus gemilerine açık hale geldi.',
  ].join('\n');
}
