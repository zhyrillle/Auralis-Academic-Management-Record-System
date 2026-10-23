const { calculateStudentGrades, weightsFromRows, resolveComponentWeights } = require('../utils/depedTransmutation');
const problem = (code, message) => Object.assign(new Error(message), { statusCode: 409, code });
const present = value => value !== null && value !== undefined && value !== '';
const isMapehSubject = offering => /MAPEH|MUSIC|ARTS|PHYSICAL EDUCATION|PE\s*&|HEALTH/i.test(`${offering.subject_code} ${offering.subject_name}`);
const termCode = name => {
  const token = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const n = [1, 2, 3].find(value => token.includes(String(value)) || token.startsWith(['', 'FIRST', 'SECOND', 'THIRD'][value]));
  return n ? `T${n}` : null;
};
function calculate({ offering, students, weights, activities, scores, config, componentOnly = null }) {
  const mapeh = isMapehSubject(offering);
  const resolved = weightsFromRows(weights);
  if (resolveComponentWeights(resolved, mapeh).error) throw problem('INVALID_WEIGHTS', 'Review the saved subject weights before submitting.');
  if (!students.length) throw problem('EMPTY_ROSTER', 'There are no enrolled learners to submit.');
  if (students.some(s => !Number.isSafeInteger(Number(s.student_id)) || Number(s.student_id) <= 0
    || !Number.isSafeInteger(Number(s.student_section_id)) || Number(s.student_section_id) <= 0)
    || new Set(students.map(s => Number(s.student_id))).size !== students.length
    || new Set(students.map(s => Number(s.student_section_id))).size !== students.length) {
    throw problem('INVALID_ROSTER', 'Duplicate or invalid enrollment identifiers need review before submitting.');
  }
  const active = activities.filter(a => !a.status || a.status === 'ACTIVE');
  if (active.some(a => mapeh ? !['MA', 'PEH'].includes(a.mapeh_component) : Boolean(a.mapeh_component))) {
    throw problem('INVALID_ACTIVITY_COMPONENT', 'An assessment is linked to an unexpected MAPEH component.');
  }
  const components = mapeh ? (componentOnly ? [componentOnly] : ['MA', 'PEH']) : [null];
  const grades = [];
  for (const student of students) {
    const results = [];
    for (const component of components) {
      const assessments = active.filter(a => (a.mapeh_component || null) === component);
      const codes = new Set(assessments.map(a => ['QA', 'STE', 'EX'].includes(a.component_code) ? 'EX' : a.component_code));
      if (!['WW', 'PT', 'EX'].every(code => codes.has(code))) throw problem('INCOMPLETE_ACTIVITIES', 'Complete the written work, performance task, and examination setup first.');
      const values = {};
      for (const activity of assessments) {
        if (!['WW', 'PT', 'EX', 'QA', 'STE'].includes(activity.component_code)) throw problem('INVALID_ACTIVITY_WEIGHT', 'An assessment has no recognized component configuration.');
        const hps = Number(activity.highest_possible_score);
        if (!present(activity.highest_possible_score) || !Number.isFinite(hps) || hps <= 0) throw problem('INVALID_HPS', 'An assessment has an invalid highest possible score.');
        const matches = scores.filter(s => Number(s.activity_id) === Number(activity.activity_id)
          && Number(s.student_section_id) === Number(student.student_section_id));
        const score = matches[0];
        if (matches.length !== 1 || !score || score.score_status === 'NOT_ENCODED') throw problem('INCOMPLETE_GRADES', 'Some assessment scores are missing or duplicated. Save and complete the class record before submitting.');
        if (score.score_status === 'EXCUSED') throw problem('EXCUSED_SCORE_REVIEW', 'An excused assessment needs a grading-policy review before this sheet can be submitted.');
        if (score.score_status && !['ENCODED', 'MISSING'].includes(score.score_status)) throw problem('INVALID_SCORE_STATUS', 'A saved score has an unrecognized status.');
        const raw = score.score_status === 'MISSING' ? 0 : score.raw_score;
        if (!present(raw) || !Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > hps) throw problem('INVALID_SCORE', 'A saved score is blank, invalid, or above its highest possible score.');
        values[activity.activity_id] = Number(raw);
      }
      const result = calculateStudentGrades({ assessments: assessments.map(a => ({
        assessment_id: a.activity_id, activity_name: a.activity_name, component_code: a.component_code,
        max_score: Number(a.highest_possible_score),
      })), scores: values, weights: resolved, isMapeh: mapeh, transmutationConfig: config });
      if (result.calculationError || !Number.isFinite(result.initialGrade) || result.initialGrade < 0 || result.initialGrade > 100
        || !Number.isFinite(result.termGrade) || result.termGrade < 0 || result.termGrade > 100) throw problem('INVALID_GRADE', 'The saved assessments do not produce a valid grade. Review their configuration.');
      const grade = { studentId: Number(student.student_id), studentSectionId: Number(student.student_section_id),
        mapehComponent: component, initialGrade: result.initialGrade, termGrade: result.termGrade };
      grades.push(grade); results.push(grade);
    }
    if (mapeh && !componentOnly) grades.push({ studentId: Number(student.student_id), studentSectionId: Number(student.student_section_id), mapehComponent: null,
      initialGrade: Number(((results[0].initialGrade + results[1].initialGrade) / 2).toFixed(2)),
      termGrade: Math.round((results[0].termGrade + results[1].termGrade) / 2) });
  }
  return grades;
}

// Existing single-learner API now delegates to the same configurable engine.
function computeTermGrade({ weights = [], activities = [], studentSectionId, config = null, isMapeh = false }) {
  if (!studentSectionId) return { complete: false, initialGrade: null, termGrade: null, reason: 'STUDENT_SECTION_MISSING' };
  const codes = new Map(weights.map(w => [Number(w.component_type_id), w.component_code]));
  try {
    const [result] = calculate({
      offering: { subject_code: isMapeh ? 'MAPEH' : 'SUBJECT' },
      students: [{ student_id: 1, student_section_id: studentSectionId }],
      weights: weights.map(w => ({ ...w, component_code: codes.get(Number(w.component_type_id)) })),
      activities: activities.map(a => ({ ...a, component_code: a.component_code || codes.get(Number(a.component_type_id)),
        mapeh_component: isMapeh ? (a.mapeh_component || 'MA') : null })),
      scores: activities.flatMap(a => (a.scores || []).map(s => ({ ...s, activity_id: a.activity_id }))),
      config, componentOnly: isMapeh ? 'MA' : null,
    });
    return { ...result, complete: true, reason: null };
  } catch (error) {
    if (!error.statusCode) throw error;
    return { complete: false, initialGrade: null, termGrade: null, reason: error.code };
  }
}
module.exports = { calculateGrades: calculate, computeTermGrade, termCode, problem, isMapehSubject,
  transmuteInitialGrade: (value, config = null) => require('../utils/depedTransmutation').getTransmutedGrade(value, null, config) };
