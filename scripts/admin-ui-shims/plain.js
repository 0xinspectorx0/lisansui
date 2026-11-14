/**
 * SSR duman testi shim'i — bağlam hook'larını ("useApp()", "useMembership()" …)
 * nötr ama "her şeyi bilen" bir değere sabitler.
 *
 * Ekranlar `settings.membership.enabled`, `gov.emails.join(', ')`, `plan?.skip`
 * gibi onlarca alana dokunuyor; tek tek sahte nesne yazmak yerine iç içe Proxy
 * kullanıyoruz: hangi alana erişilirse erişilsin undefined'a çarpmıyor, JSX'e
 * sızdığında da çökme yerine boşluk üretiyor.
 *
 * Yalnızca `npm run test:ui` kullanır; uygulama kodu bu modülü import etmez.
 */

const EMPTY_TEXT = () => '';
const EMPTY_LIST = () => [];

/** Ekranda "yükleniyor/yoğun" gösteren bayraklar — kapalı kalmalı. */
const FALSE_FLAGS = new Set([
  'busy',
  'loading',
  'pending',
  'saving',
  'running',
  'disabled',
  'locked',
  'visible',
  'open',
  'expanded',
  'selectMode',
  'error',
]);
/** Yapısal olarak true olmasa döngü/uyarı metni kaybolan bayraklar. */
const TRUE_FLAGS = new Set(['enabled', 'ok', 'ready', 'success', 'configured', 'found']);
/** Dizi döndürmesi gereken dizi metotları. */
const LIST_METHODS = new Set(['map', 'filter', 'slice', 'split', 'flat', 'concat', 'match', 'keys', 'values', 'entries']);
/** Metin döndürmesi gereken string metotları. */
const TEXT_METHODS = new Set(['join', 'trim', 'replace', 'replaceAll', 'toLowerCase', 'toUpperCase', 'charAt', 'toString', 'valueOf']);
/** Yok sayılan (çağrısı hiçbir şey yapmayan) metotlar. */
const NOOP_METHODS = new Set(['forEach', 'push', 'pop', 'set', 'delete', 'clear', 'add', 'sort', 'reverse']);

const make = (callable = false) => {
  const target = callable ? () => make(true) : {};
  return new Proxy(target, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return EMPTY_TEXT;
      if (prop === Symbol.iterator) return () => [][Symbol.iterator]();
      if (prop === Symbol.toStringTag) return 'UIStub';
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'length' || prop === 'size') return 0;
      if (LIST_METHODS.has(prop)) return EMPTY_LIST;
      if (TEXT_METHODS.has(prop)) return EMPTY_TEXT;
      if (NOOP_METHODS.has(prop)) return () => undefined;
      if (prop === 'includes' || prop === 'startsWith' || prop === 'endsWith') return () => false;
      if (prop === 'indexOf' || prop === 'findIndex') return () => -1;
      if (prop === 'find' || prop === 'some' || prop === 'every') return () => undefined;
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      // Çağrılabilir stub JSX çocuğu olarak kullanılırsa React
      // “Functions are not valid as a React child” diye bağırır. Sahte bir
      // react.element kimliği verince React onu boş <span> sayar: uyarı yok,
      // çağrılabilirlik de korunuyor (`admin.exportJson()` çalışmaya devam eder).
      if (callable && prop === '$$typeof') return Symbol.for('react.element');
      if (callable && prop === 'type') return 'span';
      if (callable && prop === 'props') return { children: '' };
      if (callable && (prop === 'key' || prop === 'ref')) return null;
      if (FALSE_FLAGS.has(prop)) return false;
      if (TRUE_FLAGS.has(prop)) return true;
      if (prop === 'toString') return EMPTY_TEXT;
      return make(callable);
    },
    apply: () => make(callable),
    construct: () => make(callable),
    has: () => true,
  });
};

/**
 * Nesne gibi davranan stub (JSX çocuklarına güvenle basılabilir — `typeof`
 * 'function' olsaydı React "Functions are not valid as a React child" derdi).
 */
export const plain = make(false);

/** Çağrılan şeyler için: aynı stub, ama fonksiyon hedefli. */
export const callable = make(true);

/** Hook gibi kullanılan stub: `const { settings } = useApp();` */
export const neutralHook = () => make(true);
