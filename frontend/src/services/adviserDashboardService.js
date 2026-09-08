/**
 * Adviser Dashboard Service
 *
 * REST endpoint connectors for the Adviser Dashboard with graceful fallback
 * to placeholder data when backend routes are not yet available.
 */

import {
  placeholderAdviserSummary,
  placeholderSubjectPerformance,
  placeholderAssignedClasses,
  placeholderGradeRangeDistribution,
  placeholderAttendanceTrend,
  placeholderTestExamAnalysis,
  placeholderSubjectAreaPerformance,
  placeholderCoreValues,
} from "./adviserDashboardPlaceholderData";

import { getStoredUser } from "../utils/auth";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const getEffectiveUserId = (userId) => {
  if (userId) return userId;
  const stored = getStoredUser();
  return stored?.user_id || stored?.id || null;
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.error || data.message || "The request could not be completed.",
    );
  }
  return data;
};

/**
 * Check if the given teacher is assigned as a section adviser
 * GET /api/adviser/dashboard/check-role/:userId
 */
export async function checkAdviserRole(userId) {
  const effectiveId = getEffectiveUserId(userId);
  if (!effectiveId) return { isAdviser: false, role: "subject teacher" };

  try {
    const response = await fetch(
      `${API_BASE_URL}/adviser/dashboard/check-role/${encodeURIComponent(effectiveId)}`,
    );
    return await parseResponse(response);
  } catch (error) {
    console.warn("Could not check adviser role from backend:", error.message);
    const stored = getStoredUser();
    return {
      isAdviser: !!(stored?.is_adviser || stored?.isAdviser),
      role: stored?.role || "subject teacher",
    };
  }
}

/**
 * REST Route: GET /api/adviser/dashboard/summary?userId=:userId
 * Retrieves overall KPI counters, section averages, and student counts.
 */
export async function getAdviserSummary(userId) {
  const effectiveId = getEffectiveUserId(userId);
  try {
    const url = effectiveId
      ? `${API_BASE_URL}/adviser/dashboard/summary?userId=${encodeURIComponent(effectiveId)}`
      : `${API_BASE_URL}/adviser/dashboard/summary`;
    const response = await fetch(url);
    return await parseResponse(response);
  } catch (error) {
    console.warn("getAdviserSummary fallback:", error.message);
    return placeholderAdviserSummary;
  }
}

/**
 * REST Route: GET /api/adviser/dashboard/subject-performance?userId=:userId&term=:term
 * Retrieves vertical bar chart data across sections for a given term.
 */
export async function getSubjectPerformance(term = "T1", userId) {
  const effectiveId = getEffectiveUserId(userId);
  try {
    let url = `${API_BASE_URL}/adviser/dashboard/subject-performance?term=${encodeURIComponent(term)}`;
    if (effectiveId) {
      url += `&userId=${encodeURIComponent(effectiveId)}`;
    }
    const response = await fetch(url);
    const data = await parseResponse(response);
    return data?.performance || placeholderSubjectPerformance[term] || [];
  } catch (error) {
    console.warn("getSubjectPerformance fallback:", error.message);
    return placeholderSubjectPerformance[term] || [];
  }
}

/**
 * REST Route: GET /api/adviser/dashboard/assigned-classes?userId=:userId
 * Retrieves the adviser's assigned classes, progress, and student enrollment.
 */
export async function getAssignedClasses(userId) {
  const effectiveId = getEffectiveUserId(userId);
  try {
    const url = effectiveId
      ? `${API_BASE_URL}/adviser/dashboard/assigned-classes?userId=${encodeURIComponent(effectiveId)}`
      : `${API_BASE_URL}/adviser/dashboard/assigned-classes`;
    const response = await fetch(url);
    const data = await parseResponse(response);
    return data?.classes || placeholderAssignedClasses;
  } catch (error) {
    console.warn("getAssignedClasses fallback:", error.message);
    return placeholderAssignedClasses;
  }
}

/**
 * REST Route: GET /api/adviser/dashboard/grade-distribution?userId=:userId&section=:section&term=:term
 * Retrieves 5-axis radar data for grade ranges.
 */
export async function getGradeRangeDistribution(section = "All", term = "T1", userId) {
  const effectiveId = getEffectiveUserId(userId);
  try {
    let url = `${API_BASE_URL}/adviser/dashboard/grade-distribution?section=${encodeURIComponent(section)}&term=${encodeURIComponent(term)}`;
    if (effectiveId) {
      url += `&userId=${encodeURIComponent(effectiveId)}`;
    }
    const response = await fetch(url);
    const data = await parseResponse(response);
    return (
      data?.distribution ||
      placeholderGradeRangeDistribution.sections[section]?.[term] ||
      placeholderGradeRangeDistribution.sections.All.T1
    );
  } catch (error) {
    console.warn("getGradeRangeDistribution fallback:", error.message);
    return (
      placeholderGradeRangeDistribution.sections[section]?.[term] ||
      placeholderGradeRangeDistribution.sections.All.T1
    );
  }
}

/**
 * REST Route: GET /api/adviser/dashboard/attendance-trend?userId=:userId
 * Retrieves 5-week attendance counts for the smooth wave chart.
 */
export async function getAttendanceTrend(userId) {
  const effectiveId = getEffectiveUserId(userId);
  try {
    const url = effectiveId
      ? `${API_BASE_URL}/adviser/dashboard/attendance-trend?userId=${encodeURIComponent(effectiveId)}`
      : `${API_BASE_URL}/adviser/dashboard/attendance-trend`;
    const response = await fetch(url);
    const data = await parseResponse(response);
    return data?.trend || placeholderAttendanceTrend;
  } catch (error) {
    console.warn("getAttendanceTrend fallback:", error.message);
    return placeholderAttendanceTrend;
  }
}

/**
 * REST Route: GET /api/adviser/dashboard/test-exam-results?userId=:userId&term=:term&section=:section
 * Retrieves polar test distributions and highest/lowest score records.
 */
export async function getTestExamAnalysis(term = "T1", section = "All", userId) {
  const effectiveId = getEffectiveUserId(userId);
  try {
    let url = `${API_BASE_URL}/adviser/dashboard/test-exam-results?term=${encodeURIComponent(term)}&section=${encodeURIComponent(section)}`;
    if (effectiveId) {
      url += `&userId=${encodeURIComponent(effectiveId)}`;
    }
    const response = await fetch(url);
    const data = await parseResponse(response);
    return data || placeholderTestExamAnalysis[term] || placeholderTestExamAnalysis.T1;
  } catch (error) {
    console.warn("getTestExamAnalysis fallback:", error.message);
    return placeholderTestExamAnalysis[term] || placeholderTestExamAnalysis.T1;
  }
}

/**
 * REST Route: GET /api/adviser/dashboard/subject-area-performance?userId=:userId&term=:term
 * Retrieves horizontal bar chart distribution by subject area.
 */
export async function getSubjectAreaPerformance(term = "T1", userId) {
  const effectiveId = getEffectiveUserId(userId);
  try {
    let url = `${API_BASE_URL}/adviser/dashboard/subject-area-performance?term=${encodeURIComponent(term)}`;
    if (effectiveId) {
      url += `&userId=${encodeURIComponent(effectiveId)}`;
    }
    const response = await fetch(url);
    const data = await parseResponse(response);
    if (data && (data.handledSubjects || data.adviserSectionSubjects || data.breakdown)) {
      return data;
    }
    return {
      handledSubjects: [],
      adviserSectionSubjects: data?.breakdown || placeholderSubjectAreaPerformance[term] || [],
      breakdown: data?.breakdown || placeholderSubjectAreaPerformance[term] || [],
    };
  } catch (error) {
    console.warn("getSubjectAreaPerformance fallback:", error.message);
    return {
      handledSubjects: [],
      adviserSectionSubjects: placeholderSubjectAreaPerformance[term] || [],
      breakdown: placeholderSubjectAreaPerformance[term] || [],
    };
  }
}

/**
 * REST Route: GET /api/adviser/dashboard/core-values?userId=:userId&term=:term
 * Retrieves core values percentages for the donut chart.
 */
export async function getCoreValuesComparison(term = "T1", userId) {
  const effectiveId = getEffectiveUserId(userId);
  try {
    let url = `${API_BASE_URL}/adviser/dashboard/core-values?term=${encodeURIComponent(term)}`;
    if (effectiveId) {
      url += `&userId=${encodeURIComponent(effectiveId)}`;
    }
    const response = await fetch(url);
    const data = await parseResponse(response);
    return data?.values || placeholderCoreValues[term] || [];
  } catch (error) {
    console.warn("getCoreValuesComparison fallback:", error.message);
    return placeholderCoreValues[term] || [];
  }
}
