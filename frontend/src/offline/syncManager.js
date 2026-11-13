import db from './db.js';
import { API_BASE_URL } from '../services/apiConfig.js';

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
      const now = Date.now();
      if (!current) {
        await db.cache.clear();
      } else {
        await db.cache.filter(entry =>
          (entry.ownerIdentity && entry.ownerIdentity !== current.identity) ||
          (Number.isFinite(entry.expiresAt) && entry.expiresAt <= now)
        ).delete();
      }
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
  // Do not wipe valid unexpired records from IndexedDB; in-memory cache handles SWR
  // revalidation when online, while IndexedDB remains available as offline fallback.
}

export const isNetworkError = error => ['TypeError', 'NetworkError'].includes(error?.name) ||
  error?.message?.includes?.('Failed to fetch') ||
  error?.message?.includes?.('NetworkError') ||
  error?.message?.includes?.('Load failed') ||
  (typeof navigator !== 'undefined' && navigator.onLine === false);

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
      await db.offlineScores.filter(item => !item.ownerId).count() > 0 ||
      await db.offlineAttendance.filter(item => !item.ownerId).count() > 0 ||
      await db.offlinePhilIri.filter(item => !item.ownerId).count() > 0 ||
      await db.offlineScreening.filter(item => !item.ownerId).count() > 0;
    if (!isCurrentSession(scope)) return empty;
    return { ...empty, recoveryNeeded, isSyncing: syncTask?.scope.sessionId === scope.sessionId,
      pendingCount: rows.filter(item => item.status === 'pending').length,
      failedCount: rows.filter(item => item.status === 'failed').length, lastSyncedAt: meta?.value ?? null };
  } catch { return { ...empty, storageUnavailable: true }; }
}

const persistentKey = (key, scope) => JSON.stringify([scope.identity, key]);

export async function setPersistentCache(key, data, ttlMs = 24 * 60 * 60 * 1000, scope = getSessionScope()) {
  if (!isCurrentSession(scope) || !db.constructor.dependencies.indexedDB) return;
  try {
    await db.transaction('rw', db.cache, async () => {
      if (!isCurrentSession(scope)) return;
      await db.cache.put({
        key: persistentKey(key, scope),
        ownerId: scope.ownerId,
        ownerIdentity: scope.identity,
        rawKey: key,
        data,
        updatedAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      });
    });
  } catch (error) { console.warn('[SyncManager] Could not cache page data:', error.message); }
}

export async function getPersistentCacheEntry(key, scope = getSessionScope()) {
  if (!isCurrentSession(scope) || !db.constructor.dependencies.indexedDB) return undefined;
  try {
    const entry = await db.cache.get(persistentKey(key, scope));
    if (!isCurrentSession(scope) || !entry) return undefined;
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
  if (!scope || !online()) return;
  if (syncTask) return syncTask.promise;

  let taskResolve;
  const taskPromise = new Promise(resolve => { taskResolve = resolve; });
  const task = { scope, controller: new AbortController(), promise: taskPromise };
  syncTask = task;
  notify();
  const flush = async () => {
    // Stop at an unresolved rejection so later edits cannot leapfrog it.
    const items = await db.outbox.where('ownerId').equals(scope.ownerId)
      .filter(item => item.ownerIdentity === scope.identity && (['pending', 'failed'].includes(item.status) || (item.status === 'requires-review' && (item.retryCount || 0) < 5))).sortBy('id');
    for (const item of items) {
      if (!isCurrentSession(scope) || !online() || task.controller.signal.aborted) break;
      if (!await db.outbox.get(item.id)) continue;
      if (item.status === 'failed') break;
      // Automatically prune obsolete/invalid non-numeric assessment IDs (e.g. ww_default_1, offline_...)
      if ((item.method === 'PUT' || item.method === 'DELETE') && /\/assessments\/(?!\d+(?:$|[/?]))[^/?]+/.test(item.url)) {
        await db.outbox.delete(item.id);
        continue;
      }
      try {
        assertCurrentSession(scope);
        // Older queued drafts predate the assignment checks. Replay only as
        // their matching current owner; always inject current user ID header.
        const replayHeaders = new Headers(item.headers || {});
        replayHeaders.set('X-Auralis-User-Id', String(scope.ownerId));
        if (item.body && !replayHeaders.has('content-type')) {
          replayHeaders.set('content-type', 'application/json');
        }

        console.log(`[SyncManager] Replaying outbox item ${item.id} -> ${item.method} ${item.url}`);
        const response = await fetch(item.url, { method: item.method, headers: replayHeaders,
          body: item.body, credentials: item.credentials, signal: task.controller.signal });
        if (!isCurrentSession(scope)) break;
        if (!response.ok) {
          const error = await response.text().catch(() => '');
          const nextRetry = (item.retryCount || 0) + 1;
          console.warn(`[SyncManager] Outbox item ${item.id} (${item.url}) failed (${response.status}):`, error);
          if (response.status === 409) {
            await db.outbox.update(item.id, { status: 'failed', error, retryCount: nextRetry });
            break;
          }
          const isClientError = response.status >= 400 && response.status < 500;
          if (isClientError) {
            // Drop unrecoverable 4xx client errors (e.g. 400/403/404 from stale or synthetic offline IDs)
            // so they never block the queue or trigger persistent "Older offline work needs review" banners.
            await db.transaction('rw', db.outbox, db.offlineScores, db.offlineAttendance, db.offlinePhilIri, db.offlineScreening, async () => {
              await db.outbox.delete(item.id);
              await clearOfflineScores(null, null, { scope, mutationId: item.id });
              await clearOfflineAttendance(null, null, { scope, mutationId: item.id });
              await clearOfflinePhilIri(null, null, { scope, mutationId: item.id });
              await clearOfflineScreening(null, null, { scope, mutationId: item.id });
            });
            continue;
          }
          await db.outbox.update(item.id, { status: 'pending', error, retryCount: nextRetry });
          break;
        }
        await db.transaction('rw', db.outbox, db.offlineScores, db.offlineAttendance, db.offlinePhilIri, db.offlineScreening, async () => {
          assertCurrentSession(scope);
          await db.outbox.delete(item.id);
          // A newer edit to the same cell has a different mutationId and must survive.
          await clearOfflineScores(null, null, { scope, mutationId: item.id });
          await clearOfflineAttendance(null, null, { scope, mutationId: item.id });
          await clearOfflinePhilIri(null, null, { scope, mutationId: item.id });
          await clearOfflineScreening(null, null, { scope, mutationId: item.id });
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
  finally {
    if (syncTask === task) syncTask = null;
    taskResolve();
    notify();
  }
  return taskPromise;
}

export async function saveOfflineScores({ subject_offering_id, term, scores, mapeh_component = null, examConfig = null, apiUrl = null }, scope = getSessionScope()) {
  assertCurrentSession(scope);
  const offeringId = Number(subject_offering_id);
  await db.transaction('rw', db.offlineScores, db.outbox, async () => {
    assertCurrentSession(scope);
    const mutationId = apiUrl ? await db.outbox.add(mutationRecord({ url: apiUrl,
      headers: { 'X-Auralis-User-Id': scope.ownerId },
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

export async function getPendingOfflineScores(subject_offering_id, term, scope = getSessionScope(), { strict = false } = {}) {
  if (!isCurrentSession(scope)) return [];
  try {
    const records = await db.offlineScores.where('[subject_offering_id+term]').equals([Number(subject_offering_id), term])
      .filter(record => record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity && record.status === 'pending').toArray();
    return isCurrentSession(scope) ? records : [];
  } catch (error) { if (strict) throw error; return []; }
}

export async function clearOfflineScores(subject_offering_id, term, { scope = getSessionScope(), mutationId } = {}) {
  if (!scope || mutationId == null) return;
  await db.offlineScores.where('mutationId').equals(mutationId).filter(record =>
    record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity &&
    (subject_offering_id == null || record.subject_offering_id === Number(subject_offering_id)) &&
    (term == null || record.term === term)).delete();
}

export async function saveOfflineAttendance({ section_id, attendance_date, attendance_sheet_id = null, adviser_assignment_id = null, teacher_assignment_id = null, attendance_scope = 'SECTION', records = [], apiUrl = null }, scope = getSessionScope()) {
  assertCurrentSession(scope);
  const secId = Number(section_id);
  const cleanDate = String(attendance_date).split('T')[0];
  const resolvedScope = attendance_scope || (teacher_assignment_id ? 'SUBJECT' : 'SECTION');
  await db.transaction('rw', db.offlineAttendance, db.outbox, async () => {
    assertCurrentSession(scope);
    const targetUrl = apiUrl || `${API_BASE_URL}/attendance/bulk-save`;
    const mutationId = await db.outbox.add(mutationRecord({
      url: targetUrl,
      headers: { 'X-Auralis-User-Id': scope.ownerId },
      body: {
        section_id: secId,
        attendance_date: cleanDate,
        adviser_assignment_id: adviser_assignment_id ? Number(adviser_assignment_id) : undefined,
        teacher_assignment_id: teacher_assignment_id ? Number(teacher_assignment_id) : undefined,
        attendance_scope: resolvedScope,
        user_id: scope.ownerId,
        records,
      },
      label: `Batch Attendance (Section ${secId}, ${cleanDate}, ${resolvedScope}, ${records.length} records)`,
    }, scope));

    for (const rec of records) {
      const studentSecId = rec.student_section_id || rec.student_id;
      const existing = await db.offlineAttendance.where('[section_id+attendance_date]').equals([secId, cleanDate])
        .filter(item => item.ownerId === scope.ownerId && item.ownerIdentity === scope.identity &&
          String(item.student_section_id) === String(studentSecId) &&
          (item.attendance_scope === resolvedScope || (!item.attendance_scope && resolvedScope === 'SECTION'))).first();

      const record = {
        section_id: secId,
        attendance_date: cleanDate,
        attendance_sheet_id: rec.attendance_sheet_id || attendance_sheet_id || null,
        attendance_scope: resolvedScope,
        adviser_assignment_id: adviser_assignment_id ? Number(adviser_assignment_id) : null,
        teacher_assignment_id: teacher_assignment_id ? Number(teacher_assignment_id) : null,
        student_section_id: studentSecId,
        student_id: rec.student_id || null,
        status: rec.status || 'BLANK',
        remarks: rec.remarks !== undefined ? rec.remarks : null,
        ownerId: scope.ownerId,
        ownerIdentity: scope.identity,
        mutationId,
        timestamp: Date.now(),
      };

      if (existing) await db.offlineAttendance.update(existing.id, record);
      else await db.offlineAttendance.add(record);
    }
  });
  notify();
  return true;
}

export async function getPendingOfflineAttendance(section_id, attendance_date = null, scope = getSessionScope(), { strict = false, teacher_assignment_id = null, adviser_assignment_id = null, attendance_scope = null } = {}) {
  if (!isCurrentSession(scope)) return [];
  try {
    const secId = Number(section_id);
    let collection;
    if (attendance_date) {
      const cleanDate = String(attendance_date).split('T')[0];
      collection = db.offlineAttendance.where('[section_id+attendance_date]').equals([secId, cleanDate]);
    } else {
      collection = db.offlineAttendance.where('section_id').equals(secId);
    }
    const records = await collection
      .filter(record => {
        if (record.ownerId !== scope.ownerId || record.ownerIdentity !== scope.identity) return false;
        if (attendance_scope && record.attendance_scope && record.attendance_scope !== attendance_scope) return false;
        if (teacher_assignment_id && record.teacher_assignment_id && Number(record.teacher_assignment_id) !== Number(teacher_assignment_id)) return false;
        if (adviser_assignment_id && record.adviser_assignment_id && Number(record.adviser_assignment_id) !== Number(adviser_assignment_id)) return false;
        return true;
      })
      .toArray();
    return isCurrentSession(scope) ? records : [];
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

export async function clearOfflineAttendance(section_id, attendance_date, { scope = getSessionScope(), mutationId } = {}) {
  if (!scope) return;
  if (mutationId != null) {
    await db.offlineAttendance.where('mutationId').equals(mutationId).filter(record =>
      record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity &&
      (section_id == null || record.section_id === Number(section_id)) &&
      (attendance_date == null || record.attendance_date === attendance_date)).delete();
  } else if (section_id != null) {
    await db.offlineAttendance.where('section_id').equals(Number(section_id)).filter(record =>
      record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity &&
      (attendance_date == null || record.attendance_date === attendance_date)).delete();
  }
}

export async function saveOfflinePhilIri({ sectionId, section_id, subjectOfferingId, subject_offering_id, schoolYearId, school_year_id, userId, testType = 'POST_TEST', test_type, passageWordsCount = 70, totalCompItems = 5, records = [], apiUrl = null }, scope = getSessionScope()) {
  assertCurrentSession(scope);
  const secId = Number(sectionId || section_id);
  const type = testType || test_type || 'POST_TEST';
  const offeringId = subjectOfferingId || subject_offering_id ? Number(subjectOfferingId || subject_offering_id) : null;
  const syId = schoolYearId || school_year_id ? Number(schoolYearId || school_year_id) : null;
  const effectiveUserId = userId || scope.ownerId;

  await db.transaction('rw', db.offlinePhilIri, db.outbox, async () => {
    assertCurrentSession(scope);
    const targetUrl = apiUrl || `${API_BASE_URL}/phil-iri/batch`;
    const mutationId = await db.outbox.add(mutationRecord({
      url: targetUrl,
      headers: { 'X-Auralis-User-Id': String(scope.ownerId) },
      body: {
        records,
        sectionId: secId,
        subjectOfferingId: offeringId,
        schoolYearId: syId,
        user_id: effectiveUserId,
        testType: type,
        passageWordsCount,
        totalCompItems,
      },
      label: `Batch Phil-Iri (Section ${secId}, ${type}, ${records.length} records)`,
    }, scope));

    for (const rec of records) {
      const studentSecId = rec.student_section_id || rec.student_id;
      const existing = await db.offlinePhilIri.where('[section_id+test_type]').equals([secId, type])
        .filter(item => item.ownerId === scope.ownerId && item.ownerIdentity === scope.identity &&
          String(item.student_section_id) === String(studentSecId)).first();

      const record = {
        section_id: secId,
        test_type: type,
        subject_offering_id: offeringId,
        school_year_id: syId,
        student_section_id: studentSecId,
        student_id: rec.student_id || null,
        words_correct: rec.words_correct,
        oral_reading_percent: rec.oral_reading_percent,
        oral_reading_level: rec.oral_reading_level,
        comp_correct: rec.comp_correct,
        comp_score_percent: rec.comp_score_percent,
        comp_reading_level: rec.comp_reading_level,
        overall_reading_level: rec.overall_reading_level,
        passage_words_count: passageWordsCount,
        total_comp_items: totalCompItems,
        ownerId: scope.ownerId,
        ownerIdentity: scope.identity,
        mutationId,
        timestamp: Date.now(),
        status: 'pending',
      };

      if (existing) await db.offlinePhilIri.update(existing.id, record);
      else await db.offlinePhilIri.add(record);
    }
  });
  notify();
  return true;
}

export async function getPendingOfflinePhilIri(sectionId, testType = 'POST_TEST', scope = getSessionScope(), { strict = false } = {}) {
  if (!isCurrentSession(scope)) return [];
  try {
    const secId = Number(sectionId);
    const type = testType || 'POST_TEST';
    const records = await db.offlinePhilIri.where('[section_id+test_type]').equals([secId, type])
      .filter(record => record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity && record.status === 'pending')
      .toArray();
    return isCurrentSession(scope) ? records : [];
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

export async function clearOfflinePhilIri(sectionId, testType, { scope = getSessionScope(), mutationId } = {}) {
  if (!scope) return;
  if (mutationId != null) {
    await db.offlinePhilIri.where('mutationId').equals(mutationId).filter(record =>
      record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity &&
      (sectionId == null || record.section_id === Number(sectionId)) &&
      (testType == null || record.test_type === testType)).delete();
  } else if (sectionId != null) {
    await db.offlinePhilIri.where('section_id').equals(Number(sectionId)).filter(record =>
      record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity &&
      (testType == null || record.test_type === testType)).delete();
  }
}

export async function saveOfflineScreening({ sectionId, section_id, schoolYearId, school_year_id, config = {}, records = [], apiUrl = null }, scope = getSessionScope()) {
  assertCurrentSession(scope);
  const secId = Number(sectionId || section_id);
  const syId = Number(schoolYearId || school_year_id);
  await db.transaction('rw', db.offlineScreening, db.outbox, async () => {
    assertCurrentSession(scope);
    const targetUrl = apiUrl || `${API_BASE_URL}/phil-iri/screening/${encodeURIComponent(secId)}?schoolYearId=${encodeURIComponent(syId)}`;
    const mutationId = await db.outbox.add(mutationRecord({
      url: targetUrl,
      headers: { 'X-Auralis-User-Id': String(scope.ownerId) },
      body: {
        config,
        records,
        sectionId: secId,
        schoolYearId: syId,
      },
      label: `Batch Screening (Section ${secId}, SY ${syId}, ${records.length} records)`,
    }, scope));

    for (const rec of records) {
      const studentSecId = rec.student_section_id || rec.student_id;
      const existing = await db.offlineScreening.where('[section_id+school_year_id]').equals([secId, syId])
        .filter(item => item.ownerId === scope.ownerId && item.ownerIdentity === scope.identity &&
          String(item.student_section_id) === String(studentSecId)).first();

      const record = {
        section_id: secId,
        school_year_id: syId,
        student_section_id: studentSecId,
        test_taken: rec.test_taken,
        literal_score: rec.literal_score,
        inferential_score: rec.inferential_score,
        critical_score: rec.critical_score,
        config,
        ownerId: scope.ownerId,
        ownerIdentity: scope.identity,
        mutationId,
        timestamp: Date.now(),
        status: 'pending',
      };

      if (existing) await db.offlineScreening.update(existing.id, record);
      else await db.offlineScreening.add(record);
    }
  });
  notify();
  return true;
}

export async function getPendingOfflineScreening(sectionId, schoolYearId, scope = getSessionScope(), { strict = false } = {}) {
  if (!isCurrentSession(scope)) return [];
  try {
    const secId = Number(sectionId);
    const syId = Number(schoolYearId);
    const records = await db.offlineScreening.where('[section_id+school_year_id]').equals([secId, syId])
      .filter(record => record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity && record.status === 'pending')
      .toArray();
    return isCurrentSession(scope) ? records : [];
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

export async function clearOfflineScreening(sectionId, schoolYearId, { scope = getSessionScope(), mutationId } = {}) {
  if (!scope) return;
  if (mutationId != null) {
    await db.offlineScreening.where('mutationId').equals(mutationId).filter(record =>
      record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity &&
      (sectionId == null || record.section_id === Number(sectionId)) &&
      (schoolYearId == null || record.school_year_id === Number(schoolYearId))).delete();
  } else if (sectionId != null) {
    await db.offlineScreening.where('section_id').equals(Number(sectionId)).filter(record =>
      record.ownerId === scope.ownerId && record.ownerIdentity === scope.identity &&
      (schoolYearId == null || record.school_year_id === Number(schoolYearId))).delete();
  }
}

export async function retryReviewItems(scope = getSessionScope()) {
  if (!scope || !db.constructor.dependencies.indexedDB) return;
  try {
    await db.transaction('rw', db.outbox, db.offlineScores, db.offlineAttendance, db.offlinePhilIri, db.offlineScreening, async () => {
      // Adopt or reset review/failed items so they can be replayed cleanly, and remove unrecoverable ownerless rows
      await db.outbox.filter(item => item.status === 'requires-review' || item.status === 'failed')
        .modify(item => {
          if (!item.ownerId) {
            item.ownerId = scope.ownerId;
            item.ownerIdentity = scope.identity;
          }
          item.status = 'pending';
          item.retryCount = 0;
        });
      await db.offlineScores.filter(item => !item.ownerId).delete();
      await db.offlineAttendance.filter(item => !item.ownerId).delete();
      await db.offlinePhilIri.filter(item => !item.ownerId).delete();
      await db.offlineScreening.filter(item => !item.ownerId).delete();
    });
    notify();
    if (online()) await processOutbox();
  } catch (err) {
    console.warn('[SyncManager] Failed to retry review items:', err);
  }
}

export async function dismissReviewItems(scope = getSessionScope()) {
  if (!scope || !db.constructor.dependencies.indexedDB) return;
  try {
    await db.transaction('rw', db.outbox, db.offlineScores, db.offlineAttendance, db.offlinePhilIri, db.offlineScreening, async () => {
      await db.outbox.filter(item => item.status === 'requires-review' || item.status === 'failed' || !item.ownerId).delete();
      await db.offlineScores.filter(item => !item.ownerId).delete();
      await db.offlineAttendance.filter(item => !item.ownerId).delete();
      await db.offlinePhilIri.filter(item => !item.ownerId).delete();
      await db.offlineScreening.filter(item => !item.ownerId).delete();
    });
    notify();
  } catch (err) {
    console.warn('[SyncManager] Failed to dismiss review items:', err);
  }
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
  enqueueMutation, processOutbox, saveOfflineScores, getPendingOfflineScores, clearOfflineScores,
  saveOfflineAttendance, getPendingOfflineAttendance, clearOfflineAttendance,
  saveOfflinePhilIri, getPendingOfflinePhilIri, clearOfflinePhilIri,
  saveOfflineScreening, getPendingOfflineScreening, clearOfflineScreening };

