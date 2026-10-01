const SCHOOL_YEARS = [
  { id: "sy-2026-2027", value: "2026-2027", label: "SY 2026–2027", adjustment: 0 },
];

const SUBJECTS = [
  { id: "filipino", code: "FIL", label: "Filipino", color: "#8b5cf6", terms: [82, 84, 85] },
  { id: "english", code: "ENG", label: "English", color: "#2563eb", terms: [84, 87, 87] },
  { id: "mathematics", code: "MATH", label: "Mathematics", color: "#ef4444", terms: [76, 79, 81] },
  { id: "science", code: "SCI", label: "Science", color: "#10b981", terms: [84, 84, 81] },
  { id: "ap", code: "AP", label: "Araling Panlipunan", color: "#6366f1", terms: [81, 83, 84] },
  { id: "tle", code: "TLE", label: "TLE", color: "#f59e0b", terms: [85, 88, 88] },
  { id: "mapeh", code: "MAPEH", label: "MAPEH", color: "#ec4899", terms: [88, 90, 91] },
  { id: "esp", code: "ESP", label: "ESP", color: "#64748b", terms: [86, 89, 89] },
];

const SECTIONS = [
  { id: "g7-mahogany", gradeLevel: 7, name: "Mahogany", code: "G7–Mahogany", learners: 43, adjustment: -2.8 },
  { id: "g7-narra", gradeLevel: 7, name: "Narra", code: "G7–Narra", learners: 41, adjustment: -1.3 },
  { id: "g7-talisay", gradeLevel: 7, name: "Talisay", code: "G7–Talisay", learners: 42, adjustment: 0.4 },
  { id: "g7-gemelina", gradeLevel: 7, name: "Gemelina", code: "G7–Gemelina", learners: 40, adjustment: 1.5 },
  { id: "g8-molave", gradeLevel: 8, name: "Molave", code: "G8–Molave", learners: 42, adjustment: -1.7 },
  { id: "g8-fire-tree", gradeLevel: 8, name: "Fire Tree", code: "G8–Fire Tree", learners: 40, adjustment: -0.2 },
  { id: "g8-acacia", gradeLevel: 8, name: "Acacia", code: "G8–Acacia", learners: 41, adjustment: 1.1 },
  { id: "g8-kamagong", gradeLevel: 8, name: "Kamagong", code: "G8–Kamagong", learners: 39, adjustment: 2 },
  { id: "g9-rizal", gradeLevel: 9, name: "Rizal", code: "G9–Rizal", learners: 44, adjustment: -2.1 },
  { id: "g9-bonifacio", gradeLevel: 9, name: "Bonifacio", code: "G9–Bonifacio", learners: 42, adjustment: -0.7 },
  { id: "g9-enriquez", gradeLevel: 9, name: "Enriquez", code: "G9–Enriquez", learners: 43, adjustment: 0.8 },
  { id: "g9-luna", gradeLevel: 9, name: "Luna", code: "G9–Luna", learners: 40, adjustment: 1.7 },
  { id: "g10-aquino", gradeLevel: 10, name: "Aquino", code: "G10–Aquino", learners: 41, adjustment: -1.4 },
  { id: "g10-mabini", gradeLevel: 10, name: "Mabini", code: "G10–Mabini", learners: 40, adjustment: 0.1 },
  { id: "g10-del-pilar", gradeLevel: 10, name: "Del Pilar", code: "G10–Del Pilar", learners: 39, adjustment: 1.2 },
  { id: "g10-jacinto", gradeLevel: 10, name: "Jacinto", code: "G10–Jacinto", learners: 38, adjustment: 2.2 },
];

const TEACHERS = [
  { id: "teacher-1", name: "Angelica Ramos", subjectId: "english", sectionIds: ["g7-mahogany", "g8-molave"], completion: [100, 100, 92], color: "#2563eb" },
  { id: "teacher-2", name: "Carla Mendoza", subjectId: "filipino", sectionIds: ["g7-narra", "g9-rizal"], completion: [100, 96, 88], color: "#8b5cf6" },
  { id: "teacher-3", name: "Diego Cruz", subjectId: "mathematics", sectionIds: ["g8-fire-tree", "g9-bonifacio"], completion: [100, 82, 72], color: "#ef4444" },
  { id: "teacher-4", name: "Angela Martinez", subjectId: "science", sectionIds: ["g7-talisay", "g10-aquino"], completion: [100, 100, 94], color: "#10b981" },
  { id: "teacher-5", name: "Mark Santos", subjectId: "ap", sectionIds: ["g8-acacia", "g9-enriquez"], completion: [100, 92, 86], color: "#6366f1" },
  { id: "teacher-6", name: "Liza Torres", subjectId: "tle", sectionIds: ["g9-luna", "g10-mabini"], completion: [100, 100, 100], color: "#f59e0b" },
  { id: "teacher-7", name: "Ramon Reyes", subjectId: "mapeh", sectionIds: ["g8-kamagong", "g10-del-pilar"], completion: [100, 100, 98], color: "#ec4899" },
  { id: "teacher-8", name: "Mia Salazar", subjectId: "esp", sectionIds: ["g7-gemelina", "g10-jacinto"], completion: [100, 96, 90], color: "#64748b" },
];

const round = (value) => Math.round(value * 10) / 10;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const buildRecords = () =>
  SCHOOL_YEARS.flatMap((schoolYear, yearIndex) =>
    SECTIONS.flatMap((section, sectionIndex) =>
      SUBJECTS.map((subject, subjectIndex) => {
        const termAverages = subject.terms.map((base, termIndex) =>
          round(
            clamp(
              base +
                schoolYear.adjustment +
                section.adjustment +
                ((sectionIndex + subjectIndex + termIndex + yearIndex) % 3) * 0.35,
              70,
              97,
            ),
          ),
        );

        return {
          id: `${schoolYear.id}-${section.id}-${subject.id}`,
          schoolYear: schoolYear.value,
          sectionId: section.id,
          gradeLevel: section.gradeLevel,
          subjectId: subject.id,
          learnerCount: section.learners,
          termAverages,
          termPassRates: termAverages.map((value, termIndex) =>
            round(clamp(55 + (value - 75) * 2.7 + termIndex * 0.4, 42, 99)),
          ),
        };
      }),
    ),
  );

export const principalPerformancePreviewData = {
  schoolYears: SCHOOL_YEARS.map(({ id, value, label }) => ({ id, value, label })),
  terms: [
    { id: "overall", label: "Overall" },
    { id: "term-1", label: "Term 1" },
    { id: "term-2", label: "Term 2" },
    { id: "term-3", label: "Term 3" },
  ],
  gradeLevels: [7, 8, 9, 10],
  subjects: SUBJECTS.map(({ id, code, label, color }) => ({
    id,
    code,
    label,
    color,
  })),
  sections: SECTIONS.map(({ id, gradeLevel, name, code, learners }) => ({
    id,
    gradeLevel,
    name,
    code,
    learners,
  })),
  teachers: TEACHERS,
  records: buildRecords(),
};
