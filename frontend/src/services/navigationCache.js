import {
  getPersistentCacheEntry, setPersistentCache, removePersistentCache, enqueueMutation, getSessionScope,
  assertCurrentSession, isNetworkError, invalidatePersistentCache,
  sessionCancellation, isSessionCancellation,
  CACHE_INVALIDATED_EVENT, SESSION_CHANGED_EVENT,
} from '../offline/syncManager.js';

// Shared memory cache backed by session-scoped, expiring IndexedDB page data.
const entries = new Map();
const listeners = new Set();
const MAX_ENTRIES = 100;
let identity = '';
let generation = 0;
let requestSessionId = null;
let sessionController = null;
let refreshingReads = 0;

function sessionSignal(scope) {
  if (!scope) return undefined;
  if (requestSessionId !== scope.sessionId) {
    sessionController?.abort();
    requestSessionId = scope.sessionId;
    sessionController = new AbortController();
  }
  return sessionController.signal;
}

function requestSignal(scope, callerSignal) {
  const activeSignal = sessionSignal(scope);
  if (!activeSignal) return callerSignal;
  if (!callerSignal) return activeSignal;
  if (AbortSignal.any) return AbortSignal.any([activeSignal, callerSignal]);
  const combined = new AbortController();
  for (const signal of [activeSignal, callerSignal]) {
    if (signal.aborted) combined.abort(signal.reason);
    else signal.addEventListener('abort', () => combined.abort(signal.reason), { once: true });
  }
  return combined.signal;
}

function userIdentity() {
  const scope = getSessionScope();
  return scope ? JSON.stringify([scope.identity, scope.sessionId]) : 'anonymous';
}

function notify() { listeners.forEach(listener => listener()); }
function clearMemory() { generation += 1; entries.clear(); notify(); }

function checkIdentity() {
  const next = userIdentity();
  if (next !== identity) {
    identity = next;
    generation += 1;
    entries.clear();
  }
}

export function cacheKey(name, filters = {}) {
  return JSON.stringify([name, Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))]);
}

export function subscribeNavigationCache(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNavigationSnapshot(key) {
  checkIdentity();
  return entries.get(key);
}

export function getCachedData(key) { return getNavigationSnapshot(key)?.data; }

export function clearNavigationCache({ persistent = true } = {}) {
  clearMemory();
  if (persistent) return invalidatePersistentCache();
}

const SWR_THROTTLE_MS = 2_000;

export function loadCached(key, loader, { force = false } = {}) {
  checkIdentity();
  const previous = entries.get(key);

  // 1. If fresh within throttle window and not forced, return cached data immediately
  if (!force && previous?.data !== undefined && Date.now() - previous.updatedAt < SWR_THROTTLE_MS) {
    return Promise.resolve(previous.data);
  }

  // 2. If already pending revalidation and not forced:
  if (!force && previous?.pending) {
    if (previous?.data !== undefined) {
      return Promise.resolve(previous.data);
    }
    return previous.pending;
  }

  const scope = getSessionScope();
  const startedGeneration = generation;
  const startedIdentity = identity;
  let entry = { ...previous, error: '', pending: null };
  const verify = () => {
    checkIdentity();
    if (startedIdentity !== identity) throw sessionCancellation();
  };

  const pending = Promise.resolve().then(async () => {
    if (previous?.data === undefined) {
      const persisted = await getPersistentCacheEntry(key, scope);
      verify();
      if (persisted && entries.get(key) === entry) {
        entry = { ...entry, data: persisted.data, updatedAt: persisted.updatedAt };
        entries.set(key, entry);
        notify();
      }
    }
    let data;
    try {
      refreshingReads += 1;
      try { data = await loader(); }
      finally { refreshingReads -= 1; }
    }
    catch (error) {
      verify();
      if (startedGeneration !== generation) return loadCached(key, loader);
      // Server rejections and session changes must not be disguised as offline success.
      const persisted = isNetworkError(error) ? await getPersistentCacheEntry(key, scope) : undefined;
      verify();
      if (!persisted && previous?.data === undefined) throw error;
      if (entries.get(key) === entry) {
        entries.set(key, { data: persisted?.data ?? previous?.data, updatedAt: Date.now(), error: '', pending: null, offline: true });
        notify();
      }
      return persisted?.data ?? previous?.data;
    }
    verify();
    if (startedGeneration !== generation) return loadCached(key, loader);
    if (entries.get(key) === entry) {
      entries.set(key, { data, updatedAt: Date.now(), error: '', pending: null });
      // Subscribers also need completion when the server returns unchanged data.
      notify();
      await setPersistentCache(key, data, undefined, scope);
    }
    verify();
    return data;
  }).catch(async error => {
    if (isSessionCancellation(error)) {
      if (entries.get(key) === entry) { entries.delete(key); notify(); }
      throw error;
    }
    if (entries.get(key) === entry) {
      const denied = [401, 403].includes(error.status);
      if (denied) await removePersistentCache(key, scope);
      if (entries.get(key) !== entry) throw error;
      entries.set(key, { ...(denied ? {} : entry), error: error.message || 'Unable to load this view.', pending: null });
      notify();
    }
    throw error;
  });

  entry.pending = pending;
  entries.set(key, entry);
  if (entries.size > MAX_ENTRIES) {
    const oldest = [...entries].find(([candidate, value]) => candidate !== key && !value.pending);
    if (oldest) entries.delete(oldest[0]);
  }

  notify();
  // Keep cached data immediately available while its refresh runs in the background.
  if (!force && previous?.data !== undefined) {
    // The caller receives cached data, so observe failures of the background task here.
    pending.catch(() => {});
    return Promise.resolve(previous.data);
  }

  return pending;
}

// Keep the existing offline queue; capture ownership before starting the request.
export async function apiFetch(input, init = {}) {
  const { queueOffline = true, ...requestInit } = init;
  const scope = getSessionScope();
  const method = String(requestInit.method || input?.method || 'GET').toUpperCase();
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const url = typeof input === 'string' ? input : input?.url || '';
  let response;
  try {
    response = await fetch(input, { ...requestInit,
      signal: requestSignal(scope, requestInit.signal || input?.signal) });
  }
  catch (error) {
    if (scope) assertCurrentSession(scope);
    // Request streams/files cannot be safely reconstructed by this JSON outbox.
    if (!mutation || !queueOffline || !isNetworkError(error) || typeof input !== 'string') throw error;
    await enqueueMutation({ url, method, headers: requestInit.headers, body: requestInit.body,
      credentials: requestInit.credentials }, scope);
    clearMemory();
    return new Response(JSON.stringify({ success: true, offline: true,
      message: 'Saved locally. Your changes will sync when back online.' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (scope) assertCurrentSession(scope);
  if (response.ok && mutation) await clearNavigationCache();
  if (scope) assertCurrentSession(scope);
  if ([401, 403].includes(response.status) && requestInit.throwOnAuthError !== false && !url.includes('/login')) {
    const error = new Error('You no longer have access to this data. Please sign in again.');
    error.status = response.status;
    throw error;
  }
  return response;
}

// Cache JSON page reads using the same account/session cache as useCachedQuery.
// Every consumer receives its own Response, so reading one never consumes another.
// Writes retain apiFetch's existing invalidation and offline-queue behavior.
export async function cachedApiFetch(input, init = {}) {
  const { force = false, cacheRead = true, ...requestInit } = init;
  const method = String(requestInit.method || input?.method || 'GET').toUpperCase();
  if (!cacheRead || method !== 'GET' || typeof input !== 'string' ||
      requestInit.cache === 'no-store' || !getSessionScope()) return apiFetch(input, requestInit);
  const { signal: callerSignal, ...sharedInit } = requestInit;
  if (callerSignal?.aborted) throw callerSignal.reason || new DOMException('Aborted', 'AbortError');
  const headers = [...new Headers(requestInit.headers).entries()]
    .filter(([name]) => name !== 'authorization').sort(([a], [b]) => a.localeCompare(b));
  const url = new URL(input, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  url.searchParams.sort();
  const key = cacheKey('request:json', { url: url.href, headers: JSON.stringify(headers),
    credentials: requestInit.credentials || 'same-origin' });
  const read = async () => {
    // A component can stop waiting without aborting another component's shared read.
    // Logout still aborts the underlying request through the session signal.
    const response = await apiFetch(input, sharedInit);
    // Preserve normal HTTP-error, file-download and empty-response handling.
    // Only successful JSON becomes reusable page data.
    if (!response.ok || !response.headers?.get('content-type')?.includes('json')) {
      const error = new Error('Response is not reusable page data.');
      error.response = response;
      error.status = response.status;
      throw error;
    }
    const body = await response.clone().text();
    try { JSON.parse(body); }
    catch {
      const error = new Error('Response is not valid JSON page data.');
      error.response = response;
      throw error;
    }
    return { body, status: response.status, statusText: response.statusText,
      headers: [...response.headers.entries()] };
  };
  try {
    const pending = loadCached(key, read, { force: force || refreshingReads > 0 });
    const snapshot = await waitForCachedRead(pending, callerSignal);
    return new Response(snapshot.body, { status: snapshot.status, statusText: snapshot.statusText, headers: snapshot.headers });
  } catch (error) {
    if (error.response) return error.response.clone();
    throw error;
  }
}

function waitForCachedRead(pending, signal) {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener(CACHE_INVALIDATED_EVENT, clearMemory);
  window.addEventListener(SESSION_CHANGED_EVENT, () => {
    if (requestSessionId !== getSessionScope()?.sessionId) {
      sessionController?.abort();
      sessionController = null;
      requestSessionId = null;
    }
    if (userIdentity() !== identity) { checkIdentity(); notify(); }
  });

  const revalidateOnFocus = () => {
    const now = Date.now();
    for (const [, v] of entries.entries()) {
      if (v && !v.pending && now - v.updatedAt > 30_000) {
        v.updatedAt = 0; // Age out stale entries so next read revalidates in background
      }
    }
  };

  window.addEventListener('focus', revalidateOnFocus);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        revalidateOnFocus();
      }
    });
  }
}
