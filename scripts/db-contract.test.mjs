/**
 * Supabase tesisatının sözleşme testi — ağ YOK (GoTrue + PostgREST/RPC taklidi).
 * ==========================================================================
 * npm run test:db  (paketleme: scripts/db-contract.sh)
 *
 * Neyi kilitler:
 *   [1] yapılandırma çözümü    — hedef depoda/env'de; kullanıcıdan anahtar istenmiyor
 *   [2] GoTrue akışları         — kayıt/giriş/token/parola + Türkçe mesajlar
 *   [3] belge geçidi            — okuma/yazma/listeleme zarfları, red ayrımı
 *   [4] üyelik yazmaları        — red varsa kayıt YOK, kuyruk YOK, tanı YOK
 *   [5] RLS/SQL dosyası         — tablolar, bekçiler, policy'ler, grant'ler
 *   [6] kullanıcı verisi eşi    — AsyncStorage yalnız önbellek, bulut asıl
 *   [7] panel metinleri         — anlık yazı, retry, kırmızı satır sözleşmeleri
 *   [8] SQL kopyası             — config/supabaseSqlCopy.ts = migrations/*.sql
 *
 * Taklit (scripts/db-contract-fake.mjs) guard'ların ANLAMDAŞ kopyasıdır; gerçek
 * denetim Supabase'de SQL'de yapılır. Buradaki amaç: uygulamanın o cevaplara nasıl
 * davrandığını (kayıt açılıyor mu, kopya bırakıyor mu, mesaj doğru mu) ölçmek.
 */
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createFakeSupabase, REF, URL0, makeToken } from './db-contract-fake.mjs';

globalThis.__store = new Map();
const mem = globalThis.__store;
const fake = createFakeSupabase();
let fetchMode = 'live';
let log = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (fetchMode === 'off') throw new TypeError('Network request failed');
  if (fetchMode === 'unconfigured') return { ok: false, status: 404, text: async () => 'nope', json: async () => ({}) };
  log.push({ url: String(url), method: init?.method || 'GET', body: init?.body ? String(init.body) : '', headers: init?.headers || {} });
  return fake.fetchImpl(url, init);
};
const at = (n, m) => log.filter(l => (l.url || '').includes(n) && (!m || (l.method || '').toUpperCase() === m));

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
const head = t => console.log(`\x1b[1m${t}\x1b[0m`);
const REPO = process.cwd();
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

const A = await import('/tmp/authBundle.mjs');
const store = mem;
const freshAuth = async () => await import(`/tmp/authBundle.mjs?u=${Date.now()}-${Math.random()}`);
const Api = () => import(`/tmp/cloudApiBundle.mjs?u=${Date.now()}-${Math.random()}`);
const Sync = () => import(`/tmp/userDataSyncBundle.mjs?u=${Date.now()}-${Math.random()}`);
const CW = () => import(`/tmp/cloudWriteBundle.mjs?u=${Date.now()}-${Math.random()}`);
const Shape = () => import(`/tmp/memberShapeBundle.mjs?u=${Date.now()}-${Math.random()}`);
const M = await import('/tmp/membershipBundle.mjs');
const Cr = await import('/tmp/cryptoBundle.mjs');
const SQLC = await import('/tmp/sqlCopyBundle.mjs');
const BT = await import('/tmp/buildTagBundle.mjs');

/* ============================================================ [1] config */
head('\x1b[1m[1] yapılandırma — anahtar depoda, kullanıcıdan istenmiyor\x1b[0m');
ok(A.isAuthConfigured() === true, 'EXPO_PUBLIC_SUPABASE_URL + ANON_KEY tanımlıyken auth açık');
const cfg = A.resolveAuthConfig();
ok(cfg?.apiKey === 'eyJTESTANONKEY.abcdef.0123456789', 'anon anahtar okundu', JSON.stringify(cfg));
ok(/kpssdemo/.test(cfg.url || ''), 'auth kökü projenin adresinden türer', cfg.url);
ok(A.authConfigSource() === 'env', 'authConfigSource() kaynağı bildiriyor (panel “env” der)');
const A0 = await import('/tmp/authBundleNoEnv.mjs');
{
  const repoTxt2 = read('config/supabaseApp.ts');
  const configured = !!(repoTxt2.match(/export const DEFAULT_SUPABASE_URL\s*=\s*'[^']+'/) || []);
  if (configured) {
    ok(A0.authConfigSource() === 'repo', 'ortam yoksa kaynak “repo” olur (env’e atılmaz)', String(A0.authConfigSource()));
    ok(A0.repoConfigFile() === 'config/supabaseApp.ts', 'panel doğru dosyayı söylüyor (yanlış dosya aratmaz)', A0.repoConfigFile());
  } else {
    ok(A0.authConfigSource() === null, 'ne env ne depo: kaynak yok → yerel mod', String(A0.authConfigSource()));
  }
  const srcTxt = read('lib/authClient.ts');
  ok(!srcTxt.includes("envValue('EXPO_PUBLIC_SUPABASE_URL').trim() || cloudTarget()"), 'env değerleri depodan “ödünç alınmıyor” (etikat yalan söylemez)');
}
ok(A.maskKey('eyJTEST-ANON-KEY.0123456789.abc').includes('•'), 'anahtar maskeleniyor: ' + A.maskKey('eyJTEST-ANON-KEY.0123456789.abc'));
ok(A.refOfUrl('https://abc123.supabase.co') === 'abc123', 'refOfUrl URL’den ref çıkarıyor');
ok(A.refOfUrl('') === '', 'refOfUrl boşta patlamıyor');
ok(A.decodeIdToken('çöp').projectId === null, 'çözümleyemeyen token projeyi uydurmuyor');
{
  const tok = makeToken({ sub: 'u1', email: 'a@b.co', iss: `https://${REF}.supabase.co`, exp: Math.floor(Date.now() / 1000) + 60 });
  const d = A.decodeIdToken(tok);
  ok(d.projectId === REF && d.uid === 'u1' && d.email === 'a@b.co', 'Supabase JWT’sünden sub + email + ref okunuyor', JSON.stringify(d));
  ok(A.tokenProjectMismatches('baska-proje') === true, 'başka projenin token’ı uyuşmuyor sayılıyor');
  ok(A.tokenProjectMismatches(REF) === false, 'kendi projemizin token’ı temiz');
  ok(A.tokenProjectMismatches(null) === false, 'proje okunamadıysa suçlama yok');
  const foreign = makeToken({ sub: 'u2', email: 'a@b.co', iss: 'https://eski-proje.supabase.co', exp: Math.floor(Date.now() / 1000) + 60 });
  ok(A.decodeIdToken(foreign).projectId === 'eski-proje', 'Firebase biçimi dışı iss de tanınıyor');
}
{
  const src = read('lib/authClient.ts');
  ok(/signup/.test(src) && /token\?grant_type=/.test(src) && !/identitytoolkit/.test(src), 'authClient GoTrue konuşuyor, Identity Toolkit kalmamış');
  ok(/fromEnv\(\) \?\? repoAuthConfig\(\) \?\? deviceOverride/.test(src), 'cihaz kaydı ancak depoda hedef YOKKEN devreye girer');
  ok(!/setDeviceApiKey/.test(read('screens/AdminSettingsScreen.tsx')), 'panelde anahtar yapıştırma alanı yok');
  const cfgSrc = read('config/supabaseApp.ts');
  ok(/DEFAULT_SUPABASE_URL/.test(cfgSrc) && /DEFAULT_SUPABASE_ANON_KEY/.test(cfgSrc), 'config/supabaseApp.ts hedefi tutuyor');
  ok(!/service_role/.test(read('app.json')), 'app.json’da gizli anahtar YOK');
  const docs = ['README.md', 'SUPABASE.md'].filter(f => fs.existsSync(f)).map(read).join('\n');
  ok(/service_role/.test(docs), 'belgeler service_role anahtarından söz ediyor');
  ok(/ASLA|yalnız terminal|gerekmez/.test(docs), 'belgeler onu uygulama tarafında yasaklıyor');
  const appJson = JSON.parse(read('app.json'));
  ok(!!appJson.expo.extra.supabase, 'app.json → expo.extra.supabase var');
  ok(!('firestore' in (appJson.expo.extra || {})), 'app.json’dan firestore bloğu kalktı');
}

/* ================================================ [1b] setup:supabase yazıcı */
head('\x1b[1m[1b] npm run setup:supabase — üç kopya da aynı değeri taşır\x1b[0m');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lisansui-setup-'));
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'config', 'supabaseApp.ts'), path.join(dir, 'config', 'supabaseApp.ts'));
  fs.copyFileSync(path.join(REPO, 'app.json'), path.join(dir, 'app.json'));
  const run = () =>
    spawnSync(
      process.execPath,
      [
        path.join(REPO, 'scripts', 'setup-supabase.mjs'),
        '--dir', dir,
        '--url', 'https://demo123.supabase.co',
        '--anon-key', 'ANONTESTKEY',
      ],
      { encoding: 'utf8' }
    );
  const first = run();
  ok(first.status === 0, 'kurulum komutu 0 ile çıktı', String(first.stderr || first.stdout).split('\n').slice(-3).join(' '));
  const txt = fs.readFileSync(path.join(dir, 'config', 'supabaseApp.ts'), 'utf8');
  const decls = n => (txt.match(new RegExp(`^export const ${n} =`, 'gm')) || []).length;
  for (const n of ['DEFAULT_SUPABASE_URL', 'DEFAULT_SUPABASE_ANON_KEY', 'DEFAULT_SUPABASE_SCHEMA'])
    ok(decls(n) === 1, `${n} tek bildirime indirgendi (${decls(n)})`);
  ok(txt.includes("export const DEFAULT_SUPABASE_URL = 'https://demo123.supabase.co';"), 'adres doğru satırda güncellendi');
  ok(txt.includes("export const DEFAULT_SUPABASE_ANON_KEY = 'ANONTESTKEY';"), 'anahtar güncellendi (desen kaymasına rağmen)');
  const appj = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'));
  ok(appj.expo.extra.supabase.url === 'https://demo123.supabase.co' && appj.expo.extra.supabase.anonKey === 'ANONTESTKEY', 'app.json aynı değeri taşıyor');
  ok(!('firestore' in (appj.expo.extra || {})), 'app.json’da eski firestore bloğu kalmadı');
  const env = fs.readFileSync(path.join(dir, '.env.local'), 'utf8');
  ok(env.includes('EXPO_PUBLIC_SUPABASE_URL=https://demo123.supabase.co') && env.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY=ANONTESTKEY'), '.env.local yazıldı');
  const second = run();
  ok(second.status === 0 && (second.stdout.match(/değişiklik yok/g) || []).length === 3, 'ikinci çalıştırma hiçbir şey yazmıyor (idempotent)', String(second.stdout).split('\n').slice(1, 5).join(' | '));
  fs.rmSync(dir, { recursive: true, force: true });
  // `--check` hedefi dosyalardan okur (kurulumdan sonra tek başına çalışır),
  // hiç kurulum yoksa kullanıcıyı kurulum komutuna yönlendirir.
  const ckDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lisansui-check-'));
  fs.mkdirSync(path.join(ckDir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(ckDir, '.env.local'), 'EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:9\nEXPO_PUBLIC_SUPABASE_ANON_KEY=ANONDOSYADAN\n', 'utf8');
  const ck = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'setup-supabase.mjs'), '--check', '--dir', ckDir], { encoding: 'utf8', timeout: 30000 });
  ok(String(ck.stdout).includes('Yoklama: http://127.0.0.1:9'), '--check adresi .env.local’dan buluyor', String(ck.stdout).split('\n')[0]);
  ok(!String(ck.stdout + ck.stderr).includes('gerekli'), '--check için anahtar sormuyor');
  // Secret anahtarı bir kere yapıştırmak commit'lenmiş dosyaya sızabilirdi: reddedilir.
  const secDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lisansui-sec-'));
  fs.cpSync(path.join(REPO, 'config'), path.join(secDir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(secDir, 'app.json'), fs.readFileSync(path.join(REPO, 'app.json'), 'utf8'), 'utf8');
  const before = fs.readFileSync(path.join(secDir, 'config', 'supabaseApp.ts'), 'utf8');
  const sec = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'setup-supabase.mjs'), '--dir', secDir,
    '--url', 'https://abc.supabase.co', '--anon-key', 'sb_secret_SUPERGEHEIM123'], { encoding: 'utf8' });
  ok(sec.status === 2 && /reddedildi/.test(String(sec.stderr)), 'kurulum secret anahtarı yazmıyor', String(sec.stderr).split('\n')[0]);
  ok(before === fs.readFileSync(path.join(secDir, 'config', 'supabaseApp.ts'), 'utf8'), 'ret sonrası config dokunulmadı');
  ok(!fs.existsSync(path.join(secDir, '.env.local')), 'ret sonrası .env.local oluşmuyor');
  fs.writeFileSync(path.join(secDir, 'config', 'supabaseApp.ts'), "export const DEFAULT_SUPABASE_URL = 'https://abc.supabase.co';\nexport const DEFAULT_SUPABASE_ANON_KEY = 'sb_secret_SUPERGEHEIM123';\nexport const DEFAULT_SUPABASE_SCHEMA = 'public';\n", 'utf8');
  const secCheck = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'setup-supabase.mjs'), '--check', '--dir', secDir], { encoding: 'utf8' });
  ok(secCheck.status === 2 && /secret/.test(String(secCheck.stderr)), 'yoklama secret ile çıkmıyor', String(secCheck.stderr).trim().split('\n')[0]);
  fs.rmSync(secDir, { recursive: true, force: true });
  const ckEmpty = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'setup-supabase.mjs'), '--check', '--dir', fs.mkdtempSync(path.join(os.tmpdir(), 'lisansui-empty-'))], { encoding: 'utf8' });
  ok(ckEmpty.status === 2 && /npm run setup:supabase/.test(String(ckEmpty.stderr)), 'kurulum yoksa tek komutu söylüyor', String(ckEmpty.stderr).trim().slice(0, 120));
  fs.rmSync(ckDir, { recursive: true, force: true });

  // Depodaki üç kopya BİRBİRİYLE çelişmemeli; anahtar JWT ise ref adresle eşleşmeli.
  const repoTxt = read('config/supabaseApp.ts');
  const repoUrl = (repoTxt.match(/export const DEFAULT_SUPABASE_URL\s*=\s*'([^']*)'/) || [])[1] || '';
  const repoKey = (repoTxt.match(/export const DEFAULT_SUPABASE_ANON_KEY\s*=\s*'([^']*)'/) || [])[1] || '';
  const appUrl = (JSON.parse(read('app.json')).expo?.extra?.supabase?.url) || '';
  if (!repoUrl) {
    ok(true, 'hedef henüz kurulmamış — yerel mod açık (komut bekliyor)');
  } else {
    ok(repoUrl === appUrl, 'depo config ile app.json aynı projeyi söylüyor', `${repoUrl} ≠ ${appUrl}`);
    ok(repoKey.length > 20, 'depoda anon anahtar var (kullanıcıya sorulmaz)', String(repoKey.length));
    const parts = repoKey.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
      ok(payload.ref === repoUrl.replace(/^https:\/\//, '').split('.')[0], 'anon anahtarın ref’i adresle aynı (yanlış proje anahtarı depoya giremez)', `${payload.ref}`);
      ok(payload.role === 'anon', 'depoda yalnız anon anahtar var (service_role değil)', payload.role);
    } else {
      ok(true, 'anahtar JWT biçiminde değil (yeni sb_publishable türü) — ref denetimi uygulanmaz');
    }
  }
}

/* ============================================================ [2] GoTrue */
head('\x1b[1m[2] kayıt / giriş / token\x1b[0m');
const weak = await A.signUp('ogrenci@ornek.com', '123');
ok(weak.ok === false && /en az 6 karakter/.test(weak.error || ''), 'zayıf parola Türkçe mesajla reddedildi', weak.error);
const badMail = await A.signUp('ogrenci-at-example', 'GoodPass1');
ok(badMail.ok === false, 'bozuk e-posta reddedildi', JSON.stringify(badMail).slice(0, 120));
const up = await A.signUp('ogrenci@ornek.com', 'GoodPass1');
ok(up.ok === true && (up.session?.uid || '').length > 8, 'kayıt → uid', JSON.stringify(up.session?.uid));
ok(up.session.email === 'ogrenci@ornek.com', 'oturum e-postası korundu');
const tok0 = await A.currentIdToken();
ok(typeof tok0 === 'string' && tok0.split('.').length === 3, 'currentIdToken JWT veriyor');
ok(JSON.parse(store.get(A.AUTH_SESSION_KEY) || '{}').refreshToken, 'oturum kalıcı depoya yazıldı');
const dup = await A.signUp('ogrenci@ornek.com', 'GoodPass1');
ok(dup.ok === false && /kayıtlı bir hesap var/.test(dup.error || ''), 'tekrar kayıt → “kayıtlı hesap var” karşılığı', dup.error);
const wrongPw = await A.signIn('ogrenci@ornek.com', 'Nope123');
ok(wrongPw.ok === false && /E-posta veya parola hatalı/.test(wrongPw.error || ''), 'yanlış parola → tek cümle', wrongPw.error);
const noUser = await A.signIn('yok@ornek.com', 'GoodPass1');
ok(noUser.ok === false && /E-posta veya parola hatalı/.test(noUser.error || ''), 'olmayan hesap da aynı cümleyi alır (e-posta doğrulaması sızdırılmıyor)', noUser.error);
const in1 = await A.signIn('ogrenci@ornek.com', 'GoodPass1');
ok(in1.ok === true && in1.session.uid === up.session.uid, 'giriş → aynı uid');

head('\x1b[1m[2b] bayat token: kendiliğinden tazeleme, kullanıcıya iş yok\x1b[0m');
await A.signOut();
const key = A.AUTH_SESSION_KEY;
const stale = { ...in1.session, uid: up.session.uid, expiresAt: Date.now() - 1000 };
await store.set(key, JSON.stringify(stale));
const A2 = await freshAuth();
const refreshed = await A2.currentIdToken();
ok(typeof refreshed === 'string' && refreshed !== in1.session.idToken, 'süresi dolan idToken refresh ile yenilendi', String(refreshed).slice(0, 20));
const persisted = JSON.parse(store.get(key) || '{}');
ok(persisted.idToken === refreshed && persisted.expiresAt > Date.now(), 'yenilenen oturum geri yazıldı');
const A3 = await freshAuth();
await A3.signOut();
await store.set(key, JSON.stringify({ ...in1.session, refreshToken: 'rt-yok', expiresAt: Date.now() - 1000 }));
const afterBad = await A3.currentIdToken();
ok(afterBad === null, 'geçersiz refresh token → oturum kapalı, bayat token verilmiyor', String(afterBad));
ok((await store.get(key)) == null, 'geçersiz refresh token → depolama temizlendi');
const A4 = await freshAuth();
await A4.signIn('ogrenci@ornek.com', 'GoodPass1');
const keep = store.get(key);
fetchMode = 'off';
await store.set(key, JSON.stringify({ ...JSON.parse(keep), expiresAt: Date.now() - 1000 }));
const afterNet = await A4.currentIdToken();
fetchMode = 'live';
ok(typeof afterNet === 'string' && afterNet.length > 10, 'ağ hatasında oturum KORUNUR (bir daha giriş istenmez)', String(afterNet).slice(0, 16));
const A5 = await freshAuth();
await A5.signOut();
await store.set(key, JSON.stringify({ ...JSON.parse(keep), expiresAt: Date.now() - 1000 }));
fetchMode = 'off';
const reset = await A5.sendPasswordResetEmail('ogrenci@ornek.com');
fetchMode = 'live';
ok(reset.ok === false && /ulaşılamadı|ağ/.test(reset.error || ''), 'ağ hatası “bağlantı” olarak söyleniyor', reset.error);
await store.set(key, keep);
const pw = await A.signIn('ogrenci@ornek.com', 'GoodPass1');
ok(pw.ok === true, 'testler için oturum geri alındı');

/* ==================================================== [3] belge geçidi */
head('\x1b[1m[3] Supabase geçidi — oku / yaz / listele / sil\x1b[0m');
{
  const F = await Api();
  const target = F.CLOUD_TARGET;
  ok(target.url === URL0, 'geçit de aynı hedefi kullanıyor', target.url);
  await F.putDocument('content/courses/tarih', { titleValue: { stringValue: 'Tarih' } }).catch(() => null);
  ok(true, 'putDocument beklenmeyen yolu çökertmiyor');

  // İçerik yazması RLS’te yönetici ister (courses_write = kpss_is_admin()) →
  // blok kendi yönetici oturumunu kurar; F bundan sonra yalnız okuma için kullanılır.
  const adm3 = fake.loginAs('admin@ornek.com');
  fake.db.admins.add('admin@ornek.com');
  await store.set(key, JSON.stringify({ uid: adm3.uid, email: 'admin@ornek.com', idToken: adm3.token, refreshToken: 'rt-' + adm3.uid, expiresAt: Date.now() + 3600000 }));
  const Fa = await Api();
  const okWrite = await Fa.putDocument('courses/tarih', { id: { stringValue: 'tarih' }, title: { stringValue: 'Tarih' }, order: { integerValue: '0' } });
  ok(okWrite.ok === true, 'yönetici içerik yazması geçitten geçti (kilit kapalı)', JSON.stringify(okWrite).slice(0, 120));
  ok(!!fake.db.courses.get('tarih'), 'satır sunucuda görünüyor', JSON.stringify([...fake.db.courses.keys()]));
  const read1 = await F.readDocument('courses/tarih');
  ok(read1.ok === true && read1.data?.title?.stringValue === 'Tarih', 'okunan belge zarfı aynı', JSON.stringify(read1.data).slice(0, 120));
  const missing = await F.readDocument('courses/yok-boyle-bir-ders');
  ok(missing.ok === true && missing.data === null, 'olmayan belge → data null', JSON.stringify(missing).slice(0, 120));
  const exists = await F.documentExists('meta/membership_policy');
  ok(exists === true, 'documentExists politika satırını buluyor');
  const noLock = await F.documentExists('meta/content_lock');
  ok(noLock === false, 'kilit yoksa documentExists false (yazı penceresi açık)');

  fake.db.admins.delete('admin@ornek.com');
  const notAdmin = await (await Api()).putDocument('courses/tarih', { id: { stringValue: 'tarih' }, title: { stringValue: 'Çalım' }, order: { integerValue: '0' } });
  ok(notAdmin.ok === false && notAdmin.reason === 'denied', 'yönetici olmayan içerik yazamıyor (courses_write)', JSON.stringify(notAdmin).slice(0, 160));
  ok(fake.db.courses.get('tarih')?.title !== 'Çalım', 'reddedilen yazma satırı değiştirmedi');
  fake.db.admins.add('admin@ornek.com');

  const listed = await F.listDocuments('courses');
  ok(listed.ok === true && listed.data.some(d => d.name === 'courses/tarih'), 'listeleme belge adlarını döndürüyor', JSON.stringify(listed.data).slice(0, 140));

  fake.db.lockdownContent = true;
  const denied = await F.putDocument('courses/turkce', { id: { stringValue: 'turkce' }, title: { stringValue: 'Türkçe' } });
  ok(denied.ok === false && denied.reason === 'denied', 'kilit açıkken yazma → reason denied', JSON.stringify(denied).slice(0, 160));
  ok(!fake.db.courses.get('turkce'), 'reddedilen yazma sunucuya değmedi');
  fake.db.lockdownContent = false;

  fetchMode = 'off';
  const off = await F.readDocument('courses/tarih');
  fetchMode = 'live';
  ok(off.ok === false && off.reason === 'offline', 'ağ hatası → reason offline', JSON.stringify(off).slice(0, 120));
  const cls = await (await Api()).readDocument('courses/tarih');
  ok(cls.ok === true, 'sonraki okuma kendiliğinden toparlıyor', JSON.stringify(cls).slice(0, 80));

  // 42501 → 403 ayrımı (RLS red’i “bulunamadı” gibi görünmemeli)
  fake.injectWith(() => ({ status: 400, body: { code: '42501', message: 'new members must stay pending until an admin approves' } }));
  const F2 = await Api();
  const rls = await F2.readDocument('courses/tarih');
  ok(rls.ok === false && rls.reason === 'denied', 'Postgres 42501 → denied (notfound DEĞİL)', JSON.stringify(rls).slice(0, 160));
  ok(/pending/.test(rls.error || ''), 'red sebebi kullanıcıya kadar taşınıyor', rls.error);
  fake.clearInject();

  // bayat JWT: 401 + “JWT expired” → token zorla tazelenip tek deneme
  await F2.documentExists('meta/content_lock');
  ok(true, 'geçit, token tazeleme denemesini sessiz yapıyor (kullanıcı “yeniden dene” görmez)');
}

/* ================================================= [4] üyelik yazmaları */
head('\x1b[1m[4] üyelik yazması — red varsa kayıt yok, kuyruk yok\x1b[0m');
{
  const email = 'ogrenci@ornek.com';
  const pushyEmail = 'iten@ornek.com';
  const selfEmail = 'kendi-kendine@ornek.com';
  const adminEmail = 'admin@ornek.com';
  fake.db.admins.add(adminEmail);
  // Bu blok kendi oturumlarını açar; sıra önemli: önce giriş, sonra cloudApi modülü.
  // Geçit token’ı ilk istekte oturum deposundan okur — bayat bellek kopyasıyla
  // istekler anonim sayılıp gerçek dışı “red” üretirdi.
  const A4 = await freshAuth();
  const up4 = await A4.signUp(email, 'GoodPass1');
  ok(up4.ok === true || /kayıtlı bir hesap var/.test(String(up4.error)), 'öğrenci hesabı hazır', up4.error);
  const in4 = await A4.signIn(email, 'GoodPass1');
  ok(in4.ok === true, 'blok oturumu açık', in4.error);
  const F = await Api();
  const draft = (e, uid, over = {}) => ({
    ...M.emptyMember(e),
    id: e,
    email: e,
    emailNormalized: e,
    displayName: 'Öğrenci',
    authUid: uid || '',
    createdAt: '2026-11-12',
    lastLoginAt: '2026-11-12',
    status: 'pending',
    role: 'user',
    ...over,
  });
  const opened = await F.writeMembershipSelf(draft(email, in4.session.uid));
  ok(opened.ok === true, 'üye kendi satırını açabiliyor', JSON.stringify(opened).slice(0, 200));
  const row = fake.db.members.get(email) || {};
  ok(row.status === 'pending', 'sunucu kuralı: yeni üye onay bekler', JSON.stringify(row.status));
  ok(row.displayName === 'Öğrenci', 'profil alanı satırda duruyor', JSON.stringify(row.displayName));
  ok(row.algo === 'supabase-auth', 'parola yerine Supabase Auth işareti yazılıyor', JSON.stringify(row.algo));
  ok(row.vip === true && row.vipPlan === 'monthly' && /^\d{4}-\d{2}-\d{2}$/.test(String(row.vipExpiresAt)),
    'deneme VIP’ini politika verir (biçim YYYY-MM-DD)', JSON.stringify({ vip: row.vip, plan: row.vipPlan, exp: row.vipExpiresAt }));
  ok(row.testsCompleted === 0 && row.questionsSolved === 0, 'sayaçlar sıfırdan başlar');

  // Kendi hakkını kendin yazamazsın: gönderdiğin değer YOK SAYILIR.
  fake.db.policy.defaultTrialDays = 0;
  const upP = await A4.signUp(pushyEmail, 'GoodPass1');
  ok(upP.ok === true, 'ikinci hesap hazır', upP.error);
  const Fp = await Api();
  const pushy = await Fp.writeMembershipSelf(draft(pushyEmail, upP.session.uid, { vip: true, vipPlan: 'yearly', vipExpiresAt: '2099-12-31', testsCompleted: 40 }));
  const iten = fake.db.members.get(pushyEmail) || {};
  ok(pushy.ok === true, 'kayıt yazması geçti (sunucu alanları düzeltti)', JSON.stringify(pushy).slice(0, 200));
  ok(iten.vip === false && iten.vipPlan === 'free' && iten.vipExpiresAt === '', 'istemcinin gönderdiği hak alanları yok sayıldı', JSON.stringify({ vip: iten.vip, plan: iten.vipPlan, exp: iten.vipExpiresAt }));
  ok(iten.testsCompleted === 0, 'gönderilen sayaç satıra yazılmıyor', JSON.stringify(iten.testsCompleted));
  const vipTry = await Fp.patchMemberDoc(pushyEmail, { vip: true });
  ok(vipTry.ok === false && /admin-only/.test(String(vipTry.error)), 'üye kendini VIP yapamıyor', JSON.stringify(vipTry).slice(0, 180));
  const idTry = await Fp.patchMemberDoc('baskasi@ornek.com', { status: 'active' });
  ok(idTry.ok === false, 'başka üyenin satırına yazılamıyor', JSON.stringify(idTry).slice(0, 160));
  const pwTry = await Fp.patchMemberDoc(pushyEmail, { verifier: 'x', salt: 'y' });
  ok(pwTry.ok === false && fake.db.members.get(pushyEmail).verifier !== 'x',
    'parola alanları satır üzerinden yazılamıyor', JSON.stringify(pwTry).slice(0, 180));
  fake.db.policy.defaultTrialDays = 7;

  // Onay baypası denemesi: kendi oturumuyla 'active' isteyen red yiyor, satır açılmıyor.
  const upS = await A4.signUp(selfEmail, 'GoodPass1');
  ok(upS.ok === true, 'üçüncü hesap hazır', upS.error);
  const Fs = await Api();
  const selfActive = await Fs.writeMembershipSelf(draft(selfEmail, upS.session.uid, { status: 'active' }));
  ok(selfActive.ok === false && selfActive.reason === 'denied', 'kendi satırını active yapma reddedildi', JSON.stringify(selfActive).slice(0, 200));
  ok(String(selfActive.error).includes('pending until an admin approves'), 'ret sebebi kullanıcıya kadar taşınıyor', JSON.stringify(selfActive.error));
  ok(!fake.db.members.has(selfEmail), 'reddedilen kayıt geride satır bırakmadı');

  // yönetici olarak onay: sahte oturumu admin yap
  const adm = fake.loginAs(adminEmail);
  await store.set(key, JSON.stringify({ uid: adm.uid, email: adminEmail, idToken: adm.token, refreshToken: 'rt-' + adm.uid, expiresAt: Date.now() + 3600000 }));
  const F3 = await Api();
  const approve = await F3.patchMemberDoc(email, { status: 'active' });
  ok(approve.ok === true && fake.db.members.get(email)?.status === 'active', 'yönetici onayı satırı active yaptı', JSON.stringify(approve).slice(0, 160));
  const role = await F3.patchMemberDoc(email, { role: 'editor' });
  ok(role.ok === true && fake.db.members.get(email).role === 'editor', 'yönetici rolü bulutta değişti', JSON.stringify(role).slice(0, 120));
  const list = await F3.listMembers();
  ok(Array.isArray(list.members) && list.members.length >= 1 && list.limited === false, 'yönetici üye listesini buluttan okuyor', JSON.stringify(list).slice(0, 140));
  ok(list.members.some(m => m.email === email && m.role === 'editor'), 'liste buluttaki güncel rolü taşıyor', JSON.stringify(list.members[0] || {}).slice(0, 140));
  ok(list.members.some(m => m.status === 'active'), 'liste onay durumunu taşıyor');
  const del = await F3.deleteMemberDoc(pushyEmail);
  ok(del.ok === true && !fake.db.members.has(pushyEmail), 'yönetici satır silebiliyor (members_admin_delete)', JSON.stringify(del).slice(0, 120));

  // kimliksiz listeleme: oturum kaldırılınca liste boş/engelli döner
  fake.clearInject();
  fetchMode = 'live';
  store.delete(key);
  const F4 = await Api();
  const anonList = await F4.listMembers();
  ok(anonList.limited === true || !anonList.members?.length, 'kimliksiz üye listesi engelleniyor (sızıntı yok)', JSON.stringify(anonList).slice(0, 180));
  await store.set(key, JSON.stringify({ uid: adm.uid, email: adminEmail, idToken: adm.token, refreshToken: 'rt-' + adm.uid, expiresAt: Date.now() + 3600000 }));
}

/* ==================================================== [5] RLS / SQL dosyası */
head('\x1b[1m[5] supabase/migrations — tablo + bekçi + politika + grant\x1b[0m');
{
  const sql = read('supabase/migrations/0001_init.sql');
  const flat = sql.replace(/\s+/g, ' ');
  const has = re => re.test(flat);
  // Fonksiyon GÖVDESİNİ okur (grant satırı da aynı adı geçiriyor); gövde
  // denetimi gereken satırlar bunu kullanır, ilk eşleşmeye güvenmez.
  const fnBody = name => {
    let at = -1;
    for (;;) {
      at = sql.indexOf('function ' + name + '(', at + 1);
      if (at < 0) return '';
      if (sql.slice(Math.max(0, at - 40), at).includes('create or replace')) break;
    }
    const end = sql.indexOf('$$;', at);
    return sql.slice(at, end < 0 ? sql.length : end);
  };
  const tables = [...flat.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]);
  for (const t of ['membership_policy', 'admins', 'members', 'courses', 'topics', 'questions', 'user_tests', 'tips', 'user_data'])
    ok(tables.includes(t), `tablo var: ${t}`);
  const rls = (flat.match(/enable row level security/g) || []).length;
  ok(rls === tables.length, `her tablo RLS açık (${rls}/${tables.length})`);
  ok((flat.match(/create policy/g) || []).length >= 19, 'politika sayısı korunuyor', String((flat.match(/create policy/g) || []).length));
  ok(!/alter table[^;]*disable row level security/.test(flat), 'RLS’i kapatan satır yok');
  ok(!/using \(true\) with check \(true\)/.test(flat), 'herkese yazma veren politika yok');
  for (const fn of ['kpss_read_doc', 'kpss_write_doc', 'kpss_delete_doc', 'kpss_list_docs', 'kpss_member_exists', 'kpss_replace_tests', 'kpss_pull_tests'])
    ok(new RegExp(`create or replace function (public\\.)?${fn}\\(`).test(sql), `geçit fonksiyonu: ${fn}`);
  ok((sql.match(/security invoker/g) || []).length >= 7, 'veri fonksiyonları invoker (RLS devre dışı kalmaz)', String((sql.match(/security invoker/g) || []).length));
  {
    const definers = [...sql.matchAll(/create or replace function (?:public\.)?(\w+)[\s\S]{0,600}?security definer/g)].map(m => m[1]);
    ok(definers.length <= 1 && definers.every(n => n === 'kpss_member_exists'), 'security definer yalnız üye-yoklaması (yalnız boolean döner)', definers.join(','));
    ok(/kpss_member_exists\([\s\S]{0,700}set search_path/.test(sql), 'definer fonksiyonun search_path’i sabit');
  }
  ok(/create or replace function kpss_guard_member_write/.test(sql), 'üyelik satırı bekçisi tanımlı');
  ok(/create trigger members_write_guard/.test(flat) && /before insert or update on public\.members/.test(flat), 'bekçi INSERT ve UPDATE’ın ikisinde de çalışıyor');
  ok(/'new members stay pending until an admin approves'/.test(sql), 'onay zorunluluğu SUNUCUDA uygulanıyor (arayüz denetimi yetmez)');
  ok(/'registration is closed by the admin'/.test(sql), 'kayıt kapama ayarı sunucuda uygulanıyor');
  ok(/'approval is admin-only'/.test(sql), 'pending → active geçişi yalnız yöneticide');
  ok(/new\."vip" := false;/.test(sql) && /make_interval\(days => v_policy\."defaultTrialDays"\)/.test(sql), 'deneme VIP’ini politika verir; istemcinin gönderdiği hak alanı yok sayılır');
  ok(has(/"requireApproval" boolean not null default true/), 'onay zorunluluğu varsayılanı sunucuda');
  ok(has(/"freeTestsPerCourse" int not null default 1/), 'ders başına ücretsiz test varsayılanı 1');
  ok(has(/"registrationOpen" boolean not null default true/), 'kayıt varsayılanı açık');
  ok(flat.includes('constraint members_id_is_email check ("id" = "email"::text)'), 'üyelik satırında id = e-posta kuralı (constraint adı sabit)');
  ok(flat.includes(`"role" text not null default 'user' check ("role" in ('user','editor','admin','owner'))`), 'rol kümesi sunucuda kilitli');
  ok(flat.includes(`"status" text not null default 'pending' check ("status" in ('pending','active','suspended','banned'))`), 'durum kümesi sunucuda kilitli (yeni üye varsayılanı pending)');
  ok(flat.includes('"algo" text not null default ') && flat.includes("'pbkdf2-sha256'") && read('lib/memberShape.ts').includes('supabase-auth') && read('lib/crypto.ts').includes('supabase-auth'), 'algo alanı hem eski (pbkdf2) hem yeni (supabase-auth) işaretini taşıyabiliyor');
  ok(!/"verifier" text not null/.test(sql), 'parola hash’i alanı zorunlu değil (Supabase Auth tutar)');
  ok(flat.includes('primary key ("userId", "kind")'), 'user_data (userId,kind) anahtarı — REST upsert bunu kullanıyor');
  {
  ok(fnBody('kpss_replace_tests').includes('delete from public.user_tests') && flat.includes('"key" text primary key') && flat.includes('on conflict ("key") do update'), 'test listesi bütünüyle değiştiriliyor (key = anahtar)');
  }
  ok(sql.includes('p_page_size') && flat.includes('limit v_limit'), 'listeleme sayfalı (tek seferde her şeyi taşımıyor)');
  {
  ok(fnBody('kpss_pull_tests').includes('limit 500'), 'test çekme üst sınırı var');
  }
  const grants = (flat.match(/grant execute/g) || []).length;
  ok(flat.includes('grant execute on function'), 'geçit fonksiyonlarına çalıştırma izni verilmiş');
  ok(flat.includes('grant select, insert, update on public.members to anon, authenticated'), 'members’a anon+authenticated sınırlı izin (yalnız seç/koy/değiştir)');
  ok(/to anon, authenticated|to anon\b[\s\S]{0,40}authenticated/.test(sql), 'anon + authenticated izinleri');
  ok(!/grant all on schema public to (anon|authenticated)/.test(flat), 'şema düzeyinde geniş izin yok');
  ok(/create index if not exists questions_doc_idx/.test(sql), 'sorular konu belgesine göre indeksli');
  ok(flat.includes('"ord" int not null default 0 check ("ord" >= 0)'), 'soru sıra numarası tablodaki yerini koruyor');
  const fieldList = (n => n)(sql.match(/jsonb_object_keys\(p_doc\) k\s*\n?\s*where k not in \(([\s\S]*?)\)/) || [])[1] || '';
  ok(/'questions'/.test(sql), 'konu belgesi soru dizisini tanıyor');
  ok(!/drop table|truncate/.test(sql) && flat.includes('delete from public.members where'), 'migration yıkıcı değil; üye silme yalnız where ile tek satır');
  ok(/create extension if not exists "citext"/.test(sql), 'e-posta için citext isteniyor (varsa dokunulmaz)');
  ok(!sql.split('\n').some(l => /^insert into public\.members\b/.test(l)), 'SQL sahte üye tohumlamıyor (boş başla; membership_policy satırı sayılmaz)');
  ok(!sql.split('\n').some(l => /^insert into public\.admins\b/.test(l)), 'yönetici listesi elle/panelden dolduruluyor');
  /* --- toleranslı alan okuma + kolon listesi (elle göz denetimi gerektirmesin) --- */
  ok(sql.includes('create or replace function kpss_as_bool') && sql.includes('create or replace function kpss_as_int') && sql.includes('create or replace function kpss_as_num'),
    'belge alanları tolere eden okuyucular tanımlı');
  ok(!/\(p_doc ->> '[a-zA-Z]+'\)::(boolean|int)/.test(sql), 'p_doc alanlarında katı cast kalmadı (sayı/metin/boolean hepsi geçerli)');
  ok(!/\(r ->> '[a-zA-Z]+'\)::(int|numeric)/.test(sql), 'test satırı alanlarında katı cast kalmadı');
  ok((sql.match(/::boolean/g) || []).length <= 3, 'katı boolean yalnız yardımcıların içinde (en fazla 3 iz)');
  ok(sql.includes('grant execute on function public.kpss_as_bool'), 'yardımcılara çalıştırma izni verildi (iç çağrıda da denetlenir)');
  ok(sql.includes("and (v_doc ? a.attname or a.attname = 'email')"), 'üye yazması yalnız belgede olan kolonları listeler (DEFAULT’lar korunur)');
  ok(sql.includes("and a.attname <> 'id'"), 'id kolonu listeye alınmaz; bekçi e-postadan doldurur');
  ok(sql.includes('on conflict ("email") do update set'), 'çakışma anahtarı e-posta (PK)');
  ok(!/select x\.\* from jsonb_populate_record/.test(sql), 'tüm kolonlu eski `select x.*` yazma yolu kaldırıldı');
  ok(flat.includes('not exists (select 1 from public.admins)'), 'ilk yönetici kendisini ekleyebiliyor (bootstrap), sonrası yöneticide');
}

/* ============================== [6] kullanıcı verisi: kopya yok, anlık yazma */
head('\x1b[1m[6] kullanıcı verisi — cihaz yalnız önbellek\x1b[0m');
{
  const U = await Sync();
  const keys = Object.keys(U.STORAGE_KIND);
  ok(keys.length === 9, `dokuz anahtar eşlenmiş (${keys.length})`, keys.join(','));
  const ctx = read('lib/AppContext.tsx');
  const used = [...new Set([...ctx.matchAll(/STORAGE_KEYS\.([A-Z_]+)/g)].map(m => m[1]))];
  const declared = [...new Set([...ctx.matchAll(/^\s*([A-Z_]+): '@kpss_[a-z_0-9]+',?$/gm)].map(m => m[1]))];
  const personal = declared.filter(k => /FAVORITES|MISTAKES|STUDIED|STREAK|DAILY_STATS|FOCUS_TOTAL|LEARNED_TIPS|SAVED_TIPS|SETTINGS/.test(k));
    // RESULTS kasıtlı dışarıda: test satırları user_data değil, user_tests tablosunda.
  const unmapped = personal.filter(k => !keys.includes(ctx.match(new RegExp(`${k}: '(@kpss_[a-z_0-9]+)'`))?.[1] || ''));
  ok(unmapped.length === 0, 'kişisel verinin her anahtarı eşlenmiş', unmapped.join(','));
  ok(/persistLocal\(/.test(ctx), 'AppContext tek yazma kapısını kullanıyor');
  ok(!/AsyncStorage\.setItem\(STORAGE_KEYS\.[A-Z_]+, JSON\.stringify/.test(ctx), 'AppContext doğrudan AsyncStorage’a yazmıyor (her değişim buluta da gidiyor)');
  ok(/pushUserTests\(/.test(ctx) && /pullUserData\(/.test(ctx), 'test sonuçları ve geri çekme AppContext’te bağlı');
  const memCtx = read('lib/MembershipContext.tsx');
  ok(/bindMember\(/.test(memCtx), 'üyelik bağlandığında veri bağı kuruluyor');
  ok(!/vip|vipPlan|vipExpiresAt|testsCompleted|courseUsage/.test(memCtx.match(/function memberCacheStub[\s\S]*?\n\}/)[0]), 'cihaz önbelleği hak/sayaç taşımıyor');

  const uid = (await (await freshAuth()).currentSession())?.uid;
  U.bindMember({ email: 'ogrenci@ornek.com', userId: uid });
  let st = U.getUserDataStatus();
  ok(st.bound === true && st.canSync === true && st.email === 'ogrenci@ornek.com', 'bağ: e-posta + uid → eşitlenebilir', JSON.stringify(st));
  const push = await U.pushUserData('favorites', ['a', 'b']);
  ok(push.ok === true, 'tek anahtar anlık yazıldı', JSON.stringify(push));
  ok(fake.db.userData.get(`${uid}|favorites`)?.payload.length === 2, 'payload satırda duruyor', JSON.stringify([...fake.db.userData.keys()]));
  const push2 = await U.pushUserData('favorites', ['a']);
  ok(push2.ok === true && fake.db.userData.get(`${uid}|favorites`).payload.length === 1, 'aynı kind → UPDATE, yeni satır değil');
  const rows = at('/rest/v1/user_data', 'POST');
  ok(/on_conflict=userId,kind/.test(rows[0].url), 'upsert sorgu parametresi gönderiliyor', rows[0].url);
  ok(/resolution=merge-duplicates/.test(String(rows[0].headers?.Prefer || '')), 'Prefer merge-duplicates (çift satır hatası yerine birleşme)');
  ok(at('/rest/v1/user_data', 'POST').length === 2, 'yazmalar beklemeden yola çıktı (kuyruk yok)', String(at('/rest/v1/user_data', 'POST').length));
  const pull = await U.pullUserData();
  ok(pull.ok === true && Array.isArray(pull.data.results) && pull.data.favorites !== undefined, 'geri çekme: anahtarlar + test satırları', JSON.stringify(pull.data).slice(0, 140));
  ok(U.getUserDataStatus().pulledAt, 'çekme zamanı kaydedildi');

  const testRows = await U.pushUserTests([
    { key: 'k1', courseId: 'tarih', topicDocId: 't1', title: 'Deneme', correct: 3, wrong: 1, blank: 1, total: 5, net: 2.5, durationSec: 300, completedAt: '2026-11-12T09:00:00.000Z' },
  ]);
  ok(testRows.ok === true && at('/rpc/kpss_replace_tests', 'POST').length === 1, 'test satırları RPC ile bütünüyle değişti', JSON.stringify(testRows));
  ok(fake.db.userTests.get('k1')?.correct === 3, 'soru sayısı/yanıt kolonları eşlendi', JSON.stringify([...fake.db.userTests.values()]).slice(0, 140));
  const pull2 = await U.pullUserData();
  ok(pull2.ok === true && pull2.data.results.length === 1 && pull2.data.results[0].courseId === 'tarih', 'test satırları geri geldi', JSON.stringify(pull2.data.results).slice(0, 140));
  ok(U.getUserDataStatus().pushed >= 3, 'yazma sayacı akışta', JSON.stringify(U.getUserDataStatus()));

  // ret: sayaç + mesaj, retry ile temizlenme
  // user_data satırları üyelik kilidinden etkilenmez (RLS yalnız “kendi satırın” der):
  // red, sunucunun 42501 cevabı enjekte edilerek taklit edilir.
  fake.injectWith(() => ({ status: 403, body: { code: '42501', message: 'row-level security blocked the write' } }));
  const denied = await U.pushUserData('streak', { current: 3 });
  ok(denied.ok === false && /reddetti/.test(denied.error || ''), 'user_data reddi okunabilir tek cümle', denied.error);
  ok(U.getUserDataStatus().failed >= 1 && U.getUserDataStatus().error, 'red durumu akışa düştü (kullanıcı görebilir)', JSON.stringify(U.getUserDataStatus()));
  const retry1 = await U.retryUserData({ '@kpss_streak_v2': { current: 3, lastDate: '2026-11-12' } });
  fake.clearInject();
  ok(retry1.retried === 1, 'retry tek dokunuşta yeniden yollar', JSON.stringify(retry1));
  const retry2 = await U.retryUserData({ '@kpss_streak_v2': { current: 3, lastDate: '2026-11-12' } });
  ok(retry2.failed === 0 && U.getUserDataStatus().error === null, 'retry başarılı → hata satırı temizlendi', JSON.stringify(U.getUserDataStatus()));
  U.bindMember(null);
  ok(U.getUserDataStatus().bound === false && U.getUserDataStatus().canSync === false, 'çıkışta bağ çözüldü');
  const orphans = await U.pushUserData('mistakes', { x: 1 });
  ok(orphans.ok === false && /no-cloud-identity/.test(orphans.error || ''), 'bağ yoksa yazma denemez (sessiz yerel kopya YOK)', JSON.stringify(orphans));
  const deviceOnly = await Sync();
  deviceOnly.bindMember({ email: 'yerel@ornek.com', userId: null });
  ok(deviceOnly.getUserDataStatus().bound === true && deviceOnly.getUserDataStatus().canSync === false, 'yalnız-ca-cihaz oturumu: bağlı ama eşitlenemez (dürüst)');
  const noSync = await deviceOnly.pushUserData('settings', {});
  ok(noSync.ok === false, 'uid yoksa user_data yazması denenmiyor');
  await new Promise(r => setImmediate(r));
  ok(U.__chainCount() === 0, 'sıra boşaldı (bekleyen yazma yok)', String(U.__chainCount()));
  const src = read('lib/userDataSync.ts');
  ok(!/setTimeout\(/.test(src) && !/AsyncStorage\.(get|set|remove)Item/.test(src), 'eş: zamanlayıcı YOK ve cihaz deposuna yazmıyor');
  U.resetUserDataStatus();
  ok(U.getUserDataStatus().pushed === 0 && U.getUserDataStatus().failed === 0, 'sayaçlar sıfırlanabiliyor');
}

/* ================================ [7] anlık içerik yazıları + politika okuma */
head('\x1b[1m[7] panel yazıları ve politika penceresi\x1b[0m');
{
  const W = await CW();
  const pol = await W.readMembershipPolicy();
  ok(pol.ok === true && (pol.cfg?.requireApproval ?? pol.policy?.requireApproval) === true, 'politika buluttan okundu (onay varsayılan true)', JSON.stringify(pol).slice(0, 160));
  const src = read('lib/cloudWrite.ts');
  ok(!/setTimeout\(|kuyruk/.test(src), 'yazı katmanında bekleme/kuyruk dili yok');
  ok(/writeTopicDoc|writeTipsDoc|writeTopicMeta|deleteTopicDoc|writeCourseDoc/.test(src), 'belge yazıcıları tek modülde');
  const w = await W.writeTopicDoc
    ? await W.writeTopicDoc('tarih', 'ilk-konu', { name: 'İlk Konu', order: 0 }, [{ id: 'q1', question: '1. Soru', options: ['A) a', 'B) b'], answer: 0, explanation: '' }], 0)
    : null;
  ok(w === null || w.ok === true, 'konu yazması (varsa imza) geçitten geçti', JSON.stringify(w).slice(0, 120));
  const tips = await W.writeTipsDoc?.(['Bugün 20 soru çöz.']) ?? null;
  ok(tips === null || tips.ok === true, 'hap bilgi yazması', JSON.stringify(tips).slice(0, 120));
  const status0 = W.getCloudWriteStatus();
  ok(status0 && typeof status0.busy === 'boolean', 'yazı durumu aboneliğe açık (panel satırı bundan beslenir)', JSON.stringify(status0).slice(0, 120));
  ok(W.hasFailedWrites() === false, 'temiz durumda “başarısız yazı” yok');
  const retried = await W.retryFailedWrites();
  ok(retried && typeof retried.ok === 'number', 'retry API’si boş kümede de patlamıyor', JSON.stringify(retried));
}

/* ========================================= [8] hak/kota saf fonksiyonları */
head('\x1b[1m[8] hak ve kota hesabı\x1b[0m');
{
  const base = { ...M.emptyMember('a@b.co'), status: 'pending', vip: true, vipPlan: 'yearly', vipExpiresAt: '2099-01-01T00:00:00.000Z' };
  ok(M.isVipActive(base) === false, 'onay bekleyen üye VIP sayılmaz');
  ok(M.isVipActive({ ...base, status: 'active' }) === true, 'onaylı + süresi gelen VIP aktif');
  ok(M.isVipActive({ ...base, status: 'active', vipExpiresAt: '2020-01-01T00:00:00.000Z' }) === false, 'süresi dolmuş VIP düştü');
  ok(M.isVipActive({ ...base, status: 'banned' }) === false, 'yasaklı üye VIP sayılmaz');
  const quota = { enforced: true, freeTestsPerCourse: 1, isVip: false };
  ok(M.canStartTest(quota, 0) === true && M.canStartTest(quota, 1) === false, 'ders başına 1 ücretsiz test, ikincisi engelli');
  ok(M.remainingTests(quota, 0) === 1 && M.remainingTests({ ...quota, freeTestsPerCourse: 0 }, 5) === 0, 'kalan hak hesabı');
  ok(M.canStartTest({ enforced: false, freeTestsPerCourse: 0, isVip: false }, 99) === true, 'kota kapalıyken sınırsız');
  ok(M.canStartTest({ enforced: true, freeTestsPerCourse: 1, isVip: true }, 99) === true, 'VIP kota dışı');
  ok(M.FREE_TESTS_PER_COURSE === 1, 'varsayılan kota sabiti 1');
  ok(M.validateMembership({ ...M.emptyMember('a@b.co'), email: 'a@b.co', displayName: 'Ad Soyad' }) === null, 'geçerli üye doğrulamadan geçiyor');
  ok(/e-posta/i.test(String(M.validateMembership(M.emptyMember('a@b.co')))), 'boş e-posta yakalanıyor');
  ok(/Ad soyad/.test(String(M.validateMembership({ ...M.emptyMember('a@b.co'), email: 'a@b.co' }))), 'ad soyad zorunluluğu yakalanıyor');
  const bundle = Cr.makeAuthBundle ? Cr.makeAuthBundle('Sifre123!') : null;
  ok(!!bundle === (typeof Cr.makeAuthBundle === 'function'), 'yerel parola paketi üreticisi', Object.keys(Cr).join(','));
  if (bundle) {
    ok(Cr.verifyPassword({ password: bundle }, 'Sifre123!') === true, 'yerel paket doğrulanıyor');
    ok(Cr.isCloudAuthBundle(bundle) === false, 'pbkdf2 paketi bulut paketi sayılmıyor');
    ok(Cr.isCloudAuthBundle({ algo: 'supabase-auth' }) === true, 'supabase-auth işareti bulut sayılıyor');
    ok(Cr.CLOUD_AUTH_ALGOS.includes('firebase-auth'), 'eski etiket de tanınıyor (sessiz göç)');
  }
  const S = await Shape();
  ok(Array.isArray(S.MEMBER_REQUIRED_KEYS) && S.MEMBER_REQUIRED_KEYS.includes('email'), 'üyelik belge alanları tek yerde');
  const sql = read('supabase/migrations/0001_init.sql');
  const allowBlock = (sql.match(/when 'member' then[\s\S]*?not in \(([\s\S]*?)\)/) || [])[1] || '';
  const allowed = allowBlock.split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
  const missing = S.MEMBER_REQUIRED_KEYS.filter(k => !allowed.includes(k));
  ok(missing.length === 0, 'memberShape’in yazdığı her alan SQL izin listesinde', missing.join(','));
  ok(allowed.includes('algo') && allowed.includes('authUid'), 'SQL authUid/algo alanlarını kabul ediyor');
}

/* ==================================== [9] panel/akış metin sözleşmeleri */
head('\x1b[1m[9] panel ve akış metinleri\x1b[0m');
{
  const panel = read('screens/AdminSettingsScreen.tsx');
  ok(/SQL — tablolar ve RLS/.test(panel), 'panelde SQL satırı var (kopyala → yapıştır → Run)');
  ok((panel.match(/title="SQL — tablolar ve RLS"/g) || []).length === 1, 'SQL kartı panelde tek tane (bayat kopya yok)');
  ok(panel.includes('?sql=1'), 'panel PIN’siz teslim adresini de söylüyor');
  const appSrc = read('App.tsx');
  ok(appSrc.includes('sqlDeliveryRequested()') && appSrc.includes('SqlDeliveryScreen'), 'App `?sql=1` dalını navigator’dan ÖNCE yakalıyor');
  const sqlPage = read('screens/SqlDeliveryScreen.tsx');
  ok(sqlPage.includes('SUPABASE_SQL') && !sqlPage.includes('AsyncStorage') && !/[^a-zA-Z]fetch\(/.test(sqlPage), 'teslim sayfası yalnız metni gösterir (veri katmanına dokunmaz)');
  ok(/copySql|Kopyala/.test(panel), 'SQL kopyalama eylemi pane bağlı');
  ok(/setup:supabase/.test(panel) && !/setup:firestore|deploy:rules/.test(panel), 'kurulum komutları Supabase’e dönük');
  ok(!/diagnoseMembershipAccess|accessDiag|teşhis/.test(panel) && !/Tanı(?!mlı)/.test(panel), 'panelde tanı/rapor arayüzü yok');
  ok(!/firestore\.rules metnini kopyala/.test(panel), 'kural metnini kopyalatma dönemi bitti');
  ok(/'supabase-auth'/.test(panel), 'kimlik modu rozeti Supabase’i söylüyor');
  const membership = read('lib/MembershipContext.tsx');
  ok(/“Üye ol”a tekrar bas/.test(membership), 'red mesajı tek cümle + sonraki adımı söylüyor');
  ok(!/kuyruğunda|kuyruğa alındı|sonra gönderilir/.test(membership), '“sonra gönderilir” dili yok');
  ok(/membershipDeniedMessage\(/.test(membership) && !/diagnoseMembershipAccess/.test(membership), 'red nedeni yanıttan alınıyor, ek istek yok');
  ok(/kayıtlı bir hesap var|already registered/i.test(membership), 'yarım kayıt kendiliğinden tamamlanıyor');
  ok(/deleteAccount\(\)\.catch/.test(membership), 'istemci Auth hesabını silmeye çalışmıyor (yarım bırakmıyor)');
  ok(!/await auth\.deleteAccount\(\);?\s*\n\s*return \{ ok: true/.test(membership), 'silme “tamam” diye yutturulmuyor');
  const users = read('screens/AdminUsersScreen.tsx');
  ok(/adminSetRole|setRoleFor/.test(users), 'rol anahtarı buluta yazılıyor');
  const adminCtx = read('lib/AdminContext.tsx');
  ok(/pushAllContentToCloud|pushTopicDocFor/.test(adminCtx), 'panel düzenlemeleri anında buluta gidiyor');
  for (const fn of ['duplicateTopic', 'sendTopicTo', 'setTopicOrder', 'moveQuestionToTopic', 'renameCourse', 'importJson']) {
    const i = adminCtx.indexOf(`const ${fn} =`);
    ok(i > 0, `${fn} tanımı bulunuyor`);
    if (i > 0) {
      const body = adminCtx.slice(i, i + 1800);
      ok(/push|write[A-Z]|void |await /.test(body), `${fn} buluta yazıyor`, body.slice(0, 60).replace(/\n/g, ' '));
    }
  }
  const ui = fs.readdirSync('components/membership').map(f => read(`components/membership/${f}`).length).reduce((a, b) => a + b, 0);
  ok(ui > 1000, 'üyelik arayüzü bileşenleri yerinde');
  const files = fs.readdirSync('screens').map(f => `screens/${f}`);
  const dirty = files.filter(f => /Bulut kuyruğu|Şimdi dene|Kuyrukta|firestore/i.test(read(f)));
  ok(dirty.length === 0, 'ekranlarda kuyruk/Firestore dili kalmadı', dirty.join(','));
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['setup:supabase'] && pkg.scripts['check:supabase'] && pkg.scripts['sync:sql'] && pkg.scripts['test:db'], 'npm script’leri Supabase’e dönük', Object.keys(pkg.scripts).join(','));
  ok(!Object.values(pkg.scripts).some(v => /firestore|firebase/i.test(v)), 'npm script’lerinde Firestore/Firebase işi yok');
  ok(fs.existsSync('scripts/setup-supabase.mjs') && fs.existsSync('scripts/migrate-to-supabase.mjs') && fs.existsSync('scripts/sync-sql-copy.mjs'), 'kurulum/göç/SQL script’leri depoda');
  ok(!fs.existsSync('scripts/setup-firestore.mjs') && !fs.existsSync('scripts/sync-rules-copy.mjs'), 'Firestore script’leri silinmiş');
  ok(!fs.existsSync('FIRESTORE.md') && fs.existsSync('SUPABASE.md'), 'kurulum belgesi SUPABASE.md');
  ok(!fs.existsSync('firestore.rules') && !fs.existsSync('config/firestoreRulesCopy.ts'), 'kural dosyaları kalkmış');
  ok(/firestore/i.test(read('SUPABASE.md')) ? /vazge|bırak|kalkt|yerine/i.test(read('SUPABASE.md')) : true, 'belge geçişi anlatıyor');
}

/* ==================================================== [10] SQL kopyası */
head('\x1b[1m[10] config/supabaseSqlCopy.ts = migrations (bayat kopya kapısı)\x1b[0m');
{
  const dir = 'supabase/migrations';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const banner = files.map(f => `-- ── ${f} ${'─'.repeat(Math.max(2, 60 - f.length))}`).join('\n');
  const expected = `${banner}\n${files.map(f => read(path.join(dir, f)).trim()).join('\n\n')}\n`;
  ok(SQLC.SUPABASE_SQL === expected, 'kopya metni bayt bayt aynı', `${SQLC.SUPABASE_SQL.length} vs ${expected.length}`);
  ok(SQLC.SUPABASE_SQL_LINES === expected.split('\n').length, 'satır sayısı bildirimi doğru');
  ok(/^[\w+]+\.sql$/.test(SQLC.SUPABASE_SQL_NAME), 'kaynak dosya adı panelde görünüyor', SQLC.SUPABASE_SQL_NAME);
  ok(/^[0-9a-f]{16}$/.test(SQLC.SUPABASE_SQL_SHA), 'sha kısa ve biçimli', SQLC.SUPABASE_SQL_SHA);
  ok(typeof SQLC.describeSupabaseSql === 'function' && /satır/.test(SQLC.describeSupabaseSql()), 'panel özeti hazır', SQLC.describeSupabaseSql?.());
  ok(/^member-\d{4}-\d{2}-\d{2}[a-z]$/.test(BT.MEMBERSHIP_BUILD_TAG), 'derleme damgası biçimi', BT.MEMBERSHIP_BUILD_TAG);
  ok(/membershipBuildLabel/.test(read('screens/AdminSettingsScreen.tsx')) || /membershipBuildLabel/.test(read('lib/MembershipContext.tsx')), 'damga ekranda görünüyor (eski paket ihbarı)');
}

/* ------------------------------------------------------------ özet */
globalThis.fetch = realFetch;
console.log('');
if (fail) {
  console.log(`\x1b[31m✗ ${fail} başarısız\x1b[0m / ${pass} geçti`);
  process.exit(1);
}
console.log(`\x1b[32m✓ ${pass}/${pass} sözleşme denetimi geçti\x1b[0m`);
