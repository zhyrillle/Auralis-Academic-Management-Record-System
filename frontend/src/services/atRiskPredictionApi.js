const BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const API_BASE_URL = `${BASE}/principal/at-risk-prediction`;

/**
 * @typedef {Object} AtRiskPredictionSummary
 * @property {number} lowRisk
 * @property {number} mediumRisk
 * @property {number} highRisk
 * @property {number} total
 */

/**
 * @typedef {Object} StudentFlag
 * @property {string} icon - "calendar" | "trending-down" | "document" | etc.
 * @property {string} label
 */

/**
 * @typedef {Object} StudentRiskItem
 * @property {string} id
 * @property {string} name
 * @property {number} grade
 * @property {string} section
 * @property {string} adviser
 * @property {number} riskScore
 * @property {StudentFlag[]} flags
 */

/**
 * @typedef {Object} StudentsByRiskLevel
 * @property {StudentRiskItem[]} students
 * @property {number} totalCount
 */

export async function getAtRiskOptions() {
  try {
    const res = await fetch(`${API_BASE_URL}/options`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Using fallback options for at-risk:", e.message);
  }
  return {
    schoolYears: [
      { id: "sy-2026-2027", label: "SY 2026–2027", value: "2026-2027" },
      { id: "sy-2025-2026", label: "SY 2025–2026", value: "2025-2026" },
    ],
    gradeLevels: [
      { id: "g-all", label: "All Grade Levels", value: "all" },
      { id: "g-7", label: "Grade 7", value: "7" },
      { id: "g-8", label: "Grade 8", value: "8" },
      { id: "g-9", label: "Grade 9", value: "9" },
      { id: "g-10", label: "Grade 10", value: "10" },
    ],
  };
}

export async function getAtRiskPredictionSummary({ schoolYear, term, gradeLevel } = {}) {
  const params = new URLSearchParams();
  if (schoolYear) params.append("schoolYear", schoolYear);
  if (term && term !== "overall") params.append("term", term);
  if (gradeLevel && gradeLevel !== "all") params.append("gradeLevel", gradeLevel);

  const url = `${API_BASE_URL}/summary${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch at-risk summary: ${res.statusText}`);
  }
  return res.json();
}

export async function getStudentsByRiskLevel({ schoolYear, term, gradeLevel, riskLevel, limit } = {}) {
  const params = new URLSearchParams();
  if (schoolYear) params.append("schoolYear", schoolYear);
  if (term && term !== "overall") params.append("term", term);
  if (gradeLevel && gradeLevel !== "all") params.append("gradeLevel", gradeLevel);
  if (riskLevel) params.append("riskLevel", riskLevel);
  if (limit) params.append("limit", limit);

  const url = `${API_BASE_URL}/students${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${riskLevel} risk students: ${res.statusText}`);
  }
  return res.json();
}

