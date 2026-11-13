/**
 * lib/questionBulk.ts sözleşme testi — toplu soru ayrıştırıcısı (ağ gerekmez).
 * Çalıştır: npm run test:bulk
 */
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${extra}`);
  }
};

const B = await import('/tmp/bulkBundle.mjs');
const { parseQuestionBulk, formatBulkSummary, sampleBulkText, resolveAnswerToken, BULK_LETTERS } = B;

const T = lines => lines.join('\n');
const allMsg = r => r.issues.map(i => i.message).join(' | ');

console.log('\x1b[1m[0] kullanıcının kalıbı: numaralı soru + öncüller + boş satırlı şıklar\x1b[0m');
{
  const raw = T([
    '  1. IV. Mehmet dönemindeki Osmanlı-Lehistan ilişkileri önemli kazanımlar ve tartışmalı gelişmeler içermektedir.',
    '',
    '   I. Bucaş Antlaşması IV. Mehmet döneminde yapılmıştır.',
    '',
    '   II. Bu antlaşmayla Podolya ve Ukrayna Osmanlı topraklarına katılmıştır.',
    '',
    '   III. Antlaşmadaki vergi maddesi Lehistan Diyet Meclisi tarafından iptal edilmiştir.',
    '',
    ' \\*\\*Yukarıdaki öncüllerden hangileri IV. Mehmet dönemindeki Osmanlı-Lehistan ilişkileri hakkında doğru bilgiler içermektedir?',
    '',
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
    "Açıklama: Bucaş Antlaşması IV. Mehmet döneminde yapılmış, Podolya ve Ukrayna Osmanlı'ya katılmıştır.",
    '',
    '',
    '  2. Osmanlı-Lehistan savaşlarının çıkmasında Lehistan\u2019ın bölgedeki baskı politikası etkili olmuştur.',
    '',
    'A) Osmanlı Anadolu toprakları',
    '',
    'B) Ukrayna Kazakları',
    '',
    'C) Kırım Hanlığı',
    '',
    'D) Sırplar',
    '',
    'E) Arnavutlar',
    '',
    'Cevap: B',
    '',
    'Açıklama: Savaşların nedenleri arasında Lehistan\u2019ın Ukrayna Kazaklarına baskısı gösterilmektedir.',
  ]);
  const res = parseQuestionBulk(raw);
  ok(res.format === 'text' && res.blocks === 2, `2 kayda bölündü (blok: ${res.blocks})`, allMsg(res));
  ok(res.items.length === 2 && res.issues.length === 0, 'iki soru hatasız ayrıştı', allMsg(res));
  const q1 = res.items[0];
  ok(q1.no === 1 && res.items[1].no === 2, 'kaynak numaraları korundu (1, 2)', JSON.stringify(res.items.map(i => i.no)));
  ok(q1.options.length === 5 && q1.answer === 4, 'Cevap: E → 5 şık, indeks 4', JSON.stringify({ n: q1.options.length, a: q1.answer }));
  ok(q1.options[0] === 'Yalnız I' && q1.options[4] === 'I, II ve III', 'şık metinleri temiz', JSON.stringify(q1.options));
  ok(q1.question.startsWith('IV. Mehmet dönemindeki'), 'soru numarası gövdeden silindi', q1.question.slice(0, 40));
  ok(q1.question.includes('I. Bucaş Antlaşması') && q1.question.includes('III. Antlaşmadaki'), 'öncüller soru metninde kaldı');
  ok(q1.question.includes('doğru bilgiler içermektedir?'), 'son soru cümlesi gövdeye eklendi');
  ok(!/\*\*|\\\*/.test(q1.question), 'markdown ** ve kaçışları temizlendi', JSON.stringify(q1.question.slice(-60)));
  ok((q1.question.match(/\n\n/g) || []).length === 4, 'paragraf yapısı korundu (5 paragraf)', String((q1.question.match(/\n\n/g) || []).length));
  ok(!q1.options.some(o => /Bucaş|antlaşmayla/.test(o)), 'Roman rakamlı öncüller şık sanılmadı');
  ok(/^Bucaş Antlaşması IV\. Mehmet/.test(q1.explanation), 'açıklama alındı', q1.explanation.slice(0, 40));
  ok(res.items[1].question.includes('etkili olmuştur.'), '2. sorunun gövdesi tek paragraf');
  ok(res.items[1].answer === 1, '2. sorunun cevabı B', String(res.items[1].answer));
}
{
  // numara eksik/atlamsa: sırayla tamamlanır, bilgi notu verilir
  const res = parseQuestionBulk(
    T([
      '1. Başkent hangisidir?',
      'A) İstanbul',
      'B) Ankara',
      'Cevap: B',
      '',
      'Aşağıdakilerden hangisi denize kıyısı olmayan bölgedir?',
      'A) Marmara',
      'B) İç Anadolu',
      'Cevap: B',
      '',
      '4. Lozan hangi yıl imzalanmıştır?',
      'A) 1920',
      'B) 1923',
      'Cevap: B',
    ])
  );
  ok(res.items.length === 3, `numarasız soru da kayboldu (${res.items.length} kayıt)`, allMsg(res));
  ok(JSON.stringify(res.items.map(i => i.no)) === '[1,2,4]', 'numaralar mantıken tamamlandı (1,2,4)', JSON.stringify(res.items.map(i => i.no)));
  ok(res.notes.some(n => /numarası eksikti/.test(n)), 'not: eksik numara tamamlandı', JSON.stringify(res.notes));
  ok(res.notes.some(n => /atlanmış/.test(n)), 'not: numara atlaması bildirildi', JSON.stringify(res.notes));
}
{
  // şıklar tek satırda + cevap kalın + markdown ayraç çizgisi
  const res = parseQuestionBulk(
    T([
      '1. Hangisi Osmanlı\u2019ın ilk başkenti? A) Bursa B) Edirne C) Ankara D) İstanbul',
      'Cevap: **A**',
      '',
      '---',
      '',
      '2. Boğazları açan antlaşma hangisi? A) Montrö B) Lozan C) Atina D) Berlin',
      'Cevap: A',
      'Açıklama: 1936 Montrö.',
    ])
  );
  ok(res.items.length === 2, `satır içi şıklar ayrıştı (${res.items.length})`, allMsg(res));
  ok(res.items[0]?.options.length === 4 && res.items[0]?.options[0] === 'Bursa', 'A) x B) x satır içi listesi', JSON.stringify(res.items[0]?.options));
  ok(res.items[0]?.answer === 0, 'kalın işaretli cevap okundu', String(res.items[0]?.answer));
  ok(res.items[0]?.question.endsWith('ilk başkenti?'), 'gövde, şık listesinden koparıldı', res.items[0]?.question);
  ok(!/^---/.test(res.items[1]?.question || ''), 'markdown ayraç satırı gövdaya girmiyor');
}
{
  // boş satır hiç yok (kompak yapıştırma)
  const res = parseQuestionBulk(
    T([
      '1. Başkent?',
      'A) İstanbul',
      'B) Ankara',
      'C) İzmir',
      'Doğru Cevap: B',
      'Açıklama: 13 Ekim 1923.',
      '2. İkinci soru gövdesi burada?',
      'A) bir',
      'B) iki',
      'Cevap: 1',
    ])
  );
  ok(res.items.length === 2, `kompak yapıştırma 2 kayda bölündü (${res.items.length})`, allMsg(res));
  ok(res.items[0].answer === 1 && res.items[0].explanation === '13 Ekim 1923.', '1. kayıt doğru', JSON.stringify(res.items[0]));
  ok(res.items[1].answer === 0, '"Cevap: 1" → A şıkkı', String(res.items[1].answer));
}
{
  // şık satırına yapışmış cevap + cevap satırına yapışmış açıklama
  const res = parseQuestionBulk(
    T(['1. Başkent hangisidir?', 'A) İstanbul', 'B) Ankara', 'C) İzmir', 'E) Sivas Cevap: B', 'Açıklama: 13 Ekim 1923.'])
  );
  ok(res.items.length === 1 && res.items[0].options.length === 4, `yapışık "Cevap:" şıkkından ayrıldı (${res.items.length})`, JSON.stringify(res.issues));
  ok(res.items[0]?.options[3] === 'Sivas' && res.items[0]?.answer === 1, 'atlanan harf (D) şığı bozmadı, cevap B', JSON.stringify(res.items[0]));
  const res2 = parseQuestionBulk(T(['2. İkinci soru?', 'A) bir', 'B) iki', 'Cevap: A Açıklama: Çünkü öyledir.']));
  ok(res2.items[0]?.answer === 0 && res2.items[0]?.explanation === 'Çünkü öyledir.', 'aynı satırdaki açıklama da ayrılıyor', JSON.stringify(res2.items[0] ?? res2.issues));
}
{
  // açıklama birden çok satıra sarılmış + sonda numarasız devam
  const res = parseQuestionBulk(
    T([
      '3. Öncüllü soru gövdesi burada duruyor.',
      'I. Birinci öncül.',
      'II. İkinci öncül.',
      'Yukarıdakilerden hangileri doğrudur?',
      'A) Yalnız I',
      'B) Yalnız II',
      'C) I ve II',
      'Cevap: C',
      'Açıklama: Birinci öncül doğrudur çünkü örnektir.',
      'İkinci öncül de II. maddedeki bilgiyle uyumludur.',
    ])
  );
  ok(res.items.length === 1 && res.issues.length === 0, `sarmalanmış açıklama birleşti (${res.issues.length} hata)`, allMsg(res));
  ok(/^Birinci öncül doğrudur/.test(res.items[0].explanation) && res.items[0].explanation.includes('İkinci öncül'), 'açıklamanın devam satırı eklendi', res.items[0].explanation);
  ok(res.items[0].no === 3, '3. numara korundu', String(res.items[0].no));
}
{
  const res = parseQuestionBulk('1. Başkent?&nbsp;\u200B\nA) İstanbul\nB) Ankara\nCevap: B');
  ok(res.items[0]?.question === '1. Başkent?' || res.items[0]?.question.includes('Başkent?'), '&nbsp; ve sıfır genişlikli karakter temizlendi', JSON.stringify(res.items[0]));
  ok(!/\u00A0|\u200B/.test(res.items[0]?.question || ''), 'görünmez karakter soruya sızmıyor');
}

console.log('\x1b[1m[1] düz metin blokları\x1b[0m');
{
  const res = parseQuestionBulk(
    T([
      'Türkiye Cumhuriyeti’nin ilk başkenti hangisidir?',
      'A) İstanbul',
      'B) Ankara',
      'C) İzmir',
      'D) Sivas',
      'Doğru: B',
      'Açıklama: 13 Ekim 1923’te Ankara başkent oldu.',
      '',
      'Lozan Antlaşması hangi yıl imzalandı?',
      'A) 1920',
      'B) 1922',
      'C) 1923',
      'D) 1924',
      'Cevap: 3',
    ])
  );
  ok(res.format === 'text', 'metin olarak algılandı');
  ok(res.items.length === 2, `2 soru ayrıştırıldı (${res.items.length})`, JSON.stringify(res.issues));
  ok(res.issues.length === 0, 'hata yok', JSON.stringify(res.issues));
  ok(res.blocks === 2, '2 blok okundu');
  ok(res.items[0].answer === 1 && res.items[0].options.length === 4, 'Doğru: B → 1. indeks, 4 şık');
  ok(/^13 Ekim 1923/.test(res.items[0].explanation), 'Açıklama satırı alındı', res.items[0].explanation);
  ok(res.items[1].answer === 2, 'Cevap: 3 → 1 tabanlı okundu (2. indeks)', String(res.items[1].answer));
  ok(res.items[1].question === 'Lozan Antlaşması hangi yıl imzalandı?', 'numarasız ikinci sorunun gövdesi temiz', res.items[1].question);
  ok(res.items[1].explanation === '', 'açıklama olmayan soru boş diziyle döner');
}
{
  // boş satır yok: "1." / "2." numaralarından bölünmeli
  const res = parseQuestionBulk(
    T(['1. Birinci soru?', 'A) a', 'B) b', 'Doğru: A', '2. İkinci soru?', 'A) c', 'B) d', 'Doğru: B'])
  );
  ok(res.items.length === 2, `boş satırsız metin numaradan bölündü (${res.items.length})`);
  ok(res.items[0].question === 'Birinci soru?', 'soru numarası metinden temizlendi', res.items[0].question);
}
{
  // madde imli şıklar + * işareti doğru cevabı verir
  const res = parseQuestionBulk(T(['Başkent?', '- İstanbul', '* Ankara', '- İzmir', '- Sivas']));
  ok(res.items.length === 1, `madde imli şıklar okundu (${res.items.length})`, JSON.stringify(res.issues));
  ok(res.items[0]?.answer === 1, 'yıldızlı şık doğru cevap sayıldı', String(res.items[0]?.answer));
  ok(!res.items[0]?.options.some(o => o.includes('*')), 'yıldız işareti şık metninden temizlendi');
}
{
  const res = parseQuestionBulk(T(['Sadece soru metni?', 'A) tek şık', 'Doğru: A']));
  ok(res.items.length === 0 && /En az 2 şık/.test(res.issues[0]?.message || ''), 'tek şık reddedildi', JSON.stringify(res.issues));
}
{
  const res = parseQuestionBulk(T(['Şıkkı olmayan soru?', 'A) a', 'B) b', 'C) c', 'D) d', 'E) e', 'F) f', 'Doğru: A']));
  ok(res.items.length === 0 && /En fazla 5 şık/.test(res.issues[0]?.message || ''), '6 şık reddedildi (sessizce kırpılmıyor)', JSON.stringify(res.issues));
}
{
  const res = parseQuestionBulk(T(['Cevapsız soru?', 'A) a', 'B) b', 'C) c']));
  ok(res.items.length === 0 && /Doğru şık işaretlenmemiş/.test(res.issues[0]?.message || ''), 'doğru şık yoksa blok reddediliyor', JSON.stringify(res.issues));
}
{
  const res = parseQuestionBulk(T(['Listede olmayan şık?', 'A) a', 'B) b', 'Doğru: E']));
  ok(/“E” şık listesinde yok/.test(res.issues[0]?.message || ''), 'geçersiz şık harfi ayrı mesajla belirtiliyor', JSON.stringify(res.issues));
}
{
  const res = parseQuestionBulk(T(['Şıkkın kendisi yazılmış?', 'A) a', 'B) b', 'Doğru: b']));
  ok(res.items[0]?.answer === 1, 'doğru cevap şık metniyle de verilebiliyor', JSON.stringify(res.items));
}
{
  const res = parseQuestionBulk(T(['Tekrar sorusu?', 'A) a', 'B) b', 'Doğru: A', '', 'Tekrar sorusu?', 'A) a', 'B) b', 'Doğru: A']));
  ok(res.items.length === 1 && res.duplicates === 1, 'aynı soru bir kez ekleniyor', JSON.stringify({ n: res.items.length, d: res.duplicates }));
}
{
  const body = q => T([q, 'A) a', 'B) b', 'Doğru: A']);
  const res = parseQuestionBulk([body('bir'), '', body('iki'), '', body('üç')].join('\n'), { maxItems: 2 });
  ok(res.items.length === 2 && res.truncated && /Üst sınır/.test(allMsg(res)), 'maxItems aşımı uyarıya dönüşüyor', JSON.stringify(res.issues));
}

console.log('\x1b[1m[2] JSON girişi\x1b[0m');
{
  const json = JSON.stringify([
    { id: 'q1', question: 'JSON sorusu?', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'gerekçe' },
    { question: 'İkinci?', options: ['x', 'y'], answer: 0 },
  ]);
  const res = parseQuestionBulk(json);
  ok(res.format === 'json', 'JSON olarak algılandı');
  ok(res.items.length === 2 && res.issues.length === 0, '2 kayıt temiz okundu', JSON.stringify(res.issues));
  ok(res.items[0].id === 'q1', 'JSON’daki id korundu');
  ok(res.items[0].answer === 1, 'answer: 1 = 0 tabanlı ikinci şık (uygulama şeması)', String(res.items[0].answer));
  ok(res.items[1].id === '' && res.items[1].explanation === '', 'eksik alanlar boş stringle dolar');
}
{
  // JSON'da da çok paragraflı gövde + \n korunur
  const res = parseQuestionBulk(JSON.stringify([{ question: 'Gövde.\n\nI. öncül.\n\nII. öncül.', options: ['a', 'b'], answer: 0 }]));
  ok((res.items[0]?.question.match(/\n\n/g) || []).length === 2, 'JSON gövdesindeki paragraflar korunuyor', JSON.stringify(res.items[0]?.question));
}
{
  const res = parseQuestionBulk(JSON.stringify({ questions: [{ question: 'Sarmalı', options: ['a', 'b'], answer: 1 }] }));
  ok(res.items.length === 1, '{"questions":[...]} sarmalaması kabul ediliyor');
  const tr = parseQuestionBulk(JSON.stringify({ sorular: [{ soru: 'Türkçe anahtar', şıklar: ['a', 'b'], doğru: 'b' }] }));
  ok(tr.items[0]?.question === 'Türkçe anahtar' && tr.items[0]?.answer === 1, 'soru/şık/doğru anahtarları da çalışıyor', JSON.stringify(tr));
}
{
  const res = parseQuestionBulk(JSON.stringify([{ question: 'Nesne şıklar', options: { A: 'bir', B: 'iki', C: 'üç' }, answer: 'C' }]));
  ok(res.items[0]?.options.length === 3 && res.items[0]?.answer === 2, 'options nesnesi A→E sırasıyla okundu, cevap harf', JSON.stringify(res.items));
}
{
  const res = parseQuestionBulk(JSON.stringify([{ question: 'Metin şıklar', options: 'bir;iki;üç', answer: 3 }]));
  ok(res.items[0]?.options.length === 3, 'options noktalı virgülle bölündü', JSON.stringify(res.items));
  ok(res.items[0]?.answer === 2, 'aralık dışı sayı 1 tabanlı yorumlandı (3/3 → 2)', String(res.items[0]?.answer));
}
{
  const res = parseQuestionBulk(JSON.stringify([{ question: 'Yıldızlı', options: ['a', '*b', 'c'] }]));
  ok(res.items[0]?.answer === 1, 'şıkkın * işareti cevap oluyor', JSON.stringify(res.items));
}
{
  const res = parseQuestionBulk(JSON.stringify([{ question: 'Roman şık', options: ['I. İstanbul', 'II. Ankara'], answer: 'II. Ankara' }]));
  ok(res.items[0]?.options[0] === 'I. İstanbul', 'Roman rakamlı şık metni bozulmadı', JSON.stringify(res.items[0]?.options));
  ok(res.items[0]?.answer === 1, 'Roman rakamlı şık metni cevap olarak çözüldü', String(res.items[0]?.answer));
}
{
  const res = parseQuestionBulk('[{ bozuk json ');
  ok(res.items.length === 0 && /JSON çözümlenemedi/.test(res.issues[0]?.message || ''), 'bozuk JSON tek net hataya iniyor', JSON.stringify(res.issues));
  const noList = parseQuestionBulk(JSON.stringify({ foo: 1 }));
  ok(/JSON dizisi bulunamadı/.test(noList.issues[0]?.message || ''), 'dizi yoksa yönlendirici mesaj', JSON.stringify(noList.issues));
}

console.log('\x1b[1m[3] yardımcı fonksiyonlar\x1b[0m');
ok(BULK_LETTERS.length === 5, 'beş şık desteği (A-E)');
ok(resolveAnswerToken('B', ['a', 'b', 'c']) === 1, 'resolveAnswerToken harf');
ok(resolveAnswerToken('b şıkkı', ['a', 'b', 'c']) === 1, 'resolveAnswerToken “b şıkkı”');
ok(resolveAnswerToken('C', ['a', 'b']) === null, 'listede olmayan harf null döner');
{
  const res = parseQuestionBulk(sampleBulkText());
  ok(res.items.length === 2 && res.issues.length === 0, 'örnek metin kendi ayrıştırıcısından temiz geçiyor', JSON.stringify(res.issues));
  ok(res.items[0].options.length === 5 && res.items[0].answer === 4, 'örnek: öncüllü sorunun 5 şıkkı ve cevabı E', JSON.stringify(res.items[0]?.options));
  ok(res.items[0].question.includes('III. Antlaşmadaki'), 'örnek: öncüller gövdede');
  ok(res.items[1].options.length === 4 && res.items[1].answer === 0, 'örnek: ikinci soru 4 şıklı, cevap A', JSON.stringify(res.items[1]));
}
ok(formatBulkSummary(parseQuestionBulk('')) === 'Henüz bir şey yapıştırılmadı', 'boş giriş için özet');
ok(/soru hazır/.test(formatBulkSummary(parseQuestionBulk(sampleBulkText()))), 'özet satırında hazır sayısı var');
{
  // hiçbir şey yakalanamazsa yönlendirici not
  const res = parseQuestionBulk('burada hiç soru yok, sadece paragraf');
  ok(res.items.length === 0 && res.notes.length > 0, 'anlamsız giriş notla açıklanıyor', JSON.stringify({ i: res.items.length, n: res.notes }));
}

console.log('\x1b[1m[4] panel bağı (kaynak düzeyinde)\x1b[0m');
const fs = await import('node:fs');
const screen = fs.readFileSync('screens/AdminQuestionsScreen.tsx', 'utf8');
const ctx = fs.readFileSync('lib/AdminContext.tsx', 'utf8');
ok(/from '\.\.\/lib\/questionBulk'/.test(screen), 'ekran ayrıştırıcıyı kullanıyor');
ok(/parseQuestionBulk\(bulkText, \{ maxItems: BULK_DEFAULT_MAX \}\)/.test(screen), 'yapıştırma canlı ayrıştırılıyor');
ok(/\{ id: 'single', label: 'Tekli soru' \}[\s\S]{0,80}\{ id: 'bulk', label: 'Toplu içe aktar' \}/.test(screen), 'Tekli/Toplu anahtarı var');
ok(/admin\.createQuestions\(courseId, docId, list\)/.test(screen), 'toplu kayıt tek mutation ile yazılıyor');
ok(/\{q\.no\}\./.test(screen), 'önizlemede kaynak soru numarası gösteriliyor');
ok(!/no: item\.no/.test(screen), 'soru numarası kayda yazılmıyor (şema temiz kalıyor)');
ok(/bulk\.notes/.test(screen), 'bilgi notları panelde gösteriliyor');
ok(!/onPress=\{openAdd\}/.test(screen), 'openAdd olay nesnesi almıyor (mod açıkça geçiliyor)');
ok(!/topicStrip|topicChip/.test(screen), 'tüm konuları sıralayan eski şerit kaldırıldı');
ok(/const \[pickerOpen, setPickerOpen\] = useState\(false\)/.test(screen), 'konu seçici varsayılan olarak kapalı');
{
  const pickBlock = screen.match(/Konu seç —[\s\S]{0,900}/)?.[0] || '';
  ok(/setDocId\(t\.docId\);[\s\S]{0,80}setPickerOpen\(false\)/.test(pickBlock), 'seçim sonrası liste kapanıyor');
}
ok(/diğerleri için dokun/.test(screen), 'tek satıra kullanıcıya ipucu veriliyor');
ok(/pickerList: \{ maxHeight: 300 \}/.test(screen), 'uzun konu listesi kaydırılabilir yükseklikte');
ok(/createQuestions: \(courseId: CourseId, docId: string, list: Question\[\]\) => void;/.test(ctx), 'context ara-yüzünde createQuestions var');
ok(/label: `\$\{list\.length\} soru toplu eklendi`/.test(ctx), 'etkinlik kaydı toplu eklemeyi raporluyor');
{
  const src = fs.readFileSync('lib/questionBulk.ts', 'utf8');
  ok(!/from 'react-native'|require\('react-native'\)/.test(src), 'ayrıştırıcı saf TS — RN import yok (node’da test edilebilir)');
  ok(!/async |await /.test(src), 'ayrıştırıcı senkron (UI’de her tuş vuruşunda çalışabilir)');
  ok(!/split\(\/\\n\[ \\t\]\*\\n/.test(src), 'boş satırı blok ayıracı sayan eski mantık kaldırıldı');
}

console.log(`\n\x1b[1m${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} kontrol\x1b[0m\n`);
process.exit(fail ? 1 : 0);
