// Session-memory only: no learner records are persisted in browser storage.
const entries = new Map();
const listeners = new Set();
const FRESH_FOR_MS = 120_000;
const MAX_ENTRIES = 100;
let identity = '';
let generation = 0;

function userIdentity() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return JSON.stringify([user?.user_id ?? user?.id ?? null, user?.role ?? null,
      user?.is_adviser ?? user?.isAdviser ?? null]);
  } catch { return 'anonymous'; }
}

function notify() { listeners.forEach(listener => listener()); }

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

export function clearNavigationCache() {
  generation += 1;
  entries.clear();
  notify();
}

export function loadCached(key, loader, { force = false } = {}) {
  checkIdentity();
  const previous = entries.get(key);
  if (!force && previous?.pending) return previous.pending;
  if (!force && previous?.data !== undefined && Date.now() - previous.updatedAt < FRESH_FOR_MS) {
    return Promise.resolve(previous.data);
  }
  const startedGeneration = generation;
  const startedIdentity = identity;
  const entry = { ...previous, error: '', pending: null };
  const pending = Promise.resolve().then(loader).then(data => {
    checkIdentity();
    if (startedIdentity !== identity) throw new Error('The signed-in user changed. Please reload this view.');
    // A successful save happened while this read was running: read current records instead.
    if (startedGeneration !== generation) return loadCached(key, loader);
    if (entries.get(key) === entry) {
      entries.set(key, { data, updatedAt: Date.now(), error: '', pending: null });
      notify();
    }
    return data;
  }).catch(error => {
    if (entries.get(key) === entry) {
      entries.set(key, { ...previous, error: error.message || 'Unable to load this view.', pending: null });
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
  return pending;
}

// Preserve normal fetch behavior; successful writes invalidate all dependent views.
export async function apiFetch(input, init) {
  const response = await fetch(input, init);
  const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
  if (response.ok && !['GET', 'HEAD', 'OPTIONS'].includes(method)) clearNavigationCache();
  return response;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === 'user' || event.key === null) clearNavigationCache();
  });
}
