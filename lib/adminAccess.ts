import * as auth from './authClient';
import { restFetch } from './sbGateway';
import { normalizeEmail } from './membership';

export type AdminAccessStatus = 'checking' | 'allowed' | 'denied' | 'error';

/** Supabase RLS, not the member role or a local PIN, is the authority. */
export async function checkAdminAccess(email: string): Promise<AdminAccessStatus> {
  try {
    const token = await auth.currentAccessToken();
    const session = await auth.currentSession();
    if (!token || !session?.uid || !email || normalizeEmail(session.email) !== normalizeEmail(email) || await auth.isForeignSessionToken()) return 'denied';
    const res = await restFetch('rpc/kpss_is_admin', '', { method: 'POST', body: '{}' });
    if (!res.ok) return 'error';
    return (await res.json()) === true ? 'allowed' : 'denied';
  } catch {
    return 'error';
  }
}
