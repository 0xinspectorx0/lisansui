/**
 * `firestore.rules` içindeki `memberShapeOk` + `memberCreateOk` yardımcılarının
 * TypeScript aynası — memberships belgesinin **kabul edilen** tek biçimi.
 *
 * Neden gerekli: kural reddi (`403 Missing or insufficient permissions`) hangi
 * alanın yüzünden olduğunu SÖYLEMEZ. İstemci bu aynayı yazmadan hemen önce
 * çalıştırınca iki şey kazanılır:
 *
 *   1. `coerceMemberFields` — kuralın tolere edebileceği sapmalar (boş/eksik
 *      şifre demeti, 80 karakteri aşan ad, `x.y` tarih biçimi, 12'den çok
 *      kullanım girdisi, ondalık sayaç) **sessizce düzeltilir** → yazma reddi
 *      hiç oluşmaz. `fill: true` (create) eksik zorunlu alanları da tamamlar;
 *      `fill: false` (PATCH) yalnızca gönderilen alanlara dokunur.
 *   2. `checkMemberFields` — düzeltilemeyen bir şey kaldıysa kullanıcı
 *      "kural engelledi" değil, `alan: sebep` cümlesini görür.
 *
 * Sabitler `firestore.rules` dosyasından `npm run test:auth` ile denetlenir
 * (scripts/auth-contract.test.mjs §16): listelerden biri elle değişirse test
 * patlar, böylece kural ile istemci asla ayrılmaz.
 */

export type FbValue = any;

const VALUE_KINDS = [
  'stringValue',
  'integerValue',
  'doubleValue',
  'booleanValue',
  'nullValue',
  'mapValue',
  'arrayValue',
] as const;

/* --------------------------- kural sabitleri (firestore.rules ile senkron) */

/** `memberShapeOk` → `data.keys().hasAll([...])` */
export const MEMBER_REQUIRED_KEYS = [
  'id',
  'email',
  'emailNormalized',
  'displayName',
  'verifier',
  'salt',
  'iterations',
  'algo',
  'role',
  'status',
  'vip',
  'vipPlan',
  'vipExpiresAt',
  'createdAt',
  'lastLoginAt',
  'city',
  'exam',
  'note',
  'testsCompleted',
  'questionsSolved',
  'netSum',
  'courseUsage',
  'schemaVersion',
] as const;

/** `isEmail(value)` regular expression'ı. */
export const MEMBER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
/** `isVerifier` / `isSalt`. */
export const MEMBER_VERIFIER_RE = /^[0-9a-f]{64}$/;
export const MEMBER_SALT_RE = /^[0-9a-f]{32}$/;
/** `isDateLike`: boş string serbest (süresiz), yyyy-mm-dd veya ISO zaman damgası. */
export const MEMBER_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9:.]+Z?)?$/;

/** `data.role in [...]` (üye olurken `memberCreateOk` yalnız ilki ikisini kabul eder). */
export const MEMBER_ROLES = ['user', 'editor', 'admin', 'owner'];
export const MEMBER_CREATE_ROLES = ['user', 'editor'];
export const MEMBER_STATUSES = ['active', 'pending', 'suspended', 'banned'];
export const MEMBER_CREATE_STATUSES = ['active', 'pending'];
export const MEMBER_PLANS = ['free', 'monthly', 'yearly', 'lifetime'];

/** `data.<alan> is string && size() <= n` sınırları. */
export const MEMBER_STRING_LIMITS: Record<string, number> = {
  displayName: 80,
  city: 60,
  exam: 80,
  note: 400,
};

/** `isCounter` / `netSum` / `courseUsage` sınırları. */
export const MEMBER_COUNTER_MAX = 1000000;
export const MEMBER_NETSUM_MIN = -100000;
export const MEMBER_USAGE_MAX_ENTRIES = 12;
export const MEMBER_USAGE_MAX_VALUE = 999;
export const MEMBER_ITERATIONS_MIN = 100;

/** Kuralın tanıdığı şifre alanları + `authUid` işareti. */
export const MEMBER_OPTIONAL_KEYS = ['authUid'] as const;

/* ----------------------------------------------- FbValue küçük yardımcıları */

const kindOf = (v: FbValue): string => {
  if (!v || typeof v !== 'object') return 'yok';
  for (const k of VALUE_KINDS) if (k in v) return k;
  return 'bilinmiyor';
};

const sVal = (v: FbValue): string | null =>
  typeof v?.stringValue === 'string' ? v.stringValue : null;
const iVal = (v: FbValue): number | null => {
  if (typeof v?.integerValue === 'string' || typeof v?.integerValue === 'number')
    return Number(v.integerValue);
  if (typeof v?.doubleValue === 'number') return v.doubleValue;
  return null;
};
/** Unicode kod noktası sayısı — kurallar `size()` ile bunu sayar. */
const sizeOf = (s: string): number => Array.from(s).length;
const take = (s: string, n: number): string => {
  const chars = Array.from(s);
  return chars.length <= n ? s : chars.slice(0, n).join('');
};
/** Firestore `String.lower()` karşılığı (ASCII güvenli, locale'den bağımsız). */
export const ruleLower = (s: string): string => s.toLowerCase();

const S = (v: string): FbValue => ({ stringValue: v });
/** `isDateLike`: boş string SERBEST (süresiz plan demek). */
const isDateLike = (v: string): boolean => v === '' || MEMBER_DATE_RE.test(v);
const I = (v: number): FbValue => ({ integerValue: String(Math.round(v)) });

/* ------------------------------------------------------------- denetim (check) */

export interface ShapeProblem {
  field: string;
  why: string;
}

const bad = (field: string, why: string): ShapeProblem => ({ field, why });

/**
 * Payload'ı kurala karşı denetler; **reddedilecek alanları** döner (boş dizi =
 * Firestore bu belgeyi kabul eder). `mode: 'create'` ile `memberCreateOk`
 * kısıtları da denetlenir.
 */
export function checkMemberFields(
  fields: Record<string, FbValue>,
  mode: 'create' | 'update' = 'create',
  memberId?: string
): ShapeProblem[] {
  const out: ShapeProblem[] = [];
  for (const key of MEMBER_REQUIRED_KEYS) {
    if (!(key in fields)) out.push(bad(key, 'kural bu alanın gönderilmesini zorunlu tutuyor'));
  }
  if (out.length) return out; // gerisi gürültü olurdu

  const email = sVal(fields.email);
  if (email === null) out.push(bad('email', 'metin olmalı'));
  else if (!MEMBER_EMAIL_RE.test(email)) out.push(bad('email', 'geçerli bir e-posta biçiminde değil'));
  else {
    if (sVal(fields.id) !== ruleLower(email))
      out.push(bad('id', 'belge kimliği e-postanın küçük harfli hali olmalı'));
    if (sVal(fields.emailNormalized) !== ruleLower(email))
      out.push(bad('emailNormalized', 'e-postanın küçük harfli hali olmalı'));
    // Kural: `memberId == request.resource.data.id` — yol ile alan aynı olmalı.
    if (memberId && sVal(fields.id) !== memberId)
      out.push(bad('id', `belge kimliği (${memberId}) ile “id” alanı uyuşmuyor`));
  }

  for (const [field, limit] of Object.entries(MEMBER_STRING_LIMITS)) {
    const v = fields[field];
    if (kindOf(v) !== 'stringValue') out.push(bad(field, 'metin olmalı'));
    else if (sizeOf(v.stringValue) > limit)
      out.push(bad(field, `en fazla ${limit} karakter olabilir`));
  }

  const algo = sVal(fields.algo) ?? '';
  const verifier = sVal(fields.verifier) ?? '';
  const salt = sVal(fields.salt) ?? '';
  const iterations = iVal(fields.iterations);
  if (algo === 'firebase-auth') {
    if (verifier !== '' || salt !== '' || iterations !== 0)
      out.push(
        bad(
          'verifier',
          'algo "firebase-auth" iken verifier/salt boş, iterations 0 olmalı (parola Firebase Auth’ta durur)'
        )
      );
  } else {
    if (!MEMBER_VERIFIER_RE.test(verifier)) out.push(bad('verifier', '64 haneli onaltılık olmalı'));
    if (!MEMBER_SALT_RE.test(salt)) out.push(bad('salt', '32 haneli onaltılık olmalı'));
    if (iterations === null || iterations < MEMBER_ITERATIONS_MIN)
      out.push(bad('iterations', `en az ${MEMBER_ITERATIONS_MIN} olmalı`));
    if (algo !== 'pbkdf2-sha256') out.push(bad('algo', 'yalnız "firebase-auth" ya da "pbkdf2-sha256"'));
  }

  const role = sVal(fields.role) ?? '';
  const status = sVal(fields.status) ?? '';
  const roleSet = mode === 'create' ? MEMBER_CREATE_ROLES : MEMBER_ROLES;
  const statusSet = mode === 'create' ? MEMBER_CREATE_STATUSES : MEMBER_STATUSES;
  if (!roleSet.includes(role))
    out.push(bad('role', mode === 'create' ? 'yeni üye yalnız “user” ya da “editor” olabilir' : 'bilinmeyen rol'));
  if (!statusSet.includes(status))
    out.push(
      bad('status', mode === 'create' ? 'yeni üye yalnız “active” ya da “pending” olabilir' : 'bilinmeyen durum')
    );

  if (kindOf(fields.vip) !== 'booleanValue') out.push(bad('vip', 'evet/hayır olmalı'));
  if (!MEMBER_PLANS.includes(sVal(fields.vipPlan) ?? ''))
    out.push(bad('vipPlan', `şunlardan biri olmalı: ${MEMBER_PLANS.join(', ')}`));

  for (const field of ['vipExpiresAt', 'createdAt', 'lastLoginAt']) {
    const v = sVal(fields[field]);
    if (v === null) out.push(bad(field, 'metin olmalı'));
    else if (!isDateLike(v))
      out.push(bad(field, 'yyyy-AA-GG ya da ISO tarih olmalı (boş string = süresiz)'));
  }

  for (const field of ['testsCompleted', 'questionsSolved']) {
    const v = iVal(fields[field]);
    if (v === null || v < 0 || v > MEMBER_COUNTER_MAX)
      out.push(bad(field, `0..${MEMBER_COUNTER_MAX} aralığında tam sayı olmalı`));
  }
  const net = iVal(fields.netSum);
  if (net === null || net < MEMBER_NETSUM_MIN)
    out.push(bad('netSum', `${MEMBER_NETSUM_MIN} değerinden küçük olmayan sayı olmalı`));

  const usage = fields.courseUsage?.mapValue?.fields;
  if (!usage || typeof usage !== 'object') out.push(bad('courseUsage', 'alan haritası olmalı'));
  else {
    const entries = Object.entries(usage);
    if (entries.length > MEMBER_USAGE_MAX_ENTRIES)
      out.push(bad('courseUsage', `en fazla ${MEMBER_USAGE_MAX_ENTRIES} ders kaydı tutulabilir`));
    for (const [k, v] of entries) {
      const n = iVal(v);
      if (n === null || n < 0 || n > MEMBER_USAGE_MAX_VALUE)
        out.push(bad(`courseUsage.${k}`, `0..${MEMBER_USAGE_MAX_VALUE} tam sayı olmalı`));
    }
  }

  if (iVal(fields.schemaVersion) !== 1) out.push(bad('schemaVersion', '1 olmalı'));

  if ('authUid' in fields) {
    const uid = sVal(fields.authUid) ?? '';
    if (uid.length < 8) out.push(bad('authUid', 'en az 8 karakter olmalı ya da alan hiç gönderilmemeli'));
  }
  return out;
}

/* ----------------------------------------------------------- düzeltme (coerce) */

/** Kuralın izin verdiği tipte metin; değilse `fallback`. */
function stringField(fields: Record<string, FbValue>, field: string, fallback = ''): FbValue {
  const v = sVal(fields[field]);
  if (v === null) {
    const alt = iVal(fields[field]);
    return S(alt === null ? fallback : String(alt));
  }
  return S(v);
}

/**
 * Yazmadan hemen önce payload'ı kuralın kabul edeceği hale getirir.
 * Kayıp veri yok: yalnızca Firestore'un zaten reddedeceği taşmalar kırpılıyor
 * ve boş/eksik yardımcı alanlar güvenli varsayılana çekiliyor.
 * @param memberId hedef belge kimliği (genelde normalize e-posta)
 */
export function coerceMemberFields(
  input: Record<string, FbValue>,
  opts: { memberId?: string; fill?: boolean } = {}
): Record<string, FbValue> {
  const f: Record<string, FbValue> = { ...input };
  const fill = opts.fill === true;
  /** PATCH gövdesinde olmayan alanı uydurmayız — Firestore onları elle tutar. */
  const touch = (k: string, v: FbValue) => {
    if (fill || k in f) f[k] = v;
  };
  const read = (k: string, d = '') => sVal(f[k]) ?? d;

  // 1) e-posta → id/emailNormalized tutarlılığı (kural: id == email.lower()).
  //    Belge kimliği yoldan gelir: `opts.memberId` verilmişse ONA uyulur, aksi halde
  //    e-postanın küçük harfli hali kullanılır. Uyuşmazlık `checkMemberFields`'te
  //    sessizce yamanmaz — kullanıcı hangi alanın neden reddedildiğini görür.
  const emailKey = ruleLower((read('email') || String(opts.memberId || '')).trim());
  const idValue = String(opts.memberId || emailKey);
  // Kural `data.id == data.email.lower()` + `emailNormalized == email.lower()`
  // diyor: e-postayı küçültülmüş haliyle yazmak tek tutarlı seçenek.
  touch('id', S(idValue));
  touch('email', S(emailKey));
  touch('emailNormalized', S(emailKey));

  // 2) string sınırları
  for (const [field, limit] of Object.entries(MEMBER_STRING_LIMITS)) {
    const v = stringField(f, field, '');
    touch(field, S(take(v.stringValue, limit)));
  }

  // 3) şifre demeti: boş/eksik üçlü = parola Firebase Auth’ta demektir
  const verifier = read('verifier');
  const salt = read('salt');
  const iterations = iVal(f.iterations) ?? 0;
  const algoRaw = read('algo');
  const tripleEmpty = verifier === '' && salt === '' && iterations === 0;
  if (algoRaw === 'firebase-auth' || tripleEmpty) {
    touch('verifier', S(''));
    touch('salt', S(''));
    touch('iterations', I(0));
    touch('algo', S('firebase-auth'));
  } else if (!MEMBER_VERIFIER_RE.test(verifier) || !MEMBER_SALT_RE.test(salt) || iterations < MEMBER_ITERATIONS_MIN) {
    // Bozuk pbkdf2 demeti (ör. eski sürüm verisi): Firestore bunu zaten reddeder.
    // Bulutta parolayı bırak, yerel doğrulama çalışmaya devam etsin.
    touch('verifier', S(''));
    touch('salt', S(''));
    touch('iterations', I(0));
    touch('algo', S('firebase-auth'));
  } else {
    touch('verifier', S(verifier));
    touch('salt', S(salt));
    touch('iterations', I(iterations));
    touch('algo', S('pbkdf2-sha256'));
  }

  // 4) enum'lar
  touch('role', S(MEMBER_ROLES.includes(read('role')) ? read('role') : 'user'));
  touch('status', S(MEMBER_STATUSES.includes(read('status')) ? read('status') : 'pending'));
  touch('vip', { booleanValue: f.vip?.booleanValue === true });
  touch('vipPlan', S(MEMBER_PLANS.includes(read('vipPlan')) ? read('vipPlan') : 'free'));

  // 5) tarihler
  for (const field of ['vipExpiresAt', 'createdAt', 'lastLoginAt']) {
    const v = read(field);
    if (isDateLike(v)) touch(field, S(v));
    else if (field === 'vipExpiresAt') touch(field, S(''));
    else touch(field, S(new Date().toISOString()));
  }

  // 6) sayaçlar
  const clampInt = (v: number | null, lo: number, hi: number) =>
    v === null || !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, Math.round(v)));
  touch('testsCompleted', I(clampInt(iVal(f.testsCompleted), 0, MEMBER_COUNTER_MAX)));
  touch('questionsSolved', I(clampInt(iVal(f.questionsSolved), 0, MEMBER_COUNTER_MAX)));
  const net = iVal(f.netSum);
  const netFixed =
    net === null || !Number.isFinite(net)
      ? 0
      : Math.min(MEMBER_COUNTER_MAX, Math.max(MEMBER_NETSUM_MIN, Math.round(net * 10) / 10));
  // Kural `is number` diyor: ondalık net'i doubleValue olarak koru (integerValue yuvarlardı).
  touch('netSum', Number.isInteger(netFixed) ? I(netFixed) : { doubleValue: netFixed });

  // 7) kullanım haritası: en fazla 12 ders, değerler 0..999
  const usageIn = f.courseUsage?.mapValue?.fields;
  const entries: [string, FbValue][] = Object.entries(usageIn || {}).filter(
    ([, v]) => iVal(v) !== null
  );
  const kept = entries.slice(-MEMBER_USAGE_MAX_ENTRIES).map(([k, v]) => [
    take(k, 80),
    I(clampInt(iVal(v), 0, MEMBER_USAGE_MAX_VALUE) as number),
  ] as [string, FbValue]);
  if (fill || 'courseUsage' in f) f.courseUsage = { mapValue: { fields: Object.fromEntries(kept) } };

  // 8) şema sürümü + opsiyonel authUid
  touch('schemaVersion', I(1));
  if ('authUid' in f) {
    const uid = read('authUid');
    if (uid.length >= 8) f.authUid = S(uid);
    else delete f.authUid;
  }

  // 9) create: zorunlu ama hiç gönderilmemiş alanlar güvenli varsayılanla tamamlanır
  //    (kısmi PATCH'te bunlar uydurulmaz — Firestore'da zaten duruyorlar).
  if (fill) {
    for (const key of MEMBER_REQUIRED_KEYS) {
      if (key in f) continue;
      f[key] = key === 'courseUsage' ? { mapValue: { fields: {} } } : S('');
    }
    f.email = S(emailKey);
    f.emailNormalized = S(emailKey);
    f.id = S(idValue);
  }
  return f;
}

/** Panel/kullanıcı için tek satırlık açıklama. */
export function shapeProblemText(problems: ShapeProblem[]): string {
  return problems.map(p => `${p.field}: ${p.why}`).join(' • ');
}
