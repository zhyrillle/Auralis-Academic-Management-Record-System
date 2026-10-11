/**
 * Principal Performance Level Service
 *
 * REST API client connecting to backend /api/principal/performance routes.
 * Section requests reject failed/incomplete responses so the page can show Retry.
 * Other legacy endpoints retain their existing fallback behavior.
 */

import { principalPerformancePreviewData } from "../data/principalPerformancePreviewData";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export const principalPerformanceTerms = principalPerformancePreviewData.terms;

/* ==========================================================================
   PREVIEW DATA GENERATORS (Used when backend is offline or has zero records)
   ========================================================================== */

const TERM_INDEX = { "term-1": 0, "term-2": 1, "term-3": 2 };
const round = (value) => Math.round(Number(value || 0) * 10) / 10;
const average = (values) =>
  values.length
    ? values.reduce((total, value) => total + Number(value || 0), 0) / values.length
    : 0;
const sum = (values) => values.reduce((total, value) => total + Number(value || 0), 0);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const selectedIndexes = (term) => {
  if (term === "overall") return [0, 1, 2];
  if (TERM_INDEX[term] === undefined) return [0, 1, 2];
  return [TERM_INDEX[term]];
};

const valueForTerm = (values, term) =>
  round(average(selectedIndexes(term).map((index) => values[index])));

const getSchoolYear = (value) =>
  principalPerformancePreviewData.schoolYears.find((year) => year.value === value) ||
  principalPerformancePreviewData.schoolYears[0];
const getSection = (id) =>
  principalPerformancePreviewData.sections.find((section) => section.id === id);
const getSubject = (id) =>
  principalPerformancePreviewData.subjects.find((subject) => subject.id === id);

const recordsFor = ({ schoolYear, gradeLevel = "all" }) =>
  principalPerformancePreviewData.records.filter(
    (record) =>
      (!schoolYear || record.schoolYear === schoolYear || record.schoolYear === "2026-2027") &&
      (gradeLevel === "all" || record.gradeLevel === Number(gradeLevel)),
  );

const statusFor = (averageGrade, passRate) => {
  if (averageGrade < 75) return "Needs attention";
  if (averageGrade < 80 || passRate < 80) return "Monitor";
  return "On track";
};

const aggregateBy = (records, key, term) => {
  const groups = new Map();
  records.forEach((record) => {
    const current = groups.get(record[key]) || [];
    current.push(record);
    groups.set(record[key], current);
  });

  return Array.from(groups, ([id, groupedRecords]) => {
    const averageGrade = round(
      average(groupedRecords.map((record) => valueForTerm(record.termAverages, term))),
    );
    const passRate = round(
      average(groupedRecords.map((record) => valueForTerm(record.termPassRates, term))),
    );
    return { id, records: groupedRecords, averageGrade, passRate };
  });
};

const commonMetadata = (term, schoolYear) => ({
  term,
  schoolYear: getSchoolYear(schoolYear),
  availableSchoolYears: principalPerformancePreviewData.schoolYears,
  availableGradeLevels: principalPerformancePreviewData.gradeLevels,
});

const schoolSummary = (records, term) => {
  const sectionGroups = aggregateBy(records, "sectionId", term);
  const totalLearners = sum(
    sectionGroups.map((group) => getSection(group.id)?.learners || 0),
  );
  const averageGrade = round(average(sectionGroups.map((group) => group.averageGrade)));
  const passRate = round(average(sectionGroups.map((group) => group.passRate)));
  const passingLearners = Math.round(totalLearners * (passRate / 100));
  return {
    averageGrade,
    passRate,
    failRate: round(100 - passRate),
    totalLearners,
    passingLearners,
    failingLearners: Math.max(totalLearners - passingLearners, 0),
  };
};

const distributionFor = (averageGrade, passRate) => {
  const needsAttention = clamp(Math.round((80 - averageGrade) * 2 + (88 - passRate) * 0.35), 4, 28);
  const satisfactory = clamp(Math.round(25 - (averageGrade - 80) * 0.7), 12, 30);
  const verySatisfactory = clamp(Math.round(36 + (averageGrade - 84) * 0.6), 24, 44);
  const outstanding = Math.max(100 - needsAttention - satisfactory - verySatisfactory, 4);
  const total = needsAttention + satisfactory + verySatisfactory + outstanding;
  return {
    needsAttention: round((needsAttention / total) * 100),
    satisfactory: round((satisfactory / total) * 100),
    verySatisfactory: round((verySatisfactory / total) * 100),
    outstanding: round((outstanding / total) * 100),
  };
};

function getPreviewGradeLevels({ term = "overall", schoolYear = "2026-2027" }) {
  const records = recordsFor({ schoolYear });
  const gradeLevels = aggregateBy(records, "gradeLevel", term)
    .map((group) => {
      const sections = principalPerformancePreviewData.sections.filter(
        (section) => section.gradeLevel === Number(group.id),
      );
      const learners = sum(sections.map((section) => section.learners));
      return {
        id: `grade-${group.id}`,
        gradeLevel: Number(group.id),
        label: `Grade ${group.id}`,
        shortLabel: `G${group.id}`,
        learners,
        averageGrade: group.averageGrade,
        passRate: group.passRate,
        failRate: round(100 - group.passRate),
        status: statusFor(group.averageGrade, group.passRate),
      };
    })
    .sort((a, b) => a.gradeLevel - b.gradeLevel);
  const summary = schoolSummary(records, term);

  return {
    ...commonMetadata(term, schoolYear),
    summary: {
      ...summary,
      needsAttention: gradeLevels.filter((item) => item.status !== "On track").length,
    },
    gradeLevels,
  };
}

function getPreviewSections({ term = "overall", schoolYear = "2026-2027", gradeLevel = "all" }) {
  const records = recordsFor({ schoolYear, gradeLevel });
  const sections = aggregateBy(records, "sectionId", term)
    .map((group) => {
      const section = getSection(group.id);
      return {
        id: group.id,
        sectionId: group.id,
        label: section.code,
        gradeLevel: section.gradeLevel,
        section: section.name,
        learners: section.learners,
        averageGrade: group.averageGrade,
        passRate: group.passRate,
        failRate: round(100 - group.passRate),
        status: statusFor(group.averageGrade, group.passRate),
        distribution: distributionFor(group.averageGrade, group.passRate),
      };
    })
    .sort((a, b) => a.gradeLevel - b.gradeLevel || a.section.localeCompare(b.section));
  const bands = [
    { id: "needs-attention", label: "Needs Attention", count: sections.filter((item) => item.averageGrade < 80).length },
    { id: "satisfactory", label: "Satisfactory", count: sections.filter((item) => item.averageGrade >= 80 && item.averageGrade < 85).length },
    { id: "very-satisfactory", label: "Very Satisfactory", count: sections.filter((item) => item.averageGrade >= 85 && item.averageGrade < 90).length },
    { id: "outstanding", label: "Outstanding", count: sections.filter((item) => item.averageGrade >= 90).length },
  ];

  return {
    ...commonMetadata(term, schoolYear),
    gradeLevel,
    summary: {
      ...schoolSummary(records, term),
      needsAttention: sections.filter((item) => item.status !== "On track").length,
    },
    sections,
    bands,
  };
}

function getPreviewSubjects({ term = "overall", schoolYear = "2026-2027", gradeLevel = "all" }) {
  const records = recordsFor({ schoolYear, gradeLevel });
  const subjects = aggregateBy(records, "subjectId", term)
    .map((group) => {
      const subject = getSubject(group.id);
      const sectionGroups = aggregateBy(group.records, "sectionId", term)
        .map((sectionGroup) => ({
          section: getSection(sectionGroup.id),
          averageGrade: sectionGroup.averageGrade,
        }))
        .sort((a, b) => b.averageGrade - a.averageGrade);
      return {
        id: group.id,
        label: subject.label,
        code: subject.code,
        color: subject.color,
        averageGrade: group.averageGrade,
        passRate: group.passRate,
        failRate: round(100 - group.passRate),
        learners: sum(sectionGroups.map((s) => s.section?.learners || 0)),
        highestSection: sectionGroups[0] || null,
        lowestSection: sectionGroups.at(-1) || null,
        status: statusFor(group.averageGrade, group.passRate),
      };
    })
    .sort((a, b) => b.averageGrade - a.averageGrade);

  return {
    ...commonMetadata(term, schoolYear),
    gradeLevel,
    subjects,
    summary: {
      totalSubjects: subjects.length,
      topSubject: subjects[0] || null,
      lowestSubject: subjects.at(-1) || null,
      belowTarget: subjects.filter((subject) => subject.averageGrade < 80).length,
    },
  };
}

function getPreviewTeachers({ term = "overall", schoolYear = "2026-2027", gradeLevel = "all" }) {
  const teachers = principalPerformancePreviewData.teachers
    .filter((teacher) => {
      if (gradeLevel === "all") return true;
      const assignedSections = teacher.sectionIds.map((id) => getSection(id));
      return assignedSections.some((sec) => sec && sec.gradeLevel === Number(gradeLevel));
    })
    .map((teacher) => {
      const assignmentRecords = principalPerformancePreviewData.records.filter(
        (record) =>
          record.subjectId === teacher.subjectId &&
          teacher.sectionIds.includes(record.sectionId),
      );
      const averageGrade = round(
        average(assignmentRecords.map((record) => valueForTerm(record.termAverages, term))),
      );
      const passRate = round(
        average(assignmentRecords.map((record) => valueForTerm(record.termPassRates, term))),
      );
      const completion = valueForTerm(teacher.completion, term);
      const subject = getSubject(teacher.subjectId);
      const learnerCount = sum(
        teacher.sectionIds.map((sectionId) => getSection(sectionId)?.learners || 0),
      );
      return {
        id: teacher.id,
        name: teacher.name,
        subject: subject.label,
        subjectCode: subject.code,
        color: teacher.color,
        assignments: teacher.sectionIds.map((id) => getSection(id)?.code).filter(Boolean),
        learnerCount,
        averageGrade,
        passRate,
        completion,
        status: completion >= 100 ? "Submitted" : completion < 80 ? "Delayed" : "Pending",
        termAverages: [0, 1, 2].map((index) =>
          round(average(assignmentRecords.map((record) => record.termAverages[index]))),
        ),
      };
    });
  const overallPassRate = round(average(teachers.map((teacher) => teacher.passRate)));

  return {
    ...commonMetadata(term, schoolYear),
    gradeLevel,
    teachers,
    summary: {
      totalTeachers: teachers.length,
      submittedReports: teachers.filter((teacher) => teacher.completion >= 100).length,
      failRate: round(100 - overallPassRate),
      needsAttention: teachers.filter(
        (teacher) => teacher.averageGrade < 80 || teacher.completion < 80,
      ).length,
    },
  };
}

function getPreviewLowestPerformers({ term = "overall", schoolYear = "2026-2027", gradeLevel = "all" }) {
  const gradeData = getPreviewGradeLevels({ term, schoolYear });
  const sectionData = getPreviewSections({ term, schoolYear, gradeLevel });
  const subjectData = getPreviewSubjects({ term, schoolYear, gradeLevel });

  const matchingGradeLevels = gradeData.gradeLevels.filter(
    (item) => gradeLevel === "all" || item.gradeLevel === Number(gradeLevel),
  );
  const matchingSections = sectionData.sections.filter(
    (section) => gradeLevel === "all" || section.gradeLevel === Number(gradeLevel),
  );
  const atRiskStudents = sum(
    matchingSections.map((section) =>
      Math.round(section.learners * ((100 - section.passRate) / 100)),
    ),
  );
  const sortedGradeLevels = [...matchingGradeLevels].sort(
    (a, b) => a.averageGrade - b.averageGrade,
  );
  const sortedSections = [...matchingSections].sort(
    (a, b) => a.averageGrade - b.averageGrade,
  );
  const sortedSubjects = [...subjectData.subjects].sort(
    (a, b) => a.averageGrade - b.averageGrade,
  );

  return {
    ...commonMetadata(term, schoolYear),
    gradeLevel,
    summary: {
      lowestGradeLevel: sortedGradeLevels[0] || null,
      lowestSection: sortedSections[0] || null,
      lowestSubject: sortedSubjects[0] || null,
      atRiskStudents,
    },
    gradeLevels: sortedGradeLevels,
    sections: sortedSections,
    subjects: sortedSubjects,
  };
}

/* ==========================================================================
   PUBLIC API CLIENT WITH PREVIEW DATA FALLBACK
   ========================================================================== */

/**
 * 1. By Grade Levels
 */
export async function getGradeLevelPerformance({ term = "overall", schoolYear = "2026-2027" }) {
  try {
    const params = new URLSearchParams({ term, schoolYear });
    const res = await fetch(`${API_BASE_URL}/principal/performance/grade-levels?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.gradeLevels) && data.gradeLevels.length > 0) {
        // If real DB has learners or grades, use DB data!
        const hasDbData = data.gradeLevels.some((gl) => gl.learners > 0 || gl.averageGrade > 0);
        if (hasDbData) return data;
      }
    }
  } catch (err) {
    console.warn("Using preview fallback for Grade Level Performance:", err.message);
  }

  return getPreviewGradeLevels({ term, schoolYear });
}

/**
 * 2. By Sections
 */
export async function getSectionPerformance({ term = "overall", schoolYear = "2026-2027", gradeLevel = "all" }) {
  const params = new URLSearchParams({ term, schoolYear, gradeLevel: String(gradeLevel) });
  const res = await fetch(`${API_BASE_URL}/principal/performance/sections?${params.toString()}`);
  if (!res.ok) throw new Error(`Unable to load section performance (HTTP ${res.status}).`);
  const data = await res.json();
  const numeric = (value) => value != null && value !== "" && Number.isFinite(Number(value));
  const summaryFields = ["averageGrade", "passRate", "failRate", "passingLearners", "failingLearners", "needsAttention"];
  const valid = data && Array.isArray(data.sections) && Array.isArray(data.bands)
    && Array.isArray(data.availableSchoolYears) && Array.isArray(data.availableGradeLevels)
    && data.summary && summaryFields.every((field) => numeric(data.summary[field]))
    && data.availableSchoolYears.every((year) => year && typeof year.value === "string" && typeof year.label === "string")
    && data.availableGradeLevels.every(numeric)
    && data.bands.every((band) => band && typeof band.label === "string" && numeric(band.count))
    && data.sections.every((section) => section && typeof section.section === "string"
      && typeof section.label === "string" && numeric(section.gradeLevel)
      && section.distribution && ["needsAttention", "satisfactory", "verySatisfactory", "outstanding"]
        .every((band) => numeric(section.distribution[band])));
  if (!valid) throw new Error("The section performance response is incomplete. Please retry or contact the administrator.");
  return data;
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
      if (data && Array.isArray(data.subjects) && data.subjects.length > 0) {
        const hasDbData = data.subjects.some((subj) => subj.averageGrade > 0 || subj.learners > 0);
        if (hasDbData) return data;
      }
    }
  } catch (err) {
    console.warn("Using preview fallback for Subject Performance:", err.message);
  }

  return getPreviewSubjects({ term, schoolYear, gradeLevel });
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
      if (data && Array.isArray(data.teachers) && data.teachers.length > 0) {
        const hasDbData = data.teachers.some((t) => t.completion > 0 || t.averageGrade > 0 || t.assignments.length > 0);
        if (hasDbData) return data;
      }
    }
  } catch (err) {
    console.warn("Using preview fallback for Teacher Performance:", err.message);
  }

  return getPreviewTeachers({ term, schoolYear, gradeLevel });
}

/**
 * 5. Lowest Performers
 */
export async function getLowestPerformers({ term = "overall", schoolYear = "2026-2027", gradeLevel = "all" }) {
  try {
    const params = new URLSearchParams({ term, schoolYear, gradeLevel: String(gradeLevel) });
    const res = await fetch(`${API_BASE_URL}/principal/performance/lowest-performers?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.gradeLevels) && data.gradeLevels.length > 0) {
        const hasDbData = data.gradeLevels.some((gl) => gl.averageGrade > 0) || Boolean(data.summary?.lowestGradeLevel);
        if (hasDbData) return data;
      }
    }
  } catch (err) {
    console.warn("Using preview fallback for Lowest Performers:", err.message);
  }

  return getPreviewLowestPerformers({ term, schoolYear, gradeLevel });
}
