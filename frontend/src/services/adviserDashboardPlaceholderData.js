/**
 * Default fallback / placeholder data for Adviser Dashboard
 * Defaulted to zero / empty states until real backend data is fetched.
 */

export const placeholderAdviserSummary = {
  sectionAverage: "0%",
  sectionAverageDiff: "0% from Q1",
  lowestPerformingSection: "—",
  lowestPerformingSectionNote: "No data",
  atRiskStudentsCount: 0,
  atRiskStudentsNote: "Across all sections",
  entryProgress: 0,
  totalClasses: 0,
  totalStudents: 0,
  pendingSubmissions: 0,
  submittedGrades: 0,
};

export const placeholderSubjectPerformance = {
  T1: [],
  T2: [],
  T3: [],
};

export const placeholderAssignedClasses = [];

export const placeholderGradeRangeDistribution = {
  categories: ["60-74", "90-100", "85-89", "80-84", "75-79"],
  sections: {
    All: {
      T1: [0, 0, 0, 0, 0],
      T2: [0, 0, 0, 0, 0],
      T3: [0, 0, 0, 0, 0],
    },
  },
};

export const placeholderAttendanceTrend = [
  { week: "Week 1", label: "Week 1", count: 0 },
  { week: "Week 2", label: "Week 2", count: 0 },
  { week: "Week 3", label: "Week 3", count: 0 },
  { week: "Week 4", label: "Week 4", count: 0 },
  { week: "Week 5", label: "Week 5", count: 0 },
];

export const placeholderTestExamAnalysis = {
  T1: {
    above75: [],
    below75: [],
    scores: {
      ST1: { highest: 0, lowest: 0 },
      ST2: { highest: 0, lowest: 0 },
      TE: { highest: 0, lowest: 0 },
    },
  },
  T2: {
    above75: [],
    below75: [],
    scores: {
      ST1: { highest: 0, lowest: 0 },
      ST2: { highest: 0, lowest: 0 },
      TE: { highest: 0, lowest: 0 },
    },
  },
  T3: {
    above75: [],
    below75: [],
    scores: {
      ST1: { highest: 0, lowest: 0 },
      ST2: { highest: 0, lowest: 0 },
      TE: { highest: 0, lowest: 0 },
    },
  },
};

export const placeholderSubjectAreaPerformance = {
  T1: [
    { subject: "Filipino", count: 0 },
    { subject: "English", count: 0 },
    { subject: "Mathematics", count: 0 },
    { subject: "Science", count: 0 },
    { subject: "AP", count: 0 },
    { subject: "TLE", count: 0 },
    { subject: "MAPEH", count: 0 },
  ],
  T2: [
    { subject: "Filipino", count: 0 },
    { subject: "English", count: 0 },
    { subject: "Mathematics", count: 0 },
    { subject: "Science", count: 0 },
    { subject: "AP", count: 0 },
    { subject: "TLE", count: 0 },
    { subject: "MAPEH", count: 0 },
  ],
  T3: [
    { subject: "Filipino", count: 0 },
    { subject: "English", count: 0 },
    { subject: "Mathematics", count: 0 },
    { subject: "Science", count: 0 },
    { subject: "AP", count: 0 },
    { subject: "TLE", count: 0 },
    { subject: "MAPEH", count: 0 },
  ],
};

export const placeholderCoreValues = {
  T1: [],
  T2: [],
  T3: [],
};
