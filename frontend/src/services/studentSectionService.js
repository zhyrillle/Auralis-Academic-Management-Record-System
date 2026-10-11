const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed.");
  }
  return data;
};

/**
 * Fetch all sections with grade levels and student counts
 */
export const fetchSections = async () => {
  const response = await fetch(`${API_BASE_URL}/sections`);
  const data = await parseResponse(response);
  return Array.isArray(data) ? data : [];
};

/**
 * Fetch all grade levels
 */
export const fetchGradeLevels = async () => {
  const response = await fetch(`${API_BASE_URL}/grade-levels`);
  const data = await parseResponse(response);
  return Array.isArray(data) ? data : [];
};

/**
 * Fetch all students with section and grade level assignments
 */
export const fetchStudents = async () => {
  const response = await fetch(`${API_BASE_URL}/students`);
  const data = await parseResponse(response);
  return Array.isArray(data) ? data : [];
};

/**
 * Fetch all student section assignments from STUDENT_SECTION
 */
export const fetchStudentSections = async () => {
  const response = await fetch(`${API_BASE_URL}/student-sections`);
  const data = await parseResponse(response);
  return Array.isArray(data) ? data : [];
};

/** Fetch school years for enrollment-based student filtering. */
export const fetchSchoolYears = async () => {
  const response = await fetch(`${API_BASE_URL}/school-years`);
  const data = await parseResponse(response);
  if (!Array.isArray(data)) throw new Error("Invalid school-year response.");
  return data;
};

/**
 * Create a new section
 */
export const createSection = async (sectionData) => {
  const response = await fetch(`${API_BASE_URL}/sections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sectionData),
  });
  return parseResponse(response);
};

/**
 * Update an existing section
 */
export const updateSection = async (sectionId, sectionData) => {
  const response = await fetch(`${API_BASE_URL}/sections/${sectionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sectionData),
  });
  return parseResponse(response);
};

/**
 * Delete a section
 */
export const deleteSection = async (sectionId) => {
  const response = await fetch(`${API_BASE_URL}/sections/${sectionId}`, {
    method: "DELETE",
  });
  return parseResponse(response);
};

/**
 * Assign a single student to a section
 */
export const assignStudent = async ({
  studentId,
  student_id,
  sectionId,
  section_id,
  schoolYearId,
  school_year_id,
  studentSectionId,
  student_section_id,
}) => {
  const targetStudentId = studentId || student_id;
  const targetSectionId = sectionId || section_id;
  const targetSyId = schoolYearId || school_year_id;
  const targetSSIdParam = studentSectionId || student_section_id;

  try {
    const response = await fetch(`${API_BASE_URL}/student-sections/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: targetStudentId,
        section_id: targetSectionId,
        school_year_id: targetSyId,
      }),
    });
    if (response.ok) return await parseResponse(response);
  } catch (e) {
    // Continue to fallback
  }

  // Fallback if custom /assign endpoint is not available:
  let targetSSId = targetSSIdParam;
  if (!targetSSId) {
    try {
      const list = await fetchStudentSections();
      const match = list.find((item) => Number(item.student_id) === Number(targetStudentId));
      if (match) targetSSId = match.student_section_id;
    } catch (e) {}
  }

  if (targetSSId) {
    const updateRes = await fetch(`${API_BASE_URL}/student-sections/${targetSSId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: targetSectionId }),
    });
    return parseResponse(updateRes);
  } else {
    const createRes = await fetch(`${API_BASE_URL}/student-sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: targetStudentId,
        section_id: targetSectionId,
        school_year_id: targetSyId || 1,
      }),
    });
    return parseResponse(createRes);
  }
};

/**
 * Bulk assign multiple students to a section
 */
export const bulkAssignStudents = async ({
  studentIds,
  student_ids,
  sectionId,
  section_id,
  schoolYearId,
  school_year_id,
}) => {
  const targetStudentIds = studentIds || student_ids || [];
  const targetSectionId = sectionId || section_id;
  const targetSyId = schoolYearId || school_year_id;

  try {
    const response = await fetch(`${API_BASE_URL}/student-sections/bulk-assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_ids: targetStudentIds,
        section_id: targetSectionId,
        school_year_id: targetSyId,
      }),
    });
    if (response.ok) return await parseResponse(response);
  } catch (e) {
    // Continue to fallback
  }

  // Fallback: assign each student individually
  const results = [];
  for (const sId of targetStudentIds) {
    const res = await assignStudent({ studentId: sId, sectionId: targetSectionId, schoolYearId: targetSyId });
    results.push(res);
  }
  return { message: "Students assigned successfully", count: results.length, results };
};

/**
 * Unassign/remove a student from a section
 */
export const unassignStudent = async ({
  studentId,
  student_id,
  sectionId,
  section_id,
  schoolYearId,
  school_year_id,
  studentSectionId,
  student_section_id,
}) => {
  const targetStudentId = studentId || student_id;
  const targetSectionId = sectionId || section_id;
  const targetSyId = schoolYearId || school_year_id;
  const targetSSIdParam = studentSectionId || student_section_id;

  try {
    const response = await fetch(`${API_BASE_URL}/student-sections/unassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: targetStudentId,
        section_id: targetSectionId,
        school_year_id: targetSyId,
        student_section_id: targetSSIdParam,
      }),
    });
    if (response.ok) return await parseResponse(response);
  } catch (e) {
    // Continue to fallback
  }

  // Fallback if custom /unassign endpoint is not available:
  let targetSSId = studentSectionId;
  if (!targetSSId && studentId) {
    try {
      const list = await fetchStudentSections();
      const match = list.find((item) => Number(item.student_id) === Number(studentId));
      if (match) targetSSId = match.student_section_id;
    } catch (e) {}
  }

  if (targetSSId) {
    const deleteRes = await fetch(`${API_BASE_URL}/student-sections/${targetSSId}`, {
      method: "DELETE",
    });
    return parseResponse(deleteRes);
  }
  return { message: "Student unassigned successfully" };
};
