/**
 * lib/contentCopy.ts sözleşme testi — ağ gerekmez.
 *
 * Kopyalama artık İKİ Supabase projesi arasında yapılır: kaynak yalnız okunan
 * bir projedir (panelde adres yazılır), hedef `config/supabaseApp.ts`'teki
 * projedir. Bu test iki sahte proje kurar ve akışı geçit sözleşmesi üzerinden
 * ölçer: plan → yazma → doğrulama → "var olanı atla" → red hâli.
 *
 * Çalıştır: npm run test:copy
 */
import { createFakeSupabase } from './db-contract-fake.mjs';

const SRC_URL = 'https://src.supabase.co';
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${extra}`); }
};
let pass = 0;
let fail = 0;
const head = t => console.log(`\x1b[1m${t}\x1b[0m`);

/* ---------------------------------------------------------- iki sahte proje */

const srcFake = createFakeSupabase();
const dstFake = createFakeSupabase();

// Kaynak içerik (devre dışı bırakılmış eski proje): 2 ders, 3 konu, 12 soru, 3 hap bilgi.
srcFake.db.courses.set('tarih', { id: 'tarih', title: 'Tarih', order: 1, schemaVersion: 1 });
srcFake.db.courses.set('cografya', { id: 'cografya', title: 'Coğrafya', order: 2, schemaVersion: 1 });
srcFake.db.topics.set('tarih/t1', {
  meta: { id: 't1', name: 'İlk konu', questionCount: 3, questions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
  questions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
});
srcFake.db.topics.set('tarih/t2', {
  meta: { id: 't2', name: 'İkinci konu', questionCount: 7, questions: [{ id: 'd' }, { id: 'e' }, { id: 'f' }, { id: 'g' }, { id: 'h' }, { id: 'ı' }, { id: 'i' }] },
  questions: [{ id: 'd' }, { id: 'e' }, { id: 'f' }, { id: 'g' }, { id: 'h' }, { id: 'ı' }, { id: 'i' }],
});
srcFake.db.topics.set('cografya/c1', {
  meta: { id: 'c1', name: 'Coğrafya konu', questionCount: 2, questions: [{ id: 'x' }, { id: 'y' }] },
  questions: [{ id: 'x' }, { id: 'y' }],
});
srcFake.db.tips.push({ body: '1' }, { body: '2' }, { body: '3' });
// Hedef boş ama yönetici oturumu içerik yazabiliyor (içerik kilizi kapalı).
dstFake.db.admins.add('admin@ornek.com');

let maxActive = 0;
let active = 0;
const seen = [];
// Kaynak adresi hangi projeyse o sahteye gider; gerisi hedef (deponun anahtarı).
async function routeFetch(url, init) {
  const u = String(url);
  seen.push({ u, method: (init?.method || 'GET').toUpperCase(), body: init?.body ? String(init.body) : '' });
  active++;
  maxActive = Math.max(maxActive, active);
  try {
    return await (u.includes('//src.') ? srcFake : dstFake).fetchImpl(url, init);
  } finally {
    active--;
  }
}
globalThis.fetch = routeFetch;

const CC = await import('/tmp/copyBundle.mjs');
const { planCopy, runCopy, describeCopyPlan, verifyCopy, sourceBase, normalizeSourceUrl, refOf, countQuestions, countTargetTopics, LEGACY_SOURCE } = CC;

head('\x1b[1m[1] kaynak adresi çözülüyor\x1b[0m');
ok(LEGACY_SOURCE.url === '', 'deponun varsayılan kaynağı boş (kendi kendine kopya yok)');
ok(normalizeSourceUrl('src') === SRC_URL, 'yalnız ref → tam adres', normalizeSourceUrl('src'));
ok(normalizeSourceUrl('https://src.supabase.co/') === SRC_URL, 'gereksiz eğik çizgi temizleniyor', normalizeSourceUrl('https://src.supabase.co/'));
ok(refOf(SRC_URL) === 'src', 'ref çözülüyor', refOf(SRC_URL));
ok(sourceBase({ url: SRC_URL }).includes('/rest/v1'), 'kaynak tabanı Supabase REST geçidi', sourceBase({ url: SRC_URL }));
const noSrc = await planCopy('');
ok(noSrc.error === 'Kaynak adresi boş.', 'boş adres net cümleyle reddediliyor', JSON.stringify(noSrc).slice(0, 120));
ok(noSrc.docs.length === 0 && noSrc.courses === 0, 'hatada plan boş');

head('\x1b[1m[2] plan kaynak taranarak çıkıyor\x1b[0m');
let plan = await planCopy('src');
ok(!plan.error, 'plan alındı', plan.error);
ok(plan.courses === 2, '2 ders', String(plan.courses));
ok(plan.topics === 3, '3 konu', String(plan.topics));
ok(plan.tips === 1, 'hap bilgi belgesi planlandı', String(plan.tips));
ok(plan.docs.reduce((n, d) => n + countQuestions(d.json), 0) === 12, '12 soru planlandı', String(plan.docs.length));
ok(plan.docs.some(d => d.path === 'courses/tarih'), 'ders yolu olduğu gibi taşınıyor', JSON.stringify(plan.docs.map(d => d.path)).slice(0, 160));
ok(plan.docs.some(d => d.path === 'courses/tarih/topics/t2'), 'konu tam yoluyla listede');
ok(countQuestions(undefined) === 0 && countQuestions({ questions: 'yok' }) === 0, 'sorular dizi değilse sıfır sayılıyor');
ok(/src → /.test(describeCopyPlan(plan)) && /2 ders • 3 konu • 1 hap bilgi/.test(describeCopyPlan(plan)), 'özet satır biçimi', describeCopyPlan(plan));
const srcReads = seen.filter(s => s.u.includes('//src.') && (s.u.includes('kpss_read_doc') || s.u.includes('kpss_list_docs'))).length;
const srcWrites = seen.filter(s => s.u.includes('//src.') && s.u.includes('kpss_write_doc')).length;
ok(srcReads >= 5, 'kaynak listelenip konu konu okundu', String(srcReads));
ok(srcWrites === 0, 'kaynağa hiçbir yazma gitmedi (salt-okunur)', String(srcWrites));

head('\x1b[1m[3] kopya hedefe yazılıyor\x1b[0m');
const auth = await import('/tmp/authBundle.mjs');
const su = await auth.signUp('admin@ornek.com', 'GoodPass1');
ok(su.ok === true, 'hedef yönetici oturumu açıldı (içerik yazması RLS’te yönetici ister)', su.error);
const progress = [];
const res = await runCopy(plan, { onProgress: p => progress.push({ ...p }) });
ok(!res.error, 'yazmalar tamamlandı', res.error);
ok(res.copied === plan.docs.length, `${plan.docs.length} belge kopyalandı`, JSON.stringify(res).slice(0, 160));
ok(res.failed.length === 0, 'başarısız belge yok', JSON.stringify(res.failed).slice(0, 160));
ok(res.questions === 12, '12 soru hedefe geçti', String(res.questions));
ok(dstFake.db.courses.has('tarih') && dstFake.db.courses.has('cografya'), 'ders satırları hedefte duruyor', JSON.stringify([...dstFake.db.courses.keys()]));
ok(dstFake.db.topics.get('tarih/t2')?.questions?.length === 7, 'soru dizisi hedefte korunuyor', JSON.stringify(dstFake.db.topics.get('tarih/t2')?.questions?.length));
ok(dstFake.db.tips.length === 3, 'hap bilgiler hedefte', String(dstFake.db.tips.length));
ok((await countTargetTopics('tarih')) === 2, 'hedef konu sayımı listelemeden geldi', String(await countTargetTopics('tarih')));
ok(verifyCopy(plan, res).startsWith('Doğrulandı'), 'doğrulama cümlesi', verifyCopy(plan, res));
ok(progress.length >= plan.docs.length && progress[progress.length - 1].done === plan.docs.length, 'ilerleme akışı tamamlandı', JSON.stringify(progress.slice(-1)));
ok(maxActive >= 1 && maxActive <= 8, `aynı anda en fazla 8 yazma (${maxActive})`);
const writes = seen.filter(s => !s.u.includes('//src.') && s.u.includes('kpss_write_doc'));
ok(writes.length === plan.docs.length, 'her belge tek yazma istediği', `${writes.length}/${plan.docs.length}`);
ok(writes.every(s => s.body.includes('"p_path"')), 'yazma RPC gövdesi yolu taşıyor');

head('\x1b[1m[4] yarım işi devam ettirme ve red hâli\x1b[0m');
const again = await runCopy(plan, { skipExisting: true });
ok(again.copied === 0 && again.skipped === plan.docs.length, 'var olanlar atlandı (yarım iş yeniden tam yazmıyor)', JSON.stringify(again).slice(0, 160));
const forced = await runCopy(plan);
ok(forced.copied === plan.docs.length, '“atla” kapalıyken baştan yazılıyor', JSON.stringify(forced).slice(0, 120));
ok(verifyCopy(plan, forced).startsWith('Doğrulandı'), 'zorlanmış kopya da doğrulanıyor');

// Sunucu yazmayı keserse (oturum düşmüş / kilit açık) hata yutulmaz: belge belge
// başarısız listeye yazılır ve panelde gösterilecek cümleye dönüşür.
dstFake.injectWith(() => ({ status: 403, body: { code: '42501', message: 'only an admin may write content rows' } }));
const blocked = await runCopy({ ...plan, docs: [{ path: 'courses/biyoloji', json: { id: 'biyoloji', title: 'Biyoloji', order: 3 } }] });
ok(!dstFake.db.courses.has('biyoloji'), 'reddedilen yazma hedefte satır bırakmadı');
ok(blocked.copied === 0 && blocked.failed.length === 1, 'kimliksiz içerik yazması reddedildi', JSON.stringify(blocked).slice(0, 200));
ok(/tekrar dene|kilizi|RLS/i.test(String(blocked.error)), 'ret mesajı sonraki adımı söylüyor', blocked.error);
const emptyRun = await runCopy({ ...plan, docs: [] });
ok(emptyRun.error === 'Kopyalanacak belge yok.', 'boş plan yazmaya kalkışmıyor', JSON.stringify(emptyRun));
ok(verifyCopy(plan, { ...res, questions: 3 }).startsWith('Eksik'), 'eksik kopya “Eksik” diyor', verifyCopy(plan, { ...res, questions: 3 }));
dstFake.clearInject();
await auth.signOut();
ok(await auth.currentIdToken() === null, 'oturum kapatılınca token yok (panel yeniden giriş ister)');

head('\x1b[1m[5] kaynak çökerse plan dürüst kalıyor\x1b[0m');
const broken = createFakeSupabase();
globalThis.fetch = async (url, init) => (String(url).includes('//src.') ? json500() : broken.fetchImpl(url, init));
function json500() {
  return { ok: false, status: 500, text: async () => '{"error":"boom"}', json: async () => ({ error: 'boom' }) };
}
const badPlan = await planCopy('src');
ok(badPlan.error === 'Kaynak okunamadı ya da içerik boş.', 'okunamayan kaynak uydurma plan üretmiyor', JSON.stringify(badPlan).slice(0, 140));
ok(badPlan.docs.length === 0, 'okunamayan kaynakta belge listesi boş');
globalThis.fetch = routeFetch;
const selfPlan = await planCopy('kpssdemo');
ok(selfPlan.notes.some(x => /Kaynak = hedef proje/.test(x)), 'kendi projesi kaynak seçilirse uyarı veriyor', JSON.stringify(selfPlan.notes));
const srcDocWrites = seen.filter(s => s.u.includes('//src.') && s.method === 'POST' && s.u.includes('kpss_write_doc')).length;
ok(srcDocWrites === 0, 'kaynak projeye hiçbir yazma RPC’si gitmedi (salt-okunur)', String(srcDocWrites));

console.log(`\n${fail ? '\x1b[31m✗' : '\x1b[32m✓'} ${pass}/${pass + fail} kopya sözleşmesi denetimi ${fail ? `${fail} başarısız` : 'geçti'}\x1b[0m`);
process.exit(fail ? 1 : 0);
