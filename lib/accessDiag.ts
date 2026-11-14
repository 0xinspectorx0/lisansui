/**
 * "Firestore okuma/yazma kuralı engellendi" uyarısının tanısı.
 *
 * Bu modül hiçbir şey YAZMAZ; yalnızca üç ucuz okuma ile sorunun KAYNAĞINI ayırt
 * eder ve tek cümlelik bir çözüm üretir:
 *
 *   1) İzin okunamıyorsa          → kurallar hiç yayınlanmamış (Console → Publish)
 *   2) içerik okunuyor, üyelik
 *      okunamıyorsa               → yayındaki kurallar ESKİ (memberships bloğu yok)
 *   3) token 401 veriyorsa        → kimlik ANOTHER projeden (cihazda kayıtlı eski
 *                                   anahtar) → otomatik temizlenir
 *   4) kilit (meta/membership_lockdown) açıksa ve e-posta meta/admins'te yoksa
 *                                 → panel işlemleri reddedilir (kendi kaydın yine de çalışır)
 *
 * `fetch` dışında bağımlılığı yok → node'da (npm run test:auth) sahte fetch ile
 * doğrulanabilir.
 */

import { collectionPath, contentBase, documentsBase, firestoreTarget } from './firebaseConfig';
import { sessionIdTokenInfo } from './authClient';

export type AccessDiagCause =
  | 'ok'
  | 'offline'
  | 'rules-not-published'
  | 'rules-outdated'
  | 'foreign-auth-project'
  | 'lockdown-no-admin'
  | 'shape-rejected'
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
    lockdown: 'on' | 'off' | 'unknown';
    tokenProject: string | null;
    tokenPresent: boolean;
  };
}

/** Tek istek zaman aşımı. Üç yoklama PARALEL koşar → tanı en kötü ~8 sn sürer. */
const TIMEOUT_MS = 8000;

async function get(url: string, token: string | null): Promise<{ status: number | 'network' }> {
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
    return { status: res.status };
  } catch {
    return { status: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** `meta/membership_lockdown` var mı? Kural buna izin vermiyorsa 'unknown' döner. */
async function readLockdown(token: string | null, path: string): Promise<'on' | 'off' | 'unknown'> {
  const url = `${documentsBase()}/${path}?fields=note`;
  const { status } = await get(url, token);
  if (status === 200) return 'on';
  if (status === 404) return 'off';
  return 'unknown';
}

const out = (
  cause: AccessDiagCause,
  headline: string,
  steps: string[],
  detail: AccessDiag['detail']
): AccessDiag => ({ cause, headline, steps, detail });

/**
 * Üyelik okuma/yazma reddinin nedenini bulur.
 * @param email denenen üyelik belgesinin normalize e-postası (varsa)
 */
export async function diagnoseMembershipAccess(email?: string): Promise<AccessDiag> {
  const target = firestoreTarget();
  const membershipsPath = collectionPath('memberships');
  const cfg = await sessionIdTokenInfo();
  const token = cfg.token;

  // 1) Her şeyden önce: token FIRESTORE HEDEFİNİN projesinden mi?
  if (token && cfg.projectId && cfg.projectId !== target.projectId)
    return out(
      'foreign-auth-project',
      `Kimlik doğrulama “${cfg.projectId}” projesinden token veriyor, veritabanı hedefi “${target.projectId}”.`,
      [
        'Cihazda kayıtlı eski API anahtarı başka bir projeye ait — kaldırıldı, bir kez daha üye olmayı dene.',
        'Panelde: Ayarlar → Firebase Auth → “bu cihazdaki eski anahtarı kaldır”.',
      ],
      {
        projectId: target.projectId,
        databaseId: target.databaseId,
        membershipsPath,
        contentStatus: 'network',
        membershipStatus: 'skipped',
        lockdown: 'unknown',
        tokenProject: cfg.projectId,
        tokenPresent: true,
      }
    );

  // 2) Üç yoklama birden atılır (sırayla denirse çevrimdışı durumda 3×8 sn sürerdi):
  //    • içerik okuması (kimliksiz) → kurallar yayınlanmış mı?
  //    • kilit belgesi            → meta/membership_lockdown var mı?
  //    • üyelik okuması (tokenlı) → bu cihaz için memberships izni var mı?
  const membershipUrl = email
    ? `${documentsBase()}/${membershipsPath}/${encodeURIComponent(email)}`
    : `${documentsBase()}/${membershipsPath}?pageSize=1`;
  const [content, lockdownRaw, membership] = await Promise.all([
    get(`${contentBase()}/daily_tips/main`, null),
    readLockdown(token, collectionPath('meta/membership_lockdown')),
    get(membershipUrl, token || null),
  ]);
  if (content.status === 'network')
    return out(
      'offline',
      'Firestore’a ulaşılamadı (ağ yok ya da bu cihazdan erişim engelli).',
      ['Wi-Fi/hücresel bağlantını değiştir, sonra tekrar dene.'],
      {
        projectId: target.projectId,
        databaseId: target.databaseId,
        membershipsPath,
        contentStatus: 'network',
        membershipStatus: 'skipped',
        lockdown: 'unknown',
        tokenProject: cfg.projectId,
        tokenPresent: !!token,
      }
    );

  const lockdown = lockdownRaw;
  const base = {
    projectId: target.projectId,
    databaseId: target.databaseId,
    membershipsPath,
    contentStatus: content.status,
    lockdown,
    tokenProject: cfg.projectId,
    tokenPresent: !!token,
  } as const;

  if (content.status === 403)
    return out(
      'rules-not-published',
      `“${target.projectId}” veritabanında kural yok (her şey reddediliyor). firestore.rules henüz yayınlanmamış.`,
      [
        'Admin → Ayarlar → “Kuralları kopyala” → Console → Firestore → Rules → yapıştır → Publish.',
        `Hedef veritabanı: ${target.databaseId}, üyelik yolu: ${membershipsPath}/{e-posta}.`,
      ],
      { ...base, membershipStatus: membership.status }
    );

  if (membership.status === 401)
    return out(
      'foreign-auth-project',
      'Firestore gönderdiğin kimlik token’ını kabul etmedi (401).',
      [
        'Uygulama açıkken Admin → Ayarlar → Firebase Auth → “Oturumu kapat”, sonra yeniden giriş yap.',
        'Hâlâ sürüyorsa anahtar başka bir projeye ait: “eski anahtarı kaldır” satırını kullan.',
      ],
      { ...base, membershipStatus: 401 }
    );

  if (membership.status === 403) {
    if (lockdown === 'on')
      return out(
        'lockdown-no-admin',
        'Üyelik kilidi (meta/membership_lockdown) AÇIK: panel işlemleri yalnız yönetici token’ıyla çalışır.',
        [
          'Kendi kaydın için: e-posta + parola ile GİRİŞ yap, sonra tekrar dene (kendi belgeni okuyabilirsin).',
          'Liste/panel için: Console → Firestore → meta/admins belgesine e-postanı ekle.',
          'Kilidi kapatmak = meta/membership_lockdown belgesini silmek (kuralı yeniden yayınlamaya gerek yok).',
        ],
        { ...base, membershipStatus: 403 }
      );
    return out(
      'rules-outdated',
      `İçerik okunuyor ama ${membershipsPath} okunamıyor: yayındaki kurallar ESKİ (üyelik bloğu yok ya da yol öneki farklı).`,
      [
        'Admin → Ayarlar → “Kuralları kopyala” → Console → Firestore → Rules → yapıştır → Publish.',
        `Yol öneki: ${target.root ? `legacy (${target.root})` : '(kök)'} — firestore.rules iki düzeni de içeriyor.`,
      ],
      { ...base, membershipStatus: 403 }
    );
  }

  if (membership.status === 'network')
    return out(
      'offline',
      'Üyelik sorgusu ağ yüzünden tamamlanamadı.',
      ['Bağlantını kontrol edip tekrar dene.'],
      { ...base, membershipStatus: 'network' }
    );

  // Okuma serbest, yazma reddediliyor → ya belge biçimi ya da create/update kuralı.
  return out(
    'shape-rejected',
    'Okuma açık; yazma reddediliyor. Geneli ya belge alanları kuralın beklediği biçimde değil ya da kilit/yönetici ayarı yazmayı kesiyor.',
    [
      'E-posta + parolanla GİRİŞ yap (kendi belgeni yazma hakkın token ile gelir), sonra tekrar dene.',
      'Sorun sürerse Admin → Ayarlar → “Kuralları kopyala” ile firestore.rules’ı bir kez daha yayınla.',
      'Console → Firestore → Rules’ta `memberships` bloğunun ve `match /${document=**} { allow read, write: if false; }` satırının olduğundan emin ol.',
    ],
    { ...base, membershipStatus: membership.status }
  );
}
