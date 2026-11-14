/** expo-secure-store yerine geçen SSR shim'i — node'da native modül yok. */
const mem = new Map();
export const getItemAsync = async k => (mem.has(k) ? mem.get(k) : null);
export const setItemAsync = async (k, v) => void mem.set(k, String(v));
export const deleteItemAsync = async k => void mem.delete(k);
export default { getItemAsync, setItemAsync, deleteItemAsync };
