/**
 * lib/contentCopy.ts sözleşme testi — sahte Firestore REST'i (ağ gerekmez).
 * Çalıştır: npm run test:copy
 */
const s = id => ({ stringValue: id });
const n = v => ({ integerValue: String(v) });
const listOf = arr => ({ arrayValue: { values: arr.map(o => ({ mapValue: { fields: o } })) } });

/** Map<path "root'a göre tam yol", fields> biçiminde kaynak/hedef belgeleri tutar. */
function makeFake({ src, dst, opts = {} }) {
  const state = { srcWrites: 0, dstWrites: [], active: 0, maxActive: 0, reads: 0, failPaths: new Set(opts.failReadOn || []) };
  const parentOf = p => p.split('/').slice(0, -1).join('/');

  const listFrom = (map, collPath, query) => {
    const keys = [...map.keys()].filter(k => parentOf(k) === collPath).sort();
    if (!keys.length) return null; // 404
    const size = Number(query.get('pageSize')) || 30;
    const page = Number(query.get('pageToken') || '0');
    const slice = keys.slice(page * size, page * size + size);
    const body = { documents: slice.map(name => ({ name: `projects/P/databases/D/documents/${name}`, fields: map.get(name) })) };
    if ((page + 1) * size < keys.length) body.nextPageToken = String(page + 1);
    return body;
  };

  const handler = async (url, init) => {
    const u = new URL(url);
    const marker = '/documents/';
    const i = u.pathname.indexOf(marker);
    const rel = i >= 0 ? decodeURIComponent(u.pathname.slice(i + marker.length)) : '';
    const isSrc = url.includes('/projects/SRC/');
    const map = isSrc ? src : dst;
    const method = (init?.method || 'GET').toUpperCase();
    state.active++;
    state.maxActive = Math.max(state.maxActive, state.active);
    await new Promise(r => setTimeout(r, 1));
    state.active--;
    const reply = (status, body) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body == null ? '' : JSON.stringify(body)),
      json: async () => body,
    });
    if (method === 'GET') {
      state.reads++;
      if (state.failPaths.has(rel)) return reply(500, { error: { message: 'simüle kaynak hatası' } });
      if (u.searchParams.has('pageSize')) {
        const body = listFrom(map, rel, u.searchParams);
        return body ? reply(200, body) : reply(404, { error: { message: 'NOT_FOUND' } });
      }
      return map.has(rel) ? reply(200, { name: rel, fields: map.get(rel) }) : reply(404, { error: { message: 'NOT_FOUND' } });
    }
    if (method === 'PUT') {
      const body = JSON.parse(init.body);
      if (isSrc) state.srcWrites++;
      else state.dstWrites.push({ path: rel, fields: body.fields });
      map.set(rel, body.fields || {});
      return reply(200, { name: rel, fields: body.fields || {} });
    }
    return reply(400, { error: { message: `UNSUPPORTED ${method}` } });
  };
  return { fetch: handler, state };
};

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${extra}`); }
};

const CC = await import('/tmp/copyBundle.mjs');
const { planCopy, runCopy, describeCopyPlan, sourceBase, listCollection } = CC;

console.log('\x1b[1m[1] kaynak düzeni otomatik bulunuyor\x1b[0m');
const legacySrc = new Map([
  ['artifacts/SRC/public/data/courses/tarih', { id: s('tarih'), title: s('Tarih'), order: n(1) }],
  ['artifacts/SRC/public/data/courses/tarih/topics/t1', { id: s('t1'), name: s('İlk konu'), questionCount: n(3), questions: listOf([{ id: s('a') }, { id: s('b') }, { id: s('c') }]) }],
  ['artifacts/SRC/public/data/courses/tarih/topics/t2', { id: s('t2'), name: s('İkinci konu'), questionCount: n(7) }],
  ['artifacts/SRC/public/data/courses/cografya/topics/c1', { id: s('c1'), name: s('Coğrafya konu'), questions: listOf([{ id: s('x') }, { id: s('y') }]) }],
  ['artifacts/SRC/public/data/courses/cografya', { id: s('cografya'), title: s('Coğrafya'), order: n(2) }],
  ['artifacts/SRC/public/data/daily_tips/main', { list: listOf([{ t: s('1') }, { t: s('2') }, { t: s('3') }]) }],
]);
const emptyDst = new Map();
let fake = makeFake({ src: legacySrc, dst: emptyDst });
globalThis.fetch = fake.fetch;

let plan = await planCopy('SRC');
ok(!plan.error, 'plan alındı', plan.error);
ok(plan.source.root === 'artifacts/SRC/public/data', 'legacy öneki bulundu: ' + plan.source.root);
ok(plan.courses.length === 2, '2 ders', String(plan.courses.length));
ok(plan.topics.length === 3, '3 konu', JSON.stringify(plan.topics.map(t => t.topicDocId)));
ok(plan.totalQuestions === 12, `soru toplamı 12 olmalı, ${plan.totalQuestions} geldi`);
ok(plan.tips === 3 && plan.tipsAvailable, 'hap bilgi 3');
ok(/2 ders • 3 konu • 12 soru • 3 hap bilgi/.test(describeCopyPlan(plan)), 'özet metin biçimi', describeCopyPlan(plan));
ok(plan.courses[0].title === 'Tarih' || plan.courses.find(c => c.title === 'Tarih'), 'ders başlığı okundu');

console.log('\x1b[1m[2] kök düzeni (yeni tip kaynak)\x1b[0m');
const rootSrc = new Map([['courses/tarih', { id: s('tarih'), title: s('Tarih') }], ['courses/tarih/topics/t1', { id: s('t1'), questions: listOf([{ id: s('a') }]) }]]);
fake = makeFake({ src: rootSrc, dst: new Map() });
globalThis.fetch = fake.fetch;
plan = await planCopy('SRC');
ok(plan.source.root === '' && plan.notes.some(x => /kök/.test(x)), 'kök düzenine düşüldü', JSON.stringify(plan.notes));
ok(plan.totalQuestions === 1 && plan.tipsAvailable === false, 'konu sayıldı, hap bilgi yok diye işaretli');
const noSrc = await planCopy('YOK-Proje');
ok(!!noSrc.error && /proje kimliği/.test(noSrc.error), 'boş kaynakta anlaşılır hata', noSrc.error);

console.log('\x1b[1m[3] kopyalama (PUT hedefe, fields olduğu gibi)\x1b[0m');
const dst2 = new Map();
fake = makeFake({ src: legacySrc, dst: dst2 });
globalThis.fetch = fake.fetch;
plan = await planCopy('SRC');
const progress = [];
const result = await runCopy(plan, { concurrency: 4, onProgress: p => progress.push({ ...p }) });
ok(result.copied === 6, `6 belge yazılmalı (2 ders + 3 konu + tips), ${result.copied} yazıldı`, JSON.stringify(result.failed));
ok(result.failed.length === 0, 'hata yok', JSON.stringify(result.failed));
ok(dst2.has('courses/tarih'), 'hedef: kök düzeninde yazdı (ön ek yok)');
ok(dst2.has('courses/tarih/topics/t2') && dst2.has('daily_tips/main'), 'konu ve hap bilgi hedefte');
ok(
  JSON.stringify(dst2.get('courses/tarih/topics/t1')) ===
    JSON.stringify(legacySrc.get('artifacts/SRC/public/data/courses/tarih/topics/t1')),
  'soru içeriği bayt bayt aynı (alan adları değişmedi)'
);
ok(fake.state.dstWrites.length === 6 && fake.state.srcWrites === 0, 'kaynağa hiç yazılmadı');
ok(fake.state.maxActive <= 8, `eşzamanlılık sınırlı (tepe ${fake.state.maxActive})`);
ok(progress.length === 6 && progress[5].done === 6, 'ilerleme her belgede raporlandı', JSON.stringify(progress.map(p => p.done)));
ok(progress.every((p, idx) => idx === 0 || p.done >= progress[idx - 1].done), 'ilerleme monoton artıyor');
ok(progress[progress.length - 1].questions === 12, 'ilerlemede soru sayacı 12');

console.log('\x1b[1m[4] skipExisting + hata toleransı\x1b[0m');
const before = fake.state.dstWrites.length;
const again = await runCopy(plan, { concurrency: 4, skipExisting: true });
ok(again.skipped === 6 && again.copied === 0, `ikinci tur atlamalı (atlanan ${again.skipped})`);
ok(fake.state.dstWrites.length === before, 'skipExisting hedefe hiç yazmadı');
const badDst = new Map();
const badFake = makeFake({
  src: legacySrc,
  dst: badDst,
  // makeFake imzası: { src, dst, opts } — okuma hatası simülasyonu opts içinde
  opts: { failReadOn: new Set(['artifacts/SRC/public/data/courses/tarih/topics/t2']) },
});
globalThis.fetch = badFake.fetch;
const partial = await runCopy(await planCopy('SRC'), { concurrency: 2 });
ok(partial.failed.length === 1 && /simüle kaynak hatası/.test(partial.failed[0]), 'bozulan belge raporlandı, diğerleri devam etti', JSON.stringify(partial.failed));
ok(partial.copied === 5, `5 belge kopyalandı, ${partial.copied}`, JSON.stringify(partial));

console.log('\x1b[1m[5] liste/okuma yardımcıları\x1b[0m');
globalThis.fetch = makeFake({ src: legacySrc, dst: new Map() }).fetch;
const pageList = await listCollection(sourceBase({ projectId: 'SRC', root: 'artifacts/SRC/public/data' }), 'courses', { pageSize: 1 });
ok(pageList.docs.length === 2 && !pageList.error, 'pageToken ile sayfalama tamamlandı', JSON.stringify(pageList));
const missing = await listCollection(sourceBase({ projectId: 'SRC', root: 'yok' }), 'courses', {});
ok(missing.docs.length === 0 && !missing.error, 'olmayan koleksiyon = boş liste (hata değil)');

console.log('\x1b[1m[6] panel bağı (kaynak düzeyinde)\x1b[0m');
const fs = await import('node:fs');
const panel = fs.readFileSync('screens/AdminSettingsScreen.tsx', 'utf8');
ok(/from '\.\.\/lib\/contentCopy'/.test(panel), 'panel contentCopy modülünü kullanıyor');
ok(/await planCopy\(copySrc\.trim\(\) \|\| LEGACY_SOURCE\.projectId\)/.test(panel), '“Kaynağı tara” düğmesi planCopy çağırıyor');
ok(/runCopy\(copyPlan,\s*\{\s*concurrency: 4,\s*skipExisting: copySkip,/.test(panel), 'kopyalama 4 eşzamanlı + atla seçeneğiyle çalışıyor');
ok(/setLockState\(await readLockState\(\)\)/.test(panel), 'kopyalama sonrası kilit rozeti tazeleniyor');
ok(/meta\/content_lock var → içerik yazma kapalı/.test(panel), 'kilit durumunda uyarı gösteriliyor');
const src = fs.readFileSync('lib/contentCopy.ts', 'utf8');
ok(/CANDIDATE_ROOTS[\s\S]{0,140}?\[\s*`artifacts\/\$\{projectId\}\/public\/data`,\s*''/.test(src), 'kök adayı sırası: önce legacy öneki, sonra kök');
ok(!/initializeApp|from ['\"]firebase/.test(src), 'içerik kopyalama Firebase SDK kullanmıyor (REST sadece)');

console.log(`\n\x1b[1m${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} kontrol\x1b[0m\n`);
process.exit(fail ? 1 : 0);
