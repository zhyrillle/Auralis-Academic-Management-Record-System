const SUBJECT_DEFINITIONS = [
  { id: "filipino", code: "FIL", label: "Filipino", color: "#8b5cf6", terms: [80, 81, 81] },
  { id: "english", code: "ENG", label: "English", color: "#2563eb", terms: [83, 84, 85] },
  { id: "mathematics", code: "MATH", label: "Mathematics", color: "#ef4444", terms: [77, 80, 83] },
  { id: "science", code: "SCI", label: "Science", color: "#10b981", terms: [83, 81, 79] },
  { id: "ap", code: "AP", label: "Araling Panlipunan", color: "#6366f1", terms: [81, 82, 82] },
  { id: "tle", code: "TLE", label: "TLE", color: "#f59e0b", terms: [84, 86, 87] },
  { id: "mapeh", code: "MAPEH", label: "MAPEH", color: "#ec4899", terms: [87, 86, 85] },
  { id: "esp", code: "ESP", label: "ESP", color: "#64748b", terms: [86, 86, 86.5] },
];

const SCHOOL_YEARS = [
  { id: "sy-2026-2027", label: "SY 2026–2027", value: "2026-2027", adjustment: 0 },
  { id: "sy-2025-2026", label: "SY 2025–2026", value: "2025-2026", adjustment: -1.4 },
  { id: "sy-2024-2025", label: "SY 2024–2025", value: "2024-2025", adjustment: -2.3 },
];

const GRADE_LEVELS = [7, 8, 9, 10];
const GRADE_ADJUSTMENTS = { 7: -0.8, 8: 0.3, 9: -0.2, 10: 0.7 };
const YEAR_SUBJECT_ADJUSTMENTS = {
  "2025-2026": {
    filipino: -0.5,
    english: -1,
    mathematics: -3,
    science: 3,
    ap: -2,
    tle: -2,
    mapeh: 1.5,
    esp: -0.5,
  },
  "2024-2025": {
    filipino: -1.4,
    english: -2.2,
    mathematics: -4.1,
    science: 2.1,
    ap: -2.7,
    tle: -3,
    mapeh: 0.8,
    esp: -1.2,
  },
};

const round = (value) => Math.round(value * 10) / 10;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const buildPreviewRecords = () =>
  SCHOOL_YEARS.flatMap((schoolYear, yearIndex) =>
    GRADE_LEVELS.flatMap((gradeLevel, gradeIndex) =>
      SUBJECT_DEFINITIONS.map((subject, subjectIndex) => {
        const subjectAdjustment =
          YEAR_SUBJECT_ADJUSTMENTS[schoolYear.value]?.[subject.id] || 0;
        const learnerCount = 168 + gradeIndex * 7 + ((subjectIndex * 3 + yearIndex) % 8);
        const termAverages = subject.terms.map((value, termIndex) =>
          round(
            value +
              schoolYear.adjustment +
              subjectAdjustment +
              GRADE_ADJUSTMENTS[gradeLevel] +
              ((subjectIndex + gradeIndex + termIndex) % 3) * 0.2,
          ),
        );

        return {
          schoolYear: schoolYear.value,
          gradeLevel,
          subjectId: subject.id,
          subjectCode: subject.code,
          subject: subject.label,
          color: subject.color,
          learnerCount,
          termAverages,
          termPassRates: termAverages.map((average, termIndex) =>
            round(clamp(61 + (average - 75) * 2.45 + termIndex * 0.5, 48, 99)),
          ),
        };
      }),
    ),
  );

export const principalAnalyticsPreviewData = {
  schoolYears: SCHOOL_YEARS.map((schoolYear) => ({
    id: schoolYear.id,
    label: schoolYear.label,
    value: schoolYear.value,
  })),
  gradeLevels: GRADE_LEVELS,
  terms: [
    { id: "overall", label: "Overall" },
    { id: "term-1", label: "Term 1" },
    { id: "term-2", label: "Term 2" },
    { id: "term-3", label: "Term 3" },
  ],
  records: buildPreviewRecords(),
};
