const db = require('../config/db');
const AtRiskPrediction = require('../models/AtRiskPrediction');
const { decryptLrn } = require('../utils/encryption');
const { SUBJECT_DEFINITIONS, resolveSubjectDefinition, getTermPosition } = require('./MasterSheetService');
const { schoolYearRange } = require('./EnglishRiskFeatures');

const VALID_ASSIGNMENT_TYPES = new Set(['advisory', 'teaching']);
const TERM_CODES = ['T1', 'T2', 'T3'];
const RISK_LEVELS = new Set(['low', 'medium', 'high']);
const SPECIALIZATION = { STE: 'research', SPJ: 'journalism', SPA: 'spa_spec' };
const serviceError = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const buildLearnerName = student => `${student.last_name}, ${student.first_name}${student.middle_name ? ` ${student.middle_name}` : ''}${student.extension_name ? ` ${student.extension_name}` : ''}`.trim();
const validGrade = value => value != null && value !== '' && Number.isFinite(Number(value))
  && Number(value) >= 60 && Number(value) <= 100;

const getPerformanceBand = grade => {
  if (!Number.isFinite(grade)) return null;
  if (grade >= 90) return 'ADVANCING';
  if (grade >= 80) return 'BENCHMARKING';
  if (grade >= 75) return 'CONNECTING';
  if (grade >= 65) return 'DEVELOPING';
  return 'EMERGING';
};

const getHonorStatus = (grade, isAdvisory, allSubjectsPassed = true) => {
  if (!isAdvisory) return null;
  if (!Number.isFinite(grade)) return 'AWAITING_GRADES';
  if (!allSubjectsPassed) return 'NONE';
  if (grade >= 98) return 'WITH_HIGHEST_HONORS';
  if (grade >= 95) return 'WITH_HIGH_HONORS';
  if (grade >= 90) return 'WITH_HONORS';
  return 'NONE';
};

const createPerformanceBands = () => ({
  ADVANCING: { label: 'Advancing', range: '90 - 100', count: 0 },
  BENCHMARKING: { label: 'Benchmarking', range: '80 - 89', count: 0 },
  CONNECTING: { label: 'Connecting', range: '75 - 79', count: 0 },
  DEVELOPING: { label: 'Developing', range: '65 - 74', count: 0 },
  EMERGING: { label: 'Emerging', range: '0 - 64', count: 0 },
});

function savedSubjectGrade(rows, isMapeh) {
  const sheets = new Map(rows.filter(row => row.grade_sheet_id).map(row => [Number(row.grade_sheet_id), row]));
  if (sheets.size > 1) return { reason: 'Duplicate grade sheets need review.', review: true };
  const sheet = [...sheets.values()][0];
  if (!sheet || sheet.lock_status === 'TEMPORARILY_REOPENED'
    || (sheet.workflow_status !== 'SUBMITTED' && sheet.lock_status !== 'TERM_LOCKED')) {
    return { reason: 'Grades are not yet submitted or term-locked.' };
  }
  const byComponent = new Map();
  for (const row of rows) {
    if (!row.student_grade_id) continue;
    const component = row.mapeh_component || 'ALL';
    if (!byComponent.has(component)) byComponent.set(component, new Map());
    byComponent.get(component).set(Number(row.student_grade_id), row);
  }
  if ([...byComponent.values()].some(grades => grades.size > 1)) {
    return { reason: 'Duplicate saved grades need review.', review: true };
  }
  const grade = component => [...(byComponent.get(component)?.values() || [])][0]?.quarterly_grade;
  if (isMapeh) {
    // MA and PEH are one learning area, not two independently weighted subjects.
    if (!validGrade(grade('MA')) || !validGrade(grade('PEH'))) {
      return { reason: 'Both Music & Arts and PE & Health grades are needed.' };
    }
    const combined = Math.round((Number(grade('MA')) + Number(grade('PEH'))) / 2);
    if (byComponent.has('ALL') && (!validGrade(grade('ALL')) || Number(grade('ALL')) !== combined)) {
      return { reason: 'The combined MAPEH grade needs review.', review: true };
    }
    return { grade: combined };
  }
  if (!validGrade(grade('ALL'))) return { reason: 'A saved term grade is missing or invalid.' };
  return { grade: Number(grade('ALL')) };
}

class SectionDetailsService {
  static validateRequest({ assignmentType, assignmentId, userId, term }) {
    const normalizedType = String(assignmentType || '').trim().toLowerCase();
    const numericAssignmentId = Number(assignmentId), numericUserId = Number(userId);
    const termCode = String(term || '').trim().toUpperCase();
    if (!VALID_ASSIGNMENT_TYPES.has(normalizedType)) throw serviceError(400, 'INVALID_ASSIGNMENT_TYPE', 'Assignment type must be advisory or teaching.');
    if (!Number.isInteger(numericAssignmentId) || numericAssignmentId <= 0) throw serviceError(400, 'INVALID_ASSIGNMENT_ID', 'A valid assignment is required.');
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) throw serviceError(401, 'AUTHENTICATION_REQUIRED', 'A signed-in user is required.');
    if (!TERM_CODES.includes(termCode)) throw serviceError(400, 'INVALID_TERM', 'Term must be T1, T2, or T3.');
    return { assignmentType: normalizedType, assignmentId: numericAssignmentId, userId: numericUserId, termCode };
  }

  static async resolveAssignment({ assignmentType, assignmentId, userId }, database = db) {
    const isAdvisory = assignmentType === 'advisory';
    const sql = isAdvisory
      ? `SELECT saa.adviser_assignment_id AS assignment_id, saa.user_id, saa.section_id,
          saa.school_year_id, sec.section_name, gl.grade_level_name, p.program_code,
          sy.starts_on, sy.ends_on, sy.status AS school_year_status,
          NULL AS subject_offering_id, NULL AS subject_id, NULL AS subject_code, NULL AS subject_name
        FROM SECTION_ADVISER_ASSIGNMENT saa
        JOIN SECTION sec ON sec.section_id = saa.section_id
        JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
        LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
        JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE (saa.adviser_assignment_id = ? OR (saa.section_id = ? AND saa.user_id = ?))
        ORDER BY (saa.adviser_assignment_id = ?) DESC LIMIT 1`
      : `SELECT ta.teacher_assignment_id AS assignment_id, ta.user_id, so.section_id,
          so.school_year_id, sec.section_name, gl.grade_level_name, p.program_code,
          sy.starts_on, sy.ends_on, sy.status AS school_year_status,
          so.subject_offering_id, so.subject_id, s.subject_code, s.subject_name
        FROM TEACHER_ASSIGNMENT ta
        JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
        JOIN SUBJECT s ON s.subject_id = so.subject_id
        JOIN SECTION sec ON sec.section_id = so.section_id
        JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
        LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
        JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
        WHERE (ta.teacher_assignment_id = ? OR (so.section_id = ? AND ta.user_id = ?))
        ORDER BY (ta.teacher_assignment_id = ?) DESC LIMIT 1`;
    const [rows] = await database.execute(sql, [assignmentId, assignmentId, userId, assignmentId]);
    if (!rows.length) throw serviceError(404, 'ASSIGNMENT_NOT_FOUND', 'The requested assignment was not found.');
    if (Number(rows[0].user_id) !== Number(userId)) throw serviceError(403, 'SECTION_DETAILS_FORBIDDEN', 'You do not have access to this assignment.');
    return rows[0];
  }

  static async getSectionDetails(request, database = db, { predictionService = AtRiskPrediction } = {}) {
    const validated = this.validateRequest(request);
    const assignment = await this.resolveAssignment(validated, database);
    const [termRows] = await database.execute(`SELECT term_id, term_name, starts_at, ends_at,
      grade_submission_deadline_at, status FROM ACADEMIC_TERM WHERE school_year_id = ?
      ORDER BY starts_at ASC, term_id ASC`, [assignment.school_year_id]);
    const matches = termRows.filter(row => getTermPosition(row.term_name) === Number(validated.termCode[1]));
    if (!matches.length) throw serviceError(404, 'ACADEMIC_TERM_NOT_FOUND', `${validated.termCode} is not configured for this school year.`);
    const [offeringRows] = validated.assignmentType === 'advisory'
      ? await database.execute(`SELECT so.subject_offering_id, so.subject_id, s.subject_code, s.subject_name
        FROM SUBJECT_OFFERING so JOIN SUBJECT s ON s.subject_id = so.subject_id
        WHERE so.section_id = ? AND so.school_year_id = ? ORDER BY s.subject_name, so.subject_offering_id`,
      [assignment.section_id, assignment.school_year_id])
      : [[{ subject_offering_id: assignment.subject_offering_id, subject_id: assignment.subject_id,
        subject_code: assignment.subject_code, subject_name: assignment.subject_name }]];
    const [studentRows] = await database.execute(`SELECT ss.student_section_id, st.student_id, st.LRN AS lrn,
      st.first_name, st.middle_name, st.last_name, st.extension_name
      FROM STUDENT_SECTION ss JOIN STUDENT st ON st.student_id = ss.student_id
      WHERE ss.section_id = ? AND ss.school_year_id = ? AND (st.status = 'ACTIVE' OR st.status IS NULL)
      ORDER BY st.last_name, st.first_name, st.middle_name`, [assignment.section_id, assignment.school_year_id]);
    const gradeParameters = [matches[0].term_id, assignment.section_id, assignment.school_year_id, validated.termCode];
    if (validated.assignmentType === 'teaching') gradeParameters.push(assignment.subject_offering_id);
    // Read the official summaries saved by the class record; never retransmute them here.
    const [gradeRows] = await database.execute(`SELECT sg.student_grade_id, sg.subject_offering_id,
      ss.student_section_id, sg.student_section_id AS saved_enrollment_id, sg.student_id,
      sg.quarterly_grade, sg.mapeh_component, gs.grade_sheet_id, gs.workflow_status, gs.lock_status
      FROM STUDENT_GRADE sg
      JOIN SUBJECT_OFFERING so ON so.subject_offering_id = sg.subject_offering_id
      JOIN STUDENT_SECTION ss ON ss.student_id = sg.student_id AND ss.section_id = so.section_id
        AND ss.school_year_id = so.school_year_id
        AND (sg.student_section_id = ss.student_section_id OR sg.student_section_id IS NULL)
      LEFT JOIN GRADE_SHEET gs ON gs.subject_offering_id = so.subject_offering_id AND gs.term_id = ?
      WHERE so.section_id = ? AND so.school_year_id = ? AND sg.term = ?
        ${validated.assignmentType === 'teaching' ? 'AND so.subject_offering_id = ?' : ''}
      ORDER BY sg.subject_offering_id, ss.student_section_id, sg.student_grade_id`, gradeParameters);
    const response = this.buildResponse({ ...validated, assignment, termRows, offeringRows, studentRows, gradeRows });
    return this.attachPredictions(response, assignment, database, predictionService);
  }

  static buildResponse({ assignmentType, assignmentId, termCode, assignment, termRows, offeringRows, studentRows, gradeRows }) {
    const warnings = new Set(), isAdvisory = assignmentType === 'advisory';
    const selectedMatches = termRows.filter(row => getTermPosition(row.term_name) === Number(termCode[1]));
    const availableTerms = TERM_CODES.flatMap((code, index) => {
      const matches = termRows.filter(row => getTermPosition(row.term_name) === index + 1);
      if (matches.length > 1) warnings.add(`${code} has duplicate academic-term records; its grades need review.`);
      const row = matches[0];
      return row ? [{ code, termId: Number(row.term_id), label: `Term ${index + 1}`, unique: matches.length === 1, status: row.status || null,
        startsAt: row.starts_at || null, endsAt: row.ends_at || null, submissionDeadlineAt: row.grade_submission_deadline_at || null }] : [];
    });
    const offeringsBySubject = new Map();
    for (const offering of offeringRows) {
      const key = resolveSubjectDefinition(offering)?.key || `subject:${offering.subject_id}`;
      if (!offeringsBySubject.has(key)) offeringsBySubject.set(key, []);
      offeringsBySubject.get(key).push(offering);
    }
    // Same core learning areas and program specialization as the existing SF9.
    const required = isAdvisory ? SUBJECT_DEFINITIONS.filter(subject =>
      !['research', 'journalism', 'spa_spec'].includes(subject.key)
      || subject.key === SPECIALIZATION[String(assignment.program_code || '').toUpperCase()]) : [];
    const missingOfferings = required.filter(subject => !offeringsBySubject.has(subject.key));
    if (missingOfferings.length) warnings.add(`Subject setup is incomplete: ${missingOfferings.map(subject => subject.label).join(', ')} not offered.`);
    if (!offeringRows.length) warnings.add('No subjects are offered for this section and school year.');
    for (const rows of offeringsBySubject.values()) {
      if (rows.length > 1) warnings.add(`${rows[0].subject_name} has duplicate subject offerings; its grades need review.`);
    }
    const gradesByEnrollment = new Map();
    for (const row of gradeRows) {
      if (row.saved_enrollment_id != null && Number(row.saved_enrollment_id) !== Number(row.student_section_id)) continue;
      const key = `${Number(row.student_section_id)}:${Number(row.subject_offering_id)}`;
      if (!gradesByEnrollment.has(key)) gradesByEnrollment.set(key, []);
      gradesByEnrollment.get(key).push(row);
    }
    const incompleteCounts = new Map();
    const learners = studentRows.map(student => {
      const subjectGrades = [], missingSubjects = missingOfferings.map(subject => ({ subject: subject.label, reason: 'Subject is not offered.', review: true }));
      for (const [key, offerings] of offeringsBySubject) {
        const offering = offerings[0], subject = offering.subject_name || offering.subject_code || 'Subject';
        let result;
        if (selectedMatches.length !== 1) result = { reason: 'The selected term needs review.', review: true };
        else if (offerings.length !== 1) result = { reason: 'Duplicate subject offerings need review.', review: true };
        else result = savedSubjectGrade(gradesByEnrollment.get(`${Number(student.student_section_id)}:${Number(offering.subject_offering_id)}`) || [], key === 'mapeh');
        if (result.reason) {
          missingSubjects.push({ subject, reason: result.reason, review: Boolean(result.review) });
          const notice = `${subject}: ${result.reason}`;
          incompleteCounts.set(notice, (incompleteCounts.get(notice) || 0) + 1);
        } else subjectGrades.push(result.grade);
      }
      const complete = !missingSubjects.length && offeringRows.length > 0 && subjectGrades.length === offeringsBySubject.size;
      const termGrade = complete ? (isAdvisory ? Math.round(subjectGrades.reduce((sum, grade) => sum + grade, 0) / subjectGrades.length) : subjectGrades[0]) : null;
      return {
        studentSectionId: Number(student.student_section_id), studentId: Number(student.student_id),
        lrn: decryptLrn(student.lrn), name: buildLearnerName(student), termGrade,
        gradeState: complete ? 'COMPLETE' : 'INCOMPLETE', performanceBand: getPerformanceBand(termGrade),
        gradeSummary: { completeSubjects: subjectGrades.length, requiredSubjects: offeringsBySubject.size + missingOfferings.length, missingSubjects },
        honorStatus: isAdvisory && missingSubjects.some(subject => subject.review) ? 'NEEDS_REVIEW'
          : getHonorStatus(termGrade, isAdvisory, subjectGrades.every(grade => grade >= 75)),
        riskAssessment: null,
      };
    });
    for (const [notice, count] of incompleteCounts) warnings.add(`${notice} (${count} learner${count === 1 ? '' : 's'}).`);
    const performanceBands = createPerformanceBands();
    for (const learner of learners) if (learner.performanceBand) performanceBands[learner.performanceBand].count++;
    const completeGradeCount = learners.filter(learner => learner.gradeState === 'COMPLETE').length;
    return {
      context: { assignmentType, assignmentId: Number(assignmentId), sectionId: Number(assignment.section_id),
        sectionName: assignment.section_name, gradeLevel: assignment.grade_level_name,
        schoolYear: { id: Number(assignment.school_year_id), label: schoolYearRange(assignment) || 'School year unavailable', status: assignment.school_year_status || null },
        subject: isAdvisory ? null : { id: Number(assignment.subject_id), offeringId: Number(assignment.subject_offering_id), code: assignment.subject_code || null, name: assignment.subject_name },
        selectedTerm: availableTerms.find(term => term.code === termCode), availableTerms },
      capabilities: { atRiskApplicable: !isAdvisory && resolveSubjectDefinition(assignment)?.key === 'english', atRiskAvailable: false },
      summary: { learnerCount: learners.length, completeGradeCount, incompleteGradeCount: learners.length - completeGradeCount,
        performanceBands, atRiskCount: null }, learners, warnings: [...warnings],
    };
  }

  static async attachPredictions(response, assignment, database, predictionService) {
    const sourceTerm = response.context.selectedTerm.code;
    const targetTerm = sourceTerm === 'T3' ? null : `T${Number(sourceTerm[1]) + 1}`;
    const context = { subject: 'English', sourceTerm, targetTerm, status: 'unavailable', message: '' };
    response.riskContext = context;
    const setAll = (status, label, reason) => {
      context.status = status; context.message = reason;
      for (const learner of response.learners) learner.riskAssessment = { status, label, reason, targetTerm };
      return response;
    };
    if (!response.capabilities.atRiskApplicable) {
      return setAll('not_applicable', 'English only', 'English predictions are available in the assigned English teaching class, not the all-subject advisory standing.');
    }
    if (!targetTerm) return setAll('not_applicable', 'No next term', 'Term 3 has no following term in this school year.');
    if (!response.context.selectedTerm.unique || !response.context.availableTerms.some(term => term.code === targetTerm && term.unique)) {
      return setAll('needs_review', 'Needs review', 'The source or next term is missing or duplicated. The school-year calendar needs review.');
    }
    if (!response.learners.length) {
      context.status = 'available'; response.capabilities.atRiskAvailable = true;
      response.summary.atRiskCount = 0;
      response.summary.riskCounts = { low: 0, medium: 0, high: 0, awaiting: 0 };
      return response;
    }
    try {
      const preview = await predictionService.getPreview({ schoolYear: response.context.schoolYear.label, term: targetTerm }, {
        database, scope: { schoolYearId: Number(assignment.school_year_id), sectionId: Number(assignment.section_id),
          subjectOfferingId: Number(assignment.subject_offering_id) },
      });
      if (preview.sourceTerm !== sourceTerm || preview.targetTerm !== targetTerm) throw new Error('Prediction period mismatch.');
      const predictions = new Map(), unavailable = new Map();
      const belongsToAssignment = row => Number(row.sectionId) === Number(assignment.section_id)
        && Number(row.schoolYearId) === Number(assignment.school_year_id);
      for (const row of preview.students.filter(belongsToAssignment)) {
        const key = Number(row.studentSectionId);
        if (!predictions.has(key)) predictions.set(key, []);
        predictions.get(key).push(row);
      }
      for (const row of preview.unavailable.filter(belongsToAssignment)) unavailable.set(Number(row.studentSectionId), row);
      const counts = { low: 0, medium: 0, high: 0, awaiting: 0 };
      for (const learner of response.learners) {
        const rows = predictions.get(learner.studentSectionId) || [];
        const row = rows[0];
        if (rows.length === 1 && !unavailable.has(learner.studentSectionId) && RISK_LEVELS.has(row.riskLevel)) {
          counts[row.riskLevel]++;
          // Adviser status intentionally excludes numerical model outputs and developer inputs.
          learner.riskAssessment = { status: 'available', riskLevel: row.riskLevel,
            label: `${row.riskLevel[0].toUpperCase()}${row.riskLevel.slice(1)} Risk`, targetTerm };
        } else {
          counts.awaiting++;
          const review = rows.length > 1 || (row && (!RISK_LEVELS.has(row.riskLevel) || unavailable.has(learner.studentSectionId)));
          const withheld = unavailable.get(learner.studentSectionId);
          const insufficient = !review && withheld?.status === 'insufficient_data';
          learner.riskAssessment = { status: review ? 'needs_review' : insufficient ? 'insufficient_data' : 'awaiting_records',
            label: review ? 'Needs review' : insufficient ? 'Insufficient data' : 'Awaiting records', targetTerm,
            reason: review ? 'Conflicting predictions need review.' : withheld?.reason || 'Complete previous-term English records are needed.',
            ...(insufficient ? { missingSources: withheld.missingSources } : {}) };
        }
      }
      context.status = 'available';
      context.message = `English risk for Term ${targetTerm[1]} requires complete Term ${sourceTerm[1]} English records, attendance and valid PHIL-IRI screening. Labels are preliminary, not official grades.`;
      response.capabilities.atRiskAvailable = true;
      response.summary.riskCounts = counts;
      response.summary.atRiskCount = counts.medium + counts.high;
      return response;
    } catch {
      return setAll('unavailable', 'Unavailable', 'English predictions could not be loaded. Grade and honor information remains available. Retry to load predictions.');
    }
  }
}

module.exports = SectionDetailsService;
module.exports.serviceError = serviceError;
module.exports.getPerformanceBand = getPerformanceBand;
module.exports.getHonorStatus = getHonorStatus;
