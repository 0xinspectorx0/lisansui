#!/usr/bin/env node
/**
 * Supabase kurulum yardımcısı — tek komut, sıfır elle-anhtar-girme.
 * ==========================================================================
 *   npm run setup:supabase -- --url https://<ref>.supabase.co --anon-key <anon>
 *   npm run check:supabase
 *
 * Ne yapar
 *  1) .env.local             → EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY / _SCHEMA
 *  2) config/supabaseApp.ts  → DEFAULT_SUPABASE_URL / DEFAULT_SUPABASE_ANON_KEY
 *  3) app.json               → expo.extra.supabase { url, anonKey, schema }
 *  4) --check                → hedefe üç yoklama: politika satırı, RLS red davranışı,
 *                              Auth (GoTrue) erişimi
 *
 * Neden üç yer? Uygulama hedefi şu sırayla çözer: EXPO_PUBLIC_* → app.json →
 * depoya gömülü config. Üçüne de yazmak, Metro önbelleği ya da farklı bir derleme
 * biçimi yüzünden "eski proje adresinde kalan" sürümü bırakmaz.
 *
 * Gizli anahtar YAZILMAZ: buraya yalnız public (anon) anahtar girer. `service_role`
 * anahtarı uygulamanın hiçbir sürümünde bulunmaz — yetki denetimi RLS'dedir.
 * Sunucu tarafı göç işlemleri için anahtar yalnız ortamda durur (SUPABASE_SERVICE_ROLE_KEY).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const opt = name => {
  const inline = argv.find(a => a.startsWith(`--${name}=`));
  if (inline) return inline.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return undefined;
};
const has = f => argv.includes(f);
const DIR = path.resolve(opt('dir') || process.cwd());
const DRY = has('--dry-run');
const CHECK = has('--check');

/* ---- hedef çözümleme: bayrak → ortam → .env.local → config/supabaseApp.ts ---- */

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** config/supabaseApp.ts içindeki DEFAULT_* sabitleri (derlenmiş TS değil, düz metin). */
function readConfigConstants(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const txt = fs.readFileSync(file, 'utf8');
  for (const name of ['DEFAULT_SUPABASE_URL', 'DEFAULT_SUPABASE_ANON_KEY', 'DEFAULT_SUPABASE_SCHEMA']) {
    const m = txt.match(new RegExp(`export const ${name}\\s*(?::\\s*string\\s*)?=\\s*'([^']*)'`));
    if (m) out[name] = m[1];
  }
  return out;
}

function resolveTarget(dir, flags = {}) {
  const env = readEnvFile(path.join(dir, '.env.local'));
  const cfg = readConfigConstants(path.join(dir, 'config', 'supabaseApp.ts'));
  return {
    url: cleanUrl(flags.url || process.env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || cfg.DEFAULT_SUPABASE_URL || ''),
    anonKey: (flags.anonKey || process.env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || cfg.DEFAULT_SUPABASE_ANON_KEY || '').trim(),
    schema: (flags.schema || env.EXPO_PUBLIC_SUPABASE_SCHEMA || cfg.DEFAULT_SUPABASE_SCHEMA || 'public').trim(),
  };
}

const resolved = resolveTarget(DIR, { url: opt('url'), anonKey: opt('anon-key'), schema: opt('schema') });
const url = resolved.url;
const anonKey = resolved.anonKey;
const schema = resolved.schema;

function cleanUrl(v) {
  return String(v || '').trim().replace(/\/+$/, '');
}
function refOf(u) {
  return String(u || '').replace(/^https?:\/\//, '').split('.')[0] || '';
}

function writeIfChanged(file, next, label) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (cur === next) {
    console.log(`  = ${label} (değişiklik yok)`);
    return;
  }
  if (DRY) {
    console.log(`  [dry-run] ${label} yazılacaktı (${file})`);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next, 'utf8');
  console.log(`  ✓ ${label} yazıldı: ${path.relative(DIR, file)}`);
}

/** .env.local: yalnız ilgili üç anahtarı günceller, geri kalanına dokunmaz. */
function patchEnv(raw, patch) {
  const lines = String(raw || '').split('\n');
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1] in patch) {
      out.push(`${m[1]}=${patch[m[1]]}`);
      seen.add(m[1]);
    } else out.push(line);
  }
  for (const [k, v] of Object.entries(patch)) if (!seen.has(k)) out.push(`${k}=${v}`);
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

const CFG_NAMES = ['DEFAULT_SUPABASE_URL', 'DEFAULT_SUPABASE_ANON_KEY', 'DEFAULT_SUPABASE_SCHEMA'];

/**
 * config/supabaseApp.ts içindeki DEFAULT_* sabitlerini günceller.
 *
 * Eskiden yalnız `NAME: string = ''` biçimini arıyordu; depo `NAME = ''` yazdığı
 * için desen hiç eşleşmiyor, fonksiyon “bulunamadı” diye hata vermek yerine
 * arayüzün üstüne YENİ satır ekliyordu → çift bildirim (tsc: Cannot redeclare)
 * ve asıl değer hâlâ boş. Şimdi her iki yazım biçimi de tanınır, yinelenen
 * bildirimler temizlenir ve bulunamayan ad yüksek sesle hata olur.
 */
function patchConfigTs(raw, nextUrl, nextKey, nextSchema) {
  const wanted = {
    DEFAULT_SUPABASE_URL: nextUrl,
    DEFAULT_SUPABASE_ANON_KEY: nextKey,
    DEFAULT_SUPABASE_SCHEMA: nextSchema,
  };
  const q = v => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const re = /^(\s*)export const (DEFAULT_SUPABASE_URL|DEFAULT_SUPABASE_ANON_KEY|DEFAULT_SUPABASE_SCHEMA)\s*(?::\s*string\s*)?=\s*(['"]).*?\3\s*;?\s*$/;
  const seen = {};
  const out = [];
  for (const line of String(raw || '').split('\n')) {
    const m = line.match(re);
    if (!m) {
      out.push(line);
      continue;
    }
    const name = m[2];
    seen[name] = (seen[name] || 0) + 1;
    // ilk bildirim yazılır; kopyaları (eskiden kalan) düşer
    if (seen[name] === 1) out.push(`${m[1]}export const ${name} = ${q(wanted[name])};`);
  }
  const missing = CFG_NAMES.filter(n => !seen[n]);
  if (missing.length) {
    throw new Error(`config/supabaseApp.ts içinde bulunamadı: ${missing.join(', ')} — dosya elle değiştirilmiş olabilir.`);
  }
  return out.join('\n');
}

/** Yazdıktan sonra geri oku: “yazıldı” demek yetmez, değerin orada olduğunu gör. */
/**
 * Uygulama deposuna RLS'i devre dışı bırakan anahtar sızmasını iki yoldan yakalar:
 * yeni biçim (`sb_secret_…`) ve eski JWT biçimi (`payload.role === 'service_role'`).
 */
function secretProblems(key) {
  const out = [];
  if (!key) return out;
  if (/^sb_secret_/i.test(key)) out.push('anon yerine secret anahtar yazılmış — uygulamaya yalnız publishable/anon girer');
  const parts = String(key).split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload?.role === 'service_role') out.push('config’de service_role anahtarı var — bu anahtar RLS’i devre dışı bırakır');
    } catch {
      /* çözülemeyen segment zaten --check'te bildiriliyor */
    }
  }
  return out;
}

function verifyConfigFile(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const problems = [];
  for (const name of CFG_NAMES) {
    const hits = txt
      .split('\n')
      .filter(l => l.startsWith(`export const ${name} =`) || l.startsWith(`export const ${name}:`));
    if (hits.length !== 1) problems.push(`${name}: ${hits.length} bildirim (1 bekleniyor)`);
  }
  const urlLine = (txt.match(/export const DEFAULT_SUPABASE_URL\s*(?::\s*string\s*)?=\s*'([^']*)'/) || [])[1] || '';
  const keyLine = (txt.match(/export const DEFAULT_SUPABASE_ANON_KEY\s*(?::\s*string\s*)?=\s*'([^']*)'/) || [])[1] || '';
  if (!urlLine || !keyLine) problems.push('değerler boş');
  problems.push(...secretProblems(keyLine));
  if (problems.length) throw new Error(`config/supabaseApp.ts doğrulanamadı — ${problems.join('; ')}`);
  return { url: urlLine, keyLength: keyLine.length };
}

function patchAppJson(raw, cfg) {
  const json = raw ? JSON.parse(raw) : {};
  json.expo = json.expo || {};
  json.expo.extra = { ...(json.expo.extra || {}), supabase: cfg };
  delete json.expo.extra?.firestore; // eski düzen artık geçerli değil
  return JSON.stringify(json, null, 2) + '\n';
}

if (!CHECK) {
  if (!url || !anonKey) {
    console.error(
      'Kullanım: npm run setup:supabase -- --url https://<ref>.supabase.co --anon-key <anon>\n' +
        '(yalnızca doğrulama: npm run check:supabase)'
    );
    process.exit(2);
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
    console.error(`Adres biçimi bekleniyor https://<ref>.supabase.co — gelen: ${url}`);
    process.exit(2);
  }
  // Yanlış anahtarı bir kere yapıştırmak onu commit'lenmiş dosyaya yazabilirdi.
  {
    const bad = secretProblems(anonKey);
    if (bad.length) {
      console.error(
        `\x1b[31m✗ --anon-key reddedildi: ${bad.join('; ')}\x1b[0m\n` +
          '  Dashboard → Settings → API → **Client** sekmesindeki public/anon anahtarı ver;\n' +
          '  secret/service_role anahtarı repoya, panele veya cihaza hiçbir şekilde yazılmaz.'
      );
      process.exit(2);
    }
  }
  console.log(`\x1b[1mSupabase hedefi: ${url} • şema:${schema}\x1b[0m`);
  writeIfChanged(
    path.join(DIR, '.env.local'),
    patchEnv(fs.existsSync(path.join(DIR, '.env.local')) ? fs.readFileSync(path.join(DIR, '.env.local'), 'utf8') : '', {
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      EXPO_PUBLIC_SUPABASE_SCHEMA: schema,
    }),
    '.env.local'
  );
  const cfgPath = path.join(DIR, 'config', 'supabaseApp.ts');
  if (!fs.existsSync(cfgPath)) {
    console.error(`config/supabaseApp.ts yok: ${cfgPath}`);
    process.exit(1);
  }
  writeIfChanged(
    cfgPath,
    patchConfigTs(fs.readFileSync(cfgPath, 'utf8'), url, anonKey, schema),
    'config/supabaseApp.ts'
  );
  try {
    const chk = verifyConfigFile(cfgPath);
    console.log(`  ✓ config/supabaseApp.ts doğrulandı (ref:${refOf(chk.url)}, anon ${chk.keyLength} karakter)`);
  } catch (e) {
    console.error(`\x1b[31m✗ ${e instanceof Error ? e.message : e}\x1b[0m`);
    process.exit(1);
  }
  const appJsonPath = path.join(DIR, 'app.json');
  writeIfChanged(
    appJsonPath,
    patchAppJson(fs.existsSync(appJsonPath) ? fs.readFileSync(appJsonPath, 'utf8') : '', {
      url,
      anonKey,
      schema,
    }),
    'app.json → expo.extra.supabase'
  );
  console.log(
    '\nSırada: tabloları ve RLS kurallarını uygula (Dashboard → SQL Editor → Run):\n' +
      '  npm run sync:sql   # panelden tek tuşla kopyalanacak metni üretir\n' +
      `  dosya: supabase/migrations/0001_init.sql\n` +
      'Ardından Metro’yu bir kez yeniden başlat: npx expo start --clear'
  );
  process.exit(0);
}

/* ------------------------------------------------------------- --check */

/**
 * Ağ hatası ile proje hatasını ayır: "fetch failed" tek başına kullanıcıya
 * "SQL kurulmadı" gibi okunuyor; oysa çoğu zaman bu makine Supabase'e ulaşamıyor.
 */
function netNote(e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|certificate|TLS/i.test(msg)) {
    return `ağ erişilemedi (${msg}) — bu makine Supabase projesine ulaşamıyor; yoklamayı kendi terminalinde çalıştır`;
  }
  return msg;
}

async function probe(name, run) {
  try {
    const r = await run();
    console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[33m!\x1b[0m'} ${name}: ${r.note}`);
    return r.ok;
  } catch (e) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}: ${netNote(e)}`);
    return false;
  }
}

// `npm run check:supabase` artık tek başına çalışır: adres/anahtar için
// .env.local ve config/supabaseApp.ts de okunur (kurulum oraya yazılmıştı).
const target = url;
const key = anonKey;
if (!target || !key) {
  console.error('Doğrulama için adres ve anon anahtar gerekli — `.env.local` ya da config/supabaseApp.ts boşsa önce kur:  npm run setup:supabase -- --url … --anon-key …');
  process.exit(2);
}
{
  const bad = secretProblems(key);
  if (bad.length) {
    console.error(`\x1b[31m✗ ${bad.join('; ')}\x1b[0m\n  Depoyu temizle: config/supabaseApp.ts, app.json ve .env.local yalnız public/anon tutar.`);
    process.exit(2);
  }
}
console.log(`\x1b[1mYoklama: ${target} • ref:${refOf(target)}\x1b[0m`);
const H = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

await probe('erişim', async () => {
  const res = await fetch(`${target}/rest/v1/membership_policy?select=id&limit=1`, { headers: H });
  return {
    ok: res.ok || res.status === 404,
    note: `HTTP ${res.status}${res.ok ? ' (anon anahtar kabul edildi)' : ''}`,
  };
});
await probe('içerik okuma', async () => {
  const res = await fetch(`${target}/rest/v1/rpc/kpss_read_doc`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ p_path: 'meta/content_lock' }),
  });
  const body = await res.json().catch(() => null);
  const st = Number(body?.status ?? res.status);
  return {
    ok: res.ok && (st === 200 || st === 404),
    note: st === 404 ? 'SQL kurulmuş, içerik kilizi kapalı (yazılabilir)' : `status ${st}`,
  };
});
await probe('Auth (GoTrue)', async () => {
  const res = await fetch(`${target}/auth/v1/settings`, { headers: { apikey: key } });
  return { ok: res.ok, note: `HTTP ${res.status}` };
});
await probe('RLS denetimi', async () => {
  const res = await fetch(`${target}/rest/v1/members?select=email&limit=1`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ email: 'deneme@ornek.com', id: 'deneme@ornek.com' }),
  });
  const denied = res.status === 401 || res.status === 403;
  return {
    ok: denied,
    note: denied
      ? 'kimliksiz üyelik yazması reddedildi (beklenen)'
      : `HTTP ${res.status} — RLS açık DEĞİL, 0001_init.sql içindeki policy’leri çalıştır`,
  };
});
console.log('\nUygulama tarafı: npx expo start --clear (env değiştiyse zorunlu).');
