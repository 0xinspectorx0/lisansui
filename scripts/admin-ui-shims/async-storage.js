const mem = new Map();
const AsyncStorage = {
  getItem: async k => (mem.has(k) ? mem.get(k) : null),
  setItem: async (k, v) => void mem.set(k, String(v)),
  removeItem: async k => void mem.delete(k),
  clear: async () => mem.clear(),
  multiGet: async ks => ks.map(k => [k, mem.get(k) ?? null]),
  multiSet: async pairs => void pairs.forEach(([k, v]) => mem.set(k, String(v))),
};
export default AsyncStorage;
export { AsyncStorage };
