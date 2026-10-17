import db from './db.js';

const listeners = new Set();
const logoutDraftSavers = new Set();
const SESSION_KEY = 'auralis_cache_session';
export const CACHE_INVALIDATED_EVENT = 'auralis-cache-invalidated';
export const SESSION_CHANGED_EVENT = 'auralis-session-changed';
let volatileSession = null;
let syncTask = null;
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;
// randomUUID is unavailable on plain HTTP LAN URLs; getRandomValues still works.
const newId = () => globalThis.crypto.randomUUID?.() ||
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

function notify() {
  listeners.forEach(listener => { try { listener(); } catch (error) { console.warn(error); } });
}

function emit(name) {
  if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event(name));
}

function storeSession(value) {
  volatileSession = value;
  try {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* Memory-only sessions still work when browser storage is unavailable. */ }
}

export function getSessionScope() {
  let user;
  try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  const id = user?.user_id ?? user?.id;
  if (id == null) return null;
  const ownerId = String(id);
  const identity = JSON.stringify([ownerId, user.role ?? null, user.is_adviser ?? user.isAdviser ?? null]);
  let session = volatileSession;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || session; } catch { /* Use memory fallback. */ }
  if (!session?.sessionId || session.identity !== identity) {
    session = { ownerId, identity, sessionId: newId(), cacheVersion: newId() };
    storeSession(session);
  }
  return session;
}

export function isCurrentSession(scope) {
  const current = getSessionScope();
  return Boolean(scope && current?.sessionId === scope.sessionId && current.identity === scope.identity);
}

export function isCurrentCacheScope(scope) {
  return isCurrentSession(scope) && getSessionScope().cacheVersion === scope.cacheVersion;
}

export const isSessionCancellation = error => error?.code === 'SESSION_CHANGED';

export function sessionCancellation() {
  // A late response is routine cancellation. Update the mounted session so its
  // own loaders run automatically, including changes first noticed by a request.
  emit(SESSION_CHANGED_EVENT);
  const error = new Error('Obsolete session request cancelled.');
  error.name = 'AbortError';
  error.code = 'SESSION_CHANGED';
  return error;
}

export function assertCurrentSession(scope) {
  if (!isCurrentSession(scope)) throw sessionCancellation();
}

// Drafts survive logout, unlike page caches. Never adopt old ownerless keys.
export function accountDraftKey(name, scope = getSessionScope()) {
  return scope ? `auralis-draft:${scope.identity}:${name}` : null;
}

export function registerLogoutDraftSaver(save) {
  logoutDraftSavers.add(save);
  return () => logoutDraftSavers.delete(save);
}

export async function preserveDraftsBeforeLogout() {
  for (const save of logoutDraftSavers) await save();
}

async function clearObsoleteReadCaches() {
  if (!db.constructor.dependencies.indexedDB) return;
  try {
    await db.transaction('rw', db.cache, async () => {
      const current = getSessionScope();
      await db.cache.filter(entry => !current || entry.sessionId !== current.sessionId ||
        entry.cacheVersion !== current.cacheVersion).delete();
    });
  } catch (error) { console.warn('[SyncManager] Could not clear old page data:', error.message); }
}

// Logout rotates the read-cache session, but never deletes offline edits.
export function resetOfflineSession() {
  syncTask?.controller.abort();
  storeSession(null);
  getSessionScope();
  emit(SESSION_CHANGED_EVENT);
  notify();
  return clearObsoleteReadCaches();
}

export function invalidatePersistentCache() {
  const current = getSessionScope();
  if (current) storeSession({ ...current, cacheVersion: newId() });
  emit(CACHE_INVALIDATED_EVENT);
  return clearObsoleteReadCaches();
}

export const isNetworkError = error => ['TypeError', 'NetworkError'].includes(error?.name);

export function subscribeSyncStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getSyncSnapshot() {
  const scope = getSessionScope();
  const empty = { isOnline: online(), isSyncing: false, pendingCount: 0, failedCount: 0,
    recoveryNeeded: false, storageUnavailable: false, lastSyncedAt: null };
  if (!scope) return empty;
  try {
    const rows = await db.outbox.where('ownerId').equals(scope.ownerId)
      .filter(item => item.ownerIdentity === scope.identity).toArray();
    const meta = await db.syncMeta.get('lastSyncedAt:' + scope.identity);
    const recoveryNeeded = await db.outbox.where('status').equals('requires-review').count() > 0 ||
      await db.offlineScores.filter(item => !item.ownerId).count() > 0;
    if (!isCurrentSession(scope)) return empty;
    return { ...empty, recoveryNeeded, isSyncing: syncTask?.scope.sessionId === scope.sessionId,
      pendingCount: rows.filter(item => item.status === 'pending').length,
      failedCount: rows.filter(item => item.status === 'failed').length, lastSyncedAt: meta?.value ?? null };
  } catch { return { ...empty, storageUnavailable: true }; }
}

const persistentKey = (key, scope) => JSON.stringify([scope.sessionId, scope.cacheVersion, key]);

export async function setPersistentCache(key, data, ttlMs = 24 * 60 * 60 * 1000, scope = getSessionScope()) {
  if (!isCurrentCacheScope(scope) || !db.constructor.dependencies.indexedDB) return;
  try {
    await db.transaction('rw', db.cache, async () => {
      if (!isCurrentCacheScope(scope)) return;
      await db.cache.put({ key: persistentKey(key, scope), ...scope, data,
        updatedAt: Date.now(), expiresAt: Date.now() + ttlMs });
    });
  } catch (error) { console.warn('[SyncManager] Could not cache page data:', error.message); }
}

export async function getPersistentCacheEntry(key, scope = getSessionScope()) {
  if (!isCurrentCacheScope(scope) || !db.constructor.dependencies.indexedDB) return undefined;
  try {
    const entry = await db.cache.get(persistentKey(key, scope));
    if (!isCurrentCacheScope(scope) || !entry) return undefined;
    if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
      await db.cache.delete(entry.key);
      return undefined;
    }
    return entry;
  } catch { return undefined; }
}

export async function getPersistentCache(key, scope = getSessionScope()) {
  return (await getPersistentCacheEntry(key, scope))?.data;
}

export async function removePersistentCache(key, scope = getSessionScope()) {
  if (!scope || !db.constructor.dependencies.indexedDB) return;
  try { await db.cache.delete(persistentKey(key, scope)); }
  catch (error) { console.warn('[SyncManager] Could not remove cached response:', error.message); }
}

function mutationRecord({ url, method = 'POST', headers = {}, body = null, label = '', credentials = 'same-origin' }, scope) {
  assertCurrentSession(scope);
  if (body !== null && typeof body !== 'string' && !Array.isArray(body) && Object.getPrototypeOf(body) !== Object.prototype) {
    throw new Error('This type of upload cannot be saved offline. Please reconnect and retry.');
  }
  return { ownerId: scope.ownerId, ownerIdentity: scope.identity, url, method: method.toUpperCase(),
    headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
    body: body !== null && typeof body === 'object' ? JSON.stringify(body) : body,
    credentials, label: label || method + ' ' + url, timestamp: Date.now(), status: 'pending', retryCount: 0 };
}

export async function enqueueMutation(options, scope = getSessionScope()) {
  const record = mutationRecord(options, scope);
  const id = await db.transaction('rw', db.outbox, () => {
    assertCurrentSession(scope);
    return db.outbox.add(record);
  });
  notify();
  return id;
}

export async function processOutbox() {
  const scope = getSessionScope();
  if (syncTask || !scope || !online()) return;
  const task = { scope, controller: new AbortController() };
  syncTask = task;
  notify();
  const flush = async () => {
    // Stop at an unresolved rejection so later edits cannot leapfrog it.
    const items = await db.outbox.where('ownerId').equals(scope.ownerId)
      .filter(item => item.ownerIdentity === scope.identity && ['pending', 'failed'].includes(item.status)).sortBy('id');
    for (const item of items) {
      if (!isCurrentSession(scope) || !online() || task.controller.signal.aborted || item.status === 'failed') break;
      if (!await db.outbox.get(item.id)) continue;
      try {
        assertCurrentSession(scope);
        const response = await fetch(item.url, { method: item.method, headers: item.headers,
          body: item.body, credentials: item.credentials, signal: task.controller.signal });
        if (!isCurrentSession(scope)) break;
        if (!response.ok) {
          const error = await response.text().catch(() => '');
          await db.outbox.update(item.id, { status: response.status < 500 ? 'failed' : 'pending',
            error, retryCount: item.retryCount + 1 });
          break;
        }
        await db.transaction('rw', db.outbox, db.offlineScores, async () => {
          assertCurrentSession(scope);
          await db.outbox.delete(item.id);
          // A newer edit to the same cell has a different mutationId and must survive.
          await clearOfflineScores(null, null, { scope, mutationId: item.id });
        });
        await db.syncMeta.put({ key: 'lastSyncedAt:' + scope.identity, value: Date.now() });
        if (isCurrentSession(scope)) await invalidatePersistentCache();
      } catch { break; }
    }
  };
  try {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      await navigator.locks.request('auralis-outbox-sync', { ifAvailable: true }, lock => lock ? flush() : undefined);
    } else await flush();
  } catch (error) { console.warn('[SyncManager] Sync interrupted:', error.message); }
  finally { if (syncTask === task) syncTask = null; notify(); }
}

export async function saveOfflineScores({ subject_offering_id, term, scores, mapeh_component = null, examConfig = null, apiUrl = null }, scope = getSessionScope()) {
  assertCurrentSession(scope);
  const offeringId = Number(subject_offering_id);
  await db.transaction('rw', db.offlineScores, db.outbox, async () => {
    assertCurrentSession(scope);
    const mutationId = apiUrl ? await db.outbox.add(mutationRecord({ url: apiUrl,
      body: { subject_offering_id: offeringId, term, scores, mapeh_component, examConfig },
      label: 'Batch Scores (Offering ' + offeringId + ', ' + term + ', ' + scores.length + ' scores)' }, scope)) : null;
    for (const score of scores) {
      const component = score.mapeh_component || mapeh_component || null;
      const existing = await db.offlineScores.where('[subject_offering_id+term]').equals([offeringId, term])
        .filter(record => record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity &&
          String(record.student_id) === String(score.student_id) && String(record.assessment_id) === String(score.assessment_id) &&
          record.exam_key === (score.exam_key || null) && record.mapeh_component === component).first();
      const record = { ...score, subject_offering_id: offeringId, term, mapeh_component: component,
        exam_key: score.exam_key || null, ownerId: scope.ownerId, ownerIdentity: scope.identity,
        mutationId, timestamp: Date.now(), status: 'pending' };
      if (existing) await db.offlineScores.update(existing.id, record);
      else await db.offlineScores.add(record);
    }
  });
  notify();
  return true;
}

export async function getPendingOfflineScores(subject_offering_id, term, scope = getSessionScope()) {
  if (!isCurrentSession(scope)) return [];
  try {
    const records = await db.offlineScores.where('[subject_offering_id+term]').equals([Number(subject_offering_id), term])
      .filter(record => record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity && record.status === 'pending').toArray();
    return isCurrentSession(scope) ? records : [];
  } catch { return []; }
}

export async function clearOfflineScores(subject_offering_id, term, { scope = getSessionScope(), mutationId } = {}) {
  if (!scope || mutationId == null) return;
  await db.offlineScores.where('mutationId').equals(mutationId).filter(record =>
    record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity &&
    (subject_offering_id == null || record.subject_offering_id === Number(subject_offering_id)) &&
    (term == null || record.term === term)).delete();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { notify(); processOutbox(); });
  window.addEventListener('offline', notify);
  window.addEventListener('storage', event => {
    if (!['user', SESSION_KEY, null].includes(event.key)) return;
    if (event.key === SESSION_KEY) volatileSession = null;
    if (syncTask && !isCurrentSession(syncTask.scope)) syncTask.controller.abort();
    emit(SESSION_CHANGED_EVENT);
    notify();
    clearObsoleteReadCaches();
  });
}

export default { subscribeSyncStatus, getSyncSnapshot, setPersistentCache, getPersistentCache,
  enqueueMutation, processOutbox, saveOfflineScores, getPendingOfflineScores, clearOfflineScores };
