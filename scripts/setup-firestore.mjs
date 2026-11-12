#!/usr/bin/env node
/**
 * Tek komutlu Firestore kurulum yardımcısı.
 *
 *   node scripts/setup-firestore.mjs <projeKimligi> [seçenekler]
 *   npm run check:firestore
 *
 * Ne yapar
 *  1) .env.local   → EXPO_PUBLIC_FIRESTORE_PROJECT / _ROOT (varsa korur, yoksa ekler)
 *  2) .firebaserc  → { projects: { default: <projeKimligi> } }
 *  3) --check      → REST üzerinden üç okuma + üyelik yazma/silme denemesi (kural testi)
 *  4) --deploy     → `npx firebase-tools deploy --only firestore:rules` çalıştırır
 *
 * Seçenekler
 *   --root <önec>   kök yolu; '.' = koleksiyonlar veritabanı kökünde (varsayılan '.')
 *   --dir <yol>     repo kökü (varsayılan: cwd)
 *   --dry-run       hiçbir şeye dokunma, sadece ne yapacağını göster
 *   --api-key <K>   Firebase Auth API anahtarını da .env.local'a yaz (EXPO_PUBLIC_FIREBASE_API_KEY)
 *   --check         yapılandırmayı doğrula (ağ gerekir; Auth anahtarı varsa onu da dener)
 *   --deploy        kuralları yayınla (firebase login gerekir)
 *   --keep-note     mevcut .env.local alanlarını üzerine yazma, sadece ekle/güncelle (varsayılan)
 *
 * Not: bu depo kopyasında ağ erişimi kısıtlıysa --check "erişilemedi" der;
 * kendi makinende çalıştırınca gerçek sonucu verir.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--') && !a.includes('=')));
const opt = name => {
  const eq = argv.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return undefined;
};
const positional = argv.filter(a => !a.startsWith('--') && !isValueOfFlag(a));
function isValueOfFlag(value) {
  const names = ['root', 'dir', 'api-key'];
  for (const n of names) {
    const inline = `--${n}=`;
    if (value.startsWith(inline)) return true;
    const i = argv.indexOf(`--${n}`);
    if (i >= 0 && argv[i + 1] === value) return true;
  }
  return false;
}

const DRY = flags.has('--dry-run');
const apiKeyArg = opt('api-key');
const dir = path.resolve(opt('dir') || process.cwd());
const envPath = path.join(dir, '.env.local');
const rcPath = path.join(dir, '.firebaserc');
const appJsonPath = path.join(dir, 'app.json');
const rulesPath = path.join(dir, 'firestore.rules');
const rootArg = opt('root') ?? '.';
const rootValue = ['.', './', '', 'root', '(root)', 'kök', 'none'].includes(String(rootArg).trim())
  ? ''
  : String(rootArg).trim().replace(/^\/+|\/+$/g, '');

const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  ok: s => `\x1b[32m${s}\x1b[0m`,
  bad: s => `\x1b[31m${s}\x1b[0m`,
  warn: s => `\x1b[33m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`,
};

/* ------------------------------------------------------------------ helpers */

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function writeEnvFile(file, updates) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const setKey = (key, value) => {
    const idx = lines.findIndex(l => new RegExp(`^\\s*${key}\\s*=`).test(l) || new RegExp(`^#\\s*${key}\\s*=`).test(l));
    if (idx >= 0) lines[idx] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  };
  for (const [k, v] of Object.entries(updates)) setKey(k, v);
  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  if (DRY) {
    console.log(c.dim(`  [dry-run] ${path.basename(file)} dokunulmadı; yazılacak: `) + JSON.stringify(updates));
    return;
  }
  fs.writeFileSync(file, body.endsWith('\n') ? body : body + '\n');
}

/** .env.local / .env dosyasından tek değer oku (yorum satırlarını saymaz). */
function readEnvValue(file, name) {
  for (const f of [file, path.join(path.dirname(file), '.env')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (m && m[1] === name) return m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return '';
}

/**
 * Identity Toolkit anahtarını doğrular: kasıtlı olarak geçersiz parola ile
 * :signUp çağırır. Kullanıcı oluşmaz; yanıt kodu her şeyi anlatır.
 */
async function probeIdentity(apiKey) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetchJson(url, {
      method: 'POST',
      body: JSON.stringify({
        email: 'baglanti-testi@example.invalid',
        password: 'x',
        returnSecureToken: true,
      }),
    });
    const msg = String(r.body?.error?.message || '');
    const code = msg.split(' : ')[0].trim().toUpperCase();
    if (r.ok)
      return { verdict: { ok: true, note: 'beklenmedik: test hesabı oluştu — Console’dan sil.', extra: msg } };
    if (code === 'WEAK_PASSWORD' || code === 'INVALID_PASSWORD')
      return { verdict: { ok: true, note: 'API anahtarı geçerli ve Email/Password sağlayıcısı açık.', extra: `(yanıt: ${code})` } };
    if (code === 'OPERATION_NOT_ALLOWED')
      return { verdict: { ok: false, note: 'Email/Password kapalı → Console → Authentication → Sign-in method → Enable.' } };
    if (code === 'API_KEY_INVALID' || code === 'KEY_INVALID' || r.status === 403)
      return { verdict: { ok: false, note: 'API anahtarı reddedildi (403).', extra: 'Console → Project settings → Web API key; restricted key ise “Firestore/Identity Toolkit” izni ver. ' + msg } };
    if (code === 'EMAIL_EXISTS')
      return { verdict: { ok: true, note: 'anahtar çalışıyor (test e-postası çakıştı, önemsiz).' } };
    if (r.status === 403 && /IP BLOCKED/i.test(msg))
      return { verdict: { ok: false, note: 'Bu IP’dan anahtar kullanılamıyor (API key kısıtı).', extra: msg } };
    return { verdict: { ok: false, note: `HTTP ${r.status}`, extra: msg } };
  } catch (e) {
    return {
      verdict: {
        ok: false,
        note: `identitytoolkit.googleapis.com erişilemedi (${e?.cause?.code || e?.message || 'ağ'})`,
        extra: 'kendi makinende tekrar dene',
      },
    };
  }
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** config çözümleme sırası: CLI → .env.local → .env → app.json → DEFAULT_TARGET */
function resolveProject(explicit) {
  if (explicit) return { projectId: explicit, source: 'CLI argümanı' };
  const local = readEnvFile(envPath);
  if (local.EXPO_PUBLIC_FIRESTORE_PROJECT)
    return { projectId: local.EXPO_PUBLIC_FIRESTORE_PROJECT, source: '.env.local' };
  const plain = readEnvFile(path.join(dir, '.env'));
  if (plain.EXPO_PUBLIC_FIRESTORE_PROJECT)
    return { projectId: plain.EXPO_PUBLIC_FIRESTORE_PROJECT, source: '.env' };
  const extra = readJsonSafe(appJsonPath)?.expo?.extra?.firestore;
  if (extra?.projectId) return { projectId: extra.projectId, source: 'app.json' };
  const rc = readJsonSafe(rcPath)?.projects?.default;
  if (rc) return { projectId: rc, source: '.firebaserc' };
  return { projectId: 'kpss-asistani', source: 'repo varsayılanı' };
}

function rootForCheck() {
  const local = readEnvFile(envPath);
  const raw = local.EXPO_PUBLIC_FIRESTORE_ROOT;
  if (raw === undefined) {
    // app.json/varsayılan: lib/firebaseConfig.ts ile aynı öncelik
    const extra = readJsonSafe(appJsonPath)?.expo?.extra?.firestore;
    if (extra && typeof extra.root === 'string') return normalize(extra.root);
    return 'artifacts/kpss-asistani/public/data';
  }
  return normalize(raw);
}
function normalize(v) {
  const s = String(v ?? '').trim();
  if (['.', './', '', 'root', '(root)', 'kök', 'kok', 'none'].includes(s.toLocaleLowerCase('en-US'))) return '';
  return s.replace(/^\/+|\/+$/g, '');
}

const documentsBase = projectId =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

/* -------------------------------------------------------------------- check */

async function fetchJson(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok, body };
}

async function runCheck(projectId, root) {
  const base = root ? `${documentsBase(projectId)}/${root}` : documentsBase(projectId);
  const results = [];
  const probe = async (label, url, init, explain) => {
    try {
      const r = await fetchJson(url, init);
      results.push({ label, verdict: explain(r), raw: r });
    } catch (e) {
      results.push({
        label,
        verdict: { ok: false, note: `erişilemedi (${e?.cause?.code || e?.message || 'ağ'})` },
      });
    }
  };

  await probe('içerik okuma (daily_tips)', `${base}/daily_tips/main`, undefined, r =>
    r.ok
      ? { ok: true, note: 'kural çalışıyor, belge var' }
      : r.status === 404
      ? { ok: true, note: '404 = erişim serbest, belge yok (tohumlama gerekli)' }
      : r.status === 403
      ? { ok: false, note: 'PERMISSION_DENIED → firestore.rules yayınlanmamış' }
      : { ok: false, note: `HTTP ${r.status}` }
  );

  await probe('üyelik listesi', `${base}/memberships?pageSize=5`, undefined, r =>
    r.ok
      ? { ok: true, note: `${(r.body?.documents || []).length} üye belgesi görünüyor` }
      : r.status === 404
      ? { ok: true, note: '404 = koleksiyon yok (ilk kayıtta oluşur)' }
      : r.status === 403
      ? { ok: false, note: 'PERMISSION_DENIED → read kuralı eksik' }
      : { ok: false, note: `HTTP ${r.status}` }
  );

  const email = `setup-probe@${projectId.replace(/[^a-z0-9-]/gi, '') || 'demo'}.test`;
  const fields = {
    id: { stringValue: email },
    email: { stringValue: email },
    emailNormalized: { stringValue: email },
    displayName: { stringValue: 'Kurulum denemesi' },
    verifier: { stringValue: '0'.repeat(64) },
    salt: { stringValue: '0'.repeat(32) },
    iterations: { integerValue: '100' },
    algo: { stringValue: 'pbkdf2-sha256' },
    role: { stringValue: 'user' },
    status: { stringValue: 'pending' },
    vip: { booleanValue: false },
    vipPlan: { stringValue: 'free' },
    vipExpiresAt: { stringValue: '' },
    createdAt: { stringValue: new Date().toISOString() },
    lastLoginAt: { stringValue: new Date().toISOString() },
    city: { stringValue: '' },
    exam: { stringValue: '' },
    note: { stringValue: 'setup-firestore.mjs yazma testi' },
    testsCompleted: { integerValue: '0' },
    questionsSolved: { integerValue: '0' },
    netSum: { integerValue: '0' },
    courseUsage: { mapValue: { fields: {} } },
    schemaVersion: { integerValue: '1' },
  };
  let created = null;
  await probe(
    'üyelik yazma (create)',
    `${base}/memberships?documentId=${encodeURIComponent(email)}`,
    { method: 'POST', body: JSON.stringify({ fields }) },
    r => {
      if (r.ok) {
        created = email;
        return { ok: true, note: 'create kuralı kabul etti' };
      }
      if (r.status === 409) {
        created = email;
        return { ok: true, note: 'belge zaten vardı (yazma akışı çalışıyor)' };
      }
      if (r.status === 403)
        return { ok: false, note: 'PERMISSION_DENIED → create kuralı/reject: ' + (r.body?.error?.message || '') };
      return { ok: false, note: `HTTP ${r.status} ${r.body?.error?.message || ''}` };
    }
  );

  if (created) {
    await probe(`deneme belgesini sil`, `${base}/memberships/${encodeURIComponent(created)}`, { method: 'DELETE' }, r =>
      r.ok || r.status === 404
        ? { ok: true, note: 'temizlendi' }
        : { ok: false, note: `HTTP ${r.status} → belgeyi Console'dan sil: memberships/${created}` }
    );
  }

  if (root) {
    await probe('legacy yol öneki', `${base}/courses`, undefined, r =>
      r.ok || r.status === 404
        ? { ok: true, note: `root="${root}" kullanılacak; yeni projede bu ağacı sen açtın mı?` }
        : { ok: false, note: `HTTP ${r.status}` }
    );
  }

  return { base, results };
}

/* --------------------------------------------------------------------- main */

async function main() {
  const explicit = positional[0];
  const { projectId, source } = resolveProject(explicit);
  const root = explicit ? rootValue : rootForCheck();

  console.log('');
  console.log(c.b('Firestore kurulum yardımcısı'));
  console.log(c.dim(`  repo      : ${dir}`));
  console.log(c.dim(`  proje     : ${projectId} ${source ? `(kaynak: ${source})` : ''}`));
  console.log(c.dim(`  kök öneki : ${root ? root : '(veritabanı kökü)'}`));
  if (!fs.existsSync(rulesPath)) console.log(c.warn('  ! firestore.rules bulunamadı'));
  console.log('');

  if (explicit) {
    // 1) .env.local
    const updates = {
      EXPO_PUBLIC_FIRESTORE_PROJECT: projectId,
      // kök düzeni '.' işaretiyle yazılır (boş değer bazı araçlarda düşebiliyor)
      EXPO_PUBLIC_FIRESTORE_ROOT: root === '' ? '.' : root,
    };
    if (apiKeyArg) {
      updates.EXPO_PUBLIC_FIREBASE_API_KEY = apiKeyArg.trim();
      updates.EXPO_PUBLIC_FIREBASE_PROJECT_ID = projectId;
      updates.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = `${projectId}.firebaseapp.com`;
    }
    writeEnvFile(envPath, updates);
    if (!DRY) console.log(c.ok('  ✔') + ` .env.local güncellendi (${envPath})`);

    // 2) .firebaserc
    const rc = readJsonSafe(rcPath) || {};
    rc.projects = { ...(rc.projects || {}), default: projectId };
    if (DRY) console.log(c.dim('  [dry-run] .firebaserc dokunulmadı; yazılacak: ') + JSON.stringify(rc));
    else {
      fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2) + '\n');
      console.log(c.ok('  ✔') + ` .firebaserc güncellendi (default: ${projectId})`);
    }

    // app.json uyarısı: yarım kalmış extra.firestore bloğu varsa karışıklık yaratır
    const appJson = readJsonSafe(appJsonPath);
    const extraFb = appJson?.expo?.extra?.firestore;
    if (extraFb && (extraFb.projectId !== projectId || normalize(extraFb.root ?? '') !== root)) {
      console.log(
        c.warn('  ! app.json içindeki expo.extra.firestore değeri env ile çelişiyor; ') +
          c.dim('env önceliklidir ama karışıklık için bloğu silebilirsin.')
      );
    }
  } else {
    console.log(
      c.dim(
        '  proje kimliği vermedin; sadece okuma yaptım. Yazmak için: node scripts/setup-firestore.mjs <projeKimligi>'
      )
    );
    console.log(
      c.dim(`  örnek: node scripts/setup-firestore.mjs ${projectId} --root . && npm run check:firestore`)
    );
  }

  if (flags.has('--check') || flags.has('--deploy')) {
    console.log('');
    console.log(c.b('  Konsol/uygulama tarafında yapman gerekenler'));
    console.log(
      [
        '  1) Console → Firestore Database → Create database → Native mode → region (ör. europe-west1), ID=(default)',
        '  2) Kuralları yayımla (aşağıdaki --deploy komutu veya Console → Rules → Paste → Publish)',
        '  3) npx expo start --clear  (env derleme zamanında gömülür; export için: rm -rf "$TMPDIR/metro-cache")',
        '  4) Uygulama: kalkan → PIN → Uygulama Ayarları → “Firestore bağlantısı” → Test et',
        '  5) Uygulama: “Firestore klasörlerini oluştur (tohumlama)” → Planı çıkar → Firestore’a yaz',
        '  6) Console’da meta/content_lock (note=kilitli) oluştur → içerik yazma penceresi kapanır',
        '  7) Firebase Auth (önerilen): Console → Authentication → Sign-in method → Email/Password → Enable,',
        '     sonra `npm run setup:firestore -- <proje> --root . --api-key <ANAHTAR>` ve',
        '     `deploy:rules`. Anahtar tanımlıysa uygulama kimlik doğrulamayı Firebase üzerinden yapar.',
        '  8) Auth oturduysa firestore.rules içinde authRequired() → true (kimliksiz üyelik yazma/okuma kapanır)',
      ].join('\n')
    );
  }

  if (flags.has('--check')) {
    console.log('');
    console.log(c.b(`  Bağlantı testi → ${projectId}`));
    const { base, results } = await runCheck(projectId, root);
    console.log(c.dim(`  hedef: ${base}`));
    let bad = 0;
    for (const r of results) {
      const line = r.verdict.ok ? c.ok('  ✔') : c.bad('  ✗');
      if (!r.verdict.ok) bad++;
      console.log(`${line} ${r.label} — ${r.verdict.note}`);
    }
    const blocked = results.length > 0 && results.every(r => /erişilemedi/.test(r.verdict.note));
    console.log('');
    if (blocked)
      console.log(
        c.warn('  Ağ engelli görünüyor: firestore.googleapis.com adresine çıkılamıyor. ') +
          c.dim('Bu adımı kendi makinende tekrar çalıştır — kurallar/veritabanı hakkında gerçek sonucu orada verir.')
      );
    console.log(
      bad === 0
        ? c.ok('Kuruluma hazır: yukarıdaki 1-6 adımlarını uygula.')
        : c.warn(
            `${bad} kontrol takıldı. En sık sebep: (a) kurallar henüz yayınlanmadı, (b) veritabanı adı (default) değil, (c) bu makineden firestore.googleapis.com erişimi yok.`
          )
    );
  }

  if (flags.has('--check')) {
    const key = (apiKeyArg || readEnvValue(envPath, 'EXPO_PUBLIC_FIREBASE_API_KEY') || '').trim();
    console.log('');
    console.log(c.b('  Firebase Auth testi'));
    if (!key) {
      console.log(
        c.dim('  ○ EXPO_PUBLIC_FIREBASE_API_KEY tanımlı değil → uygulama yerel PBKDF2 modunda çalışıyor.')
      );
      console.log(c.dim('  İstersen: npm run setup:firestore -- ' + projectId + ' --root . --api-key <ANAHTAR>'));
    } else {
      const a = await probeIdentity(key);
      console.log(`  ${a.verdict.ok ? c.ok('✔') : c.bad('✗')} ${a.verdict.note}${a.verdict.extra ? c.dim(' ' + a.verdict.extra) : ''}`);
    }
  }

  if (flags.has('--deploy')) {
    console.log('');
    try {
      execFileSync('npx', ['--yes', 'firebase-tools', 'deploy', '--only', 'firestore:rules', '--non-interactive'], {
        cwd: dir,
        stdio: 'inherit',
      });
      console.log(c.ok('  ✔ kurallar yayınlandı'));
    } catch (e) {
      console.log(
        c.bad('  ✘ yayın başarısız ') +
          c.dim(
            '— genelde: `npx firebase-tools login` yapılmamış, proje erişimin yok ya da bu ortam googleapis.com’ne çıkamıyor. Console → Rules → Paste → Publish da geçerli.'
          )
      );
    }
  }
  console.log('');
}

main().catch(e => {
  console.error(c.bad('Beklenmedik hata: ') + (e?.stack || e?.message || String(e)));
  process.exit(1);
});
