const navigate = (...args) => (globalThis.__UI_NAV__ || (globalThis.__UI_NAV__ = [])).push(args);
export const useNavigation = () => ({ navigate, goBack: () => {}, setOptions: () => {} });
export const useRoute = () => ({ params: globalThis.__UI_ROUTE__ || {}, key: 'route' });
export const useFocusEffect = () => {};
