import { cachedApiFetch as apiFetch } from './navigationCache';
import { API_BASE_URL } from './classRecordApi';
import { getStoredUser } from '../utils/auth';
import {
  accountDraftKey,
  getSessionScope,
  assertCurrentSession,
  isNetworkError,
  saveOfflineScreening,
  getPendingOfflineScreening,
  clearOfflineScreening,
  getPersistentCache,
  setPersistentCache,
} from '../offline/syncManager';

const getScreeningDraftKey = (sectionId, schoolYearId, scope) =>
  accountDraftKey(`phil_iri_screening_${sectionId}_sy_${schoolYearId}`, scope);

/**
 * Merge pending offline screening records onto baseline records.
 */
function mergeOfflineScreeningRecords(baseRecords = [], pendingOffline = []) {
  if (!Array.isArray(pendingOffline) || pendingOffline.length === 0) return baseRecords;
  const map = new Map();
  baseRecords.forEach(r => {
    map.set(String(r.student_section_id), { ...r });
  });
  pendingOffline.forEach(p => {
    const key = String(p.student_section_id);
    const existing = map.get(key) || {};
    map.set(key, { ...existing, ...p });
  });
  return Array.from(map.values());
}

/**
 * Get PHIL-IRI screening records using Stale-While-Revalidate (SWR) cache.
 */
export async function getScreeningRecords(sectionId, schoolYearId, force = false) {
  const scope = getSessionScope();
  assertCurrentSession(scope);
  const cacheKey = `phil_iri_screening_${sectionId}_sy_${schoolYearId}`;

  // 1. Instant SWR check in Dexie persistent cache
  let cachedPayload = null;
  try {
    cachedPayload = await getPersistentCache(cacheKey, scope);
  } catch (_) {}

  const pendingOffline = await getPendingOfflineScreening(sectionId, schoolYearId).catch(() => []);

  if (cachedPayload && Array.isArray(cachedPayload.records) && !force) {
    const mergedRecords = mergeOfflineScreeningRecords(cachedPayload.records, pendingOffline);

    // Revalidate in background if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const user = getStoredUser();
      apiFetch(`${API_BASE_URL}/phil-iri/screening/${encodeURIComponent(sectionId)}?schoolYearId=${encodeURIComponent(schoolYearId)}`, {
        headers: { 'Content-Type': 'application/json', 'X-Auralis-User-Id': String(user?.user_id || user?.id || '') },
        force: true,
      })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data?.records && Array.isArray(data.records)) {
            setPersistentCache(cacheKey, {
              records: data.records,
              config: data.config || cachedPayload.config || null,
              updatedAt: Date.now(),
            }, undefined, scope).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return {
      records: mergedRecords,
      config: cachedPayload.config || null,
      tableReady: true,
      source: "cache",
      pendingCount: pendingOffline.length,
    };
  }

  // 2. Fetch from Network
  const user = getStoredUser();
  try {
    const response = await apiFetch(`${API_BASE_URL}/phil-iri/screening/${encodeURIComponent(sectionId)}?schoolYearId=${encodeURIComponent(schoolYearId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Auralis-User-Id': String(user?.user_id || user?.id || '') },
      force: Boolean(force),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Screening scores could not be loaded.');

    if (data.records && Array.isArray(data.records)) {
      await setPersistentCache(cacheKey, {
        records: data.records,
        config: data.config || null,
        updatedAt: Date.now(),
      }, undefined, scope).catch(() => {});

      const mergedRecords = mergeOfflineScreeningRecords(data.records, pendingOffline);
      return {
        records: mergedRecords,
        config: data.config || null,
        tableReady: true,
        source: "database",
        pendingCount: pendingOffline.length,
      };
    }
    return data;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    console.warn("[ScreeningApi] Could not reach screening endpoint, using cached/offline fallback:", error);
  }

  // 3. Fallback to cached or offline records
  if (cachedPayload && Array.isArray(cachedPayload.records)) {
    const mergedRecords = mergeOfflineScreeningRecords(cachedPayload.records, pendingOffline);
    return {
      records: mergedRecords,
      config: cachedPayload.config || null,
      tableReady: true,
      source: "cache",
      pendingCount: pendingOffline.length,
    };
  }

  if (pendingOffline.length > 0) {
    return {
      records: pendingOffline,
      config: null,
      tableReady: true,
      source: "offline",
      pendingCount: pendingOffline.length,
    };
  }

  // Legacy localStorage fallback
  const draftKey = getScreeningDraftKey(sectionId, schoolYearId, scope);
  if (draftKey) {
    try {
      const cached = localStorage.getItem(draftKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.records)) {
          return { records: parsed.records, config: parsed.config || null, tableReady: true, offline: true };
        }
      }
    } catch (_) {}
  }

  return { records: [], config: null, tableReady: false, source: "empty" };
}

/**
 * Save screening records with offline durability and cloud outbox queue.
 */
export async function saveScreeningRecords(sectionId, schoolYearId, body) {
  const scope = getSessionScope();
  assertCurrentSession(scope);
  const cacheKey = `phil_iri_screening_${sectionId}_sy_${schoolYearId}`;
  const draftKey = getScreeningDraftKey(sectionId, schoolYearId, scope);
  const user = getStoredUser();

  // Always update persistent cache + localStorage immediately
  try {
    await setPersistentCache(cacheKey, {
      records: body.records,
      config: body.config,
      updatedAt: Date.now(),
    }, undefined, scope);
  } catch (_) {}

  if (draftKey) {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        records: body.records,
        config: body.config,
        updatedAt: Date.now(),
      }));
    } catch (_) {}
  }

  // 1. If currently offline, directly save to IndexedDB offlineScreening + outbox queue
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await saveOfflineScreening({
      sectionId: Number(sectionId),
      schoolYearId: Number(schoolYearId),
      records: body.records,
      config: body.config,
    }).catch(e => console.warn("[ScreeningApi] saveOfflineScreening warning:", e));
    return {
      success: true,
      offline: true,
      records: body.records,
      config: body.config,
      message: "Saved locally. Changes will sync to the cloud when online.",
    };
  }

  // 2. If online, persist to server
  try {
    const response = await apiFetch(`${API_BASE_URL}/phil-iri/screening/${encodeURIComponent(sectionId)}?schoolYearId=${encodeURIComponent(schoolYearId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auralis-User-Id': String(user?.user_id || user?.id || '') },
      body: JSON.stringify({ ...body, sectionId: Number(sectionId), schoolYearId: Number(schoolYearId) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Screening scores could not be saved to server.');

    // Clear offline records since cloud sync succeeded
    await clearOfflineScreening(Number(sectionId), Number(schoolYearId)).catch(() => {});
    return { success: true, ...data };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    console.warn("Failed to reach screening endpoint; scores safely saved in offline outbox:", error);
    await saveOfflineScreening({
      sectionId: Number(sectionId),
      schoolYearId: Number(schoolYearId),
      records: body.records,
      config: body.config,
    }).catch(() => {});
    return {
      success: true,
      offline: true,
      records: body.records,
      config: body.config,
      message: "Saved locally. Changes will sync to the cloud when online.",
    };
  }
}
