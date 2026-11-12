/**
 * Firestore hedefi (proje / veritabanı / yol öneki) — tek karar noktası.
 *
 * Öncelik sırası:
 *   1. Derleme zamanı ortam değişkenleri
 *      EXPO_PUBLIC_FIRESTORE_PROJECT, EXPO_PUBLIC_FIRESTORE_DATABASE,
 *      EXPO_PUBLIC_FIRESTORE_ROOT
 *   2. app.json → expo.extra.firestore { projectId, databaseId, root }
 *   3. Bu depodaki varsayılanlar (kpss-asistani projesi, legacy yol düzeni)
 *
 * Yeni/sıfırdan bir projede koleksiyonları köke açmak istersen
 * `root` değerini boş string bırak: `courses/...`, `daily_tips/...`,
 * `memberships/...` doğrudan veritabanının kökünde aranır.
 */

export interface FirestoreTarget {
  projectId: string;
  databaseId: string;
  /** Veritabanı içi yol öneki; '' = koleksiyonlar kökte. */
  root: string;
  /** Bu ayarın nereden geldiği (panelde gösterilir). */
  source: 'env' | 'app.json' | 'default';
}

/** Bu deponun geliştirildiği mevcut kurulum. */
export const DEFAULT_TARGET: Omit<FirestoreTarget, 'source'> = {
  projectId: 'kpss-asistani',
  databaseId: '(default)',
  root: 'artifacts/kpss-asistani/public/data',
};

function clean(v: string | undefined | null): string {
  return String(v ?? '').trim().replace(/^\/+|\/+$/g, '');
}

/**
 * `root` için özel değerler: koleksiyonları veritabanının KÖKÜNDE aramak.
 * Boş string yanında '.', './', '/', 'root', '(root)', 'kök', 'none' de kabul
 * edilir — `.env` dosyalarında boş değerin kaybolması riskine karşı.
 */
const ROOT_SENTINELS = new Set(['', '.', './', '/', 'root', '(root)', 'kök', 'kok', 'none']);

function normalizeRoot(v: string | undefined | null): string {
  const value = String(v ?? '').trim();
  if (ROOT_SENTINELS.has(value.toLocaleLowerCase('en-US'))) return '';
  return clean(value);
}

/**
 * Ortam değişkenleri LİTERAL olarak okunur (`process.env.EXPO_PUBLIC_X`).
 * Expo/Metro yalnızca yazılı üye ifadelerini derleme zamanında gömer; dolaylı
 * erişim (env[name]) native derlemede boş döner. Bu yüzden burada asla
 * yardımcı bir `env[name]` sarmalayıcısı kullanma.
 */
function envRaw(name: 'EXPO_PUBLIC_FIRESTORE_PROJECT' | 'EXPO_PUBLIC_FIRESTORE_DATABASE' | 'EXPO_PUBLIC_FIRESTORE_ROOT' | 'EXPO_PUBLIC_FIRESTORE_HOST'): string | undefined {
  try {
    switch (name) {
      case 'EXPO_PUBLIC_FIRESTORE_PROJECT':
        return process.env.EXPO_PUBLIC_FIRESTORE_PROJECT;
      case 'EXPO_PUBLIC_FIRESTORE_DATABASE':
        return process.env.EXPO_PUBLIC_FIRESTORE_DATABASE;
      case 'EXPO_PUBLIC_FIRESTORE_ROOT':
        return process.env.EXPO_PUBLIC_FIRESTORE_ROOT;
      default:
        return process.env.EXPO_PUBLIC_FIRESTORE_HOST;
    }
  } catch {
    return undefined;
  }
}

/** REST kökü. Yerel emulator için: EXPO_PUBLIC_FIRESTORE_HOST=http://localhost:8080/v1 */
export const FIRESTORE_API_HOST =
  clean(envRaw('EXPO_PUBLIC_FIRESTORE_HOST')) || 'https://firestore.googleapis.com/v1';

function fromEnv(): Partial<FirestoreTarget> | null {
  const projectId = clean(envRaw('EXPO_PUBLIC_FIRESTORE_PROJECT'));
  const databaseId = clean(envRaw('EXPO_PUBLIC_FIRESTORE_DATABASE'));
  const root = envRaw('EXPO_PUBLIC_FIRESTORE_ROOT');
  if (!projectId && !databaseId && root === undefined) return null;
  return {
    ...(projectId ? { projectId } : {}),
    ...(databaseId ? { databaseId } : {}),
    ...(root !== undefined ? { root: normalizeRoot(root) } : {}),
  };
}

function fromAppJson(): Partial<FirestoreTarget> | null {
  try {
    // expo-constants web/native her yerde aynı şekli verir; test ortamında
    // modül çözümlenemeyebilir → sessizce varsayılana düşeriz.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants');
    const mod: any = (Constants as any)?.default ?? Constants;
    const extra: any =
      mod?.expoConfig?.extra ??
      mod?.manifest2?.extra ??
      mod?.manifest?.extra ??
      {};
    const cfg = extra?.firestore || extra?.eas?.firestore;
    if (!cfg) return null;
    const out: Partial<FirestoreTarget> = {};
    if (cfg.projectId) out.projectId = clean(cfg.projectId);
    if (cfg.databaseId) out.databaseId = clean(cfg.databaseId);
    if (typeof cfg.root === 'string') out.root = normalizeRoot(cfg.root);
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

let cached: FirestoreTarget | null = null;

/** Çözümlenmiş hedef. Sonuç modül ömrü boyunca sabittir (build-time config). */
export function firestoreTarget(): FirestoreTarget {
  if (cached) return cached;
  const env = fromEnv();
  const json = fromAppJson();
  const merged = { ...DEFAULT_TARGET, ...(json || {}), ...(env || {}) };
  cached = {
    projectId: merged.projectId,
    databaseId: merged.databaseId || '(default)',
    root: normalizeRoot(merged.root),
    source: env ? 'env' : json ? 'app.json' : 'default',
  };
  return cached;
}

/** `https://firestore.googleapis.com/v1/projects/{p}/databases/{db}/documents` */
export function documentsBase(target: FirestoreTarget = firestoreTarget()): string {
  return `${FIRESTORE_API_HOST}/projects/${target.projectId}/databases/${target.databaseId}/documents`;
}

/** Veritabanı kökü + `root` öneki — içerik okumalarının temeli. */
export function contentBase(target: FirestoreTarget = firestoreTarget()): string {
  const base = documentsBase(target);
  return target.root ? `${base}/${target.root}` : base;
}

/** Tam koleksiyon yolu (root öneki dahil). */
export function collectionPath(
  name: string,
  target: FirestoreTarget = firestoreTarget()
): string {
  return target.root ? `${target.root}/${name}` : name;
}

/** Üyelik koleksiyonu: `memberships/{e-posta}`. */
export const MEMBERSHIPS_COLLECTION_NAME = 'memberships';

/** Panelde gösterilecek tek satırlık özet. */
export function describeTarget(target: FirestoreTarget = firestoreTarget()): string {
  return `${target.projectId} • db:${target.databaseId} • ${target.root || '(kök)'}`;
}

/** Config'i değiştirmeden kontrol listesi için gereken REST örnek URL'leri. */
export function probeUrls(target: FirestoreTarget = firestoreTarget()) {
  const base = documentsBase(target);
  const root = target.root ? `${base}/${target.root}` : base;
  return {
    memberships: `${root}/memberships?pageSize=10`,
    tips: `${root}/daily_tips/main`,
    topics: (courseId: string) => `${root}/courses/${courseId}/topics?pageSize=100`,
  };
}

/** Test/hatalı kurulum senaryoları için cache'i sıfırlar. */
export function __resetFirestoreTargetCache(): void {
  cached = null;
}
