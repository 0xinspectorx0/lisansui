import { AppState } from 'react-native';
import { RealtimeClient } from '@supabase/realtime-js';
import { cloudTarget, isCloudConfigured } from './supabaseConfig';

/** Realtime is an invalidation signal only; content is always re-read via the RPC. */
export function watchContentUpdates(refresh: () => void): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    if (!active) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { if (active) refresh(); }, 150);
  };
  const poll = setInterval(notify, 30_000);
  const app = AppState.addEventListener('change', state => {
    if (state === 'active') notify();
  });
  const online = () => notify();
  if (typeof window !== 'undefined') window.addEventListener('online', online);

  const target = cloudTarget();
  let client: RealtimeClient | undefined;
  if (isCloudConfigured(target)) {
    try {
      const endpoint = `${target.url.replace(/\/$/, '').replace(/^http/, 'ws')}/realtime/v1`;
      client = new RealtimeClient(endpoint, {
        params: { apikey: target.anonKey },
        accessToken: async () => target.anonKey,
      });
      client.channel('content-updates')
        .on('postgres_changes', { event: '*', schema: target.schema, table: 'topics' }, notify)
        .on('postgres_changes', { event: '*', schema: target.schema, table: 'tips' }, notify)
        .subscribe(status => { if (status === 'SUBSCRIBED') notify(); });
    } catch {
      // Polling and foreground refresh remain available when Realtime is blocked.
    }
  }
  return () => {
    active = false;
    clearInterval(poll);
    if (timer) clearTimeout(timer);
    app.remove();
    if (typeof window !== 'undefined') window.removeEventListener('online', online);
    if (client) void client.disconnect();
  };
}
