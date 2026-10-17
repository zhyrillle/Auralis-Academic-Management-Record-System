import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getNavigationSnapshot, loadCached, subscribeNavigationCache } from './navigationCache';

export default function useCachedQuery(key, loader, { enabled = true, keepPreviousData = false } = {}) {
  const snapshot = useCallback(() => enabled ? getNavigationSnapshot(key) : undefined, [key, enabled]);
  const entry = useSyncExternalStore(subscribeNavigationCache, snapshot, snapshot);
  const [keys, setKeys] = useState({ current: key, previous: key });
  if (keys.current !== key) setKeys({ current: key, previous: keys.current });
  // Keep an already-rendered chart visible under its updating state, not a full-page skeleton.
  // Looking up the previous key also respects save/session invalidation.
  const previous = keepPreviousData && !entry?.error ? getNavigationSnapshot(keys.previous) : undefined;
  const data = entry?.data ?? previous?.data;
  const attemptedKey = useRef(null);
  useEffect(() => {
    if (!enabled) { attemptedKey.current = null; return; }
    if (attemptedKey.current !== key || !entry) {
      attemptedKey.current = key;
      loadCached(key, loader).catch(() => {});
    }
  }, [key, loader, enabled, entry]);
  const refresh = useCallback(() => loadCached(key, loader, { force: true }).catch(() => {}), [key, loader]);
  return {
    data: enabled ? data : undefined,
    loading: enabled && data === undefined && !entry?.error,
    refreshing: Boolean(enabled && data !== undefined && (entry?.pending || entry?.data === undefined)),
    error: enabled ? entry?.error || '' : '',
    updatedAt: enabled ? entry?.updatedAt : undefined,
    refresh,
  };
}
