/**
 * ÜRETİLMİŞ DOSYA — elle düzenleme.
 *
 * Kaynak: firestore.rules. Yenilemek için: npm run sync:rules
 * (npm run test:auth bu kopyanın güncel olduğunu denetler.)
 *
 * Amaç: paneldeki “Kuralları kopyala” düğmesi bu metni panoya alır; kullanıcı
 * Console → Firestore → Rules → yapıştır → Publish ile tek adımda yayınlar.
 */
export const FIRESTORE_RULES_TEXT = `rules_version = '2';

/**
 * KPSS Asistanı — Firestore kuralları (yeni kurulum ve eski kurulum birlikte)
 * ===========================================================================
 * İki kimlik modu vardır (lib/MembershipContext.tsx bunu otomatik seçer):
 *   • Firebase Auth (önerilen): anahtar tanımlıysa (config/firebaseApp.ts ya da
 *     EXPO_PUBLIC_FIREBASE_API_KEY) her istek \`Authorization: Bearer <idToken>\`
 *     taşır (lib/authClient.ts Identity Toolkit REST kullanır; ek paket yok). Parola
 *     Firestore'a HİÇ yazılmaz; belgede \`algo: 'firebase-auth'\` + \`authUid\` işaretçisi
 *     durur. Token hedef projesinden değilse başlık hiç gönderilmez (lib/firestoreApi.ts),
 *     böylece tek bir bayat anahtar tüm istekleri kilitleyemez.
 *
 * Bu dosyanın bir kopyası uygulamada durur (config/firestoreRulesCopy.ts) ki panel
 * “Kuralları kopyala” ile tek dokunuşta Console'a yapıştırabilsin:
 *   güncellemek için  →  npm run sync:rules   (test:auth bayat kopyayı yakalar).
 *
 * memberships yazma sözleşmesi (istemci aynası: lib/memberShape.ts — test:auth §16
 * iki tarafı satır satır karşılaştırır):
 *   • create gövdesi memberShapeOk'un ZORUNLU OLDUĞU tüm alanları taşımak zorunda;
 *     Firestore REST'te PATCH, belge YOKSA create sayılır → kısmi gövde reddedilir.
 *     Uygulama bunu kademeli yazmayla çözer (lib/firestoreApi.ts → writeMemberDoc).
 *   • update gövdesi tek bir change-set listesinde kalmalı: usageOnlyChange (kendi
 *     kendine) VEYA entitlementChange (panel). authUid yalnız ilkinde,
 *     vip/vipPlan/vipExpiresAt/status yalnız ikincisinde → ikisi AYNI PATCH'te
 *     yazılmaz; uygulama iki istek atar.
 *   • id, email, createdAt, schemaVersion, role PATCH'lenmez (listelerin dışında);
 *     e-posta belge kimliğidir.
 *   • Boş/bozuk verifier/salt/iterations üçlüsü algo: 'pbkdf2-sha256' ile
 *     gönderilirse red yer; uygulama böyle bir üçlüyü firebase-auth işaretine
 *     çevirir (parola zaten Firebase'de).
 *   • Yerel mod (anahtar yoksa): üyelikler \`memberships/{e-posta}\` belgesinde,
 *     parola cihazda PBKDF2-SHA256 ile hash'lenir (lib/crypto.ts).
 *
 * Kademeli geçiş bir VERİ ANAHTARI ile yapılır: \`meta/membership_lockdown\` belgesi
 * yokken kimliksiz istemciler de üyelik okuyup yazabilir (bugünkü davranış).
 * O belgeyi Console'da oluşturduğun an kimliksiz istekler yalnızca içeriği
 * okuyabilir; üyelik belgeleri sadece token sahibi tarafından ve yalnızca KENDİ
 * e-postasıyla okunur/yazılır. Belgeyi silmek = geri almak (yeniden yayınlama yok).
 *
 * İKİ YOL DÜZENİ DE DESTEKLENİR (lib/firebaseConfig.ts hangi kökü kullandığını
 * belirler):
 *   • Yeni kurulum (root = "")        → /courses/..., /daily_tips/..., /memberships/...
 *   • Mevcut kurulum (legacy root)    → /artifacts/kpss-asistani/public/data/...
 * Kullanmadığın bloğu silebilirsin; ikisi de durursa zararlı bir yanı yok.
 *
 * Güvenlik modeli (istemci anonim olduğu için UID tabanlı denetim YOKTUR):
 *   • Belge \`id\` alanı ile yolun son segmenti (e-posta) birebir eşleşmek zorunda.
 *   • Yeni kayıt yalnızca \`role: user|editor\` + \`status: active|pending\` ile açılır.
 *   • \`role\` hiçbir istemci tarafından DEĞİŞTİRİLEMEZ → uygulama içinden
 *     kendini yönetici yapma engellenir (rol değişimi Console/Admin SDK işidir).
 *   • Şifre alanları biçim denetiminden geçer: verifier 64 hex, salt 32 hex,
 *     iterations >= 100, algo = pbkdf2-sha256. Boş hash ile belge açılamaz.
 *   • \`schemaVersion\` 1, sayaçlar negatif olamaz, \`courseUsage\` ≤ 12 anahtar
 *     ve değerler 0..999.
 *   • İçerik koleksiyonları (courses/daily_tips/…) uygulamaya salt-okunurdur;
 *     ancak paneldeki "İçeriği Firestore'a yaz" tohumlama akışı için kilit
 *     açılana kadar yazma serbesttir (contentWriteOk). Kalıcı yayın hâlâ
 *     Console/Admin SDK ile yapılır.
 *
 * Dağıtım:  npx firebase-tools deploy --only firestore:rules
 *        veya Console → Firestore → Rules → Paste → Publish
 */

service cloud.firestore {
  match /databases/{database}/documents {

    /* ------------------------------------------------------------ yardımcılar */

    /* ------------------------------------------------------------- auth modu */

    /**
     * Katı mod bir KOD BAYRAĞI değil, bir VERİ ANAHTARI: Console'da
     * \`meta/membership_lockdown\` belgesini oluşturduğun an üyelik okuma/yazma
     * yalnızca doğru Firebase Auth token'ıyla mümkün olur. Belgeyi silersen anında
     * eski (kimliksiz) davranışa dönersin — kuralı yeniden yayımlamak gerekmez.
     * Uygulama \`meta\` altına bu listedeki istisna dışında yazamaz, anahtarı yalnız
     * sen çevirebilirsin.
     */
    function lockdownOn() {
      return exists(/databases/$(database)/documents/meta/membership_lockdown)
        || exists(/databases/$(database)/documents/artifacts/kpss-asistani/public/data/meta/membership_lockdown);
    }

    function signedIn() {
      return request.auth != null;
    }

    /** Oturumdaki e-posta (normalize). Token yoksa boş string. */
    function sessionEmail() {
      return signedIn() && request.auth.token.email is string
        ? request.auth.token.email.lower()
        : '';
    }

    /**
     * Yönetici listesi de veride durur: \`meta/admins { emails: [küçük harf e-posta] }\`.
     * Admin SDK / custom claim gerekmez; Console'dan satır ekleyip çıkarırsın.
     * \`kpss_admin: true\` claim'i de ayrıca kabul edilir (kullanmak istersen).
     */
    function isAdminSession() {
      return signedIn()
        && (request.auth.token.kpss_admin == true
            || (exists(/databases/$(database)/documents/meta/admins)
                && request.auth.token.email.lower()
                   in get(/databases/$(database)/documents/meta/admins).data.emails)
            || (exists(/databases/$(database)/documents/artifacts/kpss-asistani/public/data/meta/admins)
                && request.auth.token.email.lower()
                   in get(/databases/$(database)/documents/artifacts/kpss-asistani/public/data/meta/admins)
                     .data.emails));
    }

    /**
     * Bütçe notu: get()/exists() çağrıları liste sorgularında HER aday belge için
     * değerlendirilir (sorgu başına ~100 okuma limiti). Bu yüzden \`listMembers\`
     * 30'luk sayfalarla çalışır (lib/firestoreApi.ts). İki yol denemesi, iki yolu da
     * desteklemek için gerekli; kendi kurulumunu biliyorsan kullanmadığın satırı sil.
     */
    /** Kilit kapalıyken kimliksiz istemci bugünkü gibi serbest; kilitte token şart. */
    function adminOk() {
      return isAdminSession() || !lockdownOn();
    }

    /** Yol segmenti oturum e-postası ve (varsa) belge e-postası ile eşleşmeli. */
    function selfReadOk(memberId) {
      return sessionEmail() != ''
        && memberId == sessionEmail()
        && resource.data.email.lower() == sessionEmail();
    }

    function selfCreateOk(memberId) {
      return sessionEmail() != ''
        && memberId == sessionEmail()
        && request.resource.data.email.lower() == sessionEmail();
    }

    function selfUpdateOk(memberId) {
      return sessionEmail() != ''
        && memberId == sessionEmail()
        && resource.data.email.lower() == sessionEmail()
        && request.resource.data.email.lower() == sessionEmail();
    }

    function isEmail(value) {
      return value is string
        && value.size() >= 5
        && value.size() <= 180
        && value.matches("^[^\\\\s@]+@[^\\\\s@]+\\\\.[a-zA-Z]{2,}$");
    }

    function isVerifier(value) {
      return value is string && value.matches("^[0-9a-f]{64}$");
    }

    function isSalt(value) {
      return value is string && value.matches("^[0-9a-f]{32}$");
    }

    /** Boş string serbest (süresiz plan); yyyy-mm-dd veya ISO zaman damgası kabul. */
    function isDateLike(value) {
      return value is string
        && (value == '' || value.matches("^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9:.]+Z?)?$") == true);
    }

    function isCounter(value) {
      return value is int && value >= 0 && value <= 1000000;
    }

    /** Uygulamanın yazdığı düz alan seti — lib/membership.ts#memberToFields. */
    function memberShapeOk(data) {
      return data.keys().hasAll([
          'id', 'email', 'emailNormalized', 'displayName',
          'verifier', 'salt', 'iterations', 'algo',
          'role', 'status', 'vip', 'vipPlan', 'vipExpiresAt',
          'createdAt', 'lastLoginAt', 'city', 'exam', 'note',
          'testsCompleted', 'questionsSolved', 'netSum', 'courseUsage', 'schemaVersion'
        ])
        && isEmail(data.email)
        && data.id == data.email.lower()
        && data.emailNormalized == data.email.lower()
        && data.displayName is string && data.displayName.size() <= 80
        && (
             data.algo == 'firebase-auth'
               ? (data.verifier == '' && data.salt == '' && data.iterations == 0)
               : (isVerifier(data.verifier)
                   && isSalt(data.salt)
                   && data.iterations is int && data.iterations >= 100
                   && data.algo == 'pbkdf2-sha256')
           )
        && data.role in ['user', 'editor', 'admin', 'owner']
        && data.status in ['active', 'pending', 'suspended', 'banned']
        && data.vip is bool
        && data.vipPlan in ['free', 'monthly', 'yearly', 'lifetime']
        && isDateLike(data.vipExpiresAt)
        && isDateLike(data.createdAt)
        && isDateLike(data.lastLoginAt)
        && data.city is string && data.city.size() <= 60
        && data.exam is string && data.exam.size() <= 80
        && data.note is string && data.note.size() <= 400
        && isCounter(data.testsCompleted)
        && isCounter(data.questionsSolved)
        && data.netSum is number && data.netSum >= -100000
        && data.schemaVersion == 1
        && data.courseUsage is map
        && data.courseUsage.size() <= 12
        && data.courseUsage.values().all(v, v is int && v >= 0 && v <= 999);
    }

    /** Öğrencinin dokunabildiği alanlar: kullanım + profil + şifre değişimi. */
    function usageOnlyChange() {
      return request.resource.data.diff(resource.data)
        .affectedKeys()
        .hasOnly([
          'testsCompleted', 'questionsSolved', 'netSum', 'courseUsage',
          'lastLoginAt', 'displayName', 'city', 'exam', 'note',
          'verifier', 'salt', 'iterations', 'algo', 'authUid'
        ]);
    }

    /** Panelin yaptığı değişiklikler: hak + durum alanları, \`role\` hariç. */
    function entitlementChange() {
      return request.resource.data.diff(resource.data)
        .affectedKeys()
        .hasOnly([
          'vip', 'vipPlan', 'vipExpiresAt', 'status', 'note',
          'displayName', 'city', 'exam', 'lastLoginAt',
          'testsCompleted', 'questionsSolved', 'netSum', 'courseUsage',
          'verifier', 'salt', 'iterations', 'algo'
        ]);
    }

    /** \`authUid\` alanına herkes yazamaz: yalnızca kendi Firebase uid'si. */
    function authUidOk(data) {
      return !('authUid' in data)
        || (signedIn() && data.authUid is string
            && data.authUid == request.auth.uid && data.authUid.size() >= 8);
    }

    function memberCreateOk(memberId) {
      return memberId == request.resource.data.id
        && request.resource.data.role in ['user', 'editor']
        && request.resource.data.status in ['active', 'pending']
        && authUidOk(request.resource.data)
        && memberShapeOk(request.resource.data);
    }

    function memberUpdateOk(memberId) {
      return memberId == request.resource.data.id
        && request.resource.data.role == resource.data.role
        && memberShapeOk(request.resource.data)
        && (usageOnlyChange() || entitlementChange())
        && (adminOk() || authUidOk(request.resource.data));
    }

    /** Uygulamanın okuyabildiği içerik koleksiyonları (kök düzen). */
    function isPublicContent(collectionName) {
      return collectionName in ['courses', 'daily_tips', 'catalog', 'meta', 'notices'];
    }

    /** Tohumlama (bootstrap) ile yazılabilen koleksiyonlar. */
    function isSeedableContent(collectionName) {
      return collectionName in ['courses', 'daily_tips'];
    }

    /**
     * İçerik kilidi. Admin \`meta/content_lock\` belgesini Console'dan oluşturduğunda
     * uygulama içi içerik yazmaları kapanır. Kilit belgesini uygulama yazamaz/silemez
     * (\`meta\` tohumlama listesinde değil) — açmak da Console işidir.
     */
    function contentLocked() {
      return exists(/databases/$(database)/documents/meta/content_lock)
        || exists(/databases/$(database)/documents/artifacts/kpss-asistani/public/data/meta/content_lock);
    }

    /** Tohumlama yazımı: izinli koleksiyon + kilit yok + bilinen alan seti. */
    function contentWriteOk(collectionName) {
      return isSeedableContent(collectionName)
        && !contentLocked()
        && request.resource.data.keys().hasOnly([
            'id', 'name', 'title', 'icon', 'order', 'hidden', 'courseId',
            'questionCount', 'questions', 'list', 'updatedAt', 'schemaVersion'
          ])
        && (!('questions' in request.resource.data)
            || request.resource.data.questions is list)
        && (!('list' in request.resource.data)
            || request.resource.data.list is list)
        && (!('questionCount' in request.resource.data)
            || (request.resource.data.questionCount is int
                && request.resource.data.questionCount >= 0))
        && (!('schemaVersion' in request.resource.data)
            || request.resource.data.schemaVersion == 1);
    }

    /* ------------------------------------------------- YENİ KURULUM (kök) */
    // courses/{courseId}, daily_tips/main, meta/content_lock ...
    match /{collection}/{document} {
      allow read: if isPublicContent(collection);
      allow write: if contentWriteOk(collection);
    }

    // courses/{courseId}/topics ve courses/{courseId}/topics/{docId}
    match /{collection}/{document}/{sub} {
      allow read: if isPublicContent(collection);
      allow write: if contentWriteOk(collection);
    }

    match /{collection}/{document}/{sub}/{leaf} {
      allow read: if isPublicContent(collection);
      allow write: if contentWriteOk(collection);
    }

    /**
     * Yönetici listesinin bootstrap yazımı: kilit kapanana kadar
     * (meta/membership_lockdown yokken) uygulama kendi e-postasını listeye
     * ekleyebilir — böylece paneldeki “kendimi yönetici listesine ekle” tek dokunuşla
     * biter ve Admin SDK gerekmez. Kilit açıldıktan sonra yalnız Console yazar.
     * Kısıtlar: küçük harf e-posta, en fazla 10 kayıt, başka alan yok, silme yok.
     */
    match /meta/admins {
      allow get: if true;
      allow write: if !lockdownOn()
        && request.resource.data.keys().hasOnly(['emails', 'updatedAt', 'schemaVersion'])
        && request.resource.data.emails is list
        && request.resource.data.emails.size() <= 10
        && request.resource.data.emails.all(e, e is string && e == e.lower()
             && e.size() >= 5 && e.size() <= 180
             && e.matches("^[^\\\\s@]+@[^\\\\s@]+\\\\.[a-zA-Z]{2,}$"))
        && request.resource.data.schemaVersion == 1;
    }

    /** meta altında gerisi (content_lock, membership_lockdown...) istemciye kapalı. */
    match /meta/{document} {
      allow get: if true;
      allow list, write: if false;
    }

    match /memberships/{memberId} {
      allow read: if adminOk() || selfReadOk(memberId);
      allow create: if memberCreateOk(memberId) && (adminOk() || selfCreateOk(memberId));
      allow update: if memberUpdateOk(memberId) && (adminOk() || selfUpdateOk(memberId));
      allow delete: if adminOk() || selfReadOk(memberId);
    }

    /* ------------------------------------------- MEVCUT KURULUM (artifacts) */
    match /artifacts/{artifact}/public/data/{collection}/{document} {
      allow read: if artifact == 'kpss-asistani';
      allow write: if artifact == 'kpss-asistani' && contentWriteOk(collection);
    }

    match /artifacts/{artifact}/public/data/{collection}/{document}/{sub} {
      allow read: if artifact == 'kpss-asistani';
      allow write: if artifact == 'kpss-asistani' && contentWriteOk(collection);
    }

    match /artifacts/{artifact}/public/data/{collection}/{document}/{sub}/{leaf} {
      allow read: if artifact == 'kpss-asistani';
      allow write: if artifact == 'kpss-asistani' && contentWriteOk(collection);
    }

    match /artifacts/{artifact}/public/data/memberships/{memberId} {
      allow read: if artifact == 'kpss-asistani' && (adminOk() || selfReadOk(memberId));
      allow create: if artifact == 'kpss-asistani' && memberCreateOk(memberId)
        && (adminOk() || selfCreateOk(memberId));
      allow update: if artifact == 'kpss-asistani' && memberUpdateOk(memberId)
        && (adminOk() || selfUpdateOk(memberId));
      allow delete: if artifact == 'kpss-asistani' && (adminOk() || selfReadOk(memberId));
    }

    /* ------------------------------------------------------------ varsayılan */
    match /{document=**} {
      allow read, write: if false;
    }
  }
}

/**
 * Notlar
 * ------
 * 1) \`PATCH\` isteklerinde Firestore, gönderilen alanları mevcut belgeyle birleştirir;
 *    kural \`request.resource.data\` üzerinden birleşik hali görür. Bu yüzden
 *    \`memberShapeOk\` güncellemelerde de geçerlidir.
 *
 * 2) Liste (query) izinleri \`read\` içindedir — ayrı \`list\` kuralı gerekmez.
 *    \`listMembers\` pageSize/pageToken kullanır, composite index gerekmez
 *    (giriş zaten \`id = normalizeEmail(e-posta)\` ile doğrudan belge okur).
 *
 * 3) "Sadece Console" varyantı: VIP/durum değişikliklerinin uygulama içinden
 *    yapılmasını kapatmak için \`memberUpdateOk\` içindeki ifadeyi
 *    \`usageOnlyChange()\` olarak bırak.
 *
 * 4) Firebase Auth bağlantısı (kurulu, kademeli):
 *    a) Console → Authentication → Sign-in method → Email/Password → Enable
 *    b) \`.env.local\` → EXPO_PUBLIC_FIREBASE_API_KEY (tek gerekli değer)
 *    c) \`npm run setup:firestore -- <proje> --root . --api-key <ANAHTAR>\` ve
 *       \`npm run deploy:rules\`
 *    d) Panel → “Firebase Auth” kartı → “Kendimi yönetici listesine ekle” (bootstrap,
 *       Admin SDK gerekmez; \`meta/admins\` belgesi oluşur/güncellenir).
 *    e) Katı mod: Console'da \`meta/membership_lockdown\` belgesi oluştur (alan
 *       gerekmez, \`note: 'kilitli'\` yeter) → kimliksiz üyelik okuma/yazma kapanır.
 *       Geri almak = belgeyi silmek. Kod değişikliği/yeniden yayınlama gerekmez.
 *    E-posta doğrulama zorunluluğu istersen \`selfReadOk/selfCreateOk/selfUpdateOk\`
 *    içindeki eşitliklere \`&& request.auth.token.email_verified == true\` ekle.
 *
 * 4b) Yönetici listesi \`meta/admins { emails: [...] }\` belgesindedir; Admin SDK veya
 *    custom claim gerekmez (\`kpss_admin: true\` claim'i de ayrıca kabul edilir).
 * 4c) \`match /meta/admins\` bloğu \`match /meta/{document}\` bloğundan daha spesifik
 *    olduğu için bootstrap yazımına izin verir; \`meta\` altındaki HERHANGİ BASHKA
 *    belge (content_lock, membership_lockdown dahil) istemci tarafından
 *    yazılamaz/silinemez — anahtarı yalnızca sen çevirirsin.
 *
 * 5) İçerik tohumlaması (bootstrap): uygulamanın "İçeriği Firestore'a yaz" akışı
 *    courses/... ve daily_tips/... belgelerini yazar. Bu pencere, Console'da
 *    \`meta/content_lock\` belgesini oluşturana kadar açıktır; kilit belgesini
 *    uygulama yazamaz/silemez, yani kilidi kurmak/yıkmak yalnızca Console işidir.
 *
 * 5b) İçeriği kalıcı olarak uygulama yazımına açmak istersen \`contentWriteOk(...)\`
 *    şartını \`true\` yapmak yeterli; bu, o koleksiyonları ANONİM yazıma açar —
 *    sadece emulator/test projelerinde yapılmalı.
 */
`;

/** Kopya kaç satırlık bir metin taşıyor (panel özeti için). */
export const FIRESTORE_RULES_LINES = 420;
