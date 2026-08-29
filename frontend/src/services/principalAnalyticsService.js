import { principalAnalyticsPreviewData } from "../data/principalAnalyticsPreviewData";

const PREVIEW_DELAY_MS = 320;
const TERM_INDEX = { "term-1": 0, "term-2": 1, "term-3": 2 };

const delay = () =>
  new Promise((resolve) => {
    window.setTimeout(resolve, PREVIEW_DELAY_MS);
  });

const round = (value) => Math.round(value * 10) / 10;
const average = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const getSchoolYear = (value) =>
  principalAnalyticsPreviewData.schoolYears.find((year) => year.value === value);

const aggregateSubjectRecords = (records) => {
  const subjects = new Map();

  records.forEach((record) => {
    const current = subjects.get(record.subjectId) || {
      id: record.subjectId,
      code: record.subjectCode,
      label: record.subject,
      color: record.color,
      records: [],
    };
    current.records.push(record);
    subjects.set(record.subjectId, current);
  });

  return Array.from(subjects.values()).map((subject) => ({
    id: subject.id,
    code: subject.code,
    label: subject.label,
    color: subject.color,
    learnerCount: Math.round(average(subject.records.map((record) => record.learnerCount))),
    termAverages: [0, 1, 2].map((index) =>
      round(average(subject.records.map((record) => record.termAverages[index]))),
    ),
    termPassRates: [0, 1, 2].map((index) =>
      round(average(subject.records.map((record) => record.termPassRates[index]))),
    ),
  }));
};

export async function getSubjectPerformanceTrend({
  schoolYear,
  gradeLevel = "all",
  term = "overall",
}) {
  await delay();

  const year = getSchoolYear(schoolYear);
  if (!year) throw new Error("The selected school year is unavailable.");
  if (term !== "overall" && TERM_INDEX[term] === undefined) {
    throw new Error("The selected academic term is unavailable.");
  }

  const matchingRecords = principalAnalyticsPreviewData.records.filter(
    (record) =>
      record.schoolYear === schoolYear &&
      (gradeLevel === "all" || record.gradeLevel === Number(gradeLevel)),
  );
  const subjects = aggregateSubjectRecords(matchingRecords);
  const schoolWideAverages = [0, 1, 2].map((index) =>
    round(average(subjects.map((subject) => subject.termAverages[index]))),
  );

  return {
    schoolYear: year,
    gradeLevel,
    term,
    subjects,
    schoolWideAverages,
    totalLearners: Math.round(average(subjects.map((subject) => subject.learnerCount))),
    availableSchoolYears: principalAnalyticsPreviewData.schoolYears,
    availableGradeLevels: principalAnalyticsPreviewData.gradeLevels,
  };
}

export async function getHistoricalComparison({
  primarySchoolYear,
  comparisonSchoolYear,
  term = "overall",
}) {
  await delay();

  const primaryYear = getSchoolYear(primarySchoolYear);
  const comparisonYear = getSchoolYear(comparisonSchoolYear);
  if (!primaryYear || !comparisonYear) {
    throw new Error("One of the selected school years is unavailable.");
  }
  if (primarySchoolYear === comparisonSchoolYear) {
    throw new Error("Choose two different school years to compare.");
  }
  if (term !== "overall" && TERM_INDEX[term] === undefined) {
    throw new Error("The selected academic term is unavailable.");
  }

  const primarySubjects = aggregateSubjectRecords(
    principalAnalyticsPreviewData.records.filter(
      (record) => record.schoolYear === primarySchoolYear,
    ),
  );
  const comparisonSubjects = aggregateSubjectRecords(
    principalAnalyticsPreviewData.records.filter(
      (record) => record.schoolYear === comparisonSchoolYear,
    ),
  );

  const subjects = primarySubjects.map((primarySubject) => {
    const comparisonSubject = comparisonSubjects.find(
      (subject) => subject.id === primarySubject.id,
    );
    return {
      ...primarySubject,
      primaryTermAverages: primarySubject.termAverages,
      comparisonTermAverages: comparisonSubject?.termAverages || [],
      primaryTermPassRates: primarySubject.termPassRates,
      comparisonTermPassRates: comparisonSubject?.termPassRates || [],
    };
  });

  const primaryTrend = [0, 1, 2].map((index) =>
    round(average(subjects.map((subject) => subject.primaryTermAverages[index]))),
  );
  const comparisonTrend = [0, 1, 2].map((index) =>
    round(average(subjects.map((subject) => subject.comparisonTermAverages[index]))),
  );
  const totalStudents = Math.round(
    average(primarySubjects.map((subject) => subject.learnerCount)) * 4,
  );

  return {
    primarySchoolYear: primaryYear,
    comparisonSchoolYear: comparisonYear,
    term,
    totalStudents,
    subjects,
    primaryTrend,
    comparisonTrend,
    availableSchoolYears: principalAnalyticsPreviewData.schoolYears,
  };
}

export const principalAnalyticsTerms = principalAnalyticsPreviewData.terms;
