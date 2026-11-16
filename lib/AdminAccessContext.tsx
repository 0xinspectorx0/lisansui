import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMembership } from './MembershipContext';
import { normalizeEmail } from './membership';
import { checkAdminAccess, type AdminAccessStatus } from './adminAccess';

interface AdminAccessValue {
  status: AdminAccessStatus;
  allowed: boolean;
  refresh: () => void;
}
const AdminAccessContext = createContext<AdminAccessValue | null>(null);

export const AdminAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { member, ready } = useMembership();
  const identity = ready && member?.status === 'active' ? normalizeEmail(member.email) : '';
  const [result, setResult] = useState<{ identity: string; status: AdminAccessStatus }>({ identity: '', status: 'denied' });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    if (!identity) {
      ++seq.current;
      setResult({ identity: '', status: 'denied' });
      return () => { alive = false; };
    }
    setResult({ identity, status: 'checking' });
    const check = async () => {
      const n = ++seq.current;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const status = await Promise.race<AdminAccessStatus>([
        checkAdminAccess(identity),
        new Promise(resolve => { timeout = setTimeout(() => resolve('error'), 8000); }),
      ]);
      if (timeout) clearTimeout(timeout);
      if (alive && n === seq.current) setResult({ identity, status });
    };
    void check();
    const timer = setInterval(() => void check(), 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    return () => { alive = false; ++seq.current; clearInterval(timer); subscription.remove(); };
  }, [identity, version]);

  const status = !ready ? 'checking' : !identity ? 'denied' : result.identity === identity ? result.status : 'checking';
  return <AdminAccessContext.Provider value={{ status, allowed: status === 'allowed', refresh }}>{children}</AdminAccessContext.Provider>;
};

export function useAdminAccess(): AdminAccessValue {
  const value = useContext(AdminAccessContext);
  if (!value) throw new Error('useAdminAccess must be used inside AdminAccessProvider');
  return value;
}
