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
  ok(res.items[1].explanation === '', 'açıklama olmayan soru boş diziyle döner');
}
{
  // boş satır yok: "1." / "2." numaralarından bölünmeli
  const res = parseQuestionBulk(
    T([
      '1. Birinci soru?',
      'A) a',
      'B) b',
      'Doğru: A',
      '2. İkinci soru?',
      'A) c',
      'B) d',
      'Doğru: B',
    ])
  );
  ok(res.items.length === 2, `boş satırsız metin numaradan bölündü (${res.items.length})`);
  ok(res.items[0].question === 'Birinci soru?', 'soru numarası metinden temizlendi', res.items[0].question);
}
{
  // madde imli şıklar + * işareti doğru cevabı verir
  const res = parseQuestionBulk(
    T(['Başkent?', '- İstanbul', '* Ankara', '- İzmir', '- Sivas'])
  );
  ok(res.items.length === 1, `madde imli şıklar okundu (${res.items.length})`, JSON.stringify(res.issues));
  ok(res.items[0]?.answer === 1, 'yıldızlı şık doğru cevap sayıldı', String(res.items[0]?.answer));
  ok(!res.items[0]?.options.some(o => o.includes('*')), 'yıldız işareti şık metninden temizlendi');
}
{
  const res = parseQuestionBulk(T(['Sadece soru metni?', 'A) tek şık', 'Doğru: A']));
  ok(res.items.length === 0 && /En az 2 şık/.test(res.issues[0]?.message || ''), 'tek şık reddedildi', JSON.stringify(res.issues));
}
{
  const res = parseQuestionBulk(
    T(['Şıkkı olmayan soru?', 'A) a', 'B) b', 'C) c', 'D) d', 'E) e', 'F) f', 'Doğru: A'])
  );
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
  ok(res.items.length === 2 && res.truncated && /Üst sınır/.test(res.issues.map(i => i.message).join(' ')), 'maxItems aşımı uyarıya dönüşüyor', JSON.stringify(res.issues));
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
  ok(res.items[0].options.length === 4 && res.items[0].answer === 1, 'örnek metnin ilk sorusu doğru', JSON.stringify(res.items[0]));
}
ok(formatBulkSummary(parseQuestionBulk('')) === 'Henüz bir şey yapıştırılmadı', 'boş giriş için özet');
ok(/soru hazır/.test(formatBulkSummary(parseQuestionBulk(sampleBulkText()))), 'özet satırında hazır sayısı var');

console.log('\x1b[1m[4] panel bağı (kaynak düzeyinde)\x1b[0m');
const fs = await import('node:fs');
const screen = fs.readFileSync('screens/AdminQuestionsScreen.tsx', 'utf8');
const ctx = fs.readFileSync('lib/AdminContext.tsx', 'utf8');
ok(/from '\.\.\/lib\/questionBulk'/.test(screen), 'ekran ayrıştırıcıyı kullanıyor');
ok(/parseQuestionBulk\(bulkText, \{ maxItems: BULK_DEFAULT_MAX \}\)/.test(screen), 'yapıştırma canlı ayrıştırılıyor');
ok(/\{ id: 'single', label: 'Tekli soru' \}[\s\S]{0,80}\{ id: 'bulk', label: 'Toplu içe aktar' \}/.test(screen), 'Tekli/Toplu anahtarı var');
ok(/admin\.createQuestions\(courseId, docId, list\)/.test(screen), 'toplu kayıt tek mutation ile yazılıyor');
ok(!/onPress=\{openAdd\}/.test(screen), 'openAdd olay nesnesi almıyor (mod açıkça geçiliyor)');
ok(!/topicStrip|topicChip/.test(screen), 'tüm konuları sıralayan eski şerit kaldırıldı');
ok(/const \[pickerOpen, setPickerOpen\] = useState\(false\)/.test(screen), 'konu seçici varsayılan olarak kapalı');
{
  const pickBlock = screen.match(/Konu seç —[\s\S]{0,900}/)?.[0] || '';
  ok(/setDocId\(t\.docId\);[\s\S]{0,80}setPickerOpen\(false\)/.test(pickBlock), 'seçim sonrası liste kapanıyor');
}
ok(/diğerleri için dokun/.test(screen), 'tek satıra kullanıcıya ipucu veriliyor');
ok(/styles\.pickerList: \{ maxHeight: 300 \}/.test(screen) || /pickerList: \{ maxHeight: 300 \}/.test(screen), 'uzun konu listesi kaydırılabilir yükseklikte');
ok(/createQuestions: \(courseId: CourseId, docId: string, list: Question\[\]\) => void;/.test(ctx), 'context ara-yüzünde createQuestions var');
ok(/label: `\$\{list\.length\} soru toplu eklendi`/.test(ctx), 'etkinlik kaydı toplu eklemeyi raporluyor');
{
  const src = fs.readFileSync('lib/questionBulk.ts', 'utf8');
  ok(!/from 'react-native'|require\('react-native'\)/.test(src), 'ayrıştırıcı saf TS — RN import yok (node’da test edilebilir)');
  ok(!/async |await /.test(src), 'ayrıştırıcı senkron (UI’de her tuş vuruşunda çalışabilir)');
}

console.log(`\n\x1b[1m${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} kontrol\x1b[0m\n`);
process.exit(fail ? 1 : 0);
