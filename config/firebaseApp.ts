/**
 * Depoya gömülü Firebase Web SDK yapılandırması.
 *
 * AMAÇ: kullanıcıdan asla API anahtarı istememek. Anahtar bir kez buraya
 * yazılır ve commit'lenir; uygulama `.env.local` olmadan, panelde bir yere
 * yapıştırma gerektirmeden Firebase Auth + Firestore'u otomatik kullanır.
 *
 * Nereden alınır: Firebase Console → Project settings → General → Your apps →
 * Web app → SDK config → `apiKey` (+ `appId`).
 *
 * Güvenlik notu: Firebase *web* API anahtarları gizli değildir — pakete gömülür
 * ve istemcide görünür (public key). Veriyi koruyan şey anahtar değil,
 * `firestore.rules` güvenlik kurallarıdır (bkz. firestore.rules, `npm run
 * deploy:rules`). Servis hesabı JSON'ını / OAuth token'ını ASLA buraya veya
 * `.env.local` dosyasına commit'leme.
 *
 * Çözümleme sırası (lib/authClient.ts → resolveAuthConfig):
 *   1) cihazda kayıtlı anahtar (eski kurulumlardan kalan; panele gerek yok)
 *   2) `.env.local` → EXPO_PUBLIC_FIREBASE_API_KEY (geliştirici için, opsiyonel)
 *   3) BU DOSYA  ← normal kullanım
 *
 * Anahtarı güncellemek tek satırlık iştir: aşağıdaki `apiKey` değerini yaz,
 * commit'le, `npx expo start --clear`. Uygulama içinde hiçbir şey girilmez.
 */

export interface FirebaseWebConfig {
  /** Console → SDK config → apiKey. Boş bırakılırsa auth kapalı kalır (yerel PBKDF2 modu). */
  apiKey: string;
  /** Boş bırakılırsa Firestore hedefinin proje kimliği kullanılır (lib/firebaseConfig.ts). */
  projectId: string;
  /** Boş bırakılırsa `<projectId>.firebaseapp.com` türetilir. */
  authDomain: string;
  /** Opsiyonel; yalnız Crashlytics/Analytics için gerekir. */
  appId: string;
}

/**
 * DEĞERLENDİRME NOTU: `apiKey` boşken uygulama çalışmaya devam eder —
 * üyelikler cihazda hash'lenen yerel modla yürür. Anahtar yazıldığı anda
 * Firebase Auth kendiliğinden devreye girer; kullanıcıya hiçbir şey sorulmaz.
 */
export const FIREBASE_WEB_CONFIG: FirebaseWebConfig = {
  apiKey: '',
  projectId: 'kpssasistani-01',
  authDomain: '',
  appId: '',
};

/** Depoda gerçek bir anahtar var mı? (panel/uyarı metinleri bunu kullanır.) */
export function hasRepoApiKey(): boolean {
  return String(FIREBASE_WEB_CONFIG.apiKey || '').trim().length > 0;
}
