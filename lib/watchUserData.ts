import { AppState } from 'react-native';
import { RealtimeClient } from '@supabase/realtime-js';
import { cloudTarget, isCloudConfigured } from './supabaseConfig';
import { currentAccessToken } from './authClient';
import type { MemberBinding } from './userDataSync';

/** Changes are invalidation signals; authorized REST/RPC reads remain the source. */
export function watchUserData(binding: MemberBinding, refresh: () => void): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    if (!active) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { if (active) refresh(); }, 100);
  };
  const app = AppState.addEventListener('change', s => { if (s === 'active') notify(); });
  if (typeof window !== 'undefined') window.addEventListener('online', notify);
  const target = cloudTarget();
  let client: RealtimeClient | undefined;
  if (binding.userId && isCloudConfigured(target)) {
    try {
      client = new RealtimeClient(`${target.url.replace(/\/$/, '').replace(/^http/, 'ws')}/realtime/v1`, {
        params: { apikey: target.anonKey },
        accessToken: async () => (await currentAccessToken()) || target.anonKey,
      });
      const filter = `userId=eq.${binding.userId}`;
      client.channel('personal-data')
        .on('postgres_changes', { event: '*', schema: target.schema, table: 'user_data', filter }, notify)
        .on('postgres_changes', { event: '*', schema: target.schema, table: 'user_tests', filter }, notify)
        .subscribe(s => { if (s === 'SUBSCRIBED') notify(); });
    } catch { /* foreground/reconnect refresh remains available */ }
  }
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
    app.remove();
    if (typeof window !== 'undefined') window.removeEventListener('online', notify);
    if (client) void client.disconnect();
  };
}
