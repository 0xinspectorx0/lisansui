const mem: Map<string, string> =
  (globalThis as any).__store ?? ((globalThis as any).__store = new Map<string, string>());
export default {
  getItem: async (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: async (k: string, v: string) => void mem.set(k, v),
  removeItem: async (k: string) => void mem.delete(k),
};
