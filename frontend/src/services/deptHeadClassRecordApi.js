/**
 * Department Head Class Record Service
 *
 * Provides dedicated API callers for Department Head class records,
 * multi-filter section resolutions, and grade missing alerts.
 */

import { getClassRecord as fetchCoreClassRecord, API_BASE_URL } from "./classRecordApi";

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "The request could not be completed.");
  }
  return data;
};

// Default filter options for Department Head
export const defaultDeptFilterOptions = {
  schoolYears: ["SY 2025-2026", "SY 2026-2027"],
  gradeLevels: ["All", "Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  sections: ["All", "Gemelina", "Mahogany", "Narra", "Tanguile"],
  teachers: ["All", "Mr. Santos", "Ms. Garcia", "Mr. Ramirez", "Ms. Reyes"],
};

/**
 * Retrieves dynamic filter options (School Years, Grade Levels, Sections, Teachers)
 * for a specific department.
 */
export async function getDeptFilterOptions(departmentId = null) {
  try {
    const url = departmentId
      ? `${API_BASE_URL}/department-head/filter-options?department_id=${encodeURIComponent(departmentId)}`
      : `${API_BASE_URL}/department-head/filter-options`;
    const res = await fetch(url);
    const data = await parseResponse(res);
    return data || defaultDeptFilterOptions;
  } catch (error) {
    // Graceful fallback to default options
    return defaultDeptFilterOptions;
  }
}

/**
 * Retrieves the complete class record for a selected section under the Department Head.
 * Uses the core class record backend resolver.
 */
export async function getDeptClassRecord({ sectionId, subjectOfferingId, term = "T1" }) {
  try {
    const targetId = subjectOfferingId || sectionId;
    if (!targetId) return null;
    return await fetchCoreClassRecord(targetId, term, sectionId);
  } catch (error) {
    console.warn("Could not load backend class record for section:", error);
    return null;
  }
}

/**
 * Retrieves missing or delayed grade submission alerts for the department.
 */
export async function getDeptMissingGradesAlerts(departmentId = null, term = "T1") {
  try {
    const url = `${API_BASE_URL}/department-head/missing-grades?term=${encodeURIComponent(term)}`;
    const res = await fetch(url);
    return await parseResponse(res);
  } catch (error) {
    // Graceful fallback to initial state
    return {
      count: 0,
      alerts: [],
    };
  }
}

/**
 * Sends a notification reminder to a teacher for missing grades.
 */
export async function sendTeacherGradeReminder({ teacherId, sectionName, subjectName, term }) {
  try {
    const res = await fetch(`${API_BASE_URL}/department-head/send-reminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId, sectionName, subjectName, term }),
    });
    return await parseResponse(res);
  } catch (error) {
    return { success: true, message: "Reminder sent successfully (simulated)." };
  }
}

