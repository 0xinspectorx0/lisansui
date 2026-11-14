/**
 * "Firestore okuma/yazma kuralı engellendi" uyarısının tanısı.
 *
 * Bu modül hiçbir şey YAZMAZ; üç ucuz okuma + yerel bir biçim denetimiyle
 * sorunun KAYNAĞINI ayırt eder ve tek cümlelik bir çözüm üretir:
 *
 *   1) İzin okunamıyorsa          → kurallar hiç yayınlanmamış (Console → Publish)
 *   2) içerik okunuyor, üyelik
 *      okunamıyorsa               → yayındaki kurallar ESKİ (memberships bloğu yok)
 *   3) token 401 veriyorsa        → kimlik BAŞKA projeden (cihazda kayıtlı eski
 *                                   anahtar) → otomatik temizlenir
 *   4) kilit açıksa ve e-posta
 *      yönetici listesinde değilse → panel işlemleri reddedilir (kendi kaydın çalışır)
 *      • kilit belgesi HANGİ YOLDA olursa olsun sayılır: kurallar kök `meta/…` ile
 *        `artifacts/kpss-asistani/public/data/meta/…` yollarının ikisine de bakıyor,
 *        tanı da öyle yapar (aksi halde "kilit yok" sanılır, yazma gizemli kalır)
 *   5) okuma açık, yazma kuşkuluysa → `probeMembershipWrite` (lib/firestoreApi.ts)
 *      tek güvenilir cevabı verir; bu modül okuma tarafını, o yaza-kademe
 *      fonksiyonu yazma tarafını ölçer.
 *
 * `fetch` dışında bağımlılığı yok → node'da (npm run test:auth) sahte fetch ile
 * doğrulanabilir.
 */

import { collectionPath, contentBase, documentsBase, firestoreTarget } from './firebaseConfig';
import { sessionIdTokenInfo } from './authClient';
import { MEMBER_EMAIL_RE } from './memberShape';

export type AccessDiagCause =
  | 'ok'
  | 'offline'
  | 'rules-not-published'
  | 'rules-outdated'
  | 'foreign-auth-project'
  | 'lockdown-no-admin'
  | 'shape-rejected'
  | 'write-needs-probe'
  | 'unknown';

export interface AccessDiag {
  cause: AccessDiagCause;
  /** Tek cümle: kullanıcıya/panele gösterilir. */
  headline: string;
  /** Sırayla uygulanacak kısa adımlar (ilki her zaman yeterli olur). */
  steps: string[];
  /** Ham ölçümler — hata ayıklama için. */
  detail: {
    projectId: string;
    databaseId: string;
    membershipsPath: string;
    contentStatus: number | 'network';
    membershipStatus: number | 'network' | 'skipped';
    /** `membershipStatus` 200 ama liste boşsa true → okuma izni hakkında kanıt YOK. */
    membershipEmpty: boolean;
    lockdown: 'on' | 'off' | 'unknown';
    /** Kilidi açmak için silinecek belge yolu (kilit açıksa). */
    lockdownPath: string | null;
    /** Kilit için denenen yollar (kök + legacy). */
    lockdownChecked: string[];
    tokenProject: string | null;
    tokenPresent: boolean;
    /** Oturumun e-postası incelenen belge kimliğiyle aynı mı? (kendi belgen = yazabilirsin) */
    selfMatch: boolean;
    /** Yerel biçim denetiminin buldukları (boş = kural alanları reddetmez). */
    shapeProblems: string;
  };
}

/** Tek istek zaman aşımı. Yoklamalar PARALEL koşar → tanı en kötü ~8 sn sürer. */
const TIMEOUT_MS = 8000;

/**
 * `firestore.rules` içindeki `lockdownOn()`/`isAdminSession()` bu öneki de
 * denetliyor; tanı da denetlemeli. (Test: `scripts/auth-contract.test.mjs §17`
 * iki dosyadaki sabitin aynı kaldığını doğruluyor.)
 */
const LEGACY_ARTIFACTS_ROOT = 'artifacts/kpss-asistani/public/data';

function metaDocPaths(name: string): string[] {
  const primary = collectionPath(name);
  const legacy = `${LEGACY_ARTIFACTS_ROOT}/${name}`;
  return primary === legacy ? [primary] : [primary, legacy];
}

type Read = { status: number | 'network'; emptyList?: boolean };

async function get(url: string, token: string | null): Promise<Read> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: ctrl.signal,
    });
    // Liste sorgularında 200 + boş sonuç, okuma iznini KANITLAMAZ: kurallar
    // erişilemeyen belgeleri sessizce süzer. Boş/oluş ayrımı için gövde okunur.
    let emptyList: boolean | undefined;
    if (res.ok && url.includes('pageSize')) {
      try {
        const json = JSON.parse((await res.text()) || '{}');
        emptyList = !Array.isArray(json?.documents) || json.documents.length === 0;
      } catch {
        emptyList = undefined;
      }
    }
    return { status: res.status, emptyList };
  } catch {
    return { status: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** `meta/membership_lockdown` var mı? Her iki yol da denenir. */
async function readLockdown(
  token: string | null,
  paths: string[]
): Promise<{ state: 'on' | 'off' | 'unknown'; path: string | null }> {
  const hits = await Promise.all(
    paths.map(async path => ({ path, ...(await get(`${documentsBase()}/${path}?fields=note`, token)) }))
  );
  const on = hits.find(h => h.status === 200);
  if (on) return { state: 'on', path: on.path };
  if (hits.some(h => h.status === 'network')) return { state: 'unknown', path: null };
  if (hits.every(h => h.status === 404)) return { state: 'off', path: null };
  return { state: 'unknown', path: null };
}

/**
 * Yazılacak belgenin kuralın zorunlu tuttuğu e-posta biçimine uyup uymadığı —
 * ağa hiç gerekmeden bilinen tek "biçim" reddi burada yakalanır.
 */
export function memberEmailShapeProblem(email?: string): string {
  if (!email) return '';
  const key = String(email).trim().toLowerCase();
  if (!key) return '';
  if (!MEMBER_EMAIL_RE.test(key)) return `email: “${key}” kuralın beklediği e-posta biçiminde değil`;
  if (key.length > 180) return 'email: 180 karakterden uzun olamaz';
  return '';
}

/**
 * Üyelik okuma/yazma reddinin nedenini bulur.
 * @param email denenen üyelik belgesinin normalize e-postası (varsa)
 */
export async function diagnoseMembershipAccess(email?: string): Promise<AccessDiag> {
  const target = firestoreTarget();
  const membershipsPath = collectionPath('memberships');
  const lockdownChecked = metaDocPaths('meta/membership_lockdown');
  const adminsChecked = metaDocPaths('meta/admins');
  const cfg = await sessionIdTokenInfo();
  const token = cfg.token;

  const base: AccessDiag['detail'] = {
    projectId: target.projectId,
    databaseId: target.databaseId,
    membershipsPath,
    contentStatus: 'network',
    membershipStatus: 'skipped',
    membershipEmpty: false,
    lockdown: 'unknown',
    lockdownPath: null,
    lockdownChecked,
    tokenProject: cfg.projectId,
    tokenPresent: !!token,
    selfMatch: !!email && String(cfg.email || '').toLowerCase() === String(email).toLowerCase(),
    shapeProblems: '',
  };
  const out = (
    cause: AccessDiagCause,
    headline: string,
    steps: string[],
    detail: Partial<AccessDiag['detail']> = {}
  ): AccessDiag => ({ cause, headline, steps, detail: { ...base, ...detail } });

  // 1) Her şeyden önce: token FIRESTORE HEDEFİNİN projesinden mi?
  if (token && cfg.projectId && cfg.projectId !== target.projectId)
    return out(
      'foreign-auth-project',
      `Kimlik doğrulama “${cfg.projectId}” projesinden token veriyor, veritabanı hedefi “${target.projectId}”.`,
      [
        'Cihazda kayıtlı eski API anahtarı başka bir projeye ait — kaldırıldı, bir kez daha üye olmayı dene.',
        'Panelde: Ayarlar → Firebase Auth → “bu cihazdaki eski anahtarı kaldır”.',
        'Geliştirici işi: config/firebaseApp.ts ile app.json → expo.extra.firestore.projectId aynı projeyi göstermeli.',
      ],
      { contentStatus: 'network', membershipStatus: 'skipped' }
    );

  // 2) Üç yoklama birden atılır (sırayla denirse çevrimdışı durumda 3×8 sn sürerdi):
  //    • içerik okuması (kimliksiz) → kurallar yayınlanmış mı?
  //    • kilit belgesi (kök + legacy) → üyelik yazmaları token istiyor mu?
  //    • üyelik okuması (tokenlı)    → bu cihaz için memberships izni var mı?
  const membershipUrl = email
    ? `${documentsBase()}/${membershipsPath}/${encodeURIComponent(email)}`
    : `${documentsBase()}/${membershipsPath}?pageSize=1`;
  const [content, lockdown, membership] = await Promise.all([
    get(`${contentBase()}/daily_tips/main`, null),
    readLockdown(token, lockdownChecked),
    get(membershipUrl, token || null),
  ]);

  base.contentStatus = content.status;
  base.membershipStatus = membership.status;
  base.membershipEmpty = membership.emptyList === true;
  base.lockdown = lockdown.state;
  base.lockdownPath = lockdown.path;

  if (content.status === 'network')
    return out(
      'offline',
      'Firestore’a ulaşılamadı (ağ yok ya da bu cihazdan erişim engelli).',
      ['Wi-Fi/hücresel bağlantını değiştir, sonra tekrar dene.']
    );

  // Yerel denetim: biçim hatasıysa ağın hiç suçu yok — tek bakışta anlaşılır.
  const shape = memberEmailShapeProblem(email);
  if (shape)
    return out(
      'shape-rejected',
      'Üyelik belgesi kuralın beklediği biçimde değil; Firestore bu yüzden yazmıyor.',
      [`Düzelt: ${shape}.`, 'E-posta üyelik kimliğidir; büyük/küçük harf ve boşluk hariç aynen yazılmalı.'],
      { shapeProblems: shape }
    );

  if (content.status === 403)
    return out(
      'rules-not-published',
      `“${target.projectId}” veritabanında kural yok (her şey reddediliyor). firestore.rules henüz yayınlanmamış.`,
      [
        'Admin → Ayarlar → “firestore.rules metnini kopyala” → Console → Firestore → Rules → yapıştır → Publish.',
        `Hedef veritabanı: ${target.databaseId}, üyelik yolu: ${membershipsPath}/{e-posta}.`,
      ],
      { membershipStatus: membership.status }
    );

  if (membership.status === 401)
    return out(
      'foreign-auth-project',
      'Firestore gönderdiğin kimlik token’ını kabul etmedi (401).',
      [
        'Uygulama açıkken Admin → Ayarlar → Firebase Auth → “Oturumu kapat”, sonra yeniden giriş yap.',
        'Hâlâ sürüyorsa anahtar başka bir projeye ait: “eski anahtarı kaldır” satırını kullan.',
      ],
      { membershipStatus: 401 }
    );

  const listProvesNothing = membership.status === 200 && base.membershipEmpty && !email;

  // Kilit açıksa ve okuma da bunu doğruluyor/çelişki taşıyorsa: tek açıklama kilit.
  // (Belge okunabiliyorsa — email ile 200 — kendi yazımın önünde kilit durmaz,
  //  o yüzden o durumu aşağıdaki deneme yazısına bırakıyoruz.)
  if (lockdown.state === 'on' && (membership.status === 403 || listProvesNothing))
    return out(
      'lockdown-no-admin',
      `Üyelik kilidi AÇIK${lockdown.path ? ` (${lockdown.path})` : ''}: yazmalar yalnız yönetici token’ıyla ya da kendi belgen için yapılır.`,
      [
        'Kendi kaydın için: e-posta + parolanla GİRİŞ yap, sonra tekrar dene (kendi belgeni okuyup yazabilirsin).',
        lockdown.path
          ? `Kilidi kapatmak: Console → Firestore → Documents → ${lockdown.path} belgesini sil (kuralı yeniden yayınlamaya gerek yok).`
          : 'Kilidi kapatmak: Console → Firestore → Documents → meta/membership_lockdown belgesini sil.',
        `Panel işlemleri için e-postanın yönetici listesinde olması gerekir: ${adminsChecked.join(' veya ')} → emails dizisine ekle.`,
      ],
      { membershipStatus: membership.status, lockdownPath: lockdown.path }
    );

  if (lockdown.state === 'on' && !token)
    return out(
      'lockdown-no-admin',
      `Üyelik kilidi AÇIK${lockdown.path ? ` (${lockdown.path})` : ''} ve bu cihazda Firebase Auth oturumu yok: yazmalar kimlik ister.`,
      [
        'E-posta + parolanla GİRİŞ yap (oturum token’ı kendi belgine yazma hakkı getirir).',
        'İlk kez kaydoluyorsan: Firebase Console → Authentication → Sign-in method → Email/Password → Enable olmalı.',
        lockdown.path
          ? `Kimlik istemeden çalışmak için: Console → Firestore → Documents → ${lockdown.path} belgesini sil.`
          : 'Kimlik istemeden çalışmak için: meta/membership_lockdown belgesini Console’dan sil.',
      ],
      { membershipStatus: membership.status, lockdownPath: lockdown.path }
    );

  if (membership.status === 403)
    return out(
      'rules-outdated',
      `İçerik okunuyor ama ${membershipsPath} okunamıyor: yayındaki kurallar ESKİ (üyelik bloğu yok ya da yol öneki farklı).`,
      [
        'Admin → Ayarlar → “firestore.rules metnini kopyala” → Console → Firestore → Rules → yapıştır → Publish.',
        `Yol öneki: ${target.root ? `legacy (${target.root})` : '(kök)'} — firestore.rules iki düzeni de içeriyor.`,
      ],
      { membershipStatus: 403 }
    );

  if (membership.status === 'network')
    return out(
      'offline',
      'Üyelik sorgusu ağ yüzünden tamamlanamadı.',
      ['Bağlantını kontrol edip tekrar dene.'],
      { membershipStatus: 'network' }
    );

  if (listProvesNothing)
    return out(
      'write-needs-probe',
      'Okuma yolu açık; üyelik koleksiyonu boş görünüyor, bu yüzden yazma izni okumadan anlaşılamaz.',
      [
        'Aynı kartta “Yazma sınaması” düğmesine bas: kendi belgena zararsız bir deneme yazılır (hak alanlarına dokunulmaz).',
        'E-posta ile sınarsan sonuç kesindir: Tanı kutusundaki e-posta satırını doldur.',
      ],
      { membershipStatus: 200, membershipEmpty: true }
    );

  // Kilit açık AMA oturumun e-postası incelenen belgeyle aynıysa kendi yazımı
  // serbesttir (`selfUpdateOk`/`selfCreateOk`): "panel çalışmıyor" ile "üye olamıyorum"
  // aynı şey değil. Bunu ayırt etmezsek kullanıcıya boş yere engel var gibi görünür.
  if (lockdown.state === 'on' && base.selfMatch && membership.status === 200)
    return out(
      'ok',
      'Kendi belgen için sorun yok: oturumun e-postası bu belgeyle eşleşiyor, okuma ve yazma serbest.',
      [
        'Üye ol / giriş yap / profil güncelle normal çalışır.',
        `Panel listeleri ve başka üyelere yazma ise kapalı: üyelik kilidi AÇIK${lockdown.path ? ` (${lockdown.path})` : ''} ve e-posta yönetici listesinde değil.`,
        'Panelden de çalışmak istersen: meta/admins → emails listesine bu e-postayı ekle (ya da kilidi kapat).',
      ],
      { membershipStatus: 200 }
    );

  // Okuma açık ve kilit de engellemiyor gibi: yazmanın asıl nedeni ya belge
  // biçimidir (artık yazmadan ÖNCE düzeltiliyor) ya da create/update kuralının
  // kendisi. Kesin cevap deneme yazmasındadır.
  return out(
    'write-needs-probe',
    'Okuma açık: kural yayınlanmış, kimlik doğru projeden, kilit engellemiyor.',
    [
      'Aynı kartta “Yazma sınaması” düğmesine bas — kendi belgene yazma gerçekten denenir, engelse nedeni tek cümleyle yazar.',
      'Sınama da reddedilirse: Admin → Ayarlar → “firestore.rules metnini kopyala” → Console → Rules → yapıştır → Publish (yayındaki kopya bayatlamış olabilir).',
      `Not: Firestore kısmi güncellemeyi (PATCH) belge YOKKEN create sayar ve eksik alan yüzünden reddeder; uygulama bunu kademeli yazmayla (lib/firestoreApi.ts → writeMemberDoc) kendisi düzeltiyor.`,
    ],
    { shapeProblems: shape }
  );
}
