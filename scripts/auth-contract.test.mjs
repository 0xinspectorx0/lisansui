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
const apiSrc = fs.readFileSync('lib/firestoreApi.ts', 'utf8');
ok(/export const ADMINS_DOC_PATH = collectionPath\('meta\/admins'\);/.test(apiSrc), 'ADMINS_DOC_PATH target kökünden türetiliyor');
ok(/export const MEMBERSHIP_LOCKDOWN_DOC_PATH = collectionPath\('meta\/membership_lockdown'\);/.test(apiSrc), 'kilit belgesi yolu da target’tan');
ok(/if \(emails\.length > 10\)/.test(apiSrc), 'yönetici listesi 10 kayıtla sınırlı (kuralla aynı)');
ok(/e\.toLowerCase\(\)/.test(apiSrc) && /normalizeEmail\(email\)/.test(apiSrc), 'e-postalar normalize edilerek yazılıyor');
ok(/return \{ ok: true, data: exists \};/.test(apiSrc), 'readMembershipLockdown var/yok döndürüyor');
const panel = fs.readFileSync('screens/AdminSettingsScreen.tsx', 'utf8');
ok(/addAdminEmail,[\s\S]*readAdminList,[\s\S]*readMembershipLockdown/.test(panel), 'panel meta/admins + kilit okuyucularını kullanıyor');
ok(/Kilidi açmak yalnız Console işidir/.test(panel), 'panel, kilidin yalnız Console’tan çevrildiğini söylüyor');

console.log(`\n\x1b[1m${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} kontrol\x1b[0m\n`);
process.exit(fail ? 1 : 0);
