import { cachedApiFetch as fetch } from "./navigationCache";
import { API_BASE_URL } from "./classRecordApi";
import { accountDraftKey, getSessionScope, assertCurrentSession, isNetworkError } from "../offline/syncManager.js";

const getStorageKey = (sectionId, testType, schoolYearId, scope) =>
  accountDraftKey(`phil_iri_${sectionId}_${testType}${schoolYearId ? `_sy_${schoolYearId}` : ""}`, scope);

/**
 * Fetch PHIL-IRI records for a specific section and test type ('PRE_TEST' or 'POST_TEST').
 * Automatically falls back to localStorage if table is not yet created in the database.
 */
export async function getPhilIriRecords(sectionId, testType = "POST_TEST", subjectOfferingId = null, schoolYearId = null) {
  const scope = getSessionScope();
  assertCurrentSession(scope);
  const storageKey = getStorageKey(sectionId, testType, schoolYearId, scope);
  let localCache = null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) localCache = JSON.parse(raw);
  } catch { /* A missing or unreadable draft is not a successful server response. */ }

  try {
    let url = `${API_BASE_URL}/phil-iri/${encodeURIComponent(sectionId)}?testType=${encodeURIComponent(testType)}`;
    if (subjectOfferingId) {
      url += `&subjectOfferingId=${encodeURIComponent(subjectOfferingId)}`;
    }
    if (schoolYearId) url += `&schoolYearId=${encodeURIComponent(schoolYearId)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      assertCurrentSession(scope);
      if (data.tableReady) {
        return {
          records: Array.isArray(data.records) ? data.records : [],
          coordinator: data.coordinator || null,
          source: "database",
          tableReady: true,
        };
      }
    }
  } catch (err) {
    assertCurrentSession(scope);
    if (!isNetworkError(err)) throw err;
    console.warn("Could not reach PHIL-IRI backend API, falling back to local storage:", err);
  }

  // Fallback to local storage if available
  assertCurrentSession(scope);
  if (localCache && Array.isArray(localCache.records)) {
    return {
      records: localCache.records,
      passageWordsCount: localCache.passageWordsCount,
      totalCompItems: localCache.totalCompItems,
      source: "localStorage",
      tableReady: false,
    };
  }

  return {
    records: [],
    source: "empty",
    tableReady: false,
  };
}

/**
 * Save batch PHIL-IRI records to database and local storage backup.
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
  const storageKey = getStorageKey(sectionId, testType, schoolYearId, scope);
  let savedLocally = false;

  // 1. Always backup to local storage first to prevent any data loss
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        records,
        passageWordsCount,
        totalCompItems,
        savedAt: new Date().toISOString(),
      })
    );
    savedLocally = true;
  } catch { /* Only report a local save below if persistence actually succeeded. */ }

  // 2. Persist to MySQL backend API
  try {
    const res = await fetch(`${API_BASE_URL}/phil-iri/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    if (data.offline) return { success: true, offline: true, tableReady: false, source: "localStorage", message: data.message };
    if (res.ok && data.success) {
      return { success: true, tableReady: true, source: "database" };
    } else {
      if (!savedLocally) throw new Error("Unable to save the PHIL-IRI records locally or to the server.");
      return {
        success: true,
        tableReady: data.tableReady ?? false,
        source: "localStorage",
        message: data.error || data.message || "Saved locally (database table not yet created).",
      };
    }
  } catch (err) {
    assertCurrentSession(scope);
    if (!savedLocally || !isNetworkError(err)) throw err;
    console.warn("Failed to reach PHIL-IRI batch endpoint; scores saved in local storage:", err);
    return {
      success: true,
      tableReady: false,
      source: "localStorage",
      message: "Saved locally (database offline or unreachable).",
    };
  }
}
