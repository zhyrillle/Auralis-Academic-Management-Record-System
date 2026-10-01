const API_BASE_URL = "http://localhost:5000/api/principal/at-risk-prediction";

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

export async function getAtRiskPredictionSummary({ schoolYear, term, gradeLevel } = {}) {
  const params = new URLSearchParams();
  if (schoolYear) params.append("schoolYear", schoolYear);
  if (term && term !== "overall") params.append("term", term);
  if (gradeLevel) params.append("gradeLevel", gradeLevel);

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
  if (gradeLevel) params.append("gradeLevel", gradeLevel);
  if (riskLevel) params.append("riskLevel", riskLevel);
  if (limit) params.append("limit", limit);

  const url = `${API_BASE_URL}/students${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${riskLevel} risk students: ${res.statusText}`);
  }
  return res.json();
}
