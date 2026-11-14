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
  /** Opsiyonel; Firebase SDK kuran derlemeler / Analytics ister. REST akışımız kullanmıyor. */
  appId: string;
  /** Bilgi amaçlı: Console bloğundaki diğer public değerler (uygulama şu an kullanmıyor). */
  storageBucket?: string;
  messagingSenderId?: string;
}

/**
 * kpssasistani-01 — Console → Project settings → General → Your apps → Web app.
 * Bu değerlerin tamamı PUBLIC web SDK yapılandırmasıdır (istemci paketine gömülür);
 * veriyi koruyan şey `firestore.rules` kurallarıdır.
 */
export const FIREBASE_WEB_CONFIG: FirebaseWebConfig = {
  apiKey: 'AIzaSyC7QaaTqOZm4fn-l_-uk4Uv4z5BKFTLikA',
  projectId: 'kpssasistani-01',
  authDomain: 'kpssasistani-01.firebaseapp.com',
  appId: '1:674719983447:web:04aaeee6fb7ab9cfd48012',
  storageBucket: 'kpssasistani-01.firebasestorage.app',
  messagingSenderId: '674719983447',
};

/** Depoda gerçek bir anahtar var mı? (panel/uyarı metinleri bunu kullanır.) */
export function hasRepoApiKey(): boolean {
  return String(FIREBASE_WEB_CONFIG.apiKey || '').trim().length > 0;
}
