import { cachedApiFetch as fetch } from "./navigationCache.js";
import { cacheKey, loadCached } from "./navigationCache.js";
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

/**
 * Fetches aggregated DepEd SF10-JHS details for a student.
 * @param {string|number} identifier - Student ID, LRN, or student_section_id
 * @returns {Promise<Object>} Aggregated SF10 learner, school, scholastic records, and certification
 */
const readStudentSF10Details = async (identifier) => {
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

export const getStudentSF10Details = (identifier) => identifier
  ? loadCached(cacheKey('reports:sf10', { identifier: String(identifier).trim() }), () => readStudentSF10Details(identifier))
  : Promise.resolve(null);

export const fetchEphemeralSf10Lrn = async (identifier) => {
  if (!identifier) return null;
  const cleanId = encodeURIComponent(String(identifier).trim());
  const endpoints = [
    `/api/reports/sf10/${cleanId}/ephemeral-lrn`,
    `${API_BASE_URL}/reports/sf10/${cleanId}/ephemeral-lrn`,
    `/api/student-sf9/student/${cleanId}/ephemeral-lrn`,
    `${API_BASE_URL}/student-sf9/student/${cleanId}/ephemeral-lrn`
  ];

  for (const url of endpoints) {
    try {
      const response = await window.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.lrn) return data.lrn;
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
};
