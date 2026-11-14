# Admin paneli SSR duman testi shims'leri

`npm run test:ui` ekranları node'da `react-dom/server` ile render eder. Bu klasördeki
dosyalar yalnızca o test içindir ve uygulamada kullanılmaz:

| shim | neden |
| --- | --- |
| `rn.js` | `react-native` → `react-native-web` (Modal SSR'da satır içine basılıyor, onay içeriği okunabiliyor) |
| `icons.js` | `@expo/vector-icons/Ionicons` → `data-icon` yazan `<i>` (font yok) |
| `safe-area.js` | `SafeAreaView` / `useSafeAreaInsets` |
| `navigation.js` | `useNavigation` / `useRoute` — `globalThis.__UI_ROUTE__` ile param verilir |
| `async-storage.js` | bellek içi AsyncStorage (ağ/ekosistem yok) |
| `admin-context.js` | `useAdmin()` — sabit 5 soruluk konu + çağıran kaydedici mutasyonlar |
| `admin-gate.js` | PIN kapısı açılır (çocuklar render edilir) |
| `plain.js` | iç içe Proxy stub — Ayarlar ekranının bağladığı onlarca alan (`settings.*`, `planCopy()`, `readAdminList()` …) undefined'a çarpmadan render edilir |
| `secure-store.js` | `expo-secure-store` yerine bellek içi depolama (node'da native modül yok) |

[5] bölümü `screens/AdminSettingsScreen.tsx` için gölge üretirken stub modülleri
`TMP/stubs/` içinde otomatik yazıyor: ekranda import edilen her isim `plain.js`
(veya `use*` ise `neutralHook`) export'una bağlanıyor. Amaç: panelde anahtar
giriş alanı kalmadığını, kaynak satırının (`config/supabaseApp.ts`) doğru
görüntülendiğini gerçek render üzerinden kanıtlamak.
