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

const url = cleanUrl(opt('url') || process.env.SUPABASE_URL || '');
const anonKey = (opt('anon-key') || process.env.SUPABASE_ANON_KEY || '').trim();
const schema = (opt('schema') || 'public').trim();

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

/** config/supabaseApp.ts içindeki DEFAULT_* sabitlerini günceller (yalnız 2 satır). */
function patchConfigTs(raw, nextUrl, nextKey, nextSchema) {
  let s = String(raw || '');
  const set = (name, value) => {
    const re = new RegExp(`export const ${name}\\s*:\\s*string\\s*=\\s*'[^']*'`, 'm');
    const line = `export const ${name}: string = ${JSON.stringify(value).replace(/"/g, "'")}`;
    if (re.test(s)) s = s.replace(re, line);
    else s = s.replace(/(export interface SupabaseAppConfig)/, `${line}\n\n$1`);
  };
  set('DEFAULT_SUPABASE_URL', nextUrl);
  set('DEFAULT_SUPABASE_ANON_KEY', nextKey);
  set('DEFAULT_SUPABASE_SCHEMA', nextSchema);
  return s;
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
  writeIfChanged(
    cfgPath,
    patchConfigTs(fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : '', url, anonKey, schema),
    'config/supabaseApp.ts'
  );
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

async function probe(name, run) {
  try {
    const r = await run();
    console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[33m!\x1b[0m'} ${name}: ${r.note}`);
    return r.ok;
  } catch (e) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

const target = url || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const key = anonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
if (!target || !key) {
  console.error('Doğrulama için adres ve anon anahtar gerekli (.env.local yoksa --url/--anon-key ver).');
  process.exit(2);
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
