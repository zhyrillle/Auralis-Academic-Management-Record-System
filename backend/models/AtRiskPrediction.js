const db = require('../config/db');
const { loadInputs, schoolYearRange } = require('../services/EnglishRiskFeatures');
const model = require('../services/EnglishRiskModel');

function missingRecordSources({ profile, features }) {
  const valid = (value, maximum) => Number.isFinite(value) && value >= 0 && value <= maximum;
  const sources = [];
  if (profile.attendanceStatus !== 'available' || !valid(features.absence_rate, 1)) {
    sources.push({ source: 'attendance', label: 'Attendance',
      reason: profile.attendanceReason || 'Complete, valid source-term attendance records are needed.' });
  }
  if (profile.screeningStatus !== 'available' || features.phil_iri_unavailable !== 0
    || !['literal', 'inferential', 'critical'].every(part => valid(features[`phil_iri_${part}_pct`], 100))) {
    sources.push({ source: 'phil_iri', label: 'PHIL-IRI',
      reason: profile.screeningReason || 'Complete, valid and dated screening sub-scores are needed.' });
  }
  return sources;
}

class AtRiskPrediction {
  static async getOptions() {
    const [years] = await db.execute(`SELECT school_year_id, starts_on, ends_on, status
      FROM SCHOOL_YEAR ORDER BY CASE WHEN LOWER(status) IN ('ongoing', 'active') THEN 0 ELSE 1 END, starts_on DESC`);
    const [grades] = await db.execute('SELECT grade_level_name FROM GRADE_LEVEL ORDER BY grade_level_id');
    return {
      schoolYears: years.map(row => ({ value: schoolYearRange(row), label: `SY ${schoolYearRange(row)?.replace('-', '–')}` })).filter(row => row.value),
      gradeLevels: [{ value: 'all', label: 'All Grade Levels' }, ...grades.map(row => ({
        value: String(row.grade_level_name).match(/\d+/)?.[0], label: row.grade_level_name,
      })).filter(row => row.value)],
    };
  }

  static async getPreview(filters, { database = db, scope = {}, now = new Date() } = {}) {
    const input = await loadInputs(database, filters, now, scope);
    const complete = [], unavailable = [...input.unavailable];
    for (const row of input.eligible) {
      const missing = missingRecordSources(row);
      if (!missing.length) complete.push(row);
      else unavailable.push({ ...row.profile, status: 'insufficient_data',
        missingSources: missing.map(item => item.source),
        reason: missing.map(item => `${item.label} needed: ${item.reason}`).join(' ') });
    }
    // App labels require recorded inputs; the saved worker retains its research imputer.
    // An empty batch still checks the trusted model and matching runtime.
    const result = await model.predict(complete.map(row => row.features));
    const students = complete.map((row, index) => {
      const prediction = result.predictions[index];
      return {
        ...row.profile, riskScore: Number((prediction.score * 100).toFixed(1)),
        score: prediction.score, riskLevel: prediction.riskLevel,
        predictedAtRisk: prediction.predictedAtRisk, modelVersion: result.modelVersion,
        modelInputs: { ...row.features },
        missingInputs: Object.entries(row.features).filter(([, value]) => value == null).map(([key]) => key),
        flags: [
          { icon: 'trending-down', label: `Previous English grade: ${row.features.previous_final_grade}` },
          { icon: 'document', label: `Screening sub-scores recorded (${row.profile.screeningAssessmentDate}).` },
          { icon: 'calendar', label: `Attendance: ${row.profile.attendanceSummary.absentDays} absent day${row.profile.attendanceSummary.absentDays === 1 ? '' : 's'} across ${row.profile.attendanceSummary.classDays} recorded class days.` },
        ],
      };
    });
    const summary = { lowRisk: 0, mediumRisk: 0, highRisk: 0, total: students.length };
    const gradeMap = new Map();
    for (const student of students) {
      summary[`${student.riskLevel}Risk`]++;
      if (!gradeMap.has(student.grade)) gradeMap.set(student.grade, { grade: `Grade ${student.grade}`, low: 0, medium: 0, high: 0 });
      gradeMap.get(student.grade)[student.riskLevel]++;
    }
    return {
      mode: 'preview', subject: 'English', modelVersion: result.modelVersion,
      threshold: result.threshold, sourceTerm: input.sourceTerm, targetTerm: input.targetTerm,
      generatedAt: new Date().toISOString(), schoolYear: input.schoolYear,
      automaticAlertsEnabled: false, termTransferValidated: false,
      warnings: [
        'Research preview only. This quarterly-trained model has not been validated on three-term outcomes.',
        'Predictions require complete, dated screening sub-scores from the enrollment year, assessed by the source term end and before the target term. Missing, invalid or out-of-period screening receives no risk label.',
        'Predictions require complete previous-term section attendance. All source-term weekdays must be accounted for, excluding marked Holiday or Suspension dates. Missing, conflicting or unverified attendance receives no risk label. Late marks are not converted into absences for the model.',
        'Scores are not calibrated probabilities. Requiring complete recorded inputs does not establish prediction accuracy on the current three-term calendar.',
      ],
      summary: { ...summary, unavailable: unavailable.length, eligible: students.length,
        totalEnglish: students.length + unavailable.length },
      students, unavailable,
      distribution: {
        ...Object.fromEntries(['low', 'medium', 'high'].map(level => {
          const count = students.filter(row => row.riskLevel === level).length;
          return [level, { count, percent: students.length ? Math.round(count / students.length * 100) : 0 }];
        })), totalFlagged: students.length,
      },
      gradeBreakdown: [...gradeMap.values()].sort((a, b) => a.grade.localeCompare(b.grade)),
    };
  }

  static async getSummary(filters) { return (await this.getPreview(filters)).summary; }
  static async getStudentsByRiskLevel(filters) {
    const data = await this.getPreview(filters);
    const students = data.students.filter(row => !filters.riskLevel || row.riskLevel === filters.riskLevel);
    return { students: filters.limit ? students.slice(0, Number(filters.limit)) : students, totalCount: students.length,
      mode: data.mode, modelVersion: data.modelVersion };
  }
  static async getBreakdownData(filters) { return this.getPreview(filters); }
}

module.exports = AtRiskPrediction;
