// TODO: BACKEND CONNECTION
// (paste your base URL here, e.g. import.meta.env.VITE_API_BASE_URL)
// (paste your auth/token handling here if endpoints require it)
// (paste your actual endpoint paths + response shape here once backend team confirms)

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

export async function getAtRiskPredictionSummary({ schoolYear, term, gradeLevel }) {
  // (paste your endpoint call here, e.g. GET /api/principal/at-risk-prediction/summary)
  void schoolYear; void term; void gradeLevel;
  throw new Error("Not implemented — connect backend endpoint here");
}

export async function getStudentsByRiskLevel({ schoolYear, term, gradeLevel, riskLevel, limit }) {
  // (paste your endpoint call here)
  void schoolYear; void term; void gradeLevel; void riskLevel; void limit;
  throw new Error("Not implemented — connect backend endpoint here");
}
