const db = require('../config/db');
const { loadInputs, schoolYearRange } = require('../services/EnglishRiskFeatures');
const model = require('../services/EnglishRiskModel');

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
    // An empty batch still checks the trusted model and matching runtime.
    const result = await model.predict(input.eligible.map(row => row.features));
    const students = input.eligible.map((row, index) => {
      const prediction = result.predictions[index];
      return {
        ...row.profile, riskScore: Number((prediction.score * 100).toFixed(1)),
        score: prediction.score, riskLevel: prediction.riskLevel,
        predictedAtRisk: prediction.predictedAtRisk, modelVersion: result.modelVersion,
        // Null remains null: a training substitute is not a recorded learner value.
        modelInputs: { ...row.features },
        missingInputs: Object.entries(row.features).filter(([, value]) => value == null).map(([key]) => key),
        flags: [
          { icon: 'trending-down', label: `Previous English grade: ${row.features.previous_final_grade}` },
          { icon: 'document', label: row.features.phil_iri_unavailable
            ? `${row.profile.screeningReason || 'Screening sub-scores unavailable.'} Training medians used.`
            : `Screening sub-scores recorded (${row.profile.screeningAssessmentDate}).` },
          { icon: 'calendar', label: row.features.absence_rate == null
            ? 'Attendance: source-term records are incomplete or need review.'
            : `Attendance: ${row.profile.attendanceSummary.absentDays} absent day${row.profile.attendanceSummary.absentDays === 1 ? '' : 's'} across ${row.profile.attendanceSummary.classDays} recorded class days.` },
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
        'Complete, dated screening sub-scores from the enrollment year are used when assessed before the target term. Missing, incomplete or out-of-period results use training medians and the unavailable flag.',
        'Complete previous-term section attendance supplies the recorded absence rate. Weekdays marked Holiday or Suspension are excluded; blanks, conflicting entries or unverified periods use the training median. Late marks are not converted into absences for the model.',
        'Scores are not calibrated probabilities. The current deployment and its missing-input patterns have not been validated in the study.',
      ],
      summary: { ...summary, unavailable: input.unavailable.length, eligible: students.length,
        totalEnglish: students.length + input.unavailable.length },
      students, unavailable: input.unavailable,
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
