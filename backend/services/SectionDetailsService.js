const db = require("../config/db");
const GradeComputationService = require("./GradeComputationService");

const VALID_ASSIGNMENT_TYPES = new Set(["advisory", "teaching"]);
const TERM_CODES = ["T1", "T2", "T3"];

const serviceError = (statusCode, code, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const cleanToken = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const getTermPosition = (termName) => {
  const value = cleanToken(termName);
  if (value.includes("1") || value.startsWith("FIRST") || value.startsWith("1ST")) return 1;
  if (value.includes("2") || value.startsWith("SECOND") || value.startsWith("2ND")) return 2;
  if (value.includes("3") || value.startsWith("THIRD") || value.startsWith("3RD")) return 3;
  return null;
};

const getYearPart = (value) => {
  if (!value) return null;
  const match = String(value).match(/^([0-9]{4})/);
  if (match) return Number(match[1]);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
};

const formatSchoolYear = (startsOn, endsOn) => {
  const startYear = getYearPart(startsOn);
  const endYear = getYearPart(endsOn);
  return startYear && endYear ? `${startYear}-${endYear}` : "School year unavailable";
};

const buildLearnerName = (student) => {
  const middle = student.middle_name ? ` ${student.middle_name}` : "";
  const extension = student.extension_name ? ` ${student.extension_name}` : "";
  return `${student.last_name}, ${student.first_name}${middle}${extension}`.trim();
};

const getPerformanceBand = (grade) => {
  if (!Number.isFinite(grade)) return null;
  if (grade >= 90) return "ADVANCING";
  if (grade >= 80) return "BENCHMARKING";
  if (grade >= 75) return "CONNECTING";
  if (grade >= 65) return "DEVELOPING";
  return "EMERGING";
};

const getHonorStatus = (grade, isAdvisory) => {
  if (!isAdvisory) return null;
  if (!Number.isFinite(grade)) return "UNAVAILABLE";
  if (grade >= 98) return "WITH_HIGHEST_HONORS";
  if (grade >= 95) return "WITH_HIGH_HONORS";
  if (grade >= 90) return "WITH_HONORS";
  return "NONE";
};

const createPerformanceBands = () => ({
  ADVANCING: { label: "Advancing", range: "90 - 100", count: 0 },
  BENCHMARKING: { label: "Benchmarking", range: "80 - 89", count: 0 },
  CONNECTING: { label: "Connecting", range: "75 - 79", count: 0 },
  DEVELOPING: { label: "Developing", range: "65 - 74", count: 0 },
  EMERGING: { label: "Emerging", range: "0 - 64", count: 0 },
});

const normalizeAssignmentType = (value) => String(value || "").trim().toLowerCase();
const normalizeTermCode = (value) => String(value || "").trim().toUpperCase();

class SectionDetailsService {
  static validateRequest({ assignmentType, assignmentId, userId, term }) {
    const normalizedType = normalizeAssignmentType(assignmentType);
    const numericAssignmentId = Number(assignmentId);
    const numericUserId = Number(userId);
    const termCode = normalizeTermCode(term);

    if (!VALID_ASSIGNMENT_TYPES.has(normalizedType)) {
      throw serviceError(400, "INVALID_ASSIGNMENT_TYPE", "Assignment type must be advisory or teaching.");
    }
    if (!Number.isInteger(numericAssignmentId) || numericAssignmentId <= 0) {
      throw serviceError(400, "INVALID_ASSIGNMENT_ID", "A valid assignment is required.");
    }
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw serviceError(401, "AUTHENTICATION_REQUIRED", "A signed-in user is required.");
    }
    if (!TERM_CODES.includes(termCode)) {
      throw serviceError(400, "INVALID_TERM", "Term must be T1, T2, or T3.");
    }

    return {
      assignmentType: normalizedType,
      assignmentId: numericAssignmentId,
      userId: numericUserId,
      termCode,
    };
  }

  static async resolveAssignment({ assignmentType, assignmentId, userId }, database = db) {
    const isAdvisory = assignmentType === "advisory";
    const sql = isAdvisory
      ? `SELECT
           saa.adviser_assignment_id AS assignment_id,
           saa.user_id,
           saa.section_id,
           saa.school_year_id,
           sec.section_name,
           gl.grade_level_name,
           sy.starts_on,
           sy.ends_on,
           sy.status AS school_year_status,
           NULL AS subject_offering_id,
           NULL AS subject_id,
           NULL AS subject_code,
           NULL AS subject_name
         FROM SECTION_ADVISER_ASSIGNMENT saa
         INNER JOIN SECTION sec ON sec.section_id = saa.section_id
         INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         INNER JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
         WHERE saa.adviser_assignment_id = ?
         LIMIT 1`
      : `SELECT
           ta.teacher_assignment_id AS assignment_id,
           ta.user_id,
           so.section_id,
           so.school_year_id,
           sec.section_name,
           gl.grade_level_name,
           sy.starts_on,
           sy.ends_on,
           sy.status AS school_year_status,
           so.subject_offering_id,
           so.subject_id,
           s.subject_code,
           s.subject_name
         FROM TEACHER_ASSIGNMENT ta
         INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
         INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
         INNER JOIN SECTION sec ON sec.section_id = so.section_id
         INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         INNER JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
         WHERE ta.teacher_assignment_id = ?
         LIMIT 1`;

    const [rows] = await database.execute(sql, [assignmentId]);
    if (!rows.length) {
      throw serviceError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.");
    }
    if (Number(rows[0].user_id) !== Number(userId)) {
      throw serviceError(403, "SECTION_DETAILS_FORBIDDEN", "You do not have access to this assignment.");
    }
    return rows[0];
  }

  static async getSectionDetails(request, database = db) {
    const validated = this.validateRequest(request);
    const assignment = await this.resolveAssignment(validated, database);

    const [termRows] = await database.execute(
      `SELECT term_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status
       FROM ACADEMIC_TERM
       WHERE school_year_id = ?
       ORDER BY starts_at ASC, term_id ASC`,
      [assignment.school_year_id],
    );

    const selectedPosition = Number(validated.termCode.slice(1));
    const selectedTermMatches = termRows.filter(
      (termRow) => getTermPosition(termRow.term_name) === selectedPosition,
    );
    if (!selectedTermMatches.length) {
      throw serviceError(404, "ACADEMIC_TERM_NOT_FOUND", `${validated.termCode} is not configured for this school year.`);
    }

    const [offeringRows] = validated.assignmentType === "advisory"
      ? await database.execute(
        `SELECT so.subject_offering_id, so.subject_id, s.subject_code, s.subject_name
         FROM SUBJECT_OFFERING so
         INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
         WHERE so.section_id = ? AND so.school_year_id = ?
         ORDER BY s.subject_name, so.subject_offering_id`,
        [assignment.section_id, assignment.school_year_id],
      )
      : [[{
        subject_offering_id: assignment.subject_offering_id,
        subject_id: assignment.subject_id,
        subject_code: assignment.subject_code,
        subject_name: assignment.subject_name,
      }]];

    const [studentRows] = await database.execute(
      `SELECT
         ss.student_section_id,
         st.student_id,
         st.LRN AS lrn,
         st.first_name,
         st.middle_name,
         st.last_name,
         st.extension_name
       FROM STUDENT_SECTION ss
       INNER JOIN STUDENT st ON st.student_id = ss.student_id
       WHERE ss.section_id = ?
         AND ss.school_year_id = ?
         AND (st.status = 'ACTIVE' OR st.status IS NULL)
       ORDER BY st.last_name, st.first_name, st.middle_name`,
      [assignment.section_id, assignment.school_year_id],
    );

    const [weightRows] = await database.execute(
      `SELECT scw.subject_id, scw.component_type_id, scw.percentage
       FROM SUBJECT_COMPONENT_WEIGHT scw
       WHERE scw.school_year_id = ?`,
      [assignment.school_year_id],
    );

    const selectedTermId = Number(selectedTermMatches[0].term_id);
    const gradeParameters = [assignment.section_id, assignment.school_year_id, selectedTermId];
    let offeringRestriction = "";
    if (validated.assignmentType === "teaching") {
      offeringRestriction = " AND gs.subject_offering_id = ?";
      gradeParameters.push(assignment.subject_offering_id);
    }

    const [gradeRows] = await database.execute(
      `SELECT
         gs.grade_sheet_id,
         gs.subject_offering_id,
         gs.term_id,
         so.subject_id,
         ga.activity_id,
         ga.highest_possible_score,
         ga.status AS activity_status,
         scw.component_type_id,
         sc.score_id,
         sc.student_section_id,
         sc.raw_score,
         sc.score_status
       FROM GRADE_SHEET gs
       INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
       LEFT JOIN GRADE_ACTIVITY ga ON ga.grade_sheet_id = gs.grade_sheet_id
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN SCORE sc ON sc.activity_id = ga.activity_id
       WHERE so.section_id = ?
         AND so.school_year_id = ?
         AND gs.term_id = ?
         AND (gs.workflow_status = 'SUBMITTED' OR gs.lock_status = 'TERM_LOCKED')
         AND (gs.lock_status IS NULL OR gs.lock_status <> 'TEMPORARILY_REOPENED')
         ${offeringRestriction}
       ORDER BY gs.grade_sheet_id, ga.activity_id, sc.score_id`,
      gradeParameters,
    );

    return this.buildResponse({
      assignmentType: validated.assignmentType,
      assignmentId: validated.assignmentId,
      termCode: validated.termCode,
      assignment,
      termRows,
      offeringRows,
      studentRows,
      weightRows,
      gradeRows,
    });
  }

  static buildResponse({
    assignmentType,
    assignmentId,
    termCode,
    assignment,
    termRows,
    offeringRows,
    studentRows,
    weightRows,
    gradeRows,
  }) {
    const warnings = new Set();
    const isAdvisory = assignmentType === "advisory";
    const selectedPosition = Number(termCode.slice(1));
    const availableTerms = TERM_CODES.map((code, index) => {
      const matches = termRows.filter((row) => getTermPosition(row.term_name) === index + 1);
      if (matches.length > 1) warnings.add(`${code} has duplicate academic-term records.`);
      const row = matches[0];
      return row ? {
        code,
        termId: Number(row.term_id),
        label: `Term ${index + 1}`,
        status: row.status || null,
        startsAt: row.starts_at || null,
        endsAt: row.ends_at || null,
        submissionDeadlineAt: row.grade_submission_deadline_at || null,
      } : null;
    }).filter(Boolean);
    const selectedTerm = availableTerms.find((term) => term.code === termCode) || null;

    const offeringsBySubject = new Map();
    for (const offering of offeringRows) {
      const subjectId = Number(offering.subject_id);
      if (!offeringsBySubject.has(subjectId)) offeringsBySubject.set(subjectId, []);
      offeringsBySubject.get(subjectId).push(offering);
    }
    const duplicateOfferings = [...offeringsBySubject.values()].filter((rows) => rows.length > 1);
    for (const rows of duplicateOfferings) {
      warnings.add(`${rows[0].subject_name} has duplicate subject offerings; its grades are unavailable.`);
    }
    if (!offeringRows.length) warnings.add("No subjects are offered for this section and school year.");

    const weightsBySubject = new Map();
    for (const weight of weightRows) {
      const subjectId = Number(weight.subject_id);
      if (!weightsBySubject.has(subjectId)) weightsBySubject.set(subjectId, []);
      weightsBySubject.get(subjectId).push(weight);
    }

    const sheetsByOffering = new Map();
    const sheetsById = new Map();
    for (const row of gradeRows) {
      const sheetId = Number(row.grade_sheet_id);
      if (!sheetsById.has(sheetId)) {
        const sheet = {
          gradeSheetId: sheetId,
          subjectOfferingId: Number(row.subject_offering_id),
          subjectId: Number(row.subject_id),
          activities: [],
          activityMap: new Map(),
        };
        sheetsById.set(sheetId, sheet);
        if (!sheetsByOffering.has(sheet.subjectOfferingId)) sheetsByOffering.set(sheet.subjectOfferingId, []);
        sheetsByOffering.get(sheet.subjectOfferingId).push(sheet);
      }

      if (!row.activity_id) continue;
      const sheet = sheetsById.get(sheetId);
      const activityId = Number(row.activity_id);
      if (!sheet.activityMap.has(activityId)) {
        const activity = {
          activity_id: activityId,
          component_type_id: Number(row.component_type_id),
          highest_possible_score: row.highest_possible_score,
          status: row.activity_status,
          scores: [],
        };
        sheet.activityMap.set(activityId, activity);
        sheet.activities.push(activity);
      }
      if (row.score_id) {
        sheet.activityMap.get(activityId).scores.push({
          score_id: Number(row.score_id),
          student_section_id: Number(row.student_section_id),
          raw_score: row.raw_score,
          score_status: row.score_status,
        });
      }
    }

    for (const offering of offeringRows) {
      const sheets = sheetsByOffering.get(Number(offering.subject_offering_id)) || [];
      if (sheets.length > 1) {
        warnings.add(`${offering.subject_name} has duplicate official sheets for ${termCode}; its grades are unavailable.`);
      }
    }

    const incompleteReasons = new Map();
    const recordIncomplete = (subjectName, reason) => {
      const key = `${subjectName}:${reason}`;
      incompleteReasons.set(key, {
        subjectName,
        reason,
        count: (incompleteReasons.get(key)?.count || 0) + 1,
      });
    };

    const learners = studentRows.map((student) => {
      const subjectGrades = [];
      let invalidConfiguration = false;

      for (const subjectOfferings of offeringsBySubject.values()) {
        const offering = subjectOfferings[0];
        const subjectName = offering.subject_name || offering.subject_code || "Subject";
        if (subjectOfferings.length !== 1) {
          invalidConfiguration = true;
          recordIncomplete(subjectName, "DUPLICATE_SUBJECT_OFFERINGS");
          continue;
        }

        const sheets = sheetsByOffering.get(Number(offering.subject_offering_id)) || [];
        if (sheets.length !== 1) {
          invalidConfiguration = true;
          const reason = sheets.length > 1 ? "DUPLICATE_OFFICIAL_SHEETS" : "OFFICIAL_SHEET_MISSING";
          recordIncomplete(subjectName, reason);
          continue;
        }

        const result = GradeComputationService.computeTermGrade({
          weights: weightsBySubject.get(Number(offering.subject_id)) || [],
          activities: sheets[0].activities,
          studentSectionId: Number(student.student_section_id),
        });
        if (!result.complete) {
          invalidConfiguration = true;
          recordIncomplete(subjectName, result.reason || "GRADE_INCOMPLETE");
          continue;
        }
        subjectGrades.push(result.termGrade);
      }

      let termGrade = null;
      if (!invalidConfiguration && offeringRows.length > 0 && subjectGrades.length === offeringsBySubject.size) {
        termGrade = isAdvisory
          ? Math.round(subjectGrades.reduce((sum, grade) => sum + grade, 0) / subjectGrades.length)
          : subjectGrades[0];
      }

      return {
        studentSectionId: Number(student.student_section_id),
        studentId: Number(student.student_id),
        lrn: student.lrn || "",
        name: buildLearnerName(student),
        termGrade,
        gradeState: Number.isFinite(termGrade) ? "COMPLETE" : "INCOMPLETE",
        performanceBand: getPerformanceBand(termGrade),
        honorStatus: getHonorStatus(termGrade, isAdvisory),
        riskAssessment: null,
      };
    });

    for (const { subjectName, reason, count } of incompleteReasons.values()) {
      warnings.add(`${subjectName}: ${count} learner grade${count === 1 ? " is" : "s are"} incomplete (${reason}).`);
    }

    const performanceBands = createPerformanceBands();
    for (const learner of learners) {
      if (learner.performanceBand) performanceBands[learner.performanceBand].count += 1;
    }
    const completeGradeCount = learners.filter((learner) => learner.gradeState === "COMPLETE").length;

    return {
      context: {
        assignmentType,
        assignmentId: Number(assignmentId),
        sectionId: Number(assignment.section_id),
        sectionName: assignment.section_name,
        gradeLevel: assignment.grade_level_name,
        schoolYear: {
          id: Number(assignment.school_year_id),
          label: formatSchoolYear(assignment.starts_on, assignment.ends_on),
          status: assignment.school_year_status || null,
        },
        subject: isAdvisory ? null : {
          id: Number(assignment.subject_id),
          offeringId: Number(assignment.subject_offering_id),
          code: assignment.subject_code || null,
          name: assignment.subject_name,
        },
        selectedTerm: selectedTerm || {
          code: termCode,
          termId: null,
          label: `Term ${selectedPosition}`,
          status: null,
          startsAt: null,
          endsAt: null,
          submissionDeadlineAt: null,
        },
        availableTerms,
      },
      capabilities: { atRiskAvailable: false },
      summary: {
        learnerCount: learners.length,
        completeGradeCount,
        incompleteGradeCount: learners.length - completeGradeCount,
        performanceBands,
        atRiskCount: null,
      },
      learners,
      warnings: [...warnings],
    };
  }
}

module.exports = SectionDetailsService;
module.exports.serviceError = serviceError;
module.exports.getPerformanceBand = getPerformanceBand;
module.exports.getHonorStatus = getHonorStatus;
