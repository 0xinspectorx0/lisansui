/**
 * Kimlik doğrulama tesisatı için sözleşme testi (ağ yok).
 * lib/authClient.ts esbuild ile paketlenir, Identity Toolkit sahte fetch ile
 * taklit edilir; ayrıca firestore.rules ve MembershipContext bağları kontrol edilir.
 * Çalıştır: npm run test:auth (bkz. scripts/auth-contract.sh)
 */
globalThis.__store = new Map();
const mem = globalThis.__store;
const users = new Map(); // email -> { localId, password, email }
let uidSeq = 0;
const log = [];
let forceExpiry = false;

function res(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}
const err = (m) => res(400, { error: { message: m } });

globalThis.fetch = async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : {};
  log.push({ url: String(url), method: init?.method || 'GET', body, headers: init?.headers || {} });
  const u = String(url);

  if (u.includes('identitytoolkit.googleapis.com')) {
    if (u.includes(':signUp')) {
      if (!body.email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(body.email)) return err('INVALID_EMAIL : The email address is badly formatted.');
      if ((body.password || '').length < 6) return err('WEAK_PASSWORD : Password should be at least 6 characters');
      if (users.has(body.email)) return err('EMAIL_EXISTS : The email address is already in use by another account.');
      const localId = `uid${++uidSeq}${'x'.repeat(24)}`;
      users.set(body.email, { localId, password: body.password, email: body.email });
      return res(200, { kind: 'identitytoolkit#SignupNewUserResponse', localId, email: body.email, idToken: `id-${localId}`, refreshToken: `rt-${localId}`, expiresIn: '3600' });
    }
    if (u.includes(':signInWithPassword')) {
      const user = users.get(body.email);
      if (!user) return err('EMAIL_NOT_FOUND : There is no user record corresponding to this identifier.');
      if (user.password !== body.password) return err('INVALID_LOGIN_CREDENTIALS : The password is invalid or the user does not have a password.');
      return res(200, { localId: user.localId, email: user.email, idToken: `id-${user.localId}`, refreshToken: `rt-${user.localId}`, expiresIn: '3600' });
    }
    if (u.includes(':token')) {
      const user = [...users.values()].find(x => `rt-${x.localId}` === body.refresh_token);
      if (!user) return res(400, { error: { message: 'TOKEN_EXPIRED' } });
      return res(200, { access_token: `id2-${user.localId}`, expires_in: '3600', refresh_token: `rt-${user.localId}`, id_token: `id2-${user.localId}` });
    }
    if (u.includes(':lookup')) {
      const token = String(body.idToken || '');
      const localId = token.replace(/^id2?-/, '');
      const user = [...users.values()].find(x => x.localId === localId);
      if (!user) return err('INVALID_ID_TOKEN : The user credential is not a valid credential.');
      return res(200, { users: [{ localId: user.localId, email: user.email, emailVerified: false }] });
    }
    if (u.includes(':update')) {
      const token = String(body.idToken || '');
      const localId = token.replace(/^id2?-/, '');
      const user = [...users.values()].find(x => x.localId === localId);
      if (!user) return err('INVALID_ID_TOKEN : bad');
      if ((body.password || '').length < 6) return err('WEAK_PASSWORD : Password should be at least 6 characters');
      user.password = body.password;
      return res(200, { idToken: `id-${user.localId}`, refreshToken: `rt-${user.localId}`, expiresIn: '3600' });
    }
    if (u.includes(':delete')) {
      const token = String(body.idToken || '');
      const localId = token.replace(/^id2?-/, '');
      for (const [k, v] of users) if (v.localId === localId) users.delete(k);
      return res(200, {});
    }
    if (u.includes(':sendOobCode')) {
      if (!users.has(body.email)) return err('EMAIL_NOT_FOUND : no user');
      return res(200, { requestType: body.requestType, email: body.email });
    }
  }
  return res(404, { error: { message: `UNHANDLED ${u}` } });
};

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${extra}`); }
};

const A = await import('/tmp/authBundle.mjs');
const store = globalThis.__store;

console.log('\x1b[1m[1] yapılandırma\x1b[0m');
ok(A.isAuthConfigured() === true, 'EXPO_PUBLIC_FIREBASE_API_KEY tanımlıyken auth açık');
const cfg = A.resolveAuthConfig();
ok(cfg?.apiKey === 'AIzaTEST-KEY', 'apiKey okundu', JSON.stringify(cfg));
ok(/^[^/]+$/.test(cfg.authDomain) && cfg.authDomain.endsWith('.firebaseapp.com'), 'authDomain projeden türedi', cfg.authDomain);
ok(A.maskKey('AIzaSyD-1234567890ABCDE').includes('•'), 'anahtar maskeleniyor: ' + A.maskKey('AIzaSyD-1234567890ABCDE'));

console.log('\x1b[1m[2] kayıt\x1b[0m');
const weak = await A.signUp('ayse@example.com', '123');
ok(weak.ok === false && /en az 6 karakter/.test(weak.error), 'zayıf parola Türkçe mesajla reddedildi', weak.error);
const badMail = await A.signUp('ayse-at-example', 'GoodPass1');
ok(badMail.ok === false && badMail.code === 'INVALID_EMAIL', 'bozuk e-posta reddedildi', badMail.code);
const up = await A.signUp('ayse@example.com', 'GoodPass1');
ok(up.ok && up.session.uid.length > 8, 'kayıt → uid', JSON.stringify(up.session?.uid));
ok(up.session.email === 'ayse@example.com', 'oturum e-postası normalize gelen değer');
const tok = await A.currentIdToken();
ok(tok === `id-${up.session.uid}`, 'currentIdToken oturumdan verildi', String(tok));
ok(JSON.parse((await store.get('kpss.firebaseAuth.session.v1')) || '{}').refreshToken, 'oturum depolamaya yazıldı');

console.log('\x1b[1m[3] giriş\x1b[0m');
const dup = await A.signUp('ayse@example.com', 'GoodPass1');
ok(dup.ok === false && /Bu e-posta ile kayıtlı bir hesap var/.test(dup.error), 'EMAIL_EXISTS Türkçe karşılık', dup.error);
const wrongPw = await A.signIn('ayse@example.com', 'Nope123');
ok(wrongPw.ok === false && /E-posta veya parola hatalı/.test(wrongPw.error), 'yanlış parola', wrongPw.error);
const noUser = await A.signIn('yok@example.com', 'GoodPass1');
ok(noUser.ok === false && /kayıtlı bir hesap yok/.test(noUser.error), 'olmayan hesap', noUser.error);
const in1 = await A.signIn('ayse@example.com', 'GoodPass1');
ok(in1.ok && in1.session.uid === up.session.uid, 'giriş → aynı uid');

console.log('\x1b[1m[4] token yenileme\x1b[0m');
// "uygulama yeniden açıldı" senaryosu: bellek temiz, diskde süresi dolmuş oturum var
const key = 'kpss.firebaseAuth.session.v1';
await A.signOut();
const stale = { ...in1.session, expiresAt: Date.now() - 1000 };
await store.set(key, JSON.stringify(stale));
const refreshed = await A.currentIdToken();
ok(refreshed === `id2-${up.session.uid}`, 'süresi dolan idToken refresh ile yenilendi', String(refreshed));
const persisted = JSON.parse((await store.get(key)) || '{}');
ok(persisted.idToken === `id2-${up.session.uid}` && persisted.expiresAt > Date.now(), 'yenilenen oturum geri yazıldı');
// refresh token geçersizse oturum temizlenmeli ve ÖLÜ token gönderilmemeli
await A.signOut();
await store.set(key, JSON.stringify({ ...in1.session, refreshToken: 'rt-olmayan', expiresAt: Date.now() - 1000 }));
const afterBad = await A.currentIdToken();
ok(afterBad === null, 'geçersiz refresh token → oturum kapatıldı, bayat token verilmiyor', String(afterBad));
ok((await store.get(key)) == null, 'geçersiz refresh token → depolama temizlendi');
await A.signIn('ayse@example.com', 'GoodPass1');

// geçici ağ hatasında oturum KORUNUR (bayat token yeniden denenebilir)
await A.signIn('ayse@example.com', 'GoodPass1');
const keep = await store.get(key);
const realF = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('Network request failed'); };
await store.set(key, JSON.stringify({ ...in1.session, expiresAt: Date.now() - 1000 }));
const duringOutage = await A.currentIdToken();
globalThis.fetch = realF;
ok(duringOutage === in1.session.idToken, 'ağ kesintisinde mevcut idToken korunuyor (giriş zorlamıyor)');
void keep;

console.log('\x1b[1m[5] restore (uygulama açılışı)\x1b[0m');
const before = await A.currentSession();
ok(before?.email === 'ayse@example.com', 'kalıcı oturum okundu');

console.log('\x1b[1m[6] parola değişimi + sıfırlama\x1b[0m');
const pwUpd = await A.updatePassword('NewPass99');
ok(pwUpd.ok, 'updatePassword başarılı');
const oldPw = await A.signIn('ayse@example.com', 'GoodPass1');
ok(oldPw.ok === false, 'eski parola artık geçersiz');
const newPw = await A.signIn('ayse@example.com', 'NewPass99');
ok(newPw.ok, 'yeni parola ile giriş');
const reset = await A.sendPasswordResetEmail('ayse@example.com');
ok(reset.ok === true, 'sıfırlama e-postası gönderildi');
const resetBad = await A.sendPasswordResetEmail('yok@example.com');
ok(resetBad.ok === false && /kayıtlı bir hesap yok/.test(resetBad.error), 'olmayan e-posta için anlaşılır mesaj');

console.log('\x1b[1m[7] panel probe/lookup\x1b[0m');
const probe = await A.probeAuth();
ok(probe.ok === true && /Email\/Password/.test(probe.note), 'probeAuth: sağlayıcı açık görünüyor', probe.note);
const lk = await A.lookupSelf();
ok(lk.ok && lk.uid === up.session.uid && lk.email === 'ayse@example.com', 'lookupSelf uid+e-posta döndürdü', JSON.stringify(lk));
ok(lk.emailVerified === false, 'emailVerified flag’i taşınıyor');

console.log('\x1b[1m[8] çıkış / hesap silme\x1b[0m');
await A.signOut();
ok((await A.currentIdToken()) === null, 'signOut → token yok');
ok((await store.get(key)) == null, 'signOut → depolama temiz');
const signedBack = await A.signIn('ayse@example.com', 'NewPass99');
const del = await A.deleteAccount();
ok(del.ok === true, 'deleteAccount başarılı');
ok((await A.currentIdToken()) === null, 'hesap silinince oturum kapandı');
ok((await A.signIn('ayse@example.com', 'NewPass99')).ok === false, 'silinen hesapla giriş yapılamaz');
void signedBack;

console.log('\x1b[1m[9] ağ hatası\x1b[0m');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('Network request failed'); };
const offline = await A.signIn('a@b.com', 'x');
ok(offline.ok === false && /ulaşılamadı/.test(offline.error), 'çevrimdışı → Türkçe ağ mesajı', offline.error);
globalThis.fetch = realFetch;
ok(!log.some(l => l.url.includes('UNHANDLED')), 'sahte sunucuda ele alınmayan çağrı yok');
ok(log.filter(l => l.url.includes('key=AIzaTEST-KEY')).length > 0, 'tüm Auth çağrıları API anahtarıyla gitti');

console.log('\x1b[1m[9b] cihazdan girilen anahtar (terminal/.env yok)\x1b[0m');
const envCfg = A.resolveAuthConfig();
ok(envCfg?.source === 'env' && envCfg.apiKey === 'AIzaTEST-KEY', 'env kaynağı işaretleniyor', JSON.stringify(envCfg));
const tooShort = await A.setDeviceApiKey('AIza123');
ok(!tooShort.ok && /kısa/.test(tooShort.error), 'çok kısa anahtar reddedildi', tooShort.error);
const spaces = await A.setDeviceApiKey('AIza 12345678901234567890');
ok(!spaces.ok && /boşluk/.test(spaces.error), 'boşluklu değer reddedildi', spaces.error);
const junk = await A.setDeviceApiKey('AIza"onwards"1234567890');
ok(!junk.ok && /beklenmeyen karakter/.test(junk.error), 'geçersiz karakter reddedildi', junk.error);
const saved = await A.setDeviceApiKey('AIzaDEV-KEY_0123456789abcd');
ok(saved.ok, 'cihaz anahtarı kaydedildi', saved.error);
A.resetAuthConfigCache();
await A.ensureAuthConfigLoaded();
const dev = A.resolveAuthConfig();
ok(dev?.apiKey === 'AIzaDEV-KEY_0123456789abcd' && dev.source === 'device', 'cihaz değeri env’i gölgede bırakıyor', JSON.stringify(dev));
ok(dev?.authDomain === `${dev.projectId}.firebaseapp.com`, 'authDomain projeden türedi (cihaz modunda da)');
ok(A.authConfigSource() === 'device', 'authConfigSource() cihaz kaynağını bildiriyor');
const probed = await A.probeAuth();
ok(probed.ok, 'yazılan anahtarla sağlayıcı testi geçiyor', probed.note);
ok((await A.readDeviceApiKey()) === 'AIzaDEV-KEY_0123456789abcd', 'readDeviceApiKey kalıcı değeri döndürüyor');
await A.clearDeviceApiKey();
A.resetAuthConfigCache();
ok(A.resolveAuthConfig()?.source === 'env', '“Kaldır” sonrası env değerine dönüldü', JSON.stringify(A.resolveAuthConfig()));

console.log('\x1b[1m[10] firestore.rules sözleşmesi\x1b[0m');
const fs = await import('node:fs');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const fnOrder = (a, b) => rules.indexOf(`function ${a}(`) < rules.indexOf(`function ${b}(`);
ok(!/function authRequired\(/.test(rules), 'kod bayrağı yok (kilit artık veride)');
ok(/function lockdownOn\(\)\s*\{[\s\S]{0,220}meta\/membership_lockdown/.test(rules), 'lockdownOn() → meta/membership_lockdown belgesine bakıyor');
ok(/function adminOk\(\)\s*\{\s*return isAdminSession\(\)\s*\|\|\s*!lockdownOn\(\);/.test(rules), 'adminOk() = yönetici token’ı VEYA kilit kapalı');
ok(/request\.auth\.token\.email\.lower\(\)\s*\n?\s*in get\(\/databases\/\$\(database\)\/documents\/meta\/admins\)\.data\.emails/.test(rules), 'yönetici listesi meta/admins belgesinden okunuyor');
ok(/match \/meta\/admins \{[\s\S]*?allow write: if !lockdownOn\(\)/.test(rules), 'meta/admins yalnız kilit kapalıyken istemci yazabilir');
ok(/match \/meta\/\{document\} \{[\s\S]*?allow list, write: if false;/.test(rules), 'meta altında diğer belgeler istemciye kapalı (content_lock/lockdown dahil)');
ok(/request\.resource\.data\.emails\.all\(e, e is string && e == e\.lower\(\)/.test(rules), 'admins listesi küçük harf e-posta + tip denetimi');
ok(fnOrder('authUidOk', 'memberCreateOk'), 'authUidOk, memberCreateOk’tan önce tanımlı');
ok(/allow read: if adminOk\(\) \|\| selfReadOk\(memberId\);/.test(rules), 'kök membership read: admin veya kendi belgesi');
ok(/memberCreateOk\(memberId\) && \(adminOk\(\) \|\| selfCreateOk\(memberId\)\)/.test(rules), 'create: kimlik eşleşmesi zorunlu (token varsa)');
ok(/memberUpdateOk\(memberId\) && \(adminOk\(\) \|\| selfUpdateOk\(memberId\)\)/.test(rules), 'update: kimlik eşleşmesi zorunlu (token varsa)');
ok(rules.includes("data.algo == 'firebase-auth'") && rules.includes("data.verifier == '' && data.salt == '' && data.iterations == 0"), 'firebase-auth belgelerinde boş hash kabul, sahte hash reddedilir');
ok(rules.includes("'authUid'") && /authUid == request\.auth\.uid/.test(rules), 'authUid yalnızca kendi uid ile yazılabilir');
ok(/artifact == 'kpss-asistani' && \(adminOk\(\) \|\| selfReadOk\(memberId\)\)/.test(rules), 'legacy (artifacts) düzeni de kimlik denetiyor');
ok((rules.match(/selfReadOk\(memberId\)/g) || []).length >= 4, 'kendi-belge şartı hem read hem delete bloklarında');

console.log('\x1b[1m[11] bağlar (kaynak düzeyinde)\x1b[0m');
const ctx = fs.readFileSync('lib/MembershipContext.tsx', 'utf8');
const api = fs.readFileSync('lib/firestoreApi.ts', 'utf8');
ok(/const sec = authMode \? AUTH_PASSWORD_BUNDLE : hashPassword\(input\.password\);/.test(ctx), 'signUp: auth modunda belgeye hash yazılmıyor');
ok(/await auth\.signUp\(emailKey, input\.password\)/.test(ctx), 'signUp: önce Firebase hesabı');
ok(/if \(authMode\) await auth\.deleteAccount\(\);/.test(ctx), 'signUp: belge yazılamazsa Firebase hesabı geri alınıyor');
ok(/const account = await auth\.signIn\(emailKey, password\)/.test(ctx), 'signIn: parola Firebase’de doğrulanıyor');
ok(!/if \(authMode\)[\s\S]{0,200}verifyPassword\(password, doc\.password\)/.test(ctx), 'signIn: auth modunda yerel verifyPassword atlanıyor');
ok(/if \(!verifyPassword\(password, doc\.password\)\)/.test(ctx), 'signIn: yerel modda hâlâ verifyPassword var');
ok(/isFirebaseAuthBundle\(doc\.password\)/.test(ctx), 'signIn: auth belgesi anahtarsız modda uyarı veriyor');
ok(/await auth\.signOut\(\)/.test(ctx), 'signOut: Firebase oturumu da kapanıyor');
ok(/auth\.updatePassword\(next0\)/.test(ctx), 'changePassword: Firebase’de güncelleniyor');
ok(/auth\.signIn\(current\.email, current0\)/.test(ctx), 'changePassword: mevcut parola ile taze oturum');
ok(/if \(auth\.isAuthConfigured\(\)\) await auth\.deleteAccount\(\);/.test(ctx), 'deleteAccount: Firebase hesabı da siliniyor');
ok(/Authorization: `Bearer \$\{token\}`/.test(api), 'firestoreApi: idToken bearer olarak ekleniyor');
ok(/const token = await currentIdToken\(\);/.test(api), 'firestoreApi: token yenileme dahil alınıyor');
ok(ctx.includes('authMode: auth.isAuthConfigured(),') && ctx.includes('sendPasswordReset,'), 'context: authMode + sendPasswordReset dışa açık');
ok(/await auth\.ensureAuthConfigLoaded\(\);\n        await auth\.currentIdToken\(\)\.catch\(\(\) => null\);/.test(ctx), 'boot: cihaz anahtarı + oturum yüklenmeden Firestore isteği gitmiyor');
ok(/const missingDoc =\s*!found\.ok && authMode && \(found\.reason === 'notfound' \|\| found\.reason === 'denied'\)/.test(ctx), 'katı modda 403 dönen eksik belge “yok” sayılıyor (yeni üye girişebilir)');
ok(/missingDoc && created\.reason === 'denied'/.test(ctx), 'okuma+yazma reddedilirse “kural yayınlanmamış” uyarısı veriliyor');
ok(!/function selfCreateOk[\s\S]{0,200}?[^.]resource\.data\./.test(rules), 'selfCreateOk eksik belgeye bakmıyor → okuma yasağı ilk girişte yazmayı engellemiyor');
ok((ctx.match(/await auth\.ensureAuthConfigLoaded\(\);/g) || []).length >= 4, 'kayıt/giriş/parola akışları da yüklenmeyi bekliyor');
const panelSrc = fs.readFileSync('screens/AdminSettingsScreen.tsx', 'utf8');
ok(/clearDeviceApiKey/.test(panelSrc) && !/setDeviceApiKey\(/.test(panelSrc), 'panel yalnız eski cihaz kaydını kaldırıyor, anahtar yapıştırmıyor');
ok(!/label="Web API anahtarı \(apiKey\)"/.test(panelSrc), 'panelde apiKey giriş alanı yok (kullanıcıdan anahtar istenmiyor)');
ok(/config\/firebaseApp\.ts/.test(panelSrc), 'panel anahtarın depodan geldiğini söylüyor');
ok(/authConfigSource\(\) === 'device'/.test(panelSrc) && /authConfigSource\(\) === 'repo'/.test(panelSrc), 'panel anahtarın kaynağını (cihaz/env/repo) gösteriyor');
ok(/hasRepoApiKey\(\)/.test(panelSrc), 'panel depoda anahtar olup olmadığını sorguluyor');
const apiSrc = fs.readFileSync('lib/firestoreApi.ts', 'utf8');
ok(/export const ADMINS_DOC_PATH = collectionPath\('meta\/admins'\);/.test(apiSrc), 'ADMINS_DOC_PATH target kökünden türetiliyor');
ok(/export const MEMBERSHIP_LOCKDOWN_DOC_PATH = collectionPath\('meta\/membership_lockdown'\);/.test(apiSrc), 'kilit belgesi yolu da target’tan');
ok(/if \(emails\.length > 10\)/.test(apiSrc), 'yönetici listesi 10 kayıtla sınırlı (kuralla aynı)');
ok(/e\.toLowerCase\(\)/.test(apiSrc) && /normalizeEmail\(email\)/.test(apiSrc), 'e-postalar normalize edilerek yazılıyor');
ok(/return \{ ok: true, data: exists \};/.test(apiSrc), 'readMembershipLockdown var/yok döndürüyor');
const panel = fs.readFileSync('screens/AdminSettingsScreen.tsx', 'utf8');
ok(/addAdminEmail,[\s\S]*readAdminList,[\s\S]*readMembershipLockdown/.test(panel), 'panel meta/admins + kilit okuyucularını kullanıyor');
ok(/Kilidi açmak yalnız Console işidir/.test(panel), 'panel, kilidin yalnız Console’tan çevrildiğini söylüyor');


console.log('\x1b[1m[12] depoya gömülü config — anahtar kullanıcıdan istenmiyor\x1b[0m');
const repoSrc = fs.readFileSync('config/firebaseApp.ts', 'utf8');
const repoMatch = repoSrc.match(/apiKey:\s*'([^']*)'/);
const repoKey = (repoMatch?.[1] || '').trim();
ok(/export const FIREBASE_WEB_CONFIG/.test(repoSrc) && !!repoMatch, 'config/firebaseApp.ts apiKey alanını export ediyor');
ok(!repoKey || /^[A-Za-z0-9_-]{20,}$/.test(repoKey), 'depodaki anahtar beklenen biçimde (boşsa yerel mod sürer)', repoKey ? A.maskKey(repoKey) : '(boş)');
ok(/deviceOverride \?\? fromEnv\(\) \?\? repoAuthConfig\(\)/.test(fs.readFileSync('lib/authClient.ts', 'utf8')), 'çözümleme sırası: cihaz → env → repo config');
const built = A.buildAuthConfig({ apiKey: 'AIzaREPO-DUMMY_0123456789ab' }, 'repo');
ok(built?.source === 'repo', 'buildAuthConfig kaynak etiketini taşıyor');
ok(built?.authDomain === `${built.projectId}.firebaseapp.com`, 'eksik authDomain projeden türedi (repo config)');
ok(built?.projectId === 'kpssasistani-01', 'projectId Firestore hedefinden tamamlandı');
ok(A.buildAuthConfig({ apiKey: '   ' }, 'repo') === null, 'boş apiKey → kaynak devre dışı (null)');
ok(A.repoAuthConfig() === null || A.repoAuthConfig()?.source === 'repo', 'repoAuthConfig() depoyu okuyor');
const A2 = await import('/tmp/authBundleNoEnv.mjs');
ok(A2.isAuthConfigured() === (repoKey.length > 0), 'env yokken auth yalnız depodaki config’e bağlı', repoKey ? 'repo anahtarı var' : 'repo anahtarı boş');
ok(JSON.stringify(A2.resolveAuthConfig()) === JSON.stringify(A2.repoAuthConfig()), 'env yokken çözümleme = depodaki config');
if (repoKey) {
  const rc = A2.resolveAuthConfig();
  ok(rc?.source === 'repo' && rc?.apiKey === repoKey, 'repo anahtarı doğrudan kullanılıyor (kurulum yok)');
  ok(A2.authConfigSource() === 'repo', 'authConfigSource() “repo” bildiriyor');
} else {
  const np = await A2.probeAuth();
  ok(!np.ok && /config\/firebaseApp\.ts/.test(np.note), 'anahtar yoksa uyarı depoyu gösteriyor — kullanıcıya “yapıştır” denmiyor', np.note);
  ok(/config\/firebaseApp\.ts/.test((await A2.signIn('a@b.com', 'x12345')).error || ''), 'yapılandırma eksik hata metni de depoya işaret ediyor');
}
ok(!/\.env\.local içine EXPO_PUBLIC_FIREBASE_API_KEY ekleyip/.test(ctx), 'MembershipContext kullanıcıya .env.local düzenletmiyor');
ok(/config\/firebaseApp\.ts/.test(ctx), 'MembershipContext uyarıları repo config’e işaret ediyor');
const setupSrc = fs.readFileSync('scripts/setup-firestore.mjs', 'utf8');
ok(/writeRepoFirebaseConfig/.test(setupSrc) && /config', 'firebaseApp\.ts'/.test(setupSrc), 'setup-firestore --api-key anahtarı depoya da yazıyor');

console.log('\x1b[1m[13] setup-firestore --api-key (gerçek yazma, geçici dizinde)\x1b[0m');
const os = await import('node:os');
const nodePath = await import('node:path');
const cp = await import('node:child_process');
const tmp = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'lisansui-setup-'));
try {
  fs.mkdirSync(nodePath.join(tmp, 'config'), { recursive: true });
  fs.copyFileSync('config/firebaseApp.ts', nodePath.join(tmp, 'config', 'firebaseApp.ts'));
  const out = cp.execFileSync(
    process.execPath,
    ['scripts/setup-firestore.mjs', 'kpssasistani-01', '--root', '.', '--api-key', 'AIzaSETUP-KEY_0123456789ab', '--dir', tmp],
    { encoding: 'utf8' }
  );
  const written = fs.readFileSync(nodePath.join(tmp, 'config', 'firebaseApp.ts'), 'utf8');
  ok(/apiKey: 'AIzaSETUP-KEY_0123456789ab'/.test(written), '--api-key config/firebaseApp.ts içine yazdı');
  ok(/projectId: 'kpssasistani-01'/.test(written), 'projectId de config’e yazıldı');
  ok(/export function hasRepoApiKey/.test(written) && /AMAÇ:/.test(written), 'dosyanın yorum satırları ve export’ları korundu');
  ok(/\n  projectId: 'kpssasistani-01',\n  authDomain: '',\n  appId: '',/.test(written), 'diğer alanlar korundu (yalnız hedef satırlar değişti)');
  ok(/EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSETUP-KEY_0123456789ab/.test(fs.readFileSync(nodePath.join(tmp, '.env.local'), 'utf8')), '--api-key .env.local’a da yazıldı (override)');
  ok(/config\/firebaseApp\.ts/.test(out), 'kurulum çıktısı repo config’ten söz ediyor');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n\x1b[1m${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} kontrol\x1b[0m\n`);
process.exit(fail ? 1 : 0);
