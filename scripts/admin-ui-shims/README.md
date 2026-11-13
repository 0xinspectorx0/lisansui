# Admin paneli SSR duman testi shims'leri

`npm run test:ui` ekranları node'da `react-dom/server` ile render eder. Bu klasördeki
dosyalar yalnızca o test içindir ve uygulamada kullanılmaz:

| shim | neden |
| --- | --- |
| `rn.js` | `react-native` → `react-native-web` (Modal SSR'da satır içine basılıyor, onay içeriği okunabiliyor) |
| `icons.js` | `@expo/vector-icons/Ionicons` → `data-icon` yazan `<i>` (font yok) |
| `safe-area.js` | `SafeAreaView` / `useSafeAreaInsets` |
| `navigation.js` | `useNavigation` / `useRoute` — `globalThis.__UI_ROUTE__` ile param verilir |
| `async-storage.js` | bellek içi AsyncStorage (firebase/ekosistem yok) |
| `admin-context.js` | `useAdmin()` — sabit 5 soruluk konu + çağıran kaydedici mutasyonlar |
| `admin-gate.js` | PIN kapısı açılır (çocuklar render edilir) |
