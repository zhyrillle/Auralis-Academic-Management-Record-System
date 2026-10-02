const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

/**
 * Fetches aggregated DepEd SF10-JHS details for a student.
 * @param {string|number} identifier - Student ID, LRN, or student_section_id
 * @returns {Promise<Object>} Aggregated SF10 learner, school, scholastic records, and certification
 */
export const getStudentSF10Details = async (identifier) => {
  if (!identifier) return null;
  const cleanId = encodeURIComponent(String(identifier).trim());
  
  // Try relative proxy endpoint first, then absolute API_BASE_URL
  const endpoints = [
    `/api/reports/sf10/${cleanId}`,
    `${API_BASE_URL}/reports/sf10/${cleanId}`
  ];

  let lastError = null;
  for (const url of endpoints) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      lastError = err;
    }
  }

  // If endpoints didn't succeed, throw last error
  throw lastError || new Error("Failed to fetch official SF10 details.");
};
