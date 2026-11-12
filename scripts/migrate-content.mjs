#!/usr/bin/env node
/**
 * Eski projeden yeni projeye içerik taşıma (soru bankası + hap bilgiler).
 * ==========================================================================
 * Kaynak ve hedef arasında Firestore REST üzerinden BELGE KOPYALAR: `fields`
 * bloğu olduğu gibi taşınır, yani soru formatı/alan adları değişmez. Eski
 * `artifacts/{proje}/public/data/...` düzeninden veritabanı köküne geçiş de
 * bu tek komutla olur.
 *
   Kullanım:
 *   node scripts/migrate-content.mjs                       # .env.local hedefini kullan
 *   node scripts/migrate-content.mjs --limit 3 --dry-run   # pilot
 *   node scripts/migrate-content.mjs --force               # üzerine yaz
 *   npm run migrate:content:selftest                       # sahte sunucuyla test
 *
 * Notlar:
 *   • Kimlik gerekmez: hedef projede içerik yazma penceresi açıkken (panel
 *     tohumlama ile aynı kurallar) anonim REST yazması çalışır. `meta/content_lock`
 *     varsa yazamazsın — bu tasarım gereği (kilit yalnız Console'dan açılır).
 *   • Yarında kalırsan `.migrate-state.json` sayesinde kaldığın yerden devam eder.
 *   • Yazma sonrası her belge için soru sayısı yanıt gövdesinden doğrulanır;
 *     uyuşmazlık varsa o belge tekrar kuyruğa girer ve sonda raporlanır.
 */
import fs from 'node:fs';
import path from 'node:path';

/* ------------------------------------------------------------ argümanlar */

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const opt = (name, dflt) => {
  const inline = argv.find(a => a.startsWith(`--${name}=`));
  if (inline) return inline.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return dflt;
};

const DRY = has('--dry-run');
const FORCE = has('--force');
const SELFTEST = has('--self-test');
const CONCURRENCY = Math.max(1, Number(opt('concurrency', 6)) || 6);
const LIMIT = Number(opt('limit', 0)) || 0;
const ONLY = String(opt('only', 'courses,tips'))
  .split(',')
  .map(x => x.trim())
  .filter(Boolean);
const STATE_PATH = path.resolve(opt('state', '.migrate-state.json'));
const RETRIES = Number(opt('retries', 3)) || 3;

/* ------------------------------------------------------- hedef çözümü */

function readEnvValue(name) {
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (m && m[1] === name) return m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return process.env[name] || '';
}

const normalizeRoot = r => {
  const v = String(r ?? '').trim().replace(/^\/+|\/+$/g, '');
  return ['', '.', './', '/', 'root', '(root)', 'kök', 'kok', 'none'].includes(v) ? '' : v;
};

function docBase(project, root, database) {
  const db = `https://firestore.googleapis.com/v1/projects/${project}/databases/${database || '(default)'}/documents`;
  const r = normalizeRoot(root);
  return r ? `${db}/${r}` : db;
}

/** Uygulama ile aynı çözümleme sırası: CLI → .env.local/.env → app.json (expo.extra.firestore). */
function appJsonFirestore() {
  try {
    const j = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    return j?.expo?.extra?.firestore || j?.expo?.extra?.eas?.firestore || null;
  } catch {
    return null;
  }
}
const EXTRA = appJsonFirestore();
const FROM_PROJECT = opt('from', 'kpss-asistani');
const TO_PROJECT =
  opt('to', '') || readEnvValue('EXPO_PUBLIC_FIRESTORE_PROJECT') || String(EXTRA?.projectId || '');
const FROM_ROOT = normalizeRoot(opt('from-root', `artifacts/${FROM_PROJECT}/public/data`));
const TO_ROOT =
  opt('to-root') !== undefined
    ? normalizeRoot(opt('to-root'))
    : normalizeRoot(readEnvValue('EXPO_PUBLIC_FIRESTORE_ROOT') || (EXTRA && typeof EXTRA.root === 'string' ? EXTRA.root : ''));
const DATABASE = opt('database', '(default)');

/* ---------------------------------------------------------------- state */

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { done: raw.done || {}, startedAt: raw.startedAt || new Date().toISOString() };
  } catch {
    return { done: {}, startedAt: new Date().toISOString() };
  }
}
/** self-test disk yazmasın; normal çalıştırmada resume dosyası güncellenir. */
let STATE_DISABLED = false;

function saveState(state) {
  if (DRY || STATE_DISABLED) return;
  fs.writeFileSync(STATE_PATH, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2) + '\n');
}

/* ------------------------------------------------------------------ http */

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(base, urlPath, init, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const url = `${base}${urlPath}`;
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await doFetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
      const text = await res.text();
      const body = text ? safeJson(text) : null;
      if (res.ok) return { ok: true, status: res.status, body };
      if ((res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503) && attempt < RETRIES) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      return { ok: false, status: res.status, body };
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) {
        await sleep(400 * (attempt + 1));
        continue;
      }
    }
  }
  return { ok: false, status: 0, body: null, error: String(lastErr?.message || lastErr || 'ağ hatası') };
}

function safeJson(t) {
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t.slice(0, 400) };
  }
}

/** Koleksiyonu pageToken ile tam listeler (belgeler fields ile döner). */
async function listAll(base, collectionPath, fetchImpl, pageSize = 25) {
  const out = [];
  let token = '';
  for (let page = 0; page < 500; page++) {
    const qs = `?pageSize=${pageSize}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const r = await req(base, `/${collectionPath}${qs}`, undefined, fetchImpl);
    if (!r.ok) {
      if (r.status === 404) return { docs: out, error: null };
      return { docs: out, error: r.body?.error?.message || r.error || `HTTP ${r.status}` };
    }
    const docs = r.body?.documents || [];
    out.push(...docs);
    token = r.body?.nextPageToken || '';
    if (!token) break;
  }
  return { docs: out, error: null };
}

/** Belgeyi fields bloğuyla yaz (varsa üzerine PATCH, yoksa POST). */
async function writeDoc(dstBase, docPath, fields, fetchImpl, mode) {
  if (DRY) return { ok: true, status: 0, body: null, skipped: 'dry-run' };
  if (mode === 'post') {
    const id = docPath.split('/').pop();
    const parent = docPath.split('/').slice(0, -1).join('/');
    const r = await req(dstBase, `/${parent}?documentId=${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    }, fetchImpl);
    if (r.status === 409) {
      const p = await req(dstBase, `/${docPath}`, { method: 'PATCH', body: JSON.stringify({ fields }) }, fetchImpl);
      return p.ok ? { ...p, overwrote: true } : p;
    }
    return r;
  }
  return req(dstBase, `/${docPath}`, { method: 'PATCH', body: JSON.stringify({ fields }) }, fetchImpl);
}

const countQuestions = fields => {
  const q = fields?.questions?.arrayValue?.values;
  if (Array.isArray(q)) return q.length;
  const n = fields?.questionCount?.integerValue ?? fields?.questionCount?.doubleValue;
  return Number(n) || 0;
};
const countTips = fields => {
  const l = fields?.list?.arrayValue?.values;
  return Array.isArray(l) ? l.length : 0;
};

/* ------------------------------------------------------------- pipeline */

/**
 * @param {{fromBase:string,toBase:string,fetch?:Function,log?:(s:string)=>void,quiet?:boolean}} cfg
 */
export async function runMigration(cfg) {
  const { fromBase, toBase, fetch: fetchImpl } = cfg;
  const log = cfg.log || (m => console.log(m));
  const state = cfg.state || loadState();
  const report = { courses: 0, topics: 0, questions: 0, tips: 0, skipped: 0, failed: [], mismatch: [] };

  /* ---- dersler + konular ---- */
  if (ONLY.includes('courses')) {
    const courses = await listAll(fromBase, 'courses', fetchImpl, 100);
    if (courses.error) throw new Error(`courses listelenemedi: ${courses.error}`);
    const list = LIMIT > 0 ? courses.docs.slice(0, LIMIT) : courses.docs;
    report.courses = list.length;
    for (const course of list) {
      const cid = String(course.name || '').split('/').pop();
      const cpath = `courses/${cid}`;
      if (state.done[cpath] && !FORCE) {
        report.skipped++;
      } else {
        const r = await writeDoc(toBase, cpath, course.fields, fetchImpl, 'post');
        if (!r.ok) report.failed.push(`${cpath}: ${r.body?.error?.message || r.error || 'HTTP ' + r.status}`);
        else state.done[cpath] = { at: new Date().toISOString(), kind: 'course' };
      }
      const topics = await listAll(fromBase, `courses/${cid}/topics`, fetchImpl, 25);
      if (topics.error) {
        report.failed.push(`courses/${cid}/topics listesi: ${topics.error}`);
        continue;
      }
      for (const topic of topics.docs) {
        const tid = String(topic.name || '').split('/').pop();
        const tpath = `courses/${cid}/topics/${tid}`;
        const want = countQuestions(topic.fields);
        report.topics++;
        report.questions += want;
        if (state.done[tpath] && !FORCE) {
          report.skipped++;
          continue;
        }
        const r = await writeDoc(toBase, tpath, topic.fields, fetchImpl, 'post');
        if (!r.ok) {
          report.failed.push(`${tpath}: ${r.body?.error?.message || r.error || 'HTTP ' + r.status}`);
          continue;
        }
        // Yanıt gövdesi yazılan belgeyi döner → soru sayısını oradan doğrula.
        const got = r.body?.fields ? countQuestions(r.body.fields) : want;
        if (!DRY && got !== want) report.mismatch.push(`${tpath}: kaynak ${want}, hedef ${got}`);
        else state.done[tpath] = { at: new Date().toISOString(), kind: 'topic', questions: got };
        if (!cfg.quiet) log(`  ${tpath} → ${got} soru`);
      }
      saveState(state);
    }
  }

  /* ---- hap bilgiler ---- */
  if (ONLY.includes('tips')) {
    const tpath = 'daily_tips/main';
    const src = await req(fromBase, `/${tpath}`, undefined, fetchImpl);
    if (!src.ok) {
      if (src.status === 404) report.tipsNote = 'kaynakta daily_tips/main yok';
      else report.failed.push(`${tpath} okunamadı: ${src.body?.error?.message || src.error}`);
    } else {
      const want = countTips(src.body?.fields);
      if (state.done[tpath] && !FORCE) report.skipped++;
      else {
        const r = await writeDoc(toBase, tpath, src.body.fields, fetchImpl, 'patch');
        if (!r.ok) report.failed.push(`${tpath}: ${r.body?.error?.message || r.error}`);
        else {
          state.done[tpath] = { at: new Date().toISOString(), kind: 'tips', tips: want };
          report.tips = want;
        }
      }
      saveState(state);
    }
  }

  return { report, state };
}

/* ------------------------------------------------------------ self-test */

/** Bellek içi sahte Firestore REST'i (GET/PATCH/POST?documentId=, liste pageToken). */
function createFakeFirestore(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([k, v]) => [k, v]));
  const calls = [];
  const handler = (reqObj, res) => {
    const url = new URL(reqObj.url, 'http://x');
    // /v1/projects/P/databases/D/documents/<path>?...
    const marker = '/documents/';
    const idx = url.pathname.indexOf(marker);
    const docPath = idx >= 0 ? decodeURIComponent(url.pathname.slice(idx + marker.length)) : '';
    calls.push({ method: reqObj.method, path: docPath, query: Object.fromEntries(url.searchParams) });
    const send = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(body == null ? '' : JSON.stringify(body));
    };
    if (reqObj.method === 'GET') {
      if (url.searchParams.has('pageSize')) {
        const size = Number(url.searchParams.get('pageSize')) || 25;
        const page = Number(url.searchParams.get('pageToken') || 0);
        const all = [...docs.keys()]
          .filter(k => (k + '/').startsWith(docPath + '/') && k !== docPath)
          .filter(k => k.slice(docPath.length + 1).split('/').length === 1)
          .sort();
        const slice = all.slice(page * size, page * size + size);
        const out = {
          documents: slice.map(name => ({ name: `projects/P/databases/D/documents/${name}`, fields: docs.get(name) })),
        };
        if (page * size + size < all.length) out.nextPageToken = String(page + 1);
        return slice.length ? send(200, out) : docs.has(docPath) ? send(200, out) : send(404, { error: { message: 'NOT_FOUND' } });
      }
      return docs.has(docPath) ? send(200, { name: docPath, fields: docs.get(docPath) }) : send(404, { error: { message: 'NOT_FOUND' } });
    }
    let raw = '';
    reqObj.on('data', c => (raw += c));
    reqObj.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      if (reqObj.method === 'POST') {
        const id = url.searchParams.get('documentId');
        const full = id ? `${docPath}/${id}` : `${docPath}/auto${docs.size}`;
        if (docs.has(full)) return send(409, { error: { message: 'ALREADY_EXISTS' } });
        docs.set(full, body.fields || {});
        return send(200, { name: full, fields: body.fields || {} });
      }
      if (reqObj.method === 'PATCH') {
        docs.set(docPath, { ...(docs.get(docPath) || {}), ...(body.fields || {}) });
        return send(200, { name: docPath, fields: docs.get(docPath) });
      }
      if (reqObj.method === 'PUT') {
        docs.set(docPath, body.fields || {});
        return send(200, { name: docPath, fields: body.fields || {} });
      }
      if (reqObj.method === 'DELETE') {
        docs.delete(docPath);
        return send(200, {});
      }
      return send(400, { error: { message: 'UNSUPPORTED' } });
    });
  };
  return { docs, calls, handler };
}

async function selfTest() {
  const http = await import('node:http');
  const s = 'x'.repeat(4);
  const mkQuestions = n => ({ arrayValue: { values: Array.from({ length: n }, (_, i) => ({ mapValue: { fields: { id: { stringValue: `q${i}` }, question: { stringValue: `soru ${i} ${s}` } } } })) } });
  const legacyPrefix = 'artifacts/kpss-old/public/data';
  const seed = {
    [`${legacyPrefix}/courses/tarih`]: { id: { stringValue: 'tarih' }, title: { stringValue: 'Tarih' }, order: { integerValue: '1' } },
    [`${legacyPrefix}/courses/cografya`]: { id: { stringValue: 'cografya' }, title: { stringValue: 'Coğrafya' }, order: { integerValue: '2' } },
    [`${legacyPrefix}/courses/tarih/topics/t1`]: { id: { stringValue: 't1' }, name: { stringValue: 'İlk' }, questionCount: { integerValue: '3' }, questions: mkQuestions(3) },
    [`${legacyPrefix}/courses/tarih/topics/t2`]: { id: { stringValue: 't2' }, name: { stringValue: 'İkinci' }, questionCount: { integerValue: '5' }, questions: mkQuestions(5) },
    [`${legacyPrefix}/courses/cografya/topics/c1`]: { id: { stringValue: 'c1' }, name: { stringValue: 'Konu' }, questionCount: { integerValue: '2' }, questions: mkQuestions(2) },
    [`${legacyPrefix}/daily_tips/main`]: { list: { arrayValue: { values: [{ mapValue: { fields: { t: { stringValue: 'a' } } } }, { mapValue: { fields: { t: { stringValue: 'b' } } } }] } } },
  };
  const src = createFakeFirestore(seed);
  const dst = createFakeFirestore({});
  const srvS = http.createServer(src.handler);
  const srvD = http.createServer(dst.handler);
  await new Promise(r => srvS.listen(0, '127.0.0.1', r));
  await new Promise(r => srvD.listen(0, '127.0.0.1', r));
  const fromBase = `http://127.0.0.1:${srvS.address().port}/v1/projects/old/databases/(default)/documents/${legacyPrefix}`;
  const toBase = `http://127.0.0.1:${srvD.address().port}/v1/projects/new/databases/(default)/documents`;

  let pass = 0;
  let fail = 0;
  const ok = (cond, label, extra = '') => {
    if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${label}`); }
    else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${extra}`); }
  };

  STATE_DISABLED = true;

  console.log('\x1b[1m[1] ilk çalıştırma\x1b[0m');
  let r = await runMigration({ fromBase, toBase, state: { done: {} }, quiet: true });
  ok(dst.docs.has('courses/tarih'), 'ders belgesi kopyalandı (kök düzen)');
  ok(dst.docs.has('courses/tarih/topics/t2'), 'konu belgesi kopyalandı');
  ok(dst.docs.has('daily_tips/main'), 'hap bilgiler kopyalandı');
  ok(![...dst.docs.keys()].some(k => k.includes('artifacts/')), 'legacy öneki hedefte yok');
  ok(r.report.questions === 10, `toplam soru 10 olmalı, ${r.report.questions} geldi`);
  ok(r.report.tips === 2, 'hap bilgi sayısı 2');
  ok(r.report.failed.length === 0 && r.report.mismatch.length === 0, 'hata/uyuşmazlık yok', JSON.stringify(r.report));
  ok(JSON.stringify(dst.docs.get('courses/tarih/topics/t1').questions) === JSON.stringify(seed[`${legacyPrefix}/courses/tarih/topics/t1`].questions), 'soru içeriği bayt bayt aynı');

  console.log('\x1b[1m[2] tekrar çalıştırma (resume/atla)\x1b[0m');
  const callsBefore = dst.calls.length;
  r = await runMigration({ fromBase, toBase, state: r.state, quiet: true });
  ok(r.report.skipped === 6, `6 belge atlanmalı, ${r.report.skipped} atlandı`);
  ok(dst.calls.length === callsBefore, 'hedefe hiç yazma isteği gitmedi');

  console.log('\x1b[1m[3] hedefte belge silinmişse + force\x1b[0m');
  dst.docs.delete('courses/cografya/topics/c1');
  r = await runMigration({ fromBase, toBase, state: { done: {} }, quiet: true });
  ok(dst.docs.has('courses/cografya/topics/c1'), 'state temizlenince eksik belge yeniden yazıldı');
  ok(r.report.mismatch.length === 0, 'sayım doğrulaması geçti');

  console.log('\x1b[1m[4] kaynak erişilemezse\x1b[0m');
  let threw = '';
  try {
    await runMigration({ fromBase: 'http://127.0.0.1:1/v1/projects/x/databases/(default)/documents', toBase, state: { done: {} }, quiet: true });
  } catch (e) {
    threw = String(e.message || e);
  }
  ok(/listelenemedi/.test(threw), 'kaynak okunamazsa patlar ve state bozulmaz', threw);

  console.log('\x1b[1m[5] hedefte belge zaten varsa (409 → PATCH fallback)\x1b[0m');
  dst.docs.set('courses/tarih/topics/t1', {
    id: { stringValue: 't1' },
    name: { stringValue: 'ESKİ BAŞLIK' },
    questionCount: { integerValue: '99' },
    questions: { arrayValue: { values: [] } },
  });
  r = await runMigration({ fromBase, toBase, state: { done: {} }, quiet: true });
  const overwritten = dst.docs.get('courses/tarih/topics/t1');
  ok(overwritten?.name?.stringValue === 'İlk', '409 sonrası PATCH ile kaynak değeri yazıldı', JSON.stringify(overwritten?.name));
  ok(countQuestions(overwritten) === 3, 'soru sayısı kaynakla eşitlendi (99 değil)', String(countQuestions(overwritten)));
  ok(r.report.mismatch.length === 0, 'uyuşmazlık raporlanmadı');

  srvS.close();
  srvD.close();
  console.log(`\n\x1b[1m${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} self-test kontrolü\x1b[0m\n`);
  process.exit(fail ? 1 : 0);
}

/* ----------------------------------------------------------------- main */

if (SELFTEST) {
  await selfTest();
} else {
  if (!TO_PROJECT) {
    console.log('\x1b[33mHedef proje bulunamadı: ne .env.local (EXPO_PUBLIC_FIRESTORE_PROJECT) ne app.json (expo.extra.firestore.projectId) dolu.\x1b[0m');
    console.log('  Örnek:\x1b[0m');
    console.log('  npm run setup:firestore -- kpssasistani-01 --root .');
    console.log('  npm run migrate:content -- --limit 2 --dry-run');
    process.exit(2);
  }
  const fromBase = docBase(FROM_PROJECT, FROM_ROOT, DATABASE);
  const toBase = docBase(TO_PROJECT, TO_ROOT, DATABASE);
  console.log('');
  console.log('\x1b[1mİçerik taşıma\x1b[0m');
  console.log(`  kaynak  : ${FROM_PROJECT} → ${FROM_ROOT || '(kök)'}`);
  console.log(`  hedef  : ${TO_PROJECT} → ${TO_ROOT || '(kök)'}`);
  console.log(`  kapsam : ${ONLY.join(', ')}${LIMIT ? ` • ilk ${LIMIT} ders` : ''}${DRY ? ' • DRY-RUN (yazmıyor)' : ''}${FORCE ? ' • force' : ''}`);
  console.log('');
  try {
    const { report } = await runMigration({ fromBase, toBase });
    console.log('');
    console.log(`  ders ${report.courses} • konu ${report.topics} • soru ${report.questions} • hap bilgi ${report.tips}${report.tipsNote ? ` (${report.tipsNote})` : ''} • atlanan ${report.skipped}`);
    if (report.failed.length) {
      console.log(`\x1b[31m  ${report.failed.length} yazma hatası:\x1b[0m`);
      report.failed.slice(0, 12).forEach(f => console.log('   - ' + f));
      console.log('  En sık sebep: hedefte içerik yazma penceresi kapalı (`meta/content_lock` var) ya da kurallar yayınlanmamış.');
      console.log('  Panel → “Firestore klasörlerini oluştur (tohumlama)” kartındaki kilit rozetine bak; state korundu, komutu tekrar çalıştırabilirsin.');
      process.exit(1);
    }
    if (report.mismatch.length) {
      console.log(`\x1b[33m  ${report.mismatch.length} sayım uyuşmazlığı:\x1b[0m`);
      report.mismatch.slice(0, 12).forEach(m => console.log('   - ' + m));
      process.exit(1);
    }
    console.log(`\x1b[32m  Tamam.${DRY ? ' (dry-run: hiçbir şey yazılmadı)' : ''}\x1b[0m`);
    console.log('  Sırada: Console → Firestore → Data → meta/content_lock (note=kilitli) oluştur → içerik yazma penceresi kapanır.');
    console.log('  Uygulamada: panel → “Firestore bağlantısı” → Test et; sonra bu dosyayı silebilirsin: ' + path.relative(process.cwd(), STATE_PATH));
  } catch (e) {
    console.log('\x1b[31mBaşarısız:\x1b[0m ' + (e?.message || e));
    console.log('  Ağ erişimi ya da kural hatası olabilir; `npm run check:firestore` ile hedefi doğrula.');
    process.exit(1);
  }
}
