#!/usr/bin/env node
/**
 * İçeriği Supabase'e taşı — panel yedeği (JSON) ya da başka bir Supabase projesi → tablolar.
 * ==========================================================================
 *   node scripts/migrate-to-supabase.mjs --in yedek.json --dry-run
 *   node scripts/migrate-to-supabase.mjs --in yedek.json --force
 *   node scripts/migrate-to-supabase.mjs --from-url https://<ref>.supabase.co
 *   npm run migrate:content:selftest
 *
 * Hedef adres/anahtar: .env.local → config/supabaseApp.ts → --url/--anon-key.
 * Yazma `rpc/kpss_write_doc` üzerinden gider — yani UYGULAMANIN KENDİ kapısından:
 * satır satır `courses` / `topics` / `questions` tablolarına dağıtılır, yetki
 * denetimi RLS'dedir (sunucu anahtarı gerekmez; içerik kilizi kapalı olmalı).
 *
 * Not: `--service-key` verilirse aynı RPC, RLS'i aşan anahtarla çağrılır. Yalnız
 * göç gününde, terminalde kullanılır; depoya/.env.local'a YAZILMAZ.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
const SELFTEST = has('--self-test');

/* --------------------------------------------------------- sahte ortam */

function readEnvFile(dir) {
  const out = {};
  const p = path.join(dir, '.env.local');
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function repoTarget(dir = process.cwd()) {
  const env = readEnvFile(dir);
  let url = opt('url') || env.EXPO_PUBLIC_SUPABASE_URL || '';
  let key = opt('anon-key') || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    const cfg = path.join(dir, 'config', 'supabaseApp.ts');
    if (fs.existsSync(cfg)) {
      const t = fs.readFileSync(cfg, 'utf8');
      url = url || (t.match(/DEFAULT_SUPABASE_URL[^']*'([^']*)'/) || [])[1] || '';
      key = key || (t.match(/DEFAULT_SUPABASE_ANON_KEY[^']*'([^']*)'/) || [])[1] || '';
    }
  }
  return { url: String(url).replace(/\/+$/, ''), key, serviceKey: opt('service-key') || process.env.SUPABASE_SERVICE_ROLE_KEY || '' };
}

/* ------------------------------------------------------------ belge üretimi */

const TOPIC_KEYS = ['id', 'name', 'courseId', 'order', 'questionCount', 'questions', 'updatedAt', 'schemaVersion'];
const COURSE_KEYS = ['id', 'title', 'icon', 'order', 'hidden', 'updatedAt', 'schemaVersion'];

/** Alan setini SQL'in kabul ettiği kümeye indir (kpss_doc_keys_ok aynası). */
export function pickKeys(obj, allowed) {
  const out = {};
  for (const k of allowed) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/**
 * Panel yedeği (AdminState) → yazılacak belge listesi.
 * Sorular `content.questions["{courseId}:{docId}"]` altında durur.
 */
export function planFromExport(state) {
  const docs = [];
  const notes = [];
  const c = state?.content || {};
  const topicMap = c.topics || {};
  const courseIds = Array.isArray(c.courseOrder) && c.courseOrder.length
    ? c.courseOrder
    : [...new Set(Object.keys(topicMap))];
  const seen = new Set();
  for (const id of courseIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    docs.push({
      path: `courses/${id}`,
      kind: 'course',
      doc: pickKeys(
        {
          id,
          title: c.courseTitles?.[id] || id,
          icon: 'book-outline',
          order: courseIds.indexOf(id),
          hidden: (c.hiddenCourses || []).includes(id),
          updatedAt: new Date().toISOString(),
          schemaVersion: 1,
        },
        COURSE_KEYS
      ),
    });
    const topics = Array.isArray(topicMap[id]) ? topicMap[id] : [];
    topics.forEach((t, i) => {
      const docId = String(t?.docId || t?.id || '');
      if (!docId) return;
      const list = Array.isArray(c.questions?.[`${id}:${docId}`]) ? c.questions[`${id}:${docId}`] : [];
      if (!list.length) notes.push(`${id}/${docId}: soru yok`);
      docs.push({
        path: `courses/${id}/topics/${docId}`,
        kind: 'topic',
        doc: pickKeys(
          {
            id: t.id || docId,
            name: t.name || docId,
            courseId: id,
            order: typeof t.order === 'number' ? t.order : i,
            questionCount: list.length,
            questions: list.map((q, qi) => ({
              id: `${docId}::${q.id || qi}`,
              question: String(q.question ?? ''),
              options: Array.isArray(q.options) ? q.options.map(String) : [],
              answer: Number(q.answer ?? 0),
              explanation: String(q.explanation ?? ''),
            })),
            updatedAt: new Date().toISOString(),
            schemaVersion: 1,
          },
          TOPIC_KEYS
        ),
      });
    });
  }
  if (Array.isArray(c.tips) && c.tips.length) {
    docs.push({ path: 'daily_tips/main', kind: 'tips', doc: { list: c.tips.map(String) } });
  } else notes.push('hap bilgi yok');
  return { docs, notes };
}

/** Başka bir Supabase projesinin içeriği (kpss_list_docs + kpss_read_doc). */
export async function planFromSupabase(srcUrl, fetchImpl = fetch) {
  const base = String(srcUrl).replace(/\/+$/, '');
  const rpc = async (fn, args) => {
    const res = await fetchImpl(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    return res.ok ? await res.json() : null;
  };
  const docs = [];
  const notes = [];
  const listed = await rpc('kpss_list_docs', { p_prefix: 'courses', p_page_size: 300 });
  for (const d of listed?.documents || []) {
    docs.push({ path: d.name, kind: /^courses\/[^/]+\/topics\//.test(d.name) ? 'topic' : 'course', doc: d.fields });
    const courseId = String(d.fields?.id || d.name.split('/')[1] || '');
    const topics = await rpc('kpss_list_docs', { p_prefix: `courses/${courseId}/topics`, p_page_size: 300 });
    for (const t of topics?.documents || []) {
      const full = await rpc('kpss_read_doc', { p_path: t.name });
      if (full?.status === 200 && full.fields) docs.push({ path: t.name, kind: 'topic', doc: full.fields });
    }
  }
  const tips = await rpc('kpss_read_doc', { p_path: 'daily_tips/main' });
  if (tips?.status === 200 && tips.fields) docs.push({ path: 'daily_tips/main', kind: 'tips', doc: tips.fields });
  else notes.push('hap bilgi yok');
  if (!docs.length) notes.push('kaynak okunamadı');
  return { docs, notes };
}

/* --------------------------------------------------------------- yazma */

export function makeWriter(target, fetchImpl = fetch) {
  const key = target.serviceKey || target.key;
  if (!target.url || !key) throw new Error('Hedef adres/anahtar yok — --url ve --anon-key (ya da .env.local) ver.');
  return async function write(doc, mode = 'replace') {
    const res = await fetchImpl(`${target.url}/rest/v1/rpc/kpss_write_doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_path: doc.path, p_doc: doc.doc, p_mode: mode }),
    });
    const body = await res.json().catch(() => null);
    const status = Number(body?.status ?? res.status);
    if (!res.ok || status >= 400) {
      const msg = String(body?.message || body?.error || `HTTP ${res.status}`);
      return { ok: false, denied: res.status === 403 || /row-level security|42501/i.test(msg), error: msg.slice(0, 200) };
    }
    return { ok: true };
  };
}

export async function runPlan(plan, writer, opts = {}) {
  const out = { written: 0, skipped: 0, failed: [], questions: 0 };
  let docs = plan.docs;
  if (opts.limit) docs = docs.slice(0, Number(opts.limit));
  for (const d of docs) {
    if (opts.dryRun) {
      out.written++;
      if (d.kind === 'topic') out.questions += (d.doc.questions || []).length;
      opts.onDoc?.(d, 'kuru');
      continue;
    }
    if (opts.skip?.has(d.path)) {
      out.skipped++;
      opts.onDoc?.(d, 'atlandı');
      continue;
    }
    const r = await writer(d, opts.mode || 'replace');
    if (r.ok) {
      out.written++;
      if (d.kind === 'topic') out.questions += (d.doc.questions || []).length;
      opts.state?.add?.(d.path);
      opts.onState?.(opts.state);
    } else {
      out.failed.push(`${d.path} — ${r.error}${r.denied ? ' (RLS reddi)' : ''}`);
    }
    opts.onDoc?.(d, r.ok ? 'yazıldı' : 'red');
  }
  return out;
}

/** Kalan işi sürdürebilmek için küçük durum dosyası. */
export function loadState(file) {
  try {
    return new Set(JSON.parse(fs.readFileSync(file, 'utf8'))?.done || []);
  } catch {
    return new Set();
  }
}
export function saveState(file, set) {
  fs.writeFileSync(file, JSON.stringify({ done: [...set], at: new Date().toISOString() }, null, 2));
}

/* ------------------------------------------------------------- self-test */

/** kpss_write_doc'un kabul/red davranışını taklit eden sahte PostgREST. */
function fakeServer(store = { docs: new Map(), log: [] }) {
  const keysFor = kind =>
    kind === 'course' ? COURSE_KEYS : kind === 'topic' ? TOPIC_KEYS : ['list', 'updatedAt', 'schemaVersion'];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body || '{}');
    store.log.push({ url, body });
    const reply = (status, obj) => ({
      ok: status < 400,
      status,
      json: async () => obj,
    });
    if (!url.endsWith('/rpc/kpss_write_doc')) return reply(404, { message: 'unhandled ' + url });
    const p = String(body.p_path || '');
    const kind = /^courses\/[^/]+$/.test(p)
      ? 'course'
      : /^courses\/[^/]+\/topics\/[^/]+$/.test(p)
        ? 'topic'
        : p === 'daily_tips/main'
          ? 'tips'
          : null;
    if (!kind) return reply(200, { status: 400, error: 'unknown document path' });
    const bad = Object.keys(body.p_doc || {}).filter(k => !keysFor(kind).includes(k));
    if (bad.length) return reply(403, { code: '42501', message: `content document has unknown fields: ${bad.join(',')}` });
    if (kind === 'topic' && body.p_doc.questions !== undefined && !Array.isArray(body.p_doc.questions))
      return reply(200, { status: 400, error: 'questions must be an array' });
    if (store.locked) return reply(403, { code: '42501', message: 'write denied by row-level security' });
    store.docs.set(p, JSON.parse(JSON.stringify(body.p_doc)));
    return reply(200, { status: 200, name: p });
  };
  return { fetchImpl, store };
}

async function selfTest() {
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

  const exportState = {
    content: {
      courseOrder: ['tarih', 'turkce'],
      courseTitles: { tarih: 'Tarih' },
      hiddenCourses: ['turkce'],
      topics: {
        tarih: [{ docId: 'ilk-uygarlik', id: 't1', name: 'İlk Uygarlıklar', order: 0 }],
        turkce: [{ docId: 'ses', id: 'g1', name: 'Ses Bilgisi', order: 0 }],
      },
      questions: {
        'tarih:ilk-uygarlik': [
          { id: 'q1', question: '1. Sümerler nerede?', options: ['A) X', 'B) Y'], answer: 0, explanation: 'Açıklama' },
          { id: 'q2', question: '2. Babil kim?', options: ['A) X', 'B) Y'], answer: 1, explanation: '' },
        ],
        'turkce:ses': [],
      },
      tips: ['Bugün 20 soru çöz.'],
    },
  };

  console.log('\x1b[1m[1] plan\x1b[0m');
  const plan = planFromExport(exportState);
  ok(plan.docs.length === 5, '2 ders + 2 konu + 1 hap bilgi → 5 belge', String(plan.docs.length));
  ok(
    plan.docs.filter(d => d.kind === 'topic').every(d => Object.keys(d.doc).every(k => TOPIC_KEYS.includes(k))),
    'konu belgeleri yalnız kabul edilen alanları taşıyor'
  );
  ok(plan.docs.find(d => d.path === 'courses/tarih').doc.title === 'Tarih', 'başlık yedekten geldi');
  ok(plan.docs.find(d => d.path === 'courses/turkce').doc.hidden === true, 'gizli ders işareti taşındı');
  ok(plan.docs.find(d => d.path === 'courses/tarih/topics/ilk-uygarlik').doc.questionCount === 2, 'soru sayıldı');
  ok(
    plan.docs.find(d => d.path === 'courses/tarih/topics/ilk-uygarlik').doc.questions[0].id === 'ilk-uygarlik::q1',
    'soru kimliği konu ile adlandırıldı'
  );
  ok(plan.notes.some(n => /soru yok/.test(n)), 'boş konu nota yazıldı', JSON.stringify(plan.notes));

  console.log('\x1b[1m[2] kuru yürütme\x1b[0m');
  const dry = await runPlan(plan, async () => ({ ok: true }), { dryRun: true, limit: 3 });
  ok(dry.written === 3 && dry.failed.length === 0, '--limit 3 üç belge işledi', JSON.stringify(dry));
  ok(dry.questions === 2, 'soru toplamı doğru', String(dry.questions));

  console.log('\x1b[1m[3] sahte sunucuya yazma\x1b[0m');
  const { fetchImpl, store } = fakeServer();
  const writer = makeWriter({ url: 'https://demo.supabase.co', key: 'anon', serviceKey: '' }, fetchImpl);
  const run = await runPlan(plan, writer, {});
  ok(run.written === 5 && !run.failed.length, '5 belge yazıldı', JSON.stringify(run));
  ok(store.docs.get('courses/tarih/topics/ilk-uygarlik').questions.length === 2, 'sunucu soruları satır satır aldı');
  ok(store.log.every(l => l.url.endsWith('/rpc/kpss_write_doc')), 'yazma yalnız RPC üzerinden');
  ok(store.log.every(l => l.body.p_mode === 'replace'), 'varsayılan mod replace');

  console.log('\x1b[1m[4] reddedilen yazma\x1b[0m');
  const locked = fakeServer();
  locked.store.locked = true;
  const deniedRun = await runPlan(plan, makeWriter({ url: 'https://demo.supabase.co', key: 'anon' }, locked.fetchImpl), {});
  ok(deniedRun.written === 0 && deniedRun.failed.length === 5, 'kilitliyken hiçbir şey yazılmadı');
  ok(deniedRun.failed.every(f => /RLS reddi/.test(f)), 'red sebebi satırda görünüyor', deniedRun.failed[0]);

  console.log('\x1b[1m[5] alan seti denetimi\x1b[0m');
  const rogue = { docs: [{ path: 'courses/tarih/topics/x', kind: 'topic', doc: { name: 'x', hack: 1 } }], notes: [] };
  const r5 = await runPlan(rogue, makeWriter({ url: 'https://demo.supabase.co', key: 'anon' }, fakeServer().fetchImpl), {});
  ok(r5.failed.length === 1 && /unknown fields/.test(r5.failed[0]), 'beklenmeyen alan reddedildi', r5.failed[0]);

  console.log('\x1b[1m[6] durum dosyası / kaldığın yerden\x1b[0m');
  const stateFile = path.join(process.cwd(), '.migrate-state-test.json');
  const set = loadState(stateFile);
  ok(set.size === 0, 'durum yoksa boş küme');
  set.add('courses/tarih');
  saveState(stateFile, set);
  ok(loadState(stateFile).has('courses/tarih'), 'durum dosyası geri okundu');
  const r6 = await runPlan(plan, makeWriter({ url: 'https://demo.supabase.co', key: 'anon' }, fakeServer().fetchImpl), {
    skip: new Set(['courses/tarih']),
    state: set,
    onState: s => saveState(stateFile, s),
  });
  ok(r6.skipped === 1 && r6.written === 4, 'atlanan belge yeniden yazılmadı', JSON.stringify(r6));
  fs.rmSync(stateFile, { force: true });

  console.log('\n%s', fail ? `\x1b[31m${fail} başarısız\x1b[0m / ${pass} geçti` : `\x1b[32m✓ ${pass}/${pass} geçti\x1b[0m`);
  process.exit(fail ? 1 : 0);
}

/* ------------------------------------------------------------------ main */

if (SELFTEST) {
  await selfTest();
} else {
  const inFile = opt('in');
  const fromUrl = opt('from-url');
  if (!inFile && !fromUrl) {
    console.error(
      'Kullanım: node scripts/migrate-to-supabase.mjs --in yedek.json [--dry-run] [--force]\n' +
        '       node scripts/migrate-to-supabase.mjs --from-url https://<ref>.supabase.co\n' +
        '       npm run migrate:content:selftest'
    );
    process.exit(2);
  }
  const plan = inFile
    ? planFromExport(JSON.parse(fs.readFileSync(path.resolve(inFile), 'utf8')))
    : await planFromSupabase(fromUrl);
  const target = repoTarget();
  console.log(
    `\x1b[1m${target.url || '(hedef yok)'}\x1b[0m • ${plan.docs.length} belge` +
      (plan.notes.length ? ` • not: ${plan.notes.slice(0, 3).join('; ')}` : '')
  );
  const stateFile = path.resolve(opt('state', '.migrate-state.json'));
  const skip = has('--force') ? new Set() : loadState(stateFile);
  const res = await runPlan(plan, makeWriter(target), {
    dryRun: has('--dry-run'),
    limit: opt('limit'),
    skip,
    state: skip,
    onState: () => saveState(stateFile, skip),
    onDoc: (d, how) => console.log(`  ${how.padEnd(6)} ${d.path}`),
  });
  console.log(
    `\n${res.written} yazıldı • ${res.skipped} atlandı • ${res.questions} soru` +
      (res.failed.length ? ` • \x1b[31m${res.failed.length} red\x1b[0m` : '')
  );
  for (const f of res.failed.slice(0, 12)) console.log(`  – ${f}`);
  if (res.failed.length)
    console.log(
      '\nRed sebebini düzelt (içerik kilizi kapalı olmalı ya da --service-key ver), ' +
        'sonra aynı komutu tekrarla: atlananlar durum dosyasından yeniden denenir.'
    );
  process.exit(res.failed.length ? 1 : 0);
}
