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

function isMapehText(name = "", code = "") {
  const str = `${name} ${code}`.toLowerCase();
  return (
    str.includes("mapeh") ||
    str.includes("music") ||
    str.includes("arts") ||
    str.includes("physical education") ||
    str.includes("pe &") ||
    str.includes("health")
  );
}

function detectOfflineClassMeta(subjectOfferingId, subjectId) {
  try {
    const user = getStoredUser();
    const uid = user?.user_id || user?.id;
    const raw =
      (uid && localStorage.getItem(`auralis_assigned_classes_${uid}`)) ||
      localStorage.getItem("cachedAssignedClasses");
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const match = list.find(
          (c) =>
            String(c.subject_offering_id || c.offering_id || "") === String(subjectOfferingId) ||
            (subjectId && String(c.subject_id) === String(subjectId))
        );
        if (match) {
          const subjName = match.subject_name || match.subjectName || match.subject || "";
          const subjCode = match.subject_code || match.subjectCode || "";
          return {
            subject_name: subjName,
            subject_code: subjCode,
            section_name: match.section_name || match.sectionName || match.section || "",
            grade_level: match.grade_level || match.gradeLevel || match.grade || "",
            is_mapeh: isMapehText(subjName, subjCode),
          };
        }
      }
    }
  } catch (_) {}
  return { subject_name: "", subject_code: "", section_name: "", grade_level: "", is_mapeh: false };
}

function buildDefaultOfflineAssessments(isMapeh = false, mapehComponent = null) {
  const comp = isMapeh ? (mapehComponent || "MA") : null;
  const suffix = comp ? `_${comp}` : "";
  return [
    {
      assessment_id: `ww_default_1${suffix}`,
      activity_id: `ww_default_1${suffix}`,
      activity_name: "Written Work 1",
      title: "Written Work 1",
      component_code: "WW",
      type: "writtenWork",
      max_score: 20,
      highest_possible_score: 20,
      mapeh_component: comp,
      status: "ACTIVE",
    },
    {
      assessment_id: `pt_default_1${suffix}`,
      activity_id: `pt_default_1${suffix}`,
      activity_name: "Performance Task 1",
      title: "Performance Task 1",
      component_code: "PT",
      type: "performanceTask",
      max_score: 50,
      highest_possible_score: 50,
      mapeh_component: comp,
      status: "ACTIVE",
    },
    {
      assessment_id: `st1_default${suffix}`,
      activity_id: `st1_default${suffix}`,
      activity_name: "Summative Test 1",
      title: "Summative Test 1",
      component_code: "QA",
      type: "quarterlyAssessment",
      max_score: isMapeh ? 25 : 30,
      highest_possible_score: isMapeh ? 25 : 30,
      mapeh_component: comp,
      status: "ACTIVE",
    },
    {
      assessment_id: `st2_default${suffix}`,
      activity_id: `st2_default${suffix}`,
      activity_name: "Summative Test 2",
      title: "Summative Test 2",
      component_code: "QA",
      type: "quarterlyAssessment",
      max_score: isMapeh ? 25 : 30,
      highest_possible_score: isMapeh ? 25 : 30,
      mapeh_component: comp,
      status: "ACTIVE",
    },
    {
      assessment_id: `te_default${suffix}`,
      activity_id: `te_default${suffix}`,
      activity_name: "Term Exam",
      title: "Term Exam",
      component_code: "QA",
      type: "quarterlyAssessment",
      max_score: isMapeh ? 25 : 40,
      highest_possible_score: isMapeh ? 25 : 40,
      mapeh_component: comp,
      status: "ACTIVE",
    },
  ];
}

function countEncodedScores(record) {
  if (!record || !Array.isArray(record.students)) return 0;
  let count = 0;
  for (const st of record.students) {
    if (st?.scores && typeof st.scores === "object") {
      for (const v of Object.values(st.scores)) {
        if (v !== "" && v !== null && v !== undefined) count += 1;
      }
    }
    if (st?.examinations && typeof st.examinations === "object") {
      for (const v of Object.values(st.examinations)) {
        if (v !== "" && v !== null && v !== undefined) count += 1;
      }
    }
  }
  return count;
}

function mergeRecordStudentScores(primary, secondary) {
  if (!primary?.class_context) return secondary;
  if (!secondary?.class_context || !Array.isArray(secondary.students)) return primary;
  if (!Array.isArray(primary.students) || primary.students.length === 0) return secondary;

  const secByStudentId = new Map();
  secondary.students.forEach((st) => {
    if (st?.student_id != null) secByStudentId.set(String(st.student_id), st);
  });

  const mergedStudents = primary.students.map((st) => {
    const other = secByStudentId.get(String(st.student_id));
    if (!other) return st;
    const mergedScores = { ...(other.scores || {}) };
    if (st.scores && typeof st.scores === "object") {
      Object.entries(st.scores).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) {
          mergedScores[k] = v;
        }
      });
    }
    const mergedExams = { ...(other.examinations || {}) };
    if (st.examinations && typeof st.examinations === "object") {
      Object.entries(st.examinations).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) {
          mergedExams[k] = v;
        }
      });
    }
    return {
      ...st,
      scores: mergedScores,
      examinations: mergedExams,
    };
  });

  const primaryHasRealAssessments =
    Array.isArray(primary.assessments) &&
    primary.assessments.length > 0 &&
    !primary.assessments.some((a) => String(a.assessment_id || a.activity_id || "").includes("_default"));
  const secondaryHasRealAssessments =
    Array.isArray(secondary.assessments) &&
    secondary.assessments.length > 0 &&
    !secondary.assessments.some((a) => String(a.assessment_id || a.activity_id || "").includes("_default"));

  return {
    ...primary,
    assessments: primaryHasRealAssessments
      ? primary.assessments
      : secondaryHasRealAssessments
        ? secondary.assessments
        : primary.assessments,
    students: mergedStudents,
  };
}

function sanitizeCachedRecord(record, subjectOfferingId, subjectId, mapehComponent) {
  if (!record || !record.class_context) return record;
  const offlineMeta = detectOfflineClassMeta(subjectOfferingId, subjectId);
  const ctxName = record.class_context?.subject_name || record.subject_name || offlineMeta.subject_name || "";
  const ctxCode = record.class_context?.subject_code || record.subject_code || offlineMeta.subject_code || "";
  const hasKnownSubject = Boolean(ctxName || ctxCode);
  const hasDefaultAssessments =
    Array.isArray(record.assessments) &&
    record.assessments.some((a) => String(a.assessment_id || a.activity_id || "").includes("_default"));
  const isSynthesized = Boolean(
    record._synthesizedFromFallback ||
    (hasDefaultAssessments && countEncodedScores(record) === 0) ||
    (!record.grade_sheet_id && !record.grade_sheet?.grade_sheet_id && !record.class_context?.subject_name)
  );
  const realIsMapeh = hasKnownSubject
    ? isMapehText(ctxName, ctxCode)
    : Boolean(record.is_mapeh && !isSynthesized);
  const realComp = realIsMapeh ? (record.mapeh_component || mapehComponent || "MA") : null;
  const assessments =
    Array.isArray(record.assessments) && record.assessments.length > 0
      ? record.assessments.map((a) => (realIsMapeh ? a : { ...a, mapeh_component: null }))
      : buildDefaultOfflineAssessments(realIsMapeh, realComp);

  return {
    ...record,
    class_context: {
      ...record.class_context,
      subject_name: record.class_context.subject_name || offlineMeta.subject_name || undefined,
      subject_code: record.class_context.subject_code || offlineMeta.subject_code || undefined,
      is_mapeh: realIsMapeh,
    },
    assessments,
    is_mapeh: realIsMapeh,
    mapeh_component: realComp,
    _synthesizedFromFallback: isSynthesized,
  };
}

function getCandidateCacheKeys(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly) {
  const suffix = readOnly ? "_readOnly" : "";
  const sec = sectionId || "";
  const comp = mapehComponent || "";
  const subj = subjectId || "";
  return Array.from(
    new Set([
      `classRecord_v2_${subjectOfferingId}_${term}_${sec}_${comp}_${subj}${suffix}`,
      `classRecord_v2_${subjectOfferingId}_${term}_${sec}_${comp}_${suffix}`,
      `classRecord_v2_${subjectOfferingId}_${term}_${sec}__${subj}${suffix}`,
      `classRecord_v2_${subjectOfferingId}_${term}_${sec}__${suffix}`,
      `classRecord_v2_${subjectOfferingId}_${term}__${comp}_${subj}${suffix}`,
      `classRecord_v2_${subjectOfferingId}_${term}___${suffix}`,
    ])
  );
}

function getLocalStorageMirrorKeys(subjectOfferingId, term, mapehComponent) {
  const comp = mapehComponent || "ALL";
  return Array.from(
    new Set([
      `auralis_cr_v2_${subjectOfferingId}_${term}_${comp}`,
      `auralis_cr_v2_${subjectOfferingId}_${term}_ALL`,
    ])
  );
}

async function findCachedClassRecord(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly, scope) {
  const keys = getCandidateCacheKeys(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly);
  const candidates = [];

  for (const k of keys) {
    const item = await getPersistentCache(k, scope);
    if (item?.class_context) {
      const sanitized = sanitizeCachedRecord(item, subjectOfferingId, subjectId, mapehComponent);
      if (sanitized.is_mapeh && mapehComponent && sanitized.mapeh_component && sanitized.mapeh_component !== mapehComponent) {
        continue;
      }
      candidates.push(sanitized);
    }
  }

  if (typeof localStorage !== "undefined") {
    for (const lsKey of getLocalStorageMirrorKeys(subjectOfferingId, term, mapehComponent)) {
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.class_context) {
            const sanitized = sanitizeCachedRecord(parsed, subjectOfferingId, subjectId, mapehComponent);
            if (!sanitized.is_mapeh || !mapehComponent || !sanitized.mapeh_component || sanitized.mapeh_component === mapehComponent) {
              candidates.push(sanitized);
            }
          }
        }
      } catch (_) {}
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const scoresA = countEncodedScores(a);
    const scoresB = countEncodedScores(b);
    if (scoresA !== scoresB) return scoresB - scoresA;
    const synthA = a._synthesizedFromFallback ? 1 : 0;
    const synthB = b._synthesizedFromFallback ? 1 : 0;
    if (synthA !== synthB) return synthA - synthB;
    return (b._cachedAt || 0) - (a._cachedAt || 0);
  });

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    best = mergeRecordStudentScores(best, candidates[i]);
  }
  return best;
}

async function saveClassRecordToCache(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly, data, scope) {
  if (!data?.class_context) return;
  const sec = sectionId || data.class_context?.section_id || "";
  const subj = subjectId || data.class_context?.subject_id || "";
  const realComp = data.is_mapeh ? (data.mapeh_component || mapehComponent || "MA") : "";

  if (data._synthesizedFromFallback) {
    const existing = await findCachedClassRecord(subjectOfferingId, term, sec, realComp, subj, readOnly, scope);
    if (existing && (!existing._synthesizedFromFallback || countEncodedScores(existing) > 0)) {
      return;
    }
  }

  const recordToSave = {
    ...data,
    _cachedAt: Date.now(),
  };

  const keysToWrite = Array.from(
    new Set([
      ...getCandidateCacheKeys(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly),
      ...getCandidateCacheKeys(subjectOfferingId, term, sec, realComp, subj, readOnly),
    ])
  );
  for (const k of keysToWrite) {
    await setPersistentCache(k, recordToSave, undefined, scope).catch(() => {});
  }

  if (typeof localStorage !== "undefined" && !readOnly) {
    for (const lsKey of getLocalStorageMirrorKeys(subjectOfferingId, term, realComp)) {
      try {
        localStorage.setItem(lsKey, JSON.stringify(recordToSave));
      } catch (_) {}
    }
  }
}

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

  // Instant SWR: If not forcing a refresh, return cached data immediately when offline or when cached record already has encoded scores
  if (!force) {
    const cached = await findCachedClassRecord(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly, scope);
    const isOnlineNow = typeof navigator === 'undefined' || navigator.onLine !== false;
    const hasScores = countEncodedScores(cached) > 0;
    if (cached?.class_context && (!isOnlineNow || (!cached._synthesizedFromFallback && hasScores))) {
      // Revalidate in background quietly if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch(url, { force: true, throwOnAuthError: false })
          .then(async r => {
            if (r?.headers?.get('x-auralis-offline-fallback') === '1') return null;
            return parseResponse(r);
          })
          .then(fresh => {
            if (fresh?.class_context) {
              saveClassRecordToCache(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly, fresh, scope);
            }
          })
          .catch(() => {});
      }
      return cached;
    }
  }

  try {
    const res = await fetch(url, { force: Boolean(force), throwOnAuthError: false });
    const isOfflineFallback = res?.headers?.get('x-auralis-offline-fallback') === '1' || (typeof navigator !== 'undefined' && navigator.onLine === false);
    const data = await parseResponse(res);
    if (scope) assertCurrentSession(scope);

    if (isOfflineFallback) {
      const cached = await findCachedClassRecord(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly, scope);
      const sanitizedData = data?.class_context ? sanitizeCachedRecord(data, subjectOfferingId, subjectId, mapehComponent) : null;
      if (cached?.class_context && sanitizedData?.class_context) {
        const primary = countEncodedScores(cached) >= countEncodedScores(sanitizedData) ? cached : sanitizedData;
        const secondary = primary === cached ? sanitizedData : cached;
        return mergeRecordStudentScores(primary, secondary);
      }
      if (cached?.class_context) return cached;
      if (sanitizedData?.class_context) return sanitizedData;
    }

    if (data?.class_context) {
      if (!isOfflineFallback) {
        await saveClassRecordToCache(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly, data, scope);
      }

      // Quietly pre-fetch other terms in the background while online so they are available offline
      if (typeof window !== 'undefined' && navigator.onLine && !isOfflineFallback) {
        const otherTerms = ['T1', 'T2', 'T3'].filter(t => t !== term);
        for (const otherTerm of otherTerms) {
          findCachedClassRecord(subjectOfferingId, otherTerm, sectionId, mapehComponent, subjectId, readOnly, scope).then(existing => {
            if ((!existing || existing._synthesizedFromFallback || countEncodedScores(existing) === 0) && navigator.onLine) {
              let otherUrl = `${API_BASE_URL}/class-record/${subjectOfferingId}?term=${encodeURIComponent(otherTerm)}&gradeFlowVersion=2`;
              if (sectionId) otherUrl += `&section_id=${encodeURIComponent(sectionId)}`;
              if (mapehComponent) otherUrl += `&mapeh_component=${encodeURIComponent(mapehComponent)}`;
              if (subjectId) otherUrl += `&subject_id=${encodeURIComponent(subjectId)}`;
              if (readOnly) otherUrl += '&read_only=1';
              fetch(otherUrl, { force: true, throwOnAuthError: false })
                .then(r => {
                  if (r?.headers?.get('x-auralis-offline-fallback') === '1') return null;
                  return parseResponse(r);
                })
                .then(d => {
                  if (d?.class_context) {
                    saveClassRecordToCache(subjectOfferingId, otherTerm, sectionId, mapehComponent, subjectId, readOnly, d, scope);
                  }
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
    const cached = await findCachedClassRecord(subjectOfferingId, term, sectionId, mapehComponent, subjectId, readOnly, scope);
    if (cached?.class_context) {
      console.log(`[ClassRecordApi] Serving offline cached record for ${cacheKey}`);
      return cached;
    }

    // Resilient offline fallback 1: Check if another term exists for this class offering
    const otherTerms = ['T1', 'T2', 'T3'].filter(t => t !== term);
    for (const otherTerm of otherTerms) {
      const otherCached = await findCachedClassRecord(subjectOfferingId, otherTerm, sectionId, mapehComponent, subjectId, readOnly, scope);
      if (otherCached?.class_context && Array.isArray(otherCached.students)) {
        console.log(`[ClassRecordApi] Synthesizing term ${term} from cached term ${otherTerm}`);
        const realIsMapeh = Boolean(otherCached.is_mapeh);
        const realComp = realIsMapeh ? (otherCached.mapeh_component || mapehComponent || "MA") : null;
        const synthesized = {
          ...otherCached,
          class_context: {
            ...otherCached.class_context,
            term,
            term_name: `Term ${String(term).replace('T', '')}`,
          },
          term,
          active_term: otherCached.active_term || term,
          assessments:
            Array.isArray(otherCached.assessments) && otherCached.assessments.length > 0
              ? otherCached.assessments
              : buildDefaultOfflineAssessments(realIsMapeh, realComp),
          students: otherCached.students.map(st => ({
            ...st,
            scores: {},
            examinations: {},
            saved_summary: null,
          })),
          is_mapeh: realIsMapeh,
          mapeh_component: realComp,
          _synthesizedFromFallback: true,
        };
        await saveClassRecordToCache(subjectOfferingId, term, sectionId, realComp, subjectId, readOnly, synthesized, scope);
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
      const offlineMeta = detectOfflineClassMeta(subjectOfferingId, subjectId);
      const realIsMapeh = Boolean(offlineMeta.is_mapeh);
      const realComp = realIsMapeh ? (mapehComponent || "MA") : null;
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
          subject_name: offlineMeta.subject_name || undefined,
          subject_code: offlineMeta.subject_code || undefined,
          section_name: offlineMeta.section_name || undefined,
          grade_level: offlineMeta.grade_level || undefined,
          term,
          active_term: term,
          is_locked: false,
          is_mapeh: realIsMapeh,
          term_name: `Term ${String(term).replace('T', '')}`,
          weights: { written_weight: 40, performance_weight: 40, quarterly_weight: 20 },
        },
        term,
        active_term: term,
        assessments: buildDefaultOfflineAssessments(realIsMapeh, realComp),
        students: formattedStudents,
        is_mapeh: realIsMapeh,
        mapeh_component: realComp,
        _synthesizedFromFallback: true,
      };

      await saveClassRecordToCache(subjectOfferingId, term, sectionId, realComp, subjectId, readOnly, synthesized, scope);
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
  if (!assessmentId || isNaN(Number(assessmentId))) {
    return { success: true, offline: true };
  }
  const res = await fetch(`${API_BASE_URL}/assessments/${assessmentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
};

export const deleteAssessment = async (assessmentId) => {
  if (!assessmentId || isNaN(Number(assessmentId))) {
    return { success: true, offline: true };
  }
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
