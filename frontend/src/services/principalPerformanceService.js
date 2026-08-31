import { principalPerformancePreviewData } from "../data/principalPerformancePreviewData";

const PREVIEW_DELAY_MS = 320;
const TERM_INDEX = { "term-1": 0, "term-2": 1, "term-3": 2 };

const delay = () =>
  new Promise((resolve) => {
    window.setTimeout(resolve, PREVIEW_DELAY_MS);
  });

const round = (value) => Math.round(value * 10) / 10;
const average = (values) =>
  values.length
    ? values.reduce((total, value) => total + Number(value || 0), 0) / values.length
    : 0;
const sum = (values) => values.reduce((total, value) => total + Number(value || 0), 0);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const selectedIndexes = (term) => {
  if (term === "overall") return [0, 1, 2];
  if (TERM_INDEX[term] === undefined) throw new Error("The selected academic term is unavailable.");
  return [TERM_INDEX[term]];
};

const valueForTerm = (values, term) =>
  round(average(selectedIndexes(term).map((index) => values[index])));

const getSchoolYear = (value) =>
  principalPerformancePreviewData.schoolYears.find((year) => year.value === value);
const getSection = (id) =>
  principalPerformancePreviewData.sections.find((section) => section.id === id);
const getSubject = (id) =>
  principalPerformancePreviewData.subjects.find((subject) => subject.id === id);

const ensureSchoolYear = (schoolYear) => {
  const matchedYear = getSchoolYear(schoolYear);
  if (!matchedYear) throw new Error("The selected school year is unavailable.");
  return matchedYear;
};

const recordsFor = ({ schoolYear, gradeLevel = "all" }) =>
  principalPerformancePreviewData.records.filter(
    (record) =>
      record.schoolYear === schoolYear &&
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
  schoolYear: ensureSchoolYear(schoolYear),
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

export async function getGradeLevelPerformance({ term = "overall", schoolYear }) {
  await delay();
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

export async function getSectionPerformance({ term = "overall", schoolYear }) {
  await delay();
  const records = recordsFor({ schoolYear });
  const sections = aggregateBy(records, "sectionId", term)
    .map((group) => {
      const section = getSection(group.id);
      return {
        id: group.id,
        label: section.code,
        gradeLevel: section.gradeLevel,
        section: section.name,
        learners: section.learners,
        averageGrade: group.averageGrade,
        passRate: group.passRate,
        status: statusFor(group.averageGrade, group.passRate),
        distribution: distributionFor(group.averageGrade, group.passRate),
      };
    })
    .sort((a, b) => a.gradeLevel - b.gradeLevel || a.section.localeCompare(b.section));
  const bands = [
    { id: "outstanding", label: "Outstanding", count: sections.filter((item) => item.averageGrade >= 90).length, color: "#17376d" },
    { id: "very-satisfactory", label: "Very Satisfactory", count: sections.filter((item) => item.averageGrade >= 85 && item.averageGrade < 90).length, color: "#496483" },
    { id: "satisfactory", label: "Satisfactory", count: sections.filter((item) => item.averageGrade >= 75 && item.averageGrade < 85).length, color: "#d59a18" },
    { id: "needs-attention", label: "Needs Attention", count: sections.filter((item) => item.averageGrade < 75).length, color: "#d94b4b" },
  ];

  return {
    ...commonMetadata(term, schoolYear),
    summary: { ...schoolSummary(records, term), needsAttention: sections.filter((item) => item.status !== "On track").length },
    sections,
    bands,
  };
}

export async function getSubjectPerformance({ term = "overall", schoolYear, gradeLevel = "all" }) {
  await delay();
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
        highestSection: sectionGroups[0],
        lowestSection: sectionGroups.at(-1),
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

const teacherAssignmentRecords = (teacher, schoolYear) =>
  principalPerformancePreviewData.records.filter(
    (record) =>
      record.schoolYear === schoolYear &&
      record.subjectId === teacher.subjectId &&
      teacher.sectionIds.includes(record.sectionId),
  );

export async function getTeacherPerformance({ term = "overall", schoolYear }) {
  await delay();
  ensureSchoolYear(schoolYear);
  const teachers = principalPerformancePreviewData.teachers.map((teacher) => {
    const assignmentRecords = teacherAssignmentRecords(teacher, schoolYear);
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

export async function getLowestPerformers({ term = "overall", schoolYear, gradeLevel = "all" }) {
  const [gradeData, sectionData, subjectData] = await Promise.all([
    getGradeLevelPerformance({ term, schoolYear }),
    getSectionPerformance({ term, schoolYear }),
    getSubjectPerformance({ term, schoolYear, gradeLevel }),
  ]);
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

export const principalPerformanceTerms = principalPerformancePreviewData.terms;
