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
const realFetch2 = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  fsLog.push({ url: u, headers: init?.headers || {} });
  const key = u.includes('/meta/membership_lockdown')
    ? 'lockdown'
    : u.includes('/memberships')
      ? 'membership'
      : 'content';
  const status = fsMode[key] ?? 200;
  if (status === 'network') throw new Error('ECONNRESET');
  return { ok: status < 400, status, json: async () => ({}), text: async () => '{}' };
};

try {
  dropSession();
  fsMode = { content: 403, membership: 403, lockdown: 403 };
  let d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'rules-not-published', 'her şey 403 → kurallar hiç yayınlanmamış', d.cause);
  ok(/yayınlanmamış/.test(d.headline), 'başlık “yayınlanmamış” diyor', d.headline);
  ok(d.steps.length > 0 && /Kuralları kopyala/.test(d.steps[0]), 'ilk adım paneldeki kopyalama düğmesine götürüyor', d.steps[0]);

  fsMode = { content: 200, membership: 403, lockdown: 404 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'rules-outdated', 'içerik okunuyor, üyelik okunamıyor → yayındaki kural ESKİ', d.cause);
  ok(/ESKİ/.test(d.headline), 'başlık bayat kuralları işaret ediyor', d.headline);

  fsMode = { content: 200, membership: 403, lockdown: 200 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'lockdown-no-admin', 'kilit AÇIK + yönetici değil → panel işlemleri reddedilir', d.cause);
  ok(/membership_lockdown/.test(d.headline), 'başlık kilidi işaret ediyor', d.headline);
  ok(d.steps.some(x => /belgesini silmek/.test(x)), 'kilidi geri alma adımı da anlatılıyor');

  fsMode = { content: 200, membership: 401, lockdown: 404 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'foreign-auth-project', '401 → kimlik token’ı Firestore kabul etmedi', d.cause);

  fsMode = { content: 'network', membership: 200, lockdown: 200 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'offline', 'ağ yoksa “kural engelledi” DENMİYOR', d.cause);
  ok(/bağlant/i.test(d.steps[0]), 'ağ çözümü öneriliyor', d.steps[0]);

  fsMode = { content: 200, membership: 200, lockdown: 404 };
  d = await D.diagnoseMembershipAccess();
  ok(d.cause === 'shape-rejected', 'okuma açık + yazma yoksa biçim/kural farkına bakılıyor', d.cause);
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
  ok(/diagnoseMembershipAccess\(\)/.test(panel2), 'panel: “Tanı” düğmesi tanının kendisini çağırıyor');
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
const mtfStart = membershipSrc.indexOf('export function memberToFields');
const written = membershipSrc.slice(mtfStart, membershipSrc.indexOf('\n}', mtfStart));
const writtenKeys = new Set((written.match(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm) || []).map(x => x.trim().replace(/:$/, '')));
const missing = requiredKeys.filter(k => !writtenKeys.has(k));
ok(missing.length === 0, 'uygulamanın yazdığı alanlar kuralın istediği listeyi kapsıyor', missing.join(', '));

console.log(`\n\x1b[1m${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} kontrol\x1b[0m\n`);
process.exit(fail ? 1 : 0);
