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

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

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
 * Placeholder REST Route: GET /api/adviser/dashboard/summary
 * Retrieves overall KPI counters, section averages, and student counts.
 */
export async function getAdviserSummary() {
  try {
    const response = await fetch(`${API_BASE_URL}/adviser/dashboard/summary`);
    return await parseResponse(response);
  } catch (error) {
    // Graceful fallback to placeholder data if backend is offline/unimplemented
    return placeholderAdviserSummary;
  }
}

/**
 * Placeholder REST Route: GET /api/adviser/dashboard/subject-performance?term=:term
 * Retrieves vertical bar chart data across sections for a given term.
 */
export async function getSubjectPerformance(term = "T1") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/adviser/dashboard/subject-performance?term=${encodeURIComponent(term)}`,
    );
    const data = await parseResponse(response);
    return data?.performance || placeholderSubjectPerformance[term] || [];
  } catch (error) {
    return placeholderSubjectPerformance[term] || [];
  }
}

/**
 * Placeholder REST Route: GET /api/adviser/dashboard/assigned-classes
 * Retrieves the adviser's assigned classes, progress, and student enrollment.
 */
export async function getAssignedClasses() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/adviser/dashboard/assigned-classes`,
    );
    const data = await parseResponse(response);
    return data?.classes || placeholderAssignedClasses;
  } catch (error) {
    return placeholderAssignedClasses;
  }
}

/**
 * Placeholder REST Route: GET /api/adviser/dashboard/grade-distribution?section=:section&term=:term
 * Retrieves 5-axis radar data for grade ranges.
 */
export async function getGradeRangeDistribution(section = "All", term = "T1") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/adviser/dashboard/grade-distribution?section=${encodeURIComponent(section)}&term=${encodeURIComponent(term)}`,
    );
    const data = await parseResponse(response);
    return (
      data?.distribution ||
      placeholderGradeRangeDistribution.sections[section]?.[term] ||
      placeholderGradeRangeDistribution.sections.All.T1
    );
  } catch (error) {
    return (
      placeholderGradeRangeDistribution.sections[section]?.[term] ||
      placeholderGradeRangeDistribution.sections.All.T1
    );
  }
}

/**
 * Placeholder REST Route: GET /api/adviser/dashboard/attendance-trend
 * Retrieves 5-week attendance counts for the smooth wave chart.
 */
export async function getAttendanceTrend() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/adviser/dashboard/attendance-trend`,
    );
    const data = await parseResponse(response);
    return data?.trend || placeholderAttendanceTrend;
  } catch (error) {
    return placeholderAttendanceTrend;
  }
}

/**
 * Placeholder REST Route: GET /api/adviser/dashboard/test-exam-results?term=:term&section=:section
 * Retrieves polar test distributions and highest/lowest score records.
 */
export async function getTestExamAnalysis(term = "T1", section = "All") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/adviser/dashboard/test-exam-results?term=${encodeURIComponent(term)}&section=${encodeURIComponent(section)}`,
    );
    const data = await parseResponse(response);
    return data || placeholderTestExamAnalysis[term] || placeholderTestExamAnalysis.T1;
  } catch (error) {
    return placeholderTestExamAnalysis[term] || placeholderTestExamAnalysis.T1;
  }
}

/**
 * Placeholder REST Route: GET /api/adviser/dashboard/subject-area-performance?term=:term
 * Retrieves horizontal bar chart distribution by subject area.
 */
export async function getSubjectAreaPerformance(term = "T1") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/adviser/dashboard/subject-area-performance?term=${encodeURIComponent(term)}`,
    );
    const data = await parseResponse(response);
    return (
      data?.breakdown || placeholderSubjectAreaPerformance[term] || []
    );
  } catch (error) {
    return placeholderSubjectAreaPerformance[term] || [];
  }
}

/**
 * Placeholder REST Route: GET /api/adviser/dashboard/core-values?term=:term
 * Retrieves core values percentages for the donut chart.
 */
export async function getCoreValuesComparison(term = "T1") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/adviser/dashboard/core-values?term=${encodeURIComponent(term)}`,
    );
    const data = await parseResponse(response);
    return data?.values || placeholderCoreValues[term] || [];
  } catch (error) {
    return placeholderCoreValues[term] || [];
  }
}

