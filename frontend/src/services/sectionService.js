const API_BASE_URL = "http://localhost:5000/api";

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed.");
  }
  return data;
};

const formatGradeLevel = (name) => {
  if (!name) return "G10";
  const num = parseInt(String(name).replace(/\D/g, "")) || "";
  return num ? `G${num}` : name;
};

/**
 * Fetch assigned classes/sections (the teacher's Advisory Class + assigned subject teaching sections) for a specific user from backend.
 * Merges advisory and taught classes into a single card per section, displaying the subject name.
 * @param {string|number} userId
 */
const checkIsSpecialized = (val) => {
  if (val === null || val === undefined) return false;
  if (val === 1 || val === "1" || val === true || val === "true") return true;
  if (typeof val === "number" && val > 0) return true;
  return false;
};

export const getAdviserSections = async (userId) => {
  if (!userId) return [];


  try {
    const response = await fetch(`${API_BASE_URL}/sections/adviser/${userId}`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const mapped = data.map((item) => {
          const isSpecialized = checkIsSpecialized(item.is_specialized) || item.classType === "Special Program";
          const isAdviser = item.isAdviser ?? (item.classType === "Advisory Class");
          return {
            ...item,
            is_specialized: isSpecialized ? 1 : 0,
            isAdviser: isAdviser,
            classType: isSpecialized
              ? "Special Program"
              : isAdviser
              ? "Advisory Class"
              : "Regular Class",
          };
        });
        return mapped;
      }
    }
  } catch (e) {
    console.warn("Primary endpoint /sections/adviser failed:", e);
  }

  const combinedClasses = [];
  const addedSectionIds = new Set();

  // 2. Fallback: Fetch user details from /api/users
  try {
    const resUsers = await fetch(`${API_BASE_URL}/users`);
    if (resUsers.ok) {
      const usersList = await resUsers.json();
      const targetUser = Array.isArray(usersList)
        ? usersList.find((u) => String(u.user_id) === String(userId))
        : null;

      if (targetUser) {
        const assignments = Array.isArray(targetUser.teaching_assignments) ? targetUser.teaching_assignments : [];

        // A. Add Advisory Class if assigned (Single Card, using taught subject name)
        if (targetUser.adviser_section_id || targetUser.section || targetUser.adviser_section_name) {
          const secId = targetUser.adviser_section_id || 1;
          addedSectionIds.add(Number(secId));

          // Find if teacher teaches a specific subject in this advisory section
          const advisoryTa = assignments.find((ta) => Number(ta.section_id) === Number(secId));
          const subjectName = advisoryTa?.subject_name || "Mathematics";
          const isSpecialized = checkIsSpecialized(targetUser.is_specialized) || checkIsSpecialized(advisoryTa?.is_specialized);

          combinedClasses.push({
            id: `sec-${secId}`,
            section_id: secId,
            sectionName: targetUser.adviser_section_name || targetUser.section,
            gradeLevel: formatGradeLevel(targetUser.adviser_grade_level_name || targetUser.gradeLevel),
            grade_level_name: targetUser.adviser_grade_level_name || targetUser.gradeLevel,
            subject: subjectName,
            classType: isSpecialized ? "Special Program" : "Advisory Class",
            is_specialized: isSpecialized ? 1 : 0,
            isAdviser: true,
            deadline: "2026-07-31",
            submitted: false,
          });
        }

        // B. Add Assigned Regular Teaching Classes (deduplicated by section_id)
        assignments.forEach((ta) => {
          const secIdNum = Number(ta.section_id);
          if (!addedSectionIds.has(secIdNum)) {
            addedSectionIds.add(secIdNum);
            const isSpecialized = checkIsSpecialized(ta.is_specialized);
            combinedClasses.push({
              id: `sec-${ta.section_id}`,
              section_id: ta.section_id,
              subject_id: ta.subject_id,
              subject_offering_id: ta.subject_offering_id,
              sectionName: ta.section_name,
              gradeLevel: formatGradeLevel(ta.grade_level_name),
              grade_level_name: ta.grade_level_name,
              subject: ta.subject_name || "Mathematics",
              classType: isSpecialized ? "Special Program" : "Regular Class",
              is_specialized: isSpecialized ? 1 : 0,
              isAdviser: false,
              deadline: "2026-08-15",
              submitted: false,
            });
          }
        });
      }
    }
  } catch (e) {
    console.warn("Fallback fetch /api/users failed:", e);
  }

  return combinedClasses;
};

/**
 * Fetch students enrolled in a specific section from backend.
 * @param {string|number} sectionId
 */
export const getStudentsBySection = async (sectionId) => {
  if (!sectionId) return [];
  try {
    const response = await fetch(`${API_BASE_URL}/sections/${sectionId}/students`);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.warn("Error fetching section students:", e);
  }
  return [];
};

/**
 * Fetch all sections.
 */
export const getAllSections = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/sections`);
    return parseResponse(response);
  } catch (e) {
    return [];
  }
};
