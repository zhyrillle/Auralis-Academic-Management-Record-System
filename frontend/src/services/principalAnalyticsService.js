/**
 * Principal Analytics Service
 *
 * REST API client connecting to backend /api/principal/analytics routes.
 * Guaranteed to return structured zero-data fallbacks if backend is offline.
 */

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export const principalAnalyticsTerms = [
  { id: "overall", label: "Overall" },
  { id: "term-1", label: "Term 1" },
  { id: "term-2", label: "Term 2" },
  { id: "term-3", label: "Term 3" },
];

const DEFAULT_SUBJECTS = [
  { id: "filipino", code: "FIL", label: "Filipino", color: "#8b5cf6", learnerCount: 0, termAverages: [0, 0, 0], termPassRates: [0, 0, 0] },
  { id: "english", code: "ENG", label: "English", color: "#2563eb", learnerCount: 0, termAverages: [0, 0, 0], termPassRates: [0, 0, 0] },
  { id: "mathematics", code: "MATH", label: "Mathematics", color: "#ef4444", learnerCount: 0, termAverages: [0, 0, 0], termPassRates: [0, 0, 0] },
  { id: "science", code: "SCI", label: "Science", color: "#10b981", learnerCount: 0, termAverages: [0, 0, 0], termPassRates: [0, 0, 0] },
  { id: "ap", code: "AP", label: "Araling Panlipunan", color: "#6366f1", learnerCount: 0, termAverages: [0, 0, 0], termPassRates: [0, 0, 0] },
  { id: "tle", code: "TLE", label: "TLE", color: "#f59e0b", learnerCount: 0, termAverages: [0, 0, 0], termPassRates: [0, 0, 0] },
  { id: "mapeh", code: "MAPEH", label: "MAPEH", color: "#ec4899", learnerCount: 0, termAverages: [0, 0, 0], termPassRates: [0, 0, 0] },
  { id: "esp", code: "ESP", label: "ESP", color: "#64748b", learnerCount: 0, termAverages: [0, 0, 0], termPassRates: [0, 0, 0] },
];

/**
 * Fetches Subject Performance Trend from the backend database.
 */
export async function getSubjectPerformanceTrend({
  schoolYear = "2026-2027",
  gradeLevel = "all",
  term = "overall",
}) {
  try {
    const params = new URLSearchParams({
      schoolYear: String(schoolYear),
      gradeLevel: String(gradeLevel),
      term: String(term),
    });

    const res = await fetch(`${API_BASE_URL}/principal/analytics/subject-trend?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.subjects) && data.subjects.length > 0) {
        return data;
      }
    }
  } catch (error) {
    console.warn("Using zero-data fallback for Subject Trend:", error.message);
  }

  // Graceful Zero Data Response
  return {
    schoolYear: { id: `sy-${schoolYear}`, label: `SY ${schoolYear.replace("-", "–")}`, value: schoolYear },
    gradeLevel,
    term,
    subjects: DEFAULT_SUBJECTS,
    schoolWideAverages: [0, 0, 0],
    totalLearners: 0,
    availableSchoolYears: [
      { id: "sy-2026-2027", label: "SY 2026–2027", value: "2026-2027" },
      { id: "sy-2025-2026", label: "SY 2025–2026", value: "2025-2026" },
      { id: "sy-2024-2025", label: "SY 2024–2025", value: "2024-2025" },
    ],
    availableGradeLevels: [
      { id: "g-all", label: "All Grade Levels", value: "all" },
      { id: "g-7", label: "Grade 7", value: "7" },
      { id: "g-8", label: "Grade 8", value: "8" },
      { id: "g-9", label: "Grade 9", value: "9" },
      { id: "g-10", label: "Grade 10", value: "10" },
    ],
  };
}

/**
 * Fetches Historical Comparison across two school years from the backend database.
 */
export async function getHistoricalComparison({
  primarySchoolYear = "2026-2027",
  comparisonSchoolYear = "2025-2026",
  term = "overall",
}) {
  try {
    const params = new URLSearchParams({
      primarySchoolYear: String(primarySchoolYear),
      comparisonSchoolYear: String(comparisonSchoolYear),
      term: String(term),
    });

    const res = await fetch(`${API_BASE_URL}/principal/analytics/historical-comparison?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.subjects) && data.subjects.length > 0) {
        return data;
      }
    }
  } catch (error) {
    console.warn("Using zero-data fallback for Historical Comparison:", error.message);
  }

  // Graceful Zero Data Response
  return {
    primarySchoolYear: { id: `sy-${primarySchoolYear}`, label: `SY ${primarySchoolYear.replace("-", "–")}`, value: primarySchoolYear },
    comparisonSchoolYear: { id: `sy-${comparisonSchoolYear}`, label: `SY ${comparisonSchoolYear.replace("-", "–")}`, value: comparisonSchoolYear },
    term,
    totalStudents: 0,
    subjects: DEFAULT_SUBJECTS.map((s) => ({
      ...s,
      primaryAverage: 0,
      comparisonAverage: 0,
      difference: 0,
      passRate: 0,
      improved: true,
      primaryTermAverages: [0, 0, 0],
      comparisonTermAverages: [0, 0, 0],
      primaryTermPassRates: [0, 0, 0],
      comparisonTermPassRates: [0, 0, 0],
    })),
    primaryTrend: [0, 0, 0],
    comparisonTrend: [0, 0, 0],
    primaryOverallAverage: 0,
    comparisonOverallAverage: 0,
    overallDifference: 0,
    availableSchoolYears: [
      { id: "sy-2026-2027", label: "SY 2026–2027", value: "2026-2027" },
      { id: "sy-2025-2026", label: "SY 2025–2026", value: "2025-2026" },
      { id: "sy-2024-2025", label: "SY 2024–2025", value: "2024-2025" },
    ],
  };
}

/**
 * Fetches dynamic options for School Years and Grade Levels.
 */
export async function getPrincipalAnalyticsOptions() {
  try {
    const res = await fetch(`${API_BASE_URL}/principal/analytics/options`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Using default options fallback:", e.message);
  }
  return {
    schoolYears: [
      { id: "sy-2026-2027", label: "SY 2026–2027", value: "2026-2027" },
      { id: "sy-2025-2026", label: "SY 2025–2026", value: "2025-2026" },
    ],
    gradeLevels: [
      { id: "g7", label: "Grade 7", value: "7" },
      { id: "g8", label: "Grade 8", value: "8" },
      { id: "g9", label: "Grade 9", value: "9" },
      { id: "g10", label: "Grade 10", value: "10" },
    ],
  };
}
