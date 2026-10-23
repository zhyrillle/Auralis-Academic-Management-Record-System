import { cachedApiFetch as fetch } from "./navigationCache.js";
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export const getStudentSF9Details = async (identifier, { schoolYearId } = {}) => {
  if (!identifier) return null;
  try {
    const query = schoolYearId ? `?schoolYearId=${encodeURIComponent(schoolYearId)}` : "";
    const response = await fetch(`${API_BASE_URL}/student-sf9/student/${encodeURIComponent(identifier)}${query}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch SF9 details: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error in getStudentSF9Details:", error);
    throw error;
  }
};

export const downloadStudentSf9Pdf = async (identifier, { schoolYearId, comments } = {}) => {
  if (!identifier) throw new Error("Student identifier is required");
  const query = schoolYearId ? `?schoolYearId=${encodeURIComponent(schoolYearId)}` : "";
  const response = await window.fetch(`${API_BASE_URL}/student-sf9/student/${encodeURIComponent(identifier)}/export-pdf${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comments: comments || {} }),
  });
  if (!response.ok) {
    throw new Error(`Failed to generate SF9 PDF: ${response.statusText}`);
  }
  return await response.blob();
};

export const fetchEphemeralLrn = async (identifier) => {
  if (!identifier) return null;
  const response = await window.fetch(`${API_BASE_URL}/student-sf9/student/${encodeURIComponent(identifier)}/ephemeral-lrn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch official export credential: ${response.statusText}`);
  }
  const data = await response.json();
  return data.lrn;
};


