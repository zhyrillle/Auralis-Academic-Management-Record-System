import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getNavigationSnapshot, loadCached, subscribeNavigationCache } from './navigationCache';

export default function useCachedQuery(key, loader, { enabled = true, keepPreviousData = false } = {}) {
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; }, [loader]);

  const snapshot = useCallback(() => enabled ? getNavigationSnapshot(key) : undefined, [key, enabled]);
  const entry = useSyncExternalStore(subscribeNavigationCache, snapshot, snapshot);
  const [keys, setKeys] = useState({ current: key, previous: key });
  if (keys.current !== key) setKeys({ current: key, previous: keys.current });
  // Keep an already-rendered chart visible while a new set of filters loads.
  // Looking up the previous key also respects save/session invalidation.
  const previous = keepPreviousData && !entry?.error ? getNavigationSnapshot(keys.previous) : undefined;
  const data = entry?.data ?? previous?.data;
  useEffect(() => {
    if (!enabled) return;
    loadCached(key, () => loaderRef.current()).catch(() => {});
  }, [key, enabled]);

  // Refresh visible pages quietly once a minute, and when the user returns.
  useEffect(() => {
    if (!enabled) return;
    const revalidateVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadCached(key, () => loaderRef.current()).catch(() => {});
      }
    };
    const interval = setInterval(revalidateVisible, 60_000);
    window.addEventListener('focus', revalidateVisible);
    document.addEventListener('visibilitychange', revalidateVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', revalidateVisible);
      document.removeEventListener('visibilitychange', revalidateVisible);
    };
  }, [key, enabled]);
  const refresh = useCallback(() => loadCached(key, () => loaderRef.current(), { force: true }).catch(() => {}), [key]);
  return {
    data: enabled ? data : undefined,
    loading: enabled && data === undefined && !entry?.error,
    isPreviousData: Boolean(enabled && entry?.data === undefined && previous?.data !== undefined),
    refreshing: Boolean(enabled && data !== undefined && (entry?.pending || entry?.data === undefined)),
    error: enabled ? entry?.error || '' : '',
    updatedAt: enabled ? entry?.updatedAt : undefined,
    refresh,
  };
}
