import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** Refresh the visible admin list while foregrounded, and immediately on return.
 * This is polling, not a Supabase Realtime subscription; changes can take up to
 * one interval plus request time to appear. Never overlap scheduled reads.
 */
export function useMemberListRefresh(refresh: () => Promise<unknown>, version: number) {
  const focused = useIsFocused();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const running = useRef(false);
  const queued = useRef(false);
  const active = useRef(false);

  useEffect(() => {
    if (!focused) return;
    active.current = true;
    const isForeground = () => AppState.currentState !== 'background';
    const run = async () => {
      if (!active.current || !isForeground()) return;
      if (running.current) {
        queued.current = true;
        return;
      }
      running.current = true;
      try {
        do {
          queued.current = false;
          await refreshRef.current();
        } while (active.current && queued.current && isForeground());
      } catch {
        // The next interval or foreground event retries; callers surface errors.
      } finally {
        running.current = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), 5000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void run();
    });
    return () => {
      active.current = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [focused, version]);
}
