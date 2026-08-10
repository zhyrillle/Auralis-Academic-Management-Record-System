// TODO: BACKEND CONNECTION
// (paste your base URL here, e.g. import.meta.env.VITE_API_BASE_URL)
// (paste your auth/token handling here if endpoints require it)
// (paste your actual endpoint paths + response shape here once backend team confirms)

/**
 * @typedef {Object} AtRiskSummary
 * @property {number} lowRisk
 * @property {number} mediumRisk
 * @property {number} highRisk
 * @property {number} total
 */

/**
 * @typedef {Object} DistributionSegment
 * @property {number} count
 * @property {number} percent
 */

/**
 * @typedef {Object} OverallDistribution
 * @property {DistributionSegment} high
 * @property {DistributionSegment} medium
 * @property {DistributionSegment} low
 * @property {number} totalFlagged
 */

/**
 * @typedef {Object} GradeLevelBreakdownItem
 * @property {string} grade
 * @property {number} high
 * @property {number} medium
 * @property {number} low
 */

/**
 * @typedef {Object} RiskLevelLearners
 * @property {number} count
 * @property {string[]} notes
 */

export async function getAtRiskSummary({ schoolYear, term }) {
  // (paste your endpoint call here, e.g. GET /api/principal/at-risk/summary)
  void schoolYear; void term;
  throw new Error("Not implemented — connect backend endpoint here");
}

export async function getOverallDistribution({ schoolYear, term }) {
  // (paste your endpoint call here)
  void schoolYear; void term;
  throw new Error("Not implemented — connect backend endpoint here");
}

export async function getGradeLevelBreakdown({ schoolYear, term }) {
  // (paste your endpoint call here)
  void schoolYear; void term;
  throw new Error("Not implemented — connect backend endpoint here");
}

export async function getRiskLevelLearners({ schoolYear, term, riskLevel }) {
  // (paste your endpoint call here)
  void schoolYear; void term; void riskLevel;
  throw new Error("Not implemented — connect backend endpoint here");
}
