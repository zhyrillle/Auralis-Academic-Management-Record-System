/**
 * Principal Performance Level Service
 *
 * REST API client connecting to backend /api/principal/performance routes.
 * Guaranteed to return structured zero-data fallbacks if backend is offline.
 */

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export const principalPerformanceTerms = [
  { id: "overall", label: "Overall" },
  { id: "term-1", label: "Term 1" },
  { id: "term-2", label: "Term 2" },
  { id: "term-3", label: "Term 3" },
];

const DEFAULT_GRADE_LEVELS = [
  { id: "grade-7", gradeLevel: 7, label: "Grade 7", shortLabel: "G7", learners: 0, averageGrade: 0, passRate: 0, status: "On track" },
  { id: "grade-8", gradeLevel: 8, label: "Grade 8", shortLabel: "G8", learners: 0, averageGrade: 0, passRate: 0, status: "On track" },
  { id: "grade-9", gradeLevel: 9, label: "Grade 9", shortLabel: "G9", learners: 0, averageGrade: 0, passRate: 0, status: "On track" },
  { id: "grade-10", gradeLevel: 10, label: "Grade 10", shortLabel: "G10", learners: 0, averageGrade: 0, passRate: 0, status: "On track" },
];

const DEFAULT_SUMMARY = {
  averageGrade: 0,
  passRate: 0,
  failRate: 0,
  totalLearners: 0,
  passingLearners: 0,
  failingLearners: 0,
  passingGradeLevels: 0,
  totalGradeLevels: 4,
  needsAttention: 0,
};

const DEFAULT_SCHOOL_YEARS = [
  { id: "sy-2026-2027", label: "SY 2026–2027", value: "2026-2027" },
  { id: "sy-2025-2026", label: "SY 2025–2026", value: "2025-2026" },
];

const DEFAULT_GRADE_LEVEL_NUMS = [7, 8, 9, 10];

/**
 * 1. By Grade Levels
 */
export async function getGradeLevelPerformance({ term = "overall", schoolYear = "2026-2027" }) {
  try {
    const params = new URLSearchParams({ term, schoolYear });
    const res = await fetch(`${API_BASE_URL}/principal/performance/grade-levels?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.gradeLevels)) return data;
    }
  } catch (err) {
    console.warn("Using zero fallback for Grade Level Performance:", err.message);
  }

  const startYear = schoolYear.split("-")[0] || "2026";
  const endYear = schoolYear.split("-")[1] || "2027";

  return {
    term,
    schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
    gradeLevels: DEFAULT_GRADE_LEVELS,
    summary: DEFAULT_SUMMARY,
    availableSchoolYears: DEFAULT_SCHOOL_YEARS,
    availableGradeLevels: DEFAULT_GRADE_LEVEL_NUMS,
  };
}

/**
 * 2. By Sections
 */
export async function getSectionPerformance({ term = "overall", schoolYear = "2026-2027", gradeLevel = "all" }) {
  try {
    const params = new URLSearchParams({ term, schoolYear, gradeLevel: String(gradeLevel) });
    const res = await fetch(`${API_BASE_URL}/principal/performance/sections?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.sections) && Array.isArray(data.bands)) return data;
    }
  } catch (err) {
    console.warn("Using zero fallback for Section Performance:", err.message);
  }

  const startYear = schoolYear.split("-")[0] || "2026";
  const endYear = schoolYear.split("-")[1] || "2027";

  return {
    term,
    gradeLevel,
    schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
    sections: [],
    bands: [
      { id: "needs-attention", label: "Needs Attention", count: 0 },
      { id: "satisfactory", label: "Satisfactory", count: 0 },
      { id: "very-satisfactory", label: "Very Satisfactory", count: 0 },
      { id: "outstanding", label: "Outstanding", count: 0 },
    ],
    summary: DEFAULT_SUMMARY,
    availableSchoolYears: DEFAULT_SCHOOL_YEARS,
    availableGradeLevels: DEFAULT_GRADE_LEVEL_NUMS,
  };
}

/**
 * 3. By Subjects
 */
export async function getSubjectPerformance({ term = "overall", schoolYear = "2026-2027", gradeLevel = "all" }) {
  try {
    const params = new URLSearchParams({ term, schoolYear, gradeLevel: String(gradeLevel) });
    const res = await fetch(`${API_BASE_URL}/principal/performance/subjects?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.subjects) && data.summary) return data;
    }
  } catch (err) {
    console.warn("Using zero fallback for Subject Performance:", err.message);
  }

  const startYear = schoolYear.split("-")[0] || "2026";
  const endYear = schoolYear.split("-")[1] || "2027";

  return {
    term,
    gradeLevel,
    schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
    subjects: [],
    summary: {
      totalSubjects: 0,
      topSubject: null,
      lowestSubject: null,
      belowTarget: 0,
    },
    availableSchoolYears: DEFAULT_SCHOOL_YEARS,
    availableGradeLevels: DEFAULT_GRADE_LEVEL_NUMS,
  };
}

/**
 * 4. By Teachers
 */
export async function getTeacherPerformance({ term = "overall", schoolYear = "2026-2027", gradeLevel = "all" }) {
  try {
    const params = new URLSearchParams({ term, schoolYear, gradeLevel: String(gradeLevel) });
    const res = await fetch(`${API_BASE_URL}/principal/performance/teachers?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.teachers) && data.summary) return data;
    }
  } catch (err) {
    console.warn("Using zero fallback for Teacher Performance:", err.message);
  }

  const startYear = schoolYear.split("-")[0] || "2026";
  const endYear = schoolYear.split("-")[1] || "2027";

  return {
    term,
    gradeLevel,
    schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
    teachers: [],
    summary: {
      totalTeachers: 0,
      submittedReports: 0,
      failRate: 0,
      needsAttention: 0,
    },
    availableSchoolYears: DEFAULT_SCHOOL_YEARS,
    availableGradeLevels: DEFAULT_GRADE_LEVEL_NUMS,
  };
}

/**
 * 5. Lowest Performers
 */
export async function getLowestPerformers({ term = "overall", schoolYear = "2026-2027" }) {
  try {
    const params = new URLSearchParams({ term, schoolYear });
    const res = await fetch(`${API_BASE_URL}/principal/performance/lowest-performers?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.gradeLevels) && Array.isArray(data.sections) && Array.isArray(data.subjects)) return data;
    }
  } catch (err) {
    console.warn("Using zero fallback for Lowest Performers:", err.message);
  }

  const startYear = schoolYear.split("-")[0] || "2026";
  const endYear = schoolYear.split("-")[1] || "2027";

  return {
    term,
    schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
    gradeLevels: [],
    sections: [],
    subjects: [],
    summary: {
      lowestGradeLevel: null,
      lowestSection: null,
      lowestSubject: null,
      atRiskStudents: 0,
    },
    availableSchoolYears: DEFAULT_SCHOOL_YEARS,
    availableGradeLevels: DEFAULT_GRADE_LEVEL_NUMS,
  };
}
