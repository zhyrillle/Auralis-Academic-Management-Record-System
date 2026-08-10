// TODO: BACKEND CONNECTION
// (paste your base URL here, e.g. import.meta.env.VITE_API_BASE_URL)
// (paste your auth/token handling here if endpoints require it)
// (paste your actual endpoint paths + response shape here once backend team confirms)

/**
 * @typedef {Object} ComparativeAnalysisItem
 * @property {string} gradeLevel
 * @property {number} aboveAverage
 * @property {number} fail
 * @property {number} passingRate
 */

/**
 * @typedef {Object} PassRateData
 * @property {number} passed
 * @property {number} failed
 * @property {number} total
 * @property {number} passRatePercentage
 */

/**
 * @typedef {Object} DashboardStats
 * @property {number} totalTeachers
 * @property {number} submittedGrades
 * @property {number} submittedGradesPercent
 * @property {number} delayedSubmissions
 * @property {number} atRiskStudents
 */

/**
 * @typedef {Object} SubmissionMonitorItem
 * @property {string} teacher
 * @property {string} gradeSection
 * @property {string} status
 * @property {number} completion
 */

/**
 * @typedef {Object} PerformanceMatrixItem
 * @property {string} section
 * @property {number} mean
 * @property {number} mps
 * @property {string} examDistribution
 */

/**
 * @typedef {Object} GradeDistributionItem
 * @property {string} gradeLevel
 * @property {number|null} term1Mean
 * @property {number|null} term2Mean
 * @property {number|null} term3Mean
 * @property {number|null} term1Mps
 * @property {number|null} term2Mps
 * @property {number|null} term3Mps
 */

export async function getComparativeAnalysis({ schoolYear, gradeLevel, quarter }) {
  // (paste your endpoint call here, e.g. GET /api/department-head/comparative-analysis)
  void schoolYear; void gradeLevel; void quarter;
  throw new Error("Not implemented — connect backend endpoint here");
}

export async function getOverallPassRate({ schoolYear, gradeLevel, quarter }) {
  // (paste your endpoint call here, e.g. GET /api/department-head/pass-rate)
  void schoolYear; void gradeLevel; void quarter;
  throw new Error("Not implemented — connect backend endpoint here");
}

export async function getDashboardStats({ schoolYear, gradeLevel, quarter }) {
  // (paste your endpoint call here, e.g. GET /api/department-head/stats)
  void schoolYear; void gradeLevel; void quarter;
  throw new Error("Not implemented — connect backend endpoint here");
}

export async function getSubmissionMonitor({ schoolYear, gradeLevel, quarter }) {
  // (paste your endpoint call here, e.g. GET /api/department-head/submission-monitor)
  void schoolYear; void gradeLevel; void quarter;
  throw new Error("Not implemented — connect backend endpoint here");
}

export async function getPerformanceMatrix({ schoolYear, gradeLevel, quarter }) {
  // (paste your endpoint call here, e.g. GET /api/department-head/performance-matrix)
  void schoolYear; void gradeLevel; void quarter;
  throw new Error("Not implemented — connect backend endpoint here");
}

export async function getGradeDistribution({ schoolYear }) {
  // (paste your endpoint call here, e.g. GET /api/department-head/grade-distribution)
  void schoolYear;
  throw new Error("Not implemented — connect backend endpoint here");
}
