import { API_BASE_URL } from "./classRecordApi";

const getStorageKey = (sectionId, testType) => `phil_iri_${sectionId}_${testType}`;

/**
 * Fetch PHIL-IRI records for a specific section and test type ('PRE_TEST' or 'POST_TEST').
 * Automatically falls back to localStorage if table is not yet created in the database.
 */
export async function getPhilIriRecords(sectionId, testType = "PRE_TEST", subjectOfferingId = null) {
  const storageKey = getStorageKey(sectionId, testType);
  let localCache = null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) localCache = JSON.parse(raw);
  } catch (_) {}

  try {
    let url = `${API_BASE_URL}/phil-iri/${encodeURIComponent(sectionId)}?testType=${encodeURIComponent(testType)}`;
    if (subjectOfferingId) {
      url += `&subjectOfferingId=${encodeURIComponent(subjectOfferingId)}`;
    }
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
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
    console.warn("Could not reach PHIL-IRI backend API, falling back to local storage:", err);
  }

  // Fallback to local storage if available
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
  userId,
  testType = "PRE_TEST",
  records = [],
  passageWordsCount = 70,
  totalCompItems = 5,
}) {
  const storageKey = getStorageKey(sectionId, testType);

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
  } catch (_) {}

  // 2. Persist to MySQL backend API
  try {
    const res = await fetch(`${API_BASE_URL}/phil-iri/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records,
        sectionId,
        subjectOfferingId,
        user_id: userId,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, tableReady: true, source: "database" };
    } else {
      return {
        success: true,
        tableReady: data.tableReady ?? false,
        source: "localStorage",
        message: data.error || data.message || "Saved locally (database table not yet created).",
      };
    }
  } catch (err) {
    console.warn("Failed to reach PHIL-IRI batch endpoint; scores saved in local storage:", err);
    return {
      success: true,
      tableReady: false,
      source: "localStorage",
      message: "Saved locally (database offline or unreachable).",
    };
  }
}
