import { cachedApiFetch as fetch } from "./navigationCache";
import { API_BASE_URL } from "./classRecordApi";
import {
  accountDraftKey,
  getSessionScope,
  assertCurrentSession,
  isNetworkError,
  saveOfflinePhilIri,
  getPendingOfflinePhilIri,
  clearOfflinePhilIri,
  getPersistentCache,
  setPersistentCache,
} from "../offline/syncManager.js";

const getStorageKey = (sectionId, testType, schoolYearId, scope) =>
  accountDraftKey(`phil_iri_${sectionId}_${testType}${schoolYearId ? `_sy_${schoolYearId}` : ""}`, scope);

let lastPhilIriSaveTimestamp = 0;

/**
 * Helper to overlay pending offline PHIL-IRI records onto server/cached records.
 */
function mergeOfflinePhilIriRecords(baseRecords = [], pendingOffline = []) {
  if (!Array.isArray(pendingOffline) || pendingOffline.length === 0) return baseRecords;
  const mergedMap = new Map();
  // Index base records
  baseRecords.forEach(r => {
    const key = String(r.student_section_id || r.student_id);
    mergedMap.set(key, { ...r });
  });
  // Overlay pending offline records
  pendingOffline.forEach(p => {
    const key = String(p.student_section_id || p.student_id);
    if (p._cleared || (p.words_correct === null && p.comp_correct === null)) {
      mergedMap.delete(key);
      return;
    }
    const existing = mergedMap.get(key) || {};
    mergedMap.set(key, {
      ...existing,
      student_section_id: p.student_section_id,
      student_id: p.student_id || existing.student_id,
      words_correct: p.words_correct !== undefined ? p.words_correct : existing.words_correct,
      comp_correct: p.comp_correct !== undefined ? p.comp_correct : existing.comp_correct,
      oral_reading_level: p.oral_reading_level !== undefined ? p.oral_reading_level : existing.oral_reading_level,
      comp_level: p.comp_level !== undefined ? p.comp_level : existing.comp_level,
      overall_reading_level: p.overall_reading_level !== undefined ? p.overall_reading_level : existing.overall_reading_level,
    });
  });
  return Array.from(mergedMap.values());
}

/**
 * Fetch PHIL-IRI records for a specific section and test type ('PRE_TEST' or 'POST_TEST').
 * Employs Stale-While-Revalidate (SWR) cache via IndexedDB with automatic offline overlay.
 */
export async function getPhilIriRecords(sectionId, testType = "POST_TEST", subjectOfferingId = null, schoolYearId = null, force = false) {
  const scope = getSessionScope();
  assertCurrentSession(scope);
  const cacheKey = `phil_iri_${sectionId}_${testType}_${schoolYearId || 'all'}`;

  // 1. Instant SWR: Read from Dexie persistent cache
  let cachedPayload = null;
  try {
    cachedPayload = await getPersistentCache(cacheKey, scope);
  } catch (_) {}

  const pendingOffline = await getPendingOfflinePhilIri(sectionId, testType).catch(() => []);

  if (cachedPayload && Array.isArray(cachedPayload.records) && !force) {
    const mergedRecords = mergeOfflinePhilIriRecords(cachedPayload.records, pendingOffline);
    const cacheAge = Date.now() - (cachedPayload.updatedAt || (cachedPayload.savedAt ? new Date(cachedPayload.savedAt).getTime() : 0));
    // Background revalidate if online, cache is older than 5s, and no recent save is in progress
    if (typeof navigator !== 'undefined' && navigator.onLine && pendingOffline.length === 0 && cacheAge > 5000 && Date.now() - lastPhilIriSaveTimestamp > 5000) {
      const swrStartedAt = Date.now();
      let url = `${API_BASE_URL}/phil-iri/${encodeURIComponent(sectionId)}?testType=${encodeURIComponent(testType)}`;
      if (subjectOfferingId) url += `&subjectOfferingId=${encodeURIComponent(subjectOfferingId)}`;
      if (schoolYearId) url += `&schoolYearId=${encodeURIComponent(schoolYearId)}`;

      fetch(url, { force: true })
        .then(r => (r.ok && r.headers?.get('x-auralis-offline-fallback') !== '1' ? r.json() : null))
        .then(data => {
          if (lastPhilIriSaveTimestamp > swrStartedAt) return;
          if (data?.tableReady && Array.isArray(data.records)) {
            const freshPayload = {
              records: data.records,
              coordinator: data.coordinator || cachedPayload.coordinator || null,
              passageWordsCount: data.passageWordsCount || cachedPayload.passageWordsCount,
              totalCompItems: data.totalCompItems || cachedPayload.totalCompItems,
              updatedAt: Date.now(),
              savedAt: new Date().toISOString(),
            };
            setPersistentCache(cacheKey, freshPayload, undefined, scope).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return {
      records: mergedRecords,
      coordinator: cachedPayload.coordinator || null,
      passageWordsCount: cachedPayload.passageWordsCount,
      totalCompItems: cachedPayload.totalCompItems,
      source: "cache",
      tableReady: true,
      pendingCount: pendingOffline.length,
    };
  }

  // 2. Fetch from Network
  try {
    let url = `${API_BASE_URL}/phil-iri/${encodeURIComponent(sectionId)}?testType=${encodeURIComponent(testType)}`;
    if (subjectOfferingId) url += `&subjectOfferingId=${encodeURIComponent(subjectOfferingId)}`;
    if (schoolYearId) url += `&schoolYearId=${encodeURIComponent(schoolYearId)}`;

    const res = await fetch(url, { force: Boolean(force) });
    if (res.ok) {
      const isOfflineFallback = res.headers?.get('x-auralis-offline-fallback') === '1' || (typeof navigator !== 'undefined' && navigator.onLine === false);
      const data = await res.json();
      assertCurrentSession(scope);
      if (isOfflineFallback && cachedPayload && Array.isArray(cachedPayload.records)) {
        const mergedRecords = mergeOfflinePhilIriRecords(cachedPayload.records, pendingOffline);
        return {
          records: mergedRecords,
          coordinator: cachedPayload.coordinator || data.coordinator || null,
          passageWordsCount: cachedPayload.passageWordsCount || data.passageWordsCount,
          totalCompItems: cachedPayload.totalCompItems || data.totalCompItems,
          source: "cache",
          tableReady: true,
          pendingCount: pendingOffline.length,
        };
      }
      if (data.tableReady) {
        const payloadToCache = {
          records: Array.isArray(data.records) ? data.records : [],
          coordinator: data.coordinator || null,
          passageWordsCount: data.passageWordsCount,
          totalCompItems: data.totalCompItems,
          updatedAt: Date.now(),
          savedAt: new Date().toISOString(),
        };
        if (!isOfflineFallback) {
          await setPersistentCache(cacheKey, payloadToCache, undefined, scope).catch(() => {});
        }

        const mergedRecords = mergeOfflinePhilIriRecords(payloadToCache.records, pendingOffline);
        return {
          records: mergedRecords,
          coordinator: data.coordinator || null,
          passageWordsCount: data.passageWordsCount,
          totalCompItems: data.totalCompItems,
          source: "database",
          tableReady: true,
          pendingCount: pendingOffline.length,
        };
      }
    }
  } catch (err) {
    assertCurrentSession(scope);
    if (!isNetworkError(err)) throw err;
    console.warn("Could not reach PHIL-IRI backend API, falling back to persistent cache/offline:", err);
  }

  // 3. Fallback to cached payload or pending offline
  if (cachedPayload && Array.isArray(cachedPayload.records)) {
    const mergedRecords = mergeOfflinePhilIriRecords(cachedPayload.records, pendingOffline);
    return {
      records: mergedRecords,
      coordinator: cachedPayload.coordinator || null,
      passageWordsCount: cachedPayload.passageWordsCount,
      totalCompItems: cachedPayload.totalCompItems,
      source: "cache",
      tableReady: true,
      pendingCount: pendingOffline.length,
    };
  }

  if (pendingOffline.length > 0) {
    return {
      records: pendingOffline,
      source: "offline",
      tableReady: true,
      pendingCount: pendingOffline.length,
    };
  }

  // Fallback to legacy local storage if available
  const storageKey = getStorageKey(sectionId, testType, schoolYearId, scope);
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const localCache = JSON.parse(raw);
      if (localCache && Array.isArray(localCache.records)) {
        return {
          records: localCache.records,
          passageWordsCount: localCache.passageWordsCount,
          totalCompItems: localCache.totalCompItems,
          source: "localStorage",
          tableReady: false,
        };
      }
    }
  } catch {}

  return {
    records: [],
    source: "empty",
    tableReady: false,
  };
}

/**
 * Save batch PHIL-IRI records to database and local offline storage with automatic outbox sync.
 */
export async function savePhilIriBatch({
  sectionId,
  subjectOfferingId,
  schoolYearId,
  userId,
  testType = "POST_TEST",
  records = [],
  passageWordsCount = 70,
  totalCompItems = 5,
}) {
  const scope = getSessionScope();
  assertCurrentSession(scope);
  lastPhilIriSaveTimestamp = Date.now();
  const cacheKey = `phil_iri_${sectionId}_${testType}_${schoolYearId || 'all'}`;
  const storageKey = getStorageKey(sectionId, testType, schoolYearId, scope);
  const nonClearedRecords = records.filter(r => !r._cleared);

  // Always update persistent cache + localStorage immediately
  try {
    const existingCache = (await getPersistentCache(cacheKey, scope)) || {};
    await setPersistentCache(cacheKey, {
      ...existingCache,
      records: nonClearedRecords,
      passageWordsCount,
      totalCompItems,
      updatedAt: Date.now(),
      savedAt: new Date().toISOString(),
    }, undefined, scope);
  } catch (_) {}

  try {
    localStorage.setItem(storageKey, JSON.stringify({
      records: nonClearedRecords,
      passageWordsCount,
      totalCompItems,
      savedAt: new Date().toISOString(),
    }));
  } catch (_) {}

  // 1. If currently offline, directly save to IndexedDB offlinePhilIri + outbox queue
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await saveOfflinePhilIri({
      sectionId,
      subjectOfferingId,
      schoolYearId,
      userId,
      testType,
      records,
    }).catch(e => console.warn("[PhilIriApi] saveOfflinePhilIri warning:", e));
    return {
      success: true,
      offline: true,
      tableReady: true,
      source: "offline",
      message: "Saved locally. Changes will sync to the cloud when online.",
    };
  }

  // 2. If online, persist to MySQL backend API
  try {
    const res = await fetch(`${API_BASE_URL}/phil-iri/batch`, {
      method: "POST",
      queueOffline: false,
      headers: {
        "Content-Type": "application/json",
        "X-Auralis-User-Id": String(userId || scope?.ownerId || ""),
      },
      body: JSON.stringify({
        records,
        sectionId,
        subjectOfferingId,
        schoolYearId,
        user_id: userId,
      }),
    });

    const data = await res.json().catch(() => ({}));
    assertCurrentSession(scope);
    lastPhilIriSaveTimestamp = Date.now();

    if (res.ok && data.success && !data.offline) {
      await clearOfflinePhilIri(sectionId, testType).catch(() => {});
      return { success: true, tableReady: true, source: "database" };
    } else {
      await saveOfflinePhilIri({
        sectionId,
        subjectOfferingId,
        schoolYearId,
        userId,
        testType,
        records,
      }).catch(() => {});
      return {
        success: true,
        offline: true,
        tableReady: true,
        source: "offline",
        message: data.message || "Saved locally. Changes will sync to the cloud when online.",
      };
    }
  } catch (err) {
    assertCurrentSession(scope);
    if (!isNetworkError(err)) throw err;
    console.warn("Failed to reach PHIL-IRI batch endpoint; scores safely queued offline:", err);
    await saveOfflinePhilIri({
      sectionId,
      subjectOfferingId,
      schoolYearId,
      userId,
      testType,
      records,
    }).catch(() => {});
    return {
      success: true,
      offline: true,
      tableReady: true,
      source: "offline",
      message: "Saved locally. Changes will sync to the cloud when online.",
    };
  }
}
