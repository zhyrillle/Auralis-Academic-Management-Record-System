/**
 * Default fallback / placeholder data for Adviser Dashboard
 * Defaulted to dummy data so charts can be tested visually.
 */

export const placeholderAdviserSummary = {
  sectionAverage: "85%",
  sectionAverageDiff: "+2% from Q1",
  lowestPerformingSection: "Section B",
  lowestPerformingSectionNote: "Needs intervention",
  atRiskStudentsCount: 4,
  atRiskStudentsNote: "Across all sections",
  entryProgress: 66,
  totalClasses: 4,
  totalStudents: 150,
  pendingSubmissions: 2,
  submittedGrades: 12,
};

export const placeholderSubjectPerformance = {
  T1: [
    { section: "Section A", passCount: 25, failCount: 2 },
    { section: "Section B", passCount: 20, failCount: 5 },
    { section: "Section C", passCount: 28, failCount: 1 },
    { section: "Section D", passCount: 22, failCount: 3 },
  ],
  T2: [],
  T3: [],
};

export const placeholderAssignedClasses = [
  { section_id: 1, section: "Gemelina", subject: "English", studentCount: 50, entryProgress: 66, status: "In Progress" },
  { section_id: 2, section: "Mahogany", subject: "English", studentCount: 50, entryProgress: 80, status: "In Progress" },
  { section_id: 3, section: "Narra", subject: "English", studentCount: 50, entryProgress: 100, status: "Completed" }
];

export const placeholderGradeRangeDistribution = {
  categories: ["60-74", "75-79", "80-84", "85-89", "90-100"],
  sections: {
    All: {
      T1: [5, 15, 30, 25, 10],
      T2: [4, 12, 35, 20, 15],
      T3: [2, 10, 40, 25, 20],
    },
  },
};

export const placeholderAttendanceTrend = [
  { week: "Week 1", label: "Week 1", count: 85 },
  { week: "Week 2", label: "Week 2", count: 120 },
  { week: "Week 3", label: "Week 3", count: 180 },
  { week: "Week 4", label: "Week 4", count: 60 },
  { week: "Week 5", label: "Week 5", count: 190 },
];

export const placeholderTestExamAnalysis = {
  T1: {
    above75: [
      { name: "ST1", value: 60, fill: "#27487F" },
      { name: "ST2", value: 70, fill: "#4A6FA5" },
      { name: "TE", value: 50, fill: "#748CAB" }
    ],
    below75: [
      { name: "ST1", value: 40, fill: "#27487F" },
      { name: "ST2", value: 30, fill: "#4A6FA5" },
      { name: "TE", value: 50, fill: "#748CAB" }
    ],
    scores: {
      ST1: { highest: 50, lowest: 1 },
      ST2: { highest: 48, lowest: 5 },
      TE: { highest: 50, lowest: 1 },
    },
  },
  T2: {
    above75: [], below75: [],
    scores: { ST1: { highest: 0, lowest: 0 }, ST2: { highest: 0, lowest: 0 }, TE: { highest: 0, lowest: 0 } },
  },
  T3: {
    above75: [], below75: [],
    scores: { ST1: { highest: 0, lowest: 0 }, ST2: { highest: 0, lowest: 0 }, TE: { highest: 0, lowest: 0 } },
  },
};

export const placeholderSubjectAreaPerformance = {
  T1: [
    { subject: "Filipino", count: 45 },
    { subject: "English", count: 30 },
    { subject: "Mathematics", count: 50 },
    { subject: "Science", count: 40 },
    { subject: "AP", count: 20 },
    { subject: "TLE", count: 35 },
    { subject: "MAPEH", count: 25 },
  ],
  T2: [],
  T3: [],
};

export const placeholderCoreValues = {
  T1: [
    { name: "Maka-Diyos", value: 30 },
    { name: "Maka-tao", value: 20 },
    { name: "Makakalikasan", value: 25 },
    { name: "Makabansa", value: 25 }
  ],
  T2: [],
  T3: [],
};
