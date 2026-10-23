import { apiFetch, cachedApiFetch, clearNavigationCache } from "./navigationCache.js";
import { getStoredUser } from "../utils/auth.js";
import {
  getPersistentCache,
  removePersistentCache,
  saveOfflineScores,
  getPendingOfflineScores,
  getSessionScope,
  assertCurrentSession,
  isNetworkError,
} from "../offline/syncManager.js";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

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

  try {
    const res = await fetch(url, { force, throwOnAuthError: false });
    const data = await parseResponse(res);
    assertCurrentSession(scope);
    return data;
  } catch (err) {
    // Preserve access to an older same-session snapshot made before the shared
    // read-cache integration. New reads use the shared cache above.
    assertCurrentSession(scope);
    if ([401, 403].includes(err.status)) await removePersistentCache(cacheKey, scope);
    if (!isNetworkError(err)) throw err;
    const cached = await getPersistentCache(cacheKey, scope);
    if (cached) {
      console.log(`[ClassRecordApi] Serving offline cached record for ${cacheKey}`);
      return cached;
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
  return parseResponse(res);
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
    assertCurrentSession(scope);
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
