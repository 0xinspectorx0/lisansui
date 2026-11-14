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
ok(/const token = await auth\.currentIdToken\(\);/.test(api), 'firestoreApi: token yenileme dahil alınıyor');
ok(ctx.includes('authMode: auth.isAuthConfigured(),') && ctx.includes('sendPasswordReset,'), 'context: authMode + sendPasswordReset dışa açık');
// Anahtar SONRADAN eklendiğinde eski (yerel PBKDF2) üyeler dışarıda kalmamalı.
ok(/account\.code === 'EMAIL_NOT_FOUND' \? await fetchMemberByEmail\(emailKey\) : null/.test(ctx), 'signIn: Firebase hesabı olmayan eski üye belgeden aranıyor');
ok(/!isFirebaseAuthBundle\(legacyDoc\.password\) && verifyPassword\(password, legacyDoc\.password\)/.test(ctx), 'signIn: eski hesap yerel hash ile doğrulanıyor');
ok(/authMode = false;/.test(ctx), 'signIn: yerel doğrulama sonrası akış yerel moda düşüyor');
ok(/check\.code === 'EMAIL_NOT_FOUND' && !isFirebaseAuthBundle\(current\.password\)/.test(ctx), 'changePassword: yerel hesap için sahiplenme yolu açık');
ok(/const opened = await auth\.signUp\(current\.email, next0\);/.test(ctx), 'changePassword: Firebase hesabı yeni parolayla açılıyor');
ok(/\.\.\.\(claimUid \? \{ authUid: claimUid \} : \{\}\)/.test(ctx), 'changePassword: uid belediye yazılıyor (artık Firebase hesabı var)');
const C = await import('/tmp/cryptoBundle.mjs');
const legacyBundle = C.hashPassword('EskiParola1');
ok(!C.isFirebaseAuthBundle(legacyBundle), 'yerel bundle “firebase-auth” sayılmıyor (sahiplenme adayı)');
ok(C.verifyPassword('EskiParola1', legacyBundle) && !C.verifyPassword('Yanlis123', legacyBundle), 'sahiplenme eşiği yalnız doğru parolada açılıyor');
ok(C.isFirebaseAuthBundle(C.AUTH_PASSWORD_BUNDLE), 'firebase bundle’ı işaretli (yeniden sahiplenme adayı değil)');
ok(!C.verifyPassword('herhangi-bir-parola', C.AUTH_PASSWORD_BUNDLE), 'firebase bundle’ı yerel doğrulamayı asla geçmez (kimse parola tahminiyle içeri giremez)');
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
ok(
  /export async function readLockdownInfo/.test(apiSrc) &&
    /metaDocPaths\('meta\/membership_lockdown'\)/.test(apiSrc),
  'kilit durumu KÖK + legacy yolda birlikte aranıyor (rules lockdownOn ile aynı)'
);
ok(/LEGACY_ARTIFACTS_ROOT = 'artifacts\/kpss-asistani\/public\/data'/.test(apiSrc), 'legacy kök sabiti firestore.rules ile aynı');
ok(/PATCH_FORBIDDEN_KEYS = \['createdAt', 'id'\]/.test(apiSrc), 'createdAt/id PATCH gövdesine konmuyor (memberUpdateOk listelerinde yok)');
ok(/if \(Object\.keys\(fields\)\.length === 0\)/.test(apiSrc), 'boş PATCH gövdesi ağa gitmeden reddediliyor');
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
ok(/readRepoFirebaseConfig/.test(setupSrc) && /repoCfg\.apiKey/.test(setupSrc), 'npm run check:firestore anahtarı config/firebaseApp.ts’ten de okuyor');

console.log('\x1b[1m[13] setup-firestore --api-key (gerçek yazma, geçici dizinde)\x1b[0m');
const os = await import('node:os');
const nodePath = await import('node:path');
const cp = await import('node:child_process');
const cp2 = cp;
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
  const srcLines = fs.readFileSync('config/firebaseApp.ts', 'utf8').split('\n');
  const writtenLines = written.split('\n');
  const untouched = srcLines.filter(l => !/^\s*(apiKey|projectId):\s*'/.test(l));
  ok(untouched.every(l => writtenLines.includes(l)), 'diğer satırlar birebir korundu (yalnız apiKey/projectId değişti)', untouched.filter(l => !writtenLines.includes(l)).join(' ⏎ '));
  ok(/appId: '[^']*'/.test(written) && /authDomain: '[^']*'/.test(written), 'appId/authDomain satırları yerinde (setup bunlara dokunmuyor)');
  ok(/EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSETUP-KEY_0123456789ab/.test(fs.readFileSync(nodePath.join(tmp, '.env.local'), 'utf8')), '--api-key .env.local’a da yazıldı (override)');
  ok(/config\/firebaseApp\.ts/.test(out), 'kurulum çıktısı repo config’ten söz ediyor');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}


console.log('\x1b[1m[14] erişim tanısı + yabancı projeli token koruması\x1b[0m');
const b64url = obj => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
const mkJwt = payload => `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.sig`;
const jwt = mkJwt({
  iss: 'https://securetoken.google.com/kpssasistani-01',
  email: 'uyeler@例え.jp',
  user_id: 'uid1234567890',
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const info = A.decodeIdToken(jwt);
ok(info.projectId === 'kpssasistani-01', 'decodeIdToken: iss üzerinden proje kimliği okunuyor', JSON.stringify(info));
ok(info.uid === 'uid1234567890', 'decodeIdToken: uid okunuyor');
ok(info.email === 'uyeler@例え.jp', 'decodeIdToken: UTF-8 taban64 çözümlemesi (atob gerekmez)', info.email);
ok(A.decodeIdToken('bozuk').projectId === null && A.decodeIdToken('').email === '', 'bozuk token sessizce null döner (kriz çıkarmaz)');
ok(A.tokenProjectMismatches('baska-proje') === true && A.tokenProjectMismatches('kpssasistani-01') === false, 'hedef projeyle karşılaştırma');
ok(A.tokenProjectMismatches(null) === false, 'proje okunamadığında “uyumsuz” denmiyor (yanlış yere ceza kesme)');

// --- oturum deposuna sahte kimlik yaz (async-storage shim'i globalThis.__store kullanır)
const putSession = (projectId, extra = {}) =>
  mem.set(A.AUTH_SESSION_KEY, JSON.stringify({
    uid: 'uid1234567890',
    email: 'a@b.co',
    idToken: mkJwt({
      iss: `https://securetoken.google.com/${projectId}`,
      email: 'a@b.co',
      user_id: 'uid1234567890',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...extra,
    }),
    refreshToken: 'rt-x',
    expiresAt: Date.now() + 3_600_000,
  }));
const dropSession = () => mem.delete(A.AUTH_SESSION_KEY);

const D = await import('/tmp/accessDiagBundle.mjs');
const F = await import('/tmp/firestoreApiBundle.mjs');

// sahte Firestore: URL + başlık kaydı, durum kodları senaryoya göre
let fsMode = {};
const fsLog = [];
let inflight = 0;
let maxInflight = 0;
const realFetch2 = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  fsLog.push({ url: u, headers: init?.headers || {} });
  inflight += 1;
  maxInflight = Math.max(maxInflight, inflight);
  await Promise.resolve(); // eşzamanlılığı ölçmek için küçük bekleme
  const key = u.includes('/meta/membership_lockdown')
    ? 'lockdown'
    : u.includes('/memberships')
      ? 'membership'
      : 'content';
  const status = fsMode[key] ?? 200;
  inflight -= 1;
  if (status === 'network') throw new Error('ECONNRESET');
  return { ok: status < 400, status, json: async () => ({}), text: async () => '{}' };
};

try {
  dropSession();
  fsMode = { content: 403, membership: 403, lockdown: 403 };
  let d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'rules-not-published', 'her şey 403 → kurallar hiç yayınlanmamış', d.cause);
  ok(/yayınlanmamış/.test(d.headline), 'başlık “yayınlanmamış” diyor', d.headline);
  ok(d.steps.length > 0 && /firestore\.rules metnini kopyala/.test(d.steps[0]), 'ilk adım paneldeki kopyalama düğmesine götürüyor', d.steps[0]);
  ok(maxInflight >= 2, 'yoklamalar PARALEL koşuyor (çevrimdışıyken 3×8 sn sürmez)', String(maxInflight));
  ok(fsLog.filter(l => !l.headers.Authorization).length >= 1, 'içerik yoklaması kimliksiz atılıyor');

  fsMode = { content: 200, membership: 403, lockdown: 404 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'rules-outdated', 'içerik okunuyor, üyelik okunamıyor → yayındaki kural ESKİ', d.cause);
  ok(/ESKİ/.test(d.headline), 'başlık bayat kuralları işaret ediyor', d.headline);

  fsMode = { content: 200, membership: 403, lockdown: 200 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'lockdown-no-admin', 'kilit AÇIK + yönetici değil → panel işlemleri reddedilir', d.cause);
  ok(/membership_lockdown/.test(d.headline), 'başlık kilidi işaret ediyor', d.headline);
  ok(d.steps.some(x => /belgesini sil/.test(x)), 'kilidi geri alma adımı da anlatılıyor');
  ok(/meta\/membership_lockdown/.test(d.steps.join(' ')), 'kilit belgesinin yolu adımda geçiyor', d.steps.join(' | '));

  fsMode = { content: 200, membership: 401, lockdown: 404 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'foreign-auth-project', '401 → kimlik token’ı Firestore kabul etmedi', d.cause);

  fsMode = { content: 'network', membership: 200, lockdown: 200 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'offline', 'ağ yoksa “kural engelledi” DENMİYOR', d.cause);
  ok(/bağlant/i.test(d.steps[0]), 'ağ çözümü öneriliyor', d.steps[0]);

  fsMode = { content: 200, membership: 200, lockdown: 404 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'write-needs-probe', 'okuma açık + liste boşsa “yazma kapalı” DİYE YAZILMIYOR (kanıt yok)', d.cause);
  ok(/Yazma sınaması/.test(d.steps.join(' ')), 'tanı, tek kanıt olan deneme yazmasına yönlendiriyor', d.steps.join(' | '));
  ok(d.detail.membershipEmpty === true, 'boş liste ölçümü detail’e yazılıyor');
  d = await D.diagnoseMembershipAccess('kötü e-posta');
  ok(d.cause === 'shape-rejected', 'geçersiz e-posta → ağa gitmeden biçim tanısı', d.cause);
  ok(/email/.test(d.detail.shapeProblems), 'biçim sorunu alan adıyla birlikte yazılıyor', d.detail.shapeProblems);
  ok(d.steps.every(x => !/anahtar.*yapıştır|API anahtarı gir/i.test(x)), 'tanı adımları kullanıcıdan anahtar istemiyor', JSON.stringify(d.steps));

  // --- firestoreApi: yabancı projeden token GÖNDERİLMEZ (hedefin kendi token’ı gider)
  // Not: her senaryo taze modül örneğiyle çalışır — authClient oturumu bellekte
  // tuttuğu için aynı örnek üzerinden oturum değiştirmek yanıltıcı olur.
  const freshF = async () => await import(`/tmp/firestoreApiBundle.mjs?v=${Date.now()}-${Math.random()}`);

  dropSession();
  let fx = await freshF();
  fsLog.length = 0;
  await fx.probeCloud();
  ok(!fsLog.some(l => l.headers.Authorization), 'oturum yok → Authorization yok');

  putSession('kpssasistani-01');
  fx = await freshF();
  fsLog.length = 0;
  await fx.probeCloud();
  ok(
    fsLog.some(l => /^Bearer /.test(String(l.headers.Authorization || ''))),
    'token hedef projesinden → başlık ekleniyor',
    JSON.stringify(fsLog.map(l => Object.keys(l.headers)))
  );

  dropSession();
  putSession('baska-proje');
  fx = await freshF();
  fsLog.length = 0;
  await fx.probeCloud();
  const foreignSent = fsLog.some(l => /^Bearer /.test(String(l.headers.Authorization || '')));
  ok(!foreignSent, 'token BAŞKA projeden → istek kimliksiz gidiyor (401 zinciri yerine eski davranış)', JSON.stringify(fsLog.map(l => Object.keys(l.headers))));
  ok(fx.consumedForeignTokenNotice() === true, 'yabancı token yakalaması üst katmana bildiriliyor');
  ok(!/Authorization/.test(JSON.stringify(fsLog.map(l => Object.keys(l.headers)))), 'yabancı senaryoda hiçbir isteğe başlık sızmıyor');

  // --- otomatik iyileşme: cihazdaki eski anahtar + yabancı oturum
  dropSession();
  await A.setDeviceApiKey('AIzaDEV-KEY_0123456789abcd');
  A.resetAuthConfigCache();
  await A.ensureAuthConfigLoaded();
  putSession('baska-proje');
  ok(await A.isForeignSessionToken() === true, 'cihaz anahtarı yabancı projeden token veriyor → yakalandı');
  const heal = await A.healForeignAuthProject();
  ok(heal.healed === true && /silindi/.test(heal.note || ''), 'heal: cihaz kaydı silindi + not verildi', JSON.stringify(heal));
  ok((await A.readDeviceApiKey()) === null, 'heal: cihazdaki eski anahtar artık yok');
  ok((await A.currentSession()) === null, 'heal: yabancı oturum kapatıldı');
  A.resetAuthConfigCache();
  await A.ensureAuthConfigLoaded();
  ok(A.resolveAuthConfig()?.source === 'env', 'heal sonrası env/config değeri devrede', String(A.resolveAuthConfig()?.source));

  // --- kaynağa bakış: reddedilen yazma artık tanıyla konuşuyor
  ok(
    /diagnoseMembershipAccess\(email\)/.test(ctx) && /membershipDeniedMessage\(emailKey\)/.test(ctx),
    'context: reddedilen üyelik yazması tanı soruyor'
  );
  ok(!/firestore\.rules yayınlanmamış olabilir \(npm run deploy:rules/.test(ctx), 'context: kör “deploy:rules” uyarısı kaldırıldı');
  ok(/await auth\.isForeignSessionToken\(\)/.test(ctx), 'signUp: açılan hesabın projesi yazmadan önce doğrulanıyor');
  ok(/healForeignAuthProject\(\)/.test(ctx), 'context: yabancı projeli cihaz kaydı açılışta temizleniyor');
  ok(/if \(await auth\.isForeignSessionToken\(\)\) return \{\};/.test(apiSrc), 'firestoreApi: yabancı token başlığa konmuyor');
  const panel2 = fs.readFileSync('screens/AdminSettingsScreen.tsx', 'utf8');
  ok(/copyText\(FIRESTORE_RULES_TEXT\)/.test(panel2), 'panel: kuralları tek dokunuşla panoya kopyalama var');
  ok(/diagnoseMembershipAccess\(diagKey \|\| undefined\)/.test(panel2), 'panel: “Tanı” düğmesi tanının kendisini çağırıyor');
  ok(/probeMembershipWrite\(diagKey\)/.test(panel2), 'panel: “Yazma sınaması” deneme yazmasını çağırıyor');
  ok(/Yazma sınaması \(kendi belgen\)/.test(panel2), 'panel: sınama düğmesi etiketi');
  ok(/VIP\/rol\/durum alanlarına dokunulmaz/.test(panel2), 'panel: sınamanın yetki kazandırmadığı açıkça yazıyor');
  ok(/lockdownPath \? ` @\$\{diag\.data\.detail\.lockdownPath\}`/.test(panel2), 'panel: kilidin hangi yolda durduğu ölçüm satırında');
  ok(/data\.cause === 'write-needs-probe' \|\| data\.cause === 'lockdown-no-admin'\)/.test(panel2), 'panel: okuma temizse/kuşkuluysa sınama kendiliğinden çalışıyor');
  ok(/await runWriteProbe\(\)/.test(panel2), 'panel: tanı sonrası yazma sınaması çağrılıyor');
  ok(/yalnızca yazdığın e-postanın belgesine dokunur/.test(panel2) && /VIP\/rol\/durum alanlarına dokunulmaz/.test(panel2), 'panel: sınamanın zararsız olduğu açıkça yazıyor');
  ok(/Neden engellendi\?/.test(panel2), 'panel: sorunun başlığı kullanıcı dilinde');
} finally {
  globalThis.fetch = realFetch2;
  dropSession();
}

console.log('\x1b[1m[15] firestore.rules kopyası ve alan sözleşmesi\x1b[0m');
const RC = await import('/tmp/rulesCopyBundle.mjs');
const rulesRaw = fs.readFileSync('firestore.rules', 'utf8');
ok(RC.FIRESTORE_RULES_TEXT === rulesRaw, 'config/firestoreRulesCopy.ts = firestore.rules (bayt bayt)');
ok(RC.FIRESTORE_RULES_LINES === rulesRaw.split('\n').length, 'satır sayısı paneldeki özetle aynı');
const sync = cp2.execFileSync(process.execPath, ['scripts/sync-rules-copy.mjs', '--check'], { encoding: 'utf8' });
ok(/güncel/.test(sync), 'npm run sync:rules --check temiz geçiyor');
const required = (rulesRaw.match(/data\.keys\(\)\.hasAll\(\[([\s\S]*?)\]\)/) || [])[1] || '';
const requiredKeys = required.split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
ok(requiredKeys.length > 15, `kural ${requiredKeys.length} zorunlu alan istiyor`);
const membershipSrc = fs.readFileSync('lib/membership.ts', 'utf8');
const mtfStart = membershipSrc.indexOf('function rawMemberToFields');
ok(mtfStart > 0 && /coerceMemberFields\(rawMemberToFields\(m\)/.test(membershipSrc), 'memberToFields çıktı kural aynasından geçiyor');
const written = membershipSrc.slice(mtfStart, membershipSrc.indexOf('\n}', mtfStart));
const writtenKeys = new Set((written.match(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm) || []).map(x => x.trim().replace(/:$/, '')));
const missing = requiredKeys.filter(k => !writtenKeys.has(k));
ok(missing.length === 0, 'uygulamanın yazdığı alanlar kuralın istediği listeyi kapsıyor', missing.join(', '));

/** authClient belleği modül başına tuttuğu için her senaryo taze örnek istiyor. */
const freshApi = async () => await import(`/tmp/firestoreApiBundle.mjs?u=${Date.now()}-${Math.random()}`);

console.log('\n\x1b[1m[16] kural aynası: firestore.rules ↔ lib/memberShape.ts\x1b[0m');
const MS = await import('/tmp/memberShapeBundle.mjs');
const MB = await import('/tmp/membershipBundle.mjs');

const listFromRules = (fn) => {
  const m = rulesRaw.match(new RegExp(`function ${fn}\\(data\\) \\{[\\s\\S]*?hasAll\\(\\[([\\s\\S]*?)\\]\\)`));
  return (m?.[1] || '').split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
};
const requiredByRules = listFromRules('memberShapeOk');
ok(requiredByRules.length > 15, 'ayna testi kuralın zorunlu alan listesini okuyabildi', String(requiredByRules.length));
ok(MS.MEMBER_REQUIRED_KEYS.join('|') === requiredByRules.join('|'), 'aynadaki zorunlu alan listesi kural ile BİREBİR aynı');

const regexFrom = (fn) => {
  const m = rulesRaw.match(new RegExp(`function ${fn}\\(value\\) \\{[\\s\\S]*?value\\.matches\\("([^"]+)"\\)`));
  return (m?.[1] || '').replace(/\\\\\\\\/g, '\\').replace(/\\\\s/g, '\\s').replace(/\\\\./g, m2 => m2 === '\\\\.' ? '\\.' : m2);
};
ok(MS.MEMBER_VERIFIER_RE.source === '^[0-9a-f]{64}$' && /isVerifier\(value\) \{[\s\S]*\^\[0-9a-f\]\{64\}\$/.test(rulesRaw), 'verifier deseni kural ile aynı');
ok(MS.MEMBER_SALT_RE.source === '^[0-9a-f]{32}$' && /isSalt\(value\) \{[\s\S]*\^\[0-9a-f\]\{32\}\$/.test(rulesRaw), 'salt deseni kural ile aynı');
ok(MS.MEMBER_DATE_RE.source === '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9:.]+Z?)?$', 'tarih deseni kural ile aynı');
ok(MS.MEMBER_EMAIL_RE.source === '^[^\\s@]+@[^\\s@]+\\.[a-zA-Z]{2,}$', 'e-posta deseni kural ile aynı');
let limitsOk = true;
for (const [k, v] of Object.entries(MS.MEMBER_STRING_LIMITS))
  if (!new RegExp(`data\\.${k} is string\\s*&&\\s*data\\.${k}\\.size\\(\\) <= ${v}`).test(rulesRaw)) { limitsOk = false; console.log('   sınır farkı:', k, v); }
ok(limitsOk, 'string uzunluk sınırları kuralda aynı değerlerle duruyor');
ok(/isCounter\(value\) \{[\s\S]*value >= 0 && value <= 1000000/.test(rulesRaw) && MS.MEMBER_COUNTER_MAX === 1000000, 'sayaç aralığı kural ile aynı');
ok(/data\.courseUsage is map[\s\S]*data\.courseUsage\.size\(\) <= 12/.test(rulesRaw) && MS.MEMBER_USAGE_MAX_ENTRIES === 12, 'courseUsage giriş limiti kural ile aynı');
ok(/data\.courseUsage\.values\(\)\.all\(v, v is int && v >= 0 && v <= 999\)/.test(rulesRaw) && MS.MEMBER_USAGE_MAX_VALUE === 999, 'courseUsage değer aralığı kural ile aynı');
ok(/data\.iterations >= 100/.test(rulesRaw) && MS.MEMBER_ITERATIONS_MIN === 100, 'iterations alt sınırı kural ile aynı');

// --- bozuk payload'lar: ayna hangi ALANI reddettiğini söylüyor
const baseDoc = {
  ...MB.emptyMember('ornek@kpss.gov.tr'),
  email: 'ornek@kpss.gov.tr',
  emailNormalized: 'ornek@kpss.gov.tr',
  password: { verifier: '', salt: '', iterations: 0, algo: 'firebase-auth' },
};
const fieldsOf = (m) => MB.memberToFields(m);
{
  const f = fieldsOf(baseDoc);
  ok(MS.checkMemberFields(f, 'create', f.id.stringValue).length === 0, 'temiz üye belgesi kuralı geçiyor', JSON.stringify(MS.checkMemberFields(f, 'create', f.id.stringValue)));
  const long = fieldsOf({ ...baseDoc, displayName: 'Ç'.repeat(120), note: 'n'.repeat(600), city: 'ş'.repeat(90) });
  ok(MS.checkMemberFields(long, 'create', long.id.stringValue).length === 0, 'uzun ad/not/şehir KIRPILARAK yazılıyor (red değil)');
  ok(long.displayName.stringValue.length === 80 && long.note.stringValue.length === 400, 'kırpma sınır değerlerinde duruyor', `${long.displayName.stringValue.length}/${long.note.stringValue.length}`);
  const legacy = fieldsOf({ ...baseDoc, password: { verifier: 'abc', salt: 'def', iterations: 1, algo: 'pbkdf2-sha256' } });
  ok(MS.checkMemberFields(legacy, 'create', legacy.id.stringValue).length === 0, 'bozuk pbkdf2 demeti firebase-auth işaretine çevriliyor (red değil)');
  ok(legacy.algo.stringValue === 'firebase-auth' && legacy.verifier.stringValue === '' && legacy.iterations.integerValue === '0', 'şifre üçlüsü kuralın istediği gibi boşaltıldı');
  const real = fieldsOf({ ...baseDoc, password: { verifier: 'a'.repeat(64), salt: 'b'.repeat(32), iterations: 1200, algo: 'pbkdf2-sha256' } });
  ok(real.algo.stringValue === 'pbkdf2-sha256' && real.verifier.stringValue.length === 64, 'gerçek pbkdf2 demetine dokunulmuyor');
  const usage = fieldsOf({ ...baseDoc, courseUsage: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`ders${i}`, i + 1])) });
  ok(Object.keys(usage.courseUsage.mapValue.fields).length === 12, 'courseUsage 12 girişe indirgeniyor', String(Object.keys(usage.courseUsage.mapValue.fields).length));
  ok(usage.courseUsage.mapValue.fields.ders29.integerValue === '30', 'son girdiler korunuyor');
  const dec = fieldsOf({ ...baseDoc, netSum: 12.4 });
  ok(dec.netSum.doubleValue === 12.4, 'ondalık net doubleValue olarak korunuyor (rules: is number)');
  const badDate = fieldsOf({ ...baseDoc, vipExpiresAt: '31.12.2030', createdAt: 'dün' });
  ok(MS.checkMemberFields(badDate, 'create', badDate.id.stringValue).length === 0, 'Türkçe tarih / serbest metin tarihleri güvenli değere çekiliyor');
  ok(badDate.vipExpiresAt.stringValue === '' && /^\d{4}-\d{2}-\d{2}T/.test(badDate.createdAt.stringValue), 'vipExpiresAt boşaltıldı, createdAt bugüne döndü');
  const badRole = { ...fieldsOf(baseDoc), role: { stringValue: 'sultan' }, status: { stringValue: 'kral' } };
  const probs = MS.checkMemberFields(badRole, 'create', badRole.id.stringValue).map(p => p.field);
  ok(probs.includes('role') && probs.includes('status'), 'bilinmeyen rol/durum alan adıyla bildiriliyor', probs.join(','));
  const noMail = MS.checkMemberFields({ ...fieldsOf(baseDoc), email: { stringValue: 'ayri@yolak.com' } }, 'create', baseDoc.id);
  ok(noMail.some(p => p.field === 'id' || p.field === 'email'), 'e-posta ≠ belge kimliği ayrı yazılabilecek bir şey değil: reddediliyor', MS.shapeProblemText(noMail));
  ok(/id:|email:/.test(MS.shapeProblemText(noMail)), 'alan adı metinde geçiyor', MS.shapeProblemText(noMail));
  const missing = { ...fieldsOf(baseDoc) };
  delete missing.netSum;
  ok(MS.checkMemberFields(missing, 'create', missing.id.stringValue).some(p => p.field === 'netSum'), 'eksik zorunlu alan “zorunlu” diye bildiriliyor');
  ok(MS.MEMBER_CREATE_ROLES.join('|') === 'user|editor' && /request\.resource\.data\.role in \['user', 'editor'\]/.test(rulesRaw), 'create rol listesi kural ile aynı');
  ok(MS.MEMBER_CREATE_STATUSES.join('|') === 'active|pending' && /request\.resource\.data\.status in \['active', 'pending'\]/.test(rulesRaw), 'create durum listesi kural ile aynı');
  // coerce → check her durumda temiz çıkmalı (idempotence)
  const dirty = { ...fieldsOf(baseDoc), iterations: { integerValue: '7' }, algo: { stringValue: 'pbkdf2-sha256' }, vip: { stringValue: 'evet' }, vipPlan: { stringValue: 'haftalik' }, schemaVersion: { integerValue: '2' } };
  const fixed = MS.coerceMemberFields(dirty, { memberId: baseDoc.id, fill: true });
  ok(MS.checkMemberFields(fixed, 'create', baseDoc.id).length === 0, 'coerce her bozuk girdiyi kurala uyar hale getiriyor', JSON.stringify(MS.checkMemberFields(fixed, 'create', baseDoc.id)));
  ok(fixed.vip.booleanValue === false && fixed.vipPlan.stringValue === 'free' && fixed.schemaVersion.integerValue === '1', 'vip/vipPlan/schemaVersion güvenli varsayılana döndü');
  const patchOnly = MS.coerceMemberFields({ note: { stringValue: 'x'.repeat(500) } }, { memberId: 'a@b.co' });
  ok(Object.keys(patchOnly).length === 1 && patchOnly.note.stringValue.length === 400, 'PATCH gövdesine eksik alan UYDURULMAZ (yalnız gönderilen kırpılır)', Object.keys(patchOnly).join(','));
}

// --- kısmi güncelleme gövdesi: kuralın change-set listeleriyle uyum
const keysOfApi = (name) => {
  const i = apiSrc.indexOf(`const ${name} = [`);
  const seg = apiSrc.slice(i, apiSrc.indexOf('] as const;', i));
  return (seg.match(/'([A-Za-z]+)'/g) || []).map(x => x.replace(/'/g, ''));
};
const listFromChangeFn = (fn) => {
  const m = rulesRaw.match(new RegExp(`function ${fn}\\(\\) \\{[\\s\\S]*?hasOnly\\(\\[([\\s\\S]*?)\\]\\)`));
  return (m?.[1] || '').split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
};
const USAGE_KEYS = listFromChangeFn('usageOnlyChange');
const ENTITLE_KEYS = listFromChangeFn('entitlementChange');
ok(USAGE_KEYS.length > 10 && ENTITLE_KEYS.length > 10, 'kuralın change-set listeleri testte okunabildi', `${USAGE_KEYS.length}/${ENTITLE_KEYS.length}`);
const selfKeys = keysOfApi('SELF_WRITABLE_KEYS');
const entKeys = keysOfApi('ENTITLEMENT_KEYS');
ok(selfKeys.length > 10 && selfKeys.every(k => USAGE_KEYS.includes(k)), 'kendi kendine yazma kademesi yalnız usageOnlyChange alanlarını gönderiyor', selfKeys.filter(k => !USAGE_KEYS.includes(k)).join(','));
ok(entKeys.length > 10 && entKeys.every(k => ENTITLE_KEYS.includes(k)), 'panel yazması yalnız entitlementChange alanlarını gönderiyor', entKeys.filter(k => !ENTITLE_KEYS.includes(k)).join(','));
ok(!selfKeys.includes('authUid') || USAGE_KEYS.includes('authUid'), 'authUid yalnız izinli listede');
{
  const FP = await freshApi();
  const p = FP.memberPatchToFields({ createdAt: '2020-01-01', note: 'merhaba', email: 'a@b.co' }, 'a@b.co');
  ok(!('createdAt' in p), 'createdAt PATCH gövdesinden çıkarıldı (rules: memberUpdateOk listelerinde yok)');
  ok(p.note.stringValue === 'merhaba', 'izinli alan PATCH gövdesinde kalıyor');
  const bad = await FP.patchMemberDoc('a@b.co', { email: 'baska@ornek.com' });
  ok(!bad.ok && /kimliği/.test(bad.error), 'e-posta değiştiren PATCH ağa gitmeden açıklama ile duruyor', bad.error);
}

console.log('\n\x1b[1m[17] kuralı uygulayan sahte Firestore: yazma kademeleri + iki yollu kilit\x1b[0m');
{
  const FP = await freshApi();
  const store = new Map();
  const rules = { lockdown: false };
  const wlog = [];
  const real = globalThis.fetch;
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const pathOf = u => decodeURIComponent(String(u).split('/documents/')[1] || '').split('?')[0];
  const claim = (h, key) => {
    const t = String(h.Authorization || '').replace('Bearer ', '');
    const parts = t.split('.');
    if (parts.length !== 3) return '';
    try { return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))[key] || ''; } catch { return ''; }
  };
  const diffKeys = (before, after) => {
    const out = [];
    for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
      if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) out.push(k);
    return out;
  };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = init?.method || 'GET';
    const headers = init?.headers || {};
    const body = init?.body ? JSON.parse(init.body) : {};
    wlog.push({ url: u, method, body, headers, fields: Object.keys(body.fields || {}) });
    if (!u.includes('/documents/')) return json(404, { error: { message: `UNHANDLED ${u}` } });
    // PATCH gövdesi yalnızca diff’te görünen alanları taşır: kısmi yazımın hangi
    // change-set listesine düştüğünü ayırt edebilmek için önceki belgeyi sakla.
    let prevBeforePatch = null;
    // POST create: .../memberships?documentId=<id> → belge yolu sorgudan gelir.
    const params = new URLSearchParams(String(u).split('?')[1] || '');
    let path = pathOf(u);
    if (params.get('documentId')) path = `${path}/${params.get('documentId')}`;
    // firestore.rules legacy yolu AYNI kurallarla koruyor:
    // `artifacts/kpss-asistani/public/data/memberships/{memberId}` ↔ `memberships/{memberId}`.
    const LEGACY_PREFIX = 'artifacts/kpss-asistani/public/data/';
    const legacy = path.startsWith(LEGACY_PREFIX) ? path.slice(LEGACY_PREFIX.length) : null;
    const eff = legacy ?? path;
    const segs = eff.split('/');
    const collection = segs[0];
    const id = segs[segs.length - 1];
    const self = (claim(headers, 'email') || '').toLowerCase();
    const lockdownOn = rules.lockdown;
    if (collection === 'meta') {
      // rules: meta altında `allow get: if true`; meta/admins yazması yalnız
      // kilit kapalıyken, diğer meta belgeleri ise hiç yazılamaz.
      if (method === 'GET') return store.has(path) ? json(200, { name: path, fields: store.get(path) }) : json(404, {});
      if (eff === 'meta/admins' && !lockdownOn) {
        store.set(path, body.fields);
        return json(200, { fields: body.fields });
      }
      return json(403, { error: { message: lockdownOn ? 'LOCKDOWN' : 'META_WRITE_LOCK' } });
    }
    const stored = store.get(path);
    const selfOk = self && id === self && (!stored || (stored.email?.stringValue || '').toLowerCase() === self);
    const canWrite = !lockdownOn || selfOk || (Array.isArray(rules.admins) && rules.admins.includes(self));
    if (method === 'GET') {
      if (!store.has(path)) return json(404, {});
      if (lockdownOn && !selfOk) return json(403, { error: { message: 'Missing or insufficient permissions' } });
      return json(200, { name: path, fields: stored });
    }
    if (method === 'DELETE') {
      if (!canWrite) return json(403, {});
      store.delete(path);
      return json(200, {});
    }
    const isCreate = !store.has(path);
    if (method === 'POST' && !isCreate) return json(409, { error: { message: 'ALREADY_EXISTS' } });
    const nextFields = method === 'PATCH' || method === 'POST' ? { ...(stored || {}), ...(body.fields || {}) } : body.fields || {};
    if (method === 'PATCH') prevBeforePatch = stored ? { ...stored } : null;
    if (!canWrite) return json(403, { error: { message: 'Missing or insufficient permissions' } });
    if (MS.checkMemberFields(nextFields, 'create', id).length)
      return json(403, { error: { message: `SHAPE ${MS.shapeProblemText(MS.checkMemberFields(nextFields, 'create', id))}` } });
    if (!isCreate) {
      if (stored.role?.stringValue !== nextFields.role?.stringValue) return json(403, { error: { message: 'ROLE_LOCK' } });
      // memberUpdateOk: tek PATCH ya yalnız kullanım/profil alanlarını (usageOnlyChange)
      // ya yalnız hak alanlarını (entitlementChange) değiştirebilir — ikisi karışmaz.
      const changed = diffKeys(prevBeforePatch || stored, nextFields);
      const usage = new Set(USAGE_KEYS);
      const entitle = new Set(ENTITLE_KEYS);
      const badUsage = changed.filter(k => !usage.has(k));
      const badEntitle = changed.filter(k => !entitle.has(k));
      if (badUsage.length && badEntitle.length)
        return json(403, { error: { message: `CHANGES ${badUsage.join(',')} / ${badEntitle.join(',')}` } });
      if (!selfOk && lockdownOn && changed.length) return json(403, { error: { message: 'NOT_SELF' } });
    } else if (!['user', 'editor'].includes(nextFields.role?.stringValue) || !['active', 'pending'].includes(nextFields.status?.stringValue)) {
      return json(403, { error: { message: 'CREATE_ROLE_STATUS' } });
    }
    store.set(path, nextFields);
    return json(200, { name: `projects/p/databases/d/documents/${path}`, fields: nextFields });
  };

  try {
    // A) temiz kurulum: tek POST yeter
    dropSession();
    let r = await FP.createMemberDoc({ ...baseDoc, id: 'a@b.co', email: 'a@b.co', emailNormalized: 'a@b.co' });
    ok(r.ok, 'A: kurala uygun create kabul edildi', r.ok ? '' : r.error);
    ok(wlog.filter(l => l.method === 'POST').length === 1 && wlog.length === 1, 'A: gereksiz deneme yok, tek istek', String(wlog.length));

    // B) PATCH-create tuzağı: eksik belgeye kısmi yazım → kademe tam biçimle create eder
    store.clear();
    wlog.length = 0;
    r = await FP.patchMemberDoc('yeni@ornek.com', { note: 'kısmi' });
    ok(r.ok, 'B: belge yokken kısmi PATCH reddi, kademe ile yazıldı', r.ok ? '' : r.error);
    ok(wlog[0].method === 'PATCH' && wlog.some(l => l.method === 'POST'), 'B: önce PATCH sonra create denendi', wlog.map(l => l.method).join('>'));
    const createBody = wlog.find(l => l.method === 'POST');
    ok(createBody.fields.length >= MS.MEMBER_REQUIRED_KEYS.length, 'B: create gövdesi kuralın istediği tüm alanları taşıyor', String(createBody.fields.length));
    ok((store.get('memberships/yeni@ornek.com')?.note?.stringValue || '').startsWith('kısmi'), 'B: istenen alan belgeye işlendi');

    // C) belge zaten var (ör. eski PBKDF2 üyesi) → benimseme
    store.set('memberships/a@b.co', fieldsOf({ ...baseDoc, id: 'a@b.co', email: 'a@b.co', emailNormalized: 'a@b.co' }));
    wlog.length = 0;
    r = await FP.writeMembershipSelf({ ...baseDoc, id: 'a@b.co', email: 'a@b.co', emailNormalized: 'a@b.co', note: 'yeniden' });
    ok(r.ok && r.adopted === true, 'C: 409 → kabul edilen alanlarla güncelleme (benimsenme)', JSON.stringify({ ok: r.ok, adopted: r.adopted, e: r.error }));
    ok(wlog.some(l => l.method === 'POST') && wlog.some(l => l.method === 'PATCH'), 'C: önce create, sonra kısmi yazım denendi', wlog.map(l => l.method).join('>'));
    ok(!('password' in (store.get('memberships/a@b.co') || {})), 'C: belgeye kuralın tanımadığı `password` alanı sızmadı');
    ok(store.get('memberships/a@b.co')?.note?.stringValue === 'yeniden', 'C: not alanı güncellendi');

    // C2) karışık change-set (usage + entitlement birlikte) → ret, belge bozulmaz
    store.clear();
    store.set('memberships/a@b.co', fieldsOf({ ...baseDoc, id: 'a@b.co', email: 'a@b.co', emailNormalized: 'a@b.co', note: 'eski' }));
    putSession('kpssasistani-01');
    wlog.length = 0;
    // `displayName`/`note` İKİ listede de var; gerçek karışık vaka `authUid` (yalnız
    // usageOnlyChange) + hak alanı (yalnız entitlementChange) birlikteliğidir.
    const mixed = await FP.patchMemberDoc('a@b.co', { authUid: 'uid1234567890', vip: true }, { noCreateFallback: true });
    ok(!mixed.ok, 'C2: authUid + hak alanı birlikte PATCH edilmiyor (kuralın change-set ayrımı)', mixed.ok ? 'kabul edildi' : mixed.error);
    ok(store.get('memberships/a@b.co')?.note?.stringValue === 'eski', 'C2: ret edilen yazma belgeye dokunmadı');
    const both = await FP.upsertMemberDoc({ ...baseDoc, id: 'a@b.co', email: 'a@b.co', emailNormalized: 'a@b.co', vip: true, vipPlan: 'yearly', status: 'active', authUid: 'uid1234567890' });
    ok(both.ok, 'C2: panel yazması authUid ile hak alanlarını AYRI PATCH’lerde taşıyor', both.ok ? '' : both.error);
    ok(store.get('memberships/a@b.co')?.authUid?.stringValue === 'uid1234567890' && store.get('memberships/a@b.co')?.vipPlan?.stringValue === 'yearly', 'C2: iki kademenin ikisi de belgeye işlendi');
    const onlyVip = await FP.patchMemberDoc('a@b.co', { vip: true, vipPlan: 'monthly', vipExpiresAt: '2030-01-01', status: 'active' }, { noCreateFallback: true });
    ok(onlyVip.ok, 'C2: yalnız hak alanları ayrı bir PATCH olarak kabul ediliyor', onlyVip.ok ? '' : onlyVip.error);
    const onlyNote = await FP.patchMemberDoc('a@b.co', { note: 'yeni' }, { noCreateFallback: true });
    ok(onlyNote.ok && store.get('memberships/a@b.co')?.note?.stringValue === 'yeni', 'C2: ardından profil/not yazısı yazılabiliyor');

    // B2) kurallardan gelen red için anahtarlı deneme YAPILMAZ (boşuna gidiş-dönüş yok)
  store.clear();
  wlog.length = 0;
  const rulesDenyResponse = () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { code: 403, message: 'Missing or insufficient permissions.' } }),
    text: async () => '{"error":{"message":"Missing or insufficient permissions."}}',
    clone() {
      return { text: async () => '{"error":{"message":"Missing or insufficient permissions."}}' };
    },
  });
  const realRulesDeny = globalThis.fetch;
  let rulesHits = 0;
  globalThis.fetch = async (url, init) => {
    rulesHits += 1;
    wlog.push({ url: String(url), method: init?.method || 'GET' });
    return rulesDenyResponse();
  };
  let rulesDenyRes = 'x';
  try {
    rulesDenyRes = await (await freshApi()).documentExists('memberships/x@y.co');
  } finally {
    globalThis.fetch = realRulesDeny;
  }
  ok(rulesDenyRes === null, 'B2: kural reddi “okunamadı” olarak dürüstçe bildiriliyor', String(rulesDenyRes));
  ok(rulesHits === 1, 'B2: “Missing or insufficient permissions” için anahtarlı deneme yenilenmiyor', String(rulesHits));

  // D) düzeltilemeyen biçim → ağa hiç gitmeden, alan adıyla
    wlog.length = 0;
    r = await FP.createMemberDoc({ ...baseDoc, id: 'kotu', email: 'kotu', emailNormalized: 'kotu' });
    ok(!r.ok && /email/.test(r.error) && wlog.length === 0, 'D: geçersiz e-posta gönderilmiyor, nedeni alan adıyla yazılıyor', r.ok ? 'kabul edildi' : r.error);

    // E) deneme yazması: kendi belgesi yoksa oluşturulur
    store.clear();
    dropSession();
    rules.lockdown = false;
    let pr = await FP.probeMembershipWrite('A@B.co');
    ok(pr.ok && pr.created && pr.email === 'a@b.co', 'E: sınama belgeyi tam biçimle oluşturdu', JSON.stringify(pr));
    pr = await FP.probeMembershipWrite('a@b.co');
    ok(pr.ok && pr.updated && !pr.created, 'E: ikinci sınama mevcut belgeyi güncelledi', JSON.stringify(pr));
    pr = await FP.probeMembershipWrite('kotu');
    ok(!pr.ok && pr.cause === 'shape', 'E: e-posta yazılmadan önce yakalanıyor', JSON.stringify(pr));
    ok(MS.checkMemberFields(store.get('memberships/a@b.co'), 'create', 'a@b.co').length === 0, 'E: sınama belgesi kuralın beklediği biçimde');

    // F) kilit açık + oturum yok → engelli, ama mesaj nedeni söylüyor
    //    (taze modül örneği: authClient oturumu belleğinde tutar)
    rules.lockdown = true;
    store.clear();
    dropSession();
    const FPf = await freshApi();
    pr = await FPf.probeMembershipWrite('a@b.co');
    ok(!pr.ok && pr.cause === 'denied', 'F: kilit açıkken ve oturum yokken yazma reddi bildiriliyor', JSON.stringify(pr));
    ok(/ESKİ/.test(pr.error || '') && /metnini kopyala/.test(pr.error || ''), 'F: kilit yokken red → “yayındaki kurallar ESKİ” + kopyalama adımı', pr.error);

    // F2) kilit BELGESİ duruyorsa boşuna yazma denemiyor: nedeni + çözümü söylüyor
    store.set('meta/membership_lockdown', { note: { stringValue: 'kilit' } });
    putSession('kpssasistani-01'); // oturum a@b.co, probe baska@ornek.com
    const FPe = await freshApi();
    wlog.length = 0;
    const blocked = await FPe.probeMembershipWrite('baska@ornek.com');
    ok(!blocked.ok && blocked.cause === 'denied', 'F2: kilitli + başka üye belgesi → yazma denenmeden engelleniyor', JSON.stringify(blocked));
    ok(/Üyelik kilidi AÇIK/.test(blocked.error || '') && /meta\/membership_lockdown/.test(blocked.error || ''), 'F2: kilit + silinecek belge yolu cümlede geçiyor', blocked.error);
    ok(/giriş yap|kendi belgenize/.test(blocked.error || ''), 'F2: red cümlesi çözüm cümlesiyle birlikte geliyor', blocked.error);
    ok(!wlog.some(l => l.method === 'POST' || l.method === 'PATCH'), 'F2: gereksiz yazma isteği atılmıyor', wlog.map(l => l.method).join('>'));
    const selfOk2 = await FPe.probeMembershipWrite('a@b.co');
    ok(selfOk2.ok, 'F2: aynı oturum kendi belgesine yazabiliyor', JSON.stringify(selfOk2));
    dropSession();

    // G) kilit + doğru oturum → kendi belgesine yazabilir
    putSession('kpssasistani-01');
    const FPg = await freshApi();
    pr = await FPg.probeMembershipWrite('a@b.co');
    ok(pr.ok, 'G: kilit açıkken bile kendi belgesine yazılabiliyor (token ile)', JSON.stringify(pr));
    const other = await FPg.probeMembershipWrite('baska@ornek.com');
    ok(!other.ok, 'G: başkasının belgesine sınama yazılamıyor', JSON.stringify(other));

    // H) kilit belgesinin YOLU: yalnızca legacy yolda duruyorsa bile görünmeli
    rules.lockdown = false;
    store.clear();
    store.set('artifacts/kpss-asistani/public/data/meta/membership_lockdown', { note: { stringValue: 'test' } });
    const info = await FP.readLockdownInfo();
    ok(info.on === true && info.path === 'artifacts/kpss-asistani/public/data/meta/membership_lockdown', 'H: legacy yoldaki kilit de görülüyor', JSON.stringify(info));
    const lock = await FP.readMembershipLockdown();
    ok(lock.ok === true && lock.data === true, 'H: readMembershipLockdown iki yolu da dikkate alıyor', JSON.stringify(lock));
    rules.lockdown = true; // kural: meta/admins yazması !lockdownOn() ister
    dropSession();
    const added = await FP.addAdminEmail('a@b.co');
    rules.lockdown = false;
    ok(!added.ok && /artifacts\/kpss-asistani/.test(added.error || '') && /sil/.test(added.error || ''), 'H: kilitliyken liste yazımı, silinecek belgeyi tam yolla birlikte söylüyor', added.error);

    // I) yönetici listesi iki yolun birleşimi
    store.clear();
    store.set('meta/admins', { emails: { arrayValue: { values: [{ stringValue: 'bir@ornek.com' }] } } });
    store.set('artifacts/kpss-asistani/public/data/meta/admins', { emails: { arrayValue: { values: [{ stringValue: 'iki@ornek.com' }] } } });
    const admins = await FP.readAdminList();
    ok(admins.ok && admins.data.emails.includes('bir@ornek.com') && admins.data.emails.includes('iki@ornek.com'), 'I: kök + legacy yönetici listeleri birleşiyor', JSON.stringify(admins.data?.emails));

    // J) panel yazması (upsert) mevcut belgeye PUT ile saldırmıyor
    store.clear();
    store.set('memberships/uye@ornek.com', { ...fieldsOf({ ...baseDoc, id: 'uye@ornek.com', email: 'uye@ornek.com', emailNormalized: 'uye@ornek.com' }), role: { stringValue: 'user' } });
    wlog.length = 0;
    const vip = await FP.upsertMemberDoc({ ...baseDoc, id: 'uye@ornek.com', email: 'uye@ornek.com', emailNormalized: 'uye@ornek.com', vip: true, vipPlan: 'monthly', vipExpiresAt: '2030-01-01', status: 'active' });
    ok(vip.ok, 'J: var belgeye VIP hakkı kısmi yazımla veriliyor', vip.ok ? '' : vip.error);
    ok(!wlog.some(l => l.method === 'PUT'), 'J: mevcut belge PUT ile ezilmiyor', wlog.map(l => l.method).join('>'));
    ok(store.get('memberships/uye@ornek.com')?.vip?.booleanValue === true, 'J: vip alanı belgeye işlendi');
    ok(MS.checkMemberFields(store.get('memberships/uye@ornek.com'), 'update', 'uye@ornek.com').length === 0, 'J: sonuç belgesi kuralın biçimini koruyor');
  } finally {
    globalThis.fetch = real;
    dropSession();
  }
}
{
  const diagSrc = fs.readFileSync('lib/accessDiag.ts', 'utf8');
  ok(/LEGACY_ARTIFACTS_ROOT = 'artifacts\/kpss-asistani\/public\/data'/.test(diagSrc), 'tanı da legacy kökü biliyor (firestoreApi ile aynı sabit)');
  ok(/metaDocPaths\('meta\/membership_lockdown'\)/.test(diagSrc) && /metaDocPaths\('meta\/admins'\)/.test(diagSrc), 'tanı kilit VE yönetici listesini iki yolda yokluyor');
  ok(rulesRaw.includes("artifacts/kpss-asistani/public/data/meta/membership_lockdown"), 'kural gerçekten iki yolu da denetliyor (testin varsayımı)');
  const ctx2 = fs.readFileSync('lib/MembershipContext.tsx', 'utf8');
  ok(/writeMembershipSelf\(draft\)/.test(ctx2), 'context: kayıt ve ilk giriş yazması kademeli yolu kullanıyor');
  ok(!/createMemberDoc\(draft\)/.test(ctx2), 'context: çıplak createMemberDoc çağrısı kalmadı');
  ok(/diag\.cause === 'write-needs-probe'/.test(ctx2), 'context: okuma temizse deneme yazmasını kendisi çalıştırıyor');
}

console.log('\n\x1b[1m[18] API anahtarı yoklaması, ham sunucu yanıtları ve kopyalanabilir rapor\x1b[0m');
{
  // A) firestore istemcisi: anahtarsız red → `?key=` ile yeniden dener ve tercihini hatırlar
  const FPk = await freshApi();
  const calls = [];
  const realFetch5 = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ u, method: init?.method || 'GET', key: /[?&]key=/.test(u) });
    const okBody = { name: 'projects/p/databases/(default)/documents/memberships/a@b.co', fields: {} };
    if (!/[?&]key=/.test(u)) return { ok: false, status: 403, json: async () => ({ error: { message: 'PERMISSION_DENIED' } }), text: async () => '{"error":{"message":"PERMISSION_DENIED: missing key"}}' };
    return { ok: true, status: 200, json: async () => okBody, text: async () => JSON.stringify(okBody) };
  };
  try {
    const exists = await FPk.documentExists('memberships/a@b.co');
    ok(exists === true, 'A: anahtarsız 403 → anahtarlı denemeyle belge bulundu', JSON.stringify(calls));
    ok(calls.length === 2 && calls[0].key === false && calls[1].key === true, 'A: önce anahtarsız, sonra anahtarlı denendi', calls.map(c => (c.key ? 'key' : '-')).join(','));
    ok(FPk.isApiKeyParamPreferred() === true, 'A: anahtar tercihi hatırlanıyor');
    ok(FPk.consumeApiKeyParamNotice() === true && FPk.consumeApiKeyParamNotice() === false, 'A: bildirim bir kez gösteriliyor');
    calls.length = 0;
    await FPk.documentExists('memberships/c@d.co');
    ok(calls.length === 1 && calls[0].key === true, 'A: sonraki istekler doğrudan anahtarlı gidiyor (gereksiz deneme yok)', JSON.stringify(calls));
  } finally {
    globalThis.fetch = realFetch5;
  }

  // B) tanı: veritabanı yoksa kuralı suçlamıyor, ham yanıtı taşıyor
  const realFetch6 = globalThis.fetch;
  const notFound = (msg) => ({
    ok: false,
    status: 404,
    json: async () => ({ error: { message: msg } }),
    text: async () => JSON.stringify({ error: { message: msg } }),
  });
  globalThis.fetch = async url => notFound(`NOT_FOUND: Database (default) does not exist on project kpssasistani-01. ${String(url).length}`);
  let diagB = null;
  try {
    const Db = await import(`/tmp/accessDiagBundle.mjs?v=${Date.now()}-${Math.random()}`);
    diagB = await Db.diagnoseMembershipAccess('a@b.co');
  } finally {
    globalThis.fetch = realFetch6;
  }
  ok(diagB.cause === 'database-missing', 'B: “veritabanı yok” kural reddi olarak SUNULMUYOR', diagB.cause);
  ok(/Create database/.test(diagB.steps.join(' ')), 'B: adım tek eylemi söylüyor (veritabanını oluştur)', diagB.steps.join(' | '));
  ok(/does not exist/.test(diagB.detail.raw.content), 'B: ham sunucu gerekçesi rapora işleniyor', diagB.detail.raw.content);

  // C) tanı: okuma yalnız anahtarla geçiyorsa kullanıcıyı suçlamadan çözüme bağlıyor
  const realFetch7 = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    if (/[?&]key=/.test(u)) return { ok: true, status: 200, json: async () => ({}), text: async () => '{"documents":[]}' };
    return { ok: false, status: 403, json: async () => ({ error: { message: 'PERMISSION_DENIED' } }), text: async () => '{"error":{"message":"PERMISSION_DENIED"}}' };
  };
  let diagC = null;
  try {
    const Dc = await import(`/tmp/accessDiagBundle.mjs?v=${Date.now()}-${Math.random()}`);
    diagC = await Dc.diagnoseMembershipAccess('a@b.co');
  } finally {
    globalThis.fetch = realFetch7;
  }
  ok(diagC.cause === 'ok' && diagC.detail.needsApiKeyParam === true, 'C: “yalnız anahtarlı istek geçiyor” ayrılıyor', `${diagC.cause}/${diagC.detail.needsApiKeyParam}`);
  ok(/anahtar/i.test(diagC.headline) && !/kural.*yayınla/i.test(diagC.steps[0]), 'C: adım boşuna kural yayınlamaya göndermiyor', diagC.steps[0]);

  // D) rapor metni: tek yapıştırmayla nedeni taşır
  const Rt = await import(`/tmp/accessDiagBundle.mjs?v=${Date.now()}-${Math.random()}`);
  const text = Rt.accessDiagReportText(diagC, { email: 'a@b.co', authSource: 'repo', probe: 'Yazma serbest — a@b.co belgesi güncellendi', appLabel: 'kpssasistani-01 • db:(default) • (kök)' });
  ok(text.startsWith('— KPSS Asistanı'), 'Rapor tek blok metin olarak başlıyor');
  for (const need of ['neden: ok', 'hedef: proje kpssasistani-01', 'anahtar kaynağı repo', 'e-posta a@b.co', 'yazma sınaması: Yazma serbest', 'ham: ', 'adım 1:'])
    ok(text.includes(need), `raporda “${need}” satırı var`);
  ok(/biçim: /.test(text) && /okuma: içerik \d+/.test(text), 'rapor okuma ölçümlerini de taşıyor');
  const report3 = Rt.accessDiagReportText(diagC, { authProbe: 'E-posta/parola girişi kapalı (OPERATION_NOT_ALLOWED).' });
  ok(/^e-posta\/parola giri.*OPERATION_NOT_ALLOWED/im.test(report3), 'rapor sağlayıcı ölçümünü de taşıyor');
  ok(!/e-posta\/parola girişi: undefined/.test(report3), 'ölçülmemiş satır rapora “undefined” olarak sızmıyor');

  const diagSrc18 = fs.readFileSync('lib/accessDiag.ts', 'utf8');
  // E) derleme damgası: eski paketin yeni kod sanılmasını tek satırla engeller
  const BT = await import(`/tmp/buildTagBundle.mjs?v=${Date.now()}-${Math.random()}`);
  ok(/^member-\d{4}-\d{2}-\d{2}[a-z]$/.test(BT.MEMBERSHIP_BUILD_TAG), 'damga biçimi sabit: member-YIL-AY-GÜNharf', BT.MEMBERSHIP_BUILD_TAG);
  ok(BT.membershipBuildLabel() === BT.MEMBERSHIP_BUILD_TAG, 'damga tek kaynaktan okunuyor');
  ok(/^derleme: member-\d{4}-\d{2}-\d{2}[a-z]$/im.test(text), 'rapor cihazdaki derlemeyi de taşıyor');
  ok(/^derleme: /m.test(text) && /^düz: /m.test(text) && text.indexOf('derleme:') < text.indexOf('düz:'), 'damga zaman damgasından hemen önce geliyor');
  ok(/MEMBERSHIP_BUILD_TAG/.test(diagSrc18), 'tanı modülü damgayı gerçekten içe aktarıyor');

  // E) kaynak bağları: panel raporu gösteriyor, context bildirimi duyuyor
  const panel3 = fs.readFileSync('screens/AdminSettingsScreen.tsx', 'utf8');
  ok(/accessDiagReportText\(data,/.test(panel3), 'panel: tanı sonrası rapor otomatik kuruluyor');
  ok(/Tanı raporunu kopyala/.test(panel3) && /copyReport\(\)/.test(panel3), 'panel: raporu tek dokunuşla kopyalama satırı var');
  ok(/authClient\.probeAuth\(\)\.catch\(\(\) => null\)/.test(panel3), 'panel: sağlayıcı ölçümü rapor için gerçekten alınıyor');
  ok(/authProbe: ap\?\.note/.test(panel3) && /authProbe: authProbeNote \|\| undefined/.test(panel3), 'panel: rapora yalnız ölçülen sağlayıcı notu yazılıyor');
  ok(!/ekran fotoğrafı at|ekran görüntüsü at|fotoğraf at/.test(panel3), 'panel: kullanıcıdan ekran görüntüsü istenmiyor');
  ok(/membershipBuildLabel\(\)/.test(panel3), 'panel damgayı ekranda da gösteriyor (kopyalamadan da okunabilir)');
  const ctx3 = fs.readFileSync('lib/MembershipContext.tsx', 'utf8');
  ok(/consumeApiKeyParamNotice\(\)/.test(ctx3), 'context: anahtar parametresi iyileşmesi kullanıcıya bildiriliyor');
  ok(/auth\.consumeForeignTokenNotice\(\)/.test(ctx3), 'context: yabancı anahtar iyileşmesi de bildiriliyor');
  const apiSrc3 = fs.readFileSync('lib/firestoreApi.ts', 'utf8');
  ok(/const key = auth\.webApiKey\(\);/.test(apiSrc3) && !/const auth = await authHeaders\(\);/.test(apiSrc3), 'firestoreApi: modül takma adı gölgelenmiyor (auth.* çağrısı güvenli)');
  ok(/key \&\& useApiKeyParam/.test(apiSrc3), 'firestoreApi: anahtar tercihi bir kez kazanılıyor');
}

console.log(`\n\x1b[1m${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} kontrol\x1b[0m\n`);
process.exit(fail ? 1 : 0);
