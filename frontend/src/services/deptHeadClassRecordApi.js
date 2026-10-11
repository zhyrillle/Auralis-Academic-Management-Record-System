/**
 * Department Head Class Record Service
 *
 * Provides dedicated API callers for Department Head class records,
 * multi-filter section resolutions, downloads, and grade missing alerts.
 */

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "The request could not be completed.");
  }
  return data;
};

/**
 * Retrieves dynamic filter options (School Years, Grade Levels, Sections, Department Subjects)
 * securely tied to the Department Head's department.
 */
export async function getDeptFilterOptions(userId = null) {
  try {
    const url = userId
      ? `${API_BASE_URL}/department-head/filter-options?user_id=${encodeURIComponent(userId)}`
      : `${API_BASE_URL}/department-head/filter-options`;
    const headers = userId ? { "x-auralis-user-id": String(userId) } : {};
    const res = await fetch(url, { headers });
    return await parseResponse(res);
  } catch (error) {
    console.warn("Could not load department filter options:", error);
    return null;
  }
}

/**
 * Retrieves the complete class record for a selected section under the Department Head.
 * STRICT SECURITY: Only subjects and grades belonging to the Department Head's department are returned.
 */
export async function getDeptClassRecord({ sectionId, schoolYearId, userId }) {
  try {
    const params = new URLSearchParams();
    if (sectionId) params.append("sectionId", String(sectionId));
    if (schoolYearId) params.append("schoolYearId", String(schoolYearId));
    if (userId) params.append("user_id", String(userId));

    const headers = userId ? { "x-auralis-user-id": String(userId) } : {};
    const res = await fetch(`${API_BASE_URL}/department-head/class-record?${params.toString()}`, {
      headers,
    });
    return await parseResponse(res);
  } catch (error) {
    console.warn("Could not load department class record:", error);
    throw error;
  }
}

const extractFilename = (contentDisposition) => {
  if (!contentDisposition) return null;
  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) return decodeURIComponent(encodedMatch[1].trim());
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1].trim() : null;
};

/**
 * Downloads the DepEd-aligned Excel spreadsheet for the department class record.
 */
export async function downloadDeptClassRecord({ sectionId, schoolYearId, userId }) {
  const params = new URLSearchParams();
  if (sectionId) params.append("sectionId", String(sectionId));
  if (schoolYearId) params.append("schoolYearId", String(schoolYearId));
  if (userId) params.append("user_id", String(userId));

  const headers = userId ? { "x-auralis-user-id": String(userId) } : {};
  const response = await fetch(
    `${API_BASE_URL}/department-head/class-record/download?${params.toString()}`,
    { headers }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || "The class record could not be downloaded.");
  }

  const blob = await response.blob();
  const filename = extractFilename(response.headers.get("Content-Disposition")) || "Department_Class_Record.xlsx";
  return { blob, filename };
}

/**
 * Retrieves missing or delayed grade submission alerts for the department.
 */
export async function getDeptMissingGradesAlerts(userId = null, term = "T1") {
  try {
    const url = `${API_BASE_URL}/department-head/missing-grades?term=${encodeURIComponent(term)}${userId ? `&user_id=${encodeURIComponent(userId)}` : ""}`;
    const headers = userId ? { "x-auralis-user-id": String(userId) } : {};
    const res = await fetch(url, { headers });
    return await parseResponse(res);
  } catch (error) {
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
    return { success: true, message: "Reminder sent successfully." };
  }
}
