import type { MemberBinding } from './userDataSync';

/** One readiness barrier per authenticated identity; never reuse a prior account. */
let generation = 0;
let state: { identity: string; result: boolean | null; generation: number } | null = null;
const listeners = new Set<() => void>();
const identityOf = (b: MemberBinding) => `${b.email.toLowerCase()}\n${b.userId || ''}`;

export function beginPersonalLoad(binding: MemberBinding | null): void {
  generation++;
  state = binding ? { identity: identityOf(binding), result: null, generation } : null;
  listeners.forEach(fn => fn());
}

export function finishPersonalLoad(binding: MemberBinding, ok: boolean): void {
  if (!state || state.identity !== identityOf(binding) || state.result !== null) return;
  state = { ...state, result: ok };
  listeners.forEach(fn => fn());
}

/** Resolves false on failure, account switch or timeout; never claims cached data is cloud data. */
export function waitForPersonalLoad(binding: MemberBinding, timeoutMs = 12000): Promise<boolean> {
  const current = state;
  if (!current || current.identity !== identityOf(binding)) return Promise.resolve(false);
  if (current.result !== null) return Promise.resolve(current.result);
  return new Promise(resolve => {
    const cleanup = () => { clearTimeout(timer); listeners.delete(check); };
    const check = () => {
      if (!state || state.generation !== current.generation) { cleanup(); resolve(false); }
      else if (state.result !== null) { const result = state.result; cleanup(); resolve(result); }
    };
    const timer = setTimeout(() => { cleanup(); resolve(false); }, timeoutMs);
    listeners.add(check);
    check();
  });
}

const reloadListeners = new Set<(binding: MemberBinding) => void>();
export function subscribePersonalReload(listener: (binding: MemberBinding) => void): () => void {
  reloadListeners.add(listener);
  return () => reloadListeners.delete(listener);
}
export function requestPersonalReload(binding: MemberBinding): void {
  beginPersonalLoad(binding);
  reloadListeners.forEach(fn => fn(binding));
}
