import { apiFetch, cachedApiFetch, clearNavigationCache } from "./navigationCache.js";
import { getStoredUser } from "../utils/auth.js";
import {
  getPersistentCache,
  setPersistentCache,
  removePersistentCache,
  saveOfflineScores,
  getPendingOfflineScores,
  getSessionScope,
  assertCurrentSession,
  isNetworkError,
} from "../offline/syncManager.js";

import { API_BASE_URL } from "./apiConfig.js";
export { API_BASE_URL };

const fetch = (url, options = {}) => {
  const user = getStoredUser();
  const userId = user?.user_id || user?.id;
  return cachedApiFetch(url, { ...options, headers: {
    ...(userId ? { "X-Auralis-User-Id": String(userId) } : {}), ...options.headers,
  } });
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return data;
};

export const getClassRecord = async (
  subjectOfferingId,
  term = "T1",
  sectionId = null,
  mapehComponent = null,
  subjectId = null,
  { force = false, readOnly = false } = {}
) => {
  const scope = getSessionScope();
  let url = `${API_BASE_URL}/class-record/${subjectOfferingId}?term=${encodeURIComponent(term)}&gradeFlowVersion=2`;
  if (sectionId) {
    url += `&section_id=${encodeURIComponent(sectionId)}`;
  }
  if (mapehComponent) {
    url += `&mapeh_component=${encodeURIComponent(mapehComponent)}`;
  }
  if (subjectId) {
    url += `&subject_id=${encodeURIComponent(subjectId)}`;
  }
  if (readOnly) url += '&read_only=1';

  const cacheKey = `classRecord_v2_${subjectOfferingId}_${term}_${sectionId || ""}_${mapehComponent || ""}_${subjectId || ""}${readOnly ? '_readOnly' : ''}`;

  // Instant SWR: If not forcing a refresh, return cached data immediately (0ms delay)
  if (!force) {
    const cached = await getPersistentCache(cacheKey, scope);
    if (cached?.class_context) {
      // Revalidate in background quietly if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch(url, { force: true, throwOnAuthError: false })
          .then(parseResponse)
          .then(fresh => {
            if (fresh?.class_context) {
              setPersistentCache(cacheKey, fresh, undefined, scope);
            }
          })
          .catch(() => {});
      }
      return cached;
    }
  }

  try {
    const res = await fetch(url, { force: Boolean(force), throwOnAuthError: false });
    const data = await parseResponse(res);
    if (scope) assertCurrentSession(scope);

    if (data?.class_context) {
      await setPersistentCache(cacheKey, data, undefined, scope);

      // Quietly pre-fetch other terms in the background while online so they are available offline
      if (typeof window !== 'undefined' && navigator.onLine) {
        const otherTerms = ['T1', 'T2', 'T3'].filter(t => t !== term);
        for (const otherTerm of otherTerms) {
          const otherKey = `classRecord_v2_${subjectOfferingId}_${otherTerm}_${sectionId || ""}_${mapehComponent || ""}_${subjectId || ""}${readOnly ? '_readOnly' : ''}`;
          getPersistentCache(otherKey, scope).then(existing => {
            if (!existing && navigator.onLine) {
              let otherUrl = `${API_BASE_URL}/class-record/${subjectOfferingId}?term=${encodeURIComponent(otherTerm)}&gradeFlowVersion=2`;
              if (sectionId) otherUrl += `&section_id=${encodeURIComponent(sectionId)}`;
              if (mapehComponent) otherUrl += `&mapeh_component=${encodeURIComponent(mapehComponent)}`;
              if (subjectId) otherUrl += `&subject_id=${encodeURIComponent(subjectId)}`;
              if (readOnly) otherUrl += '&read_only=1';
              fetch(otherUrl, { throwOnAuthError: false })
                .then(r => parseResponse(r))
                .then(d => {
                  if (d?.class_context) setPersistentCache(otherKey, d, undefined, scope);
                })
                .catch(() => {});
            }
          }).catch(() => {});
        }
      }
    }

    return data;
  } catch (err) {
    if (scope) assertCurrentSession(scope);
    if ([401, 403].includes(err.status)) await removePersistentCache(cacheKey, scope);
    const cached = await getPersistentCache(cacheKey, scope);
    if (cached?.class_context) {
      console.log(`[ClassRecordApi] Serving offline cached record for ${cacheKey}`);
      return cached;
    }

    // Resilient offline fallback 1: Check if another term exists for this class offering
    const otherTerms = ['T1', 'T2', 'T3'].filter(t => t !== term);
    for (const otherTerm of otherTerms) {
      const otherKey = `classRecord_v2_${subjectOfferingId}_${otherTerm}_${sectionId || ""}_${mapehComponent || ""}_${subjectId || ""}${readOnly ? '_readOnly' : ''}`;
      const otherCached = await getPersistentCache(otherKey, scope);
      if (otherCached?.class_context && Array.isArray(otherCached.students)) {
        console.log(`[ClassRecordApi] Synthesizing term ${term} from cached term ${otherTerm}`);
        const synthesized = {
          ...otherCached,
          class_context: {
            ...otherCached.class_context,
            term,
            term_name: `Term ${String(term).replace('T', '')}`,
          },
          term,
          active_term: otherCached.active_term || term,
          assessments: [],
          students: otherCached.students.map(st => ({
            ...st,
            scores: {},
            examinations: {},
            saved_summary: null,
          })),
        };
        await setPersistentCache(cacheKey, synthesized, undefined, scope).catch(() => {});
        return synthesized;
      }
    }

    // Resilient offline fallback 2: Check if section students exist in localStorage or Dexie cache
    let studentList = null;
    if (sectionId) {
      try {
        const rawLocal = localStorage.getItem(`auralis_students_section_${sectionId}`);
        if (rawLocal) studentList = JSON.parse(rawLocal);
      } catch (_) {}
      if (!Array.isArray(studentList) || studentList.length === 0) {
        studentList = await getPersistentCache(`students:section:${sectionId}`, scope).catch(() => null);
      }
    }

    if (Array.isArray(studentList) && studentList.length > 0) {
      console.log(`[ClassRecordApi] Synthesizing offline initial record from ${studentList.length} cached students`);
      const formattedStudents = studentList.map(st => ({
        student_id: st.student_id || st.id,
        student_section_id: st.student_section_id || st.id,
        LRN: st.lrn || st.LRN || "",
        first_name: st.first_name || st.firstName || "Unknown",
        last_name: st.last_name || st.lastName || "",
        middle_name: st.middle_name || st.middleName || "",
        sex: st.sex || "M",
        scores: {},
        examinations: {},
      }));

      const synthesized = {
        class_context: {
          subject_offering_id: subjectOfferingId,
          section_id: sectionId,
          term,
          active_term: term,
          is_locked: false,
          term_name: `Term ${String(term).replace('T', '')}`,
          weights: { written_weight: 40, performance_weight: 40, quarterly_weight: 20 },
        },
        term,
        active_term: term,
        assessments: [],
        students: formattedStudents,
        is_mapeh: Boolean(mapehComponent),
        mapeh_component: mapehComponent || null,
      };

      await setPersistentCache(cacheKey, synthesized, undefined, scope).catch(() => {});
      return synthesized;
    }

    throw err;
  }
};

export const createAssessment = async (payload) => {
  const res = await fetch(`${API_BASE_URL}/assessments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  if (data?.offline && !data.assessment) {
    const tempId = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    data.assessment = {
      assessment_id: tempId,
      activity_id: tempId,
      activity_name: payload.activity_name || payload.title,
      title: payload.activity_name || payload.title,
      component_code: payload.component_code,
      type: payload.type,
      max_score: payload.max_score || payload.highest_possible_score,
      highest_possible_score: payload.max_score || payload.highest_possible_score,
      activity_date: payload.activity_date || null,
      mapeh_component: payload.mapeh_component || null,
      status: "ACTIVE",
    };
  }
  return data;
};

export const updateAssessment = async (assessmentId, payload) => {
  const res = await fetch(`${API_BASE_URL}/assessments/${assessmentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
};

export const deleteAssessment = async (assessmentId) => {
  const res = await fetch(`${API_BASE_URL}/assessments/${assessmentId}`, {
    method: "DELETE",
  });
  return parseResponse(res);
};

export const saveScoresBatch = async ({ subject_offering_id, term = "T1", scores, mapeh_component = null, examConfig = null }, scope = getSessionScope()) => {
  assertCurrentSession(scope);
  const payload = {
    subject_offering_id,
    term,
    scores,
  };
  if (mapeh_component) {
    payload.mapeh_component = mapeh_component;
  }
  if (examConfig) {
    payload.examConfig = examConfig;
  }

  const url = `${API_BASE_URL}/scores/batch`;

  // If currently offline, directly persist to IndexedDB offlineScores and outbox queue
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await saveOfflineScores({
      subject_offering_id,
      term,
      scores,
      mapeh_component,
      examConfig,
      apiUrl: url,
    }, scope);
    clearNavigationCache({ persistent: false });
    return {
      success: true,
      offline: true,
      message: "Scores saved locally. Will sync when back online.",
      students: {},
    };
  }

  try {
    const res = await fetch(url, {
      queueOffline: false, // Scores need their overlay and outbox entry saved atomically below.
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await parseResponse(res);
    assertCurrentSession(scope);
    return data;
  } catch (err) {
    if (scope) assertCurrentSession(scope);
    if (!isNetworkError(err)) throw err;
    // Only a network failure can fall back to offline storage, never a server rejection.
    console.warn("[ClassRecordApi] Network error during batch save, storing offline:", err.message);
    await saveOfflineScores({
      subject_offering_id,
      term,
      scores,
      mapeh_component,
      examConfig,
      apiUrl: url,
    }, scope);
    clearNavigationCache({ persistent: false });
    return {
      success: true,
      offline: true,
      message: "Scores saved locally (offline fallback). Will sync when online.",
      students: {},
    };
  }
};

export const calculateAndSaveGrades = async (subject_offering_id, term = "T1", mapeh_component = null) => {
  const payload = { subject_offering_id, term };
  if (mapeh_component) payload.mapeh_component = mapeh_component;
  const res = await fetch(`${API_BASE_URL}/class-record/calculate-and-save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
};

export const getExportClassRecordUrl = (subjectOfferingId, term = "T1", mapehComponent = null) => {
  let url = `${API_BASE_URL}/class-record/${subjectOfferingId}/export?term=${encodeURIComponent(term)}`;
  if (mapehComponent) {
    url += `&mapeh_component=${encodeURIComponent(mapehComponent)}`;
  }
  return url;
};

export const downloadClassRecordExcel = async (subjectOfferingId, term = "T1", mapehComponent = null) => {
  const url = getExportClassRecordUrl(subjectOfferingId, term, mapehComponent);
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Export failed with status ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition");
  let filename = `Class_Record_${subjectOfferingId}_${term}${mapehComponent ? `_${mapehComponent}` : ""}.xlsx`;
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
};

const classRecordApi = {
  getClassRecord,
  createAssessment,
  updateAssessment,
  updateAssessmentHps: (id, maxScore) => updateAssessment(id, { max_score: maxScore }),
  deleteAssessment,
  saveScoresBatch,
  batchSaveScores: (scores) => saveScoresBatch({ scores }),
  calculateAndSaveGrades,
  getExportClassRecordUrl,
  downloadClassRecordExcel,
  exportClassRecordExcel: downloadClassRecordExcel,
};

export default classRecordApi;

const gradeRequestHeaders = () => ({ 'Content-Type': 'application/json', 'X-Auralis-User-Id': String(getStoredUser()?.user_id || getStoredUser()?.id || '') });
export async function getTeacherGradingSummary(context, { force = false } = {}) {
  const query = new URLSearchParams({ section_id: context.section_id, school_year_id: context.school_year_id, gradeFlowVersion: '2' });
  const data = await parseResponse(await fetch(`${API_BASE_URL}/class-record/grading-summary/${context.subject_offering_id}?${query}`, { force, headers: gradeRequestHeaders() }));
  if (data?.summaryVersion !== 2 || !Array.isArray(data.students)
    || Number(data.context?.subjectOfferingId) !== Number(context.subject_offering_id)
    || Number(data.context?.sectionId) !== Number(context.section_id) || Number(data.context?.schoolYearId) !== Number(context.school_year_id)
    || (data.context.activeTerm !== null && !/^T[123]$/.test(data.context.activeTerm))) throw new Error('The grading sheet returned incomplete class information. Please retry.');
  return data;
}
export async function submitTeacherGrades(context) {
  const scope = getSessionScope();
  let pending;
  try { pending = await getPendingOfflineScores(context.subject_offering_id, context.term, scope, { strict: true }); }
  catch { throw new Error('Unable to check pending score edits. Reopen the class record and retry before submitting.'); }
  assertCurrentSession(scope);
  if (pending.length) throw new Error('Sync this term’s pending score edits before submitting grades to the adviser.');
  const data = await parseResponse(await apiFetch(`${API_BASE_URL}/class-record/submit`, {
    method: 'POST', headers: gradeRequestHeaders(), queueOffline: false, body: JSON.stringify(context),
  }));
  if (data?.submitted !== true || data.offline || data.submissionVersion !== 2 || data.term !== context.term
    || Number(data.subjectOfferingId) !== Number(context.subject_offering_id)
    || Number(data.sectionId) !== Number(context.section_id) || Number(data.schoolYearId) !== Number(context.school_year_id)) {
    throw new Error('The server did not confirm this class and term submission. Please retry online.');
  }
  return data;
}
