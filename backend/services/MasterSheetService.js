const db = require("../config/db");
const GradeComputationService = require("./GradeComputationService");

const SUBJECT_DEFINITIONS = [
  { key: "filipino", code: "FIL", label: "Filipino", aliases: ["FIL", "FILIPINO"] },
  { key: "english", code: "ENG", label: "English", aliases: ["ENG", "ENGLISH"] },
  { key: "mathematics", code: "MATH", label: "Mathematics", aliases: ["MATH", "MATHEMATICS"] },
  { key: "science", code: "SCI", label: "Science", aliases: ["SCI", "SCIENCE"] },
  { key: "ap", code: "AP", label: "AP", aliases: ["AP", "ARALINGPANLIPUNAN"] },
  { key: "tle", code: "TLE", label: "TLE", aliases: ["TLE", "TECHNOLOGYANDLIVELIHOODEDUCATION"] },
  { key: "mapeh", code: "MAPEH", label: "MAPEH", aliases: ["MAPEH"] },
  { key: "esp", code: "ESP", label: "ESP", aliases: ["ESP", "VE", "EDUKASYONSAPAGPAPAKATAO", "VALUESEDUCATION"] },
];

const serviceError = (statusCode, code, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const cleanToken = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const resolveSubjectDefinition = (subject) => {
  const tokens = [cleanToken(subject.subject_code), cleanToken(subject.subject_name)];
  return SUBJECT_DEFINITIONS.find((definition) =>
    definition.aliases.some((alias) => tokens.includes(alias)),
  ) || null;
};

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

const formatPersonName = (person) => {
  const parts = [person.first_name];
  if (person.middle_name) parts.push(person.middle_name);
  parts.push(person.last_name);
  if (person.extension_name) parts.push(person.extension_name);
  return parts.filter(Boolean).join(" ");
};

const normalizeSex = (sex) => {
  const value = String(sex || "").trim().toUpperCase();
  if (value === "M" || value === "MALE") return "M";
  if (value === "F" || value === "FEMALE") return "F";
  return "UNSPECIFIED";
};

const buildLearnerName = (student) => {
  const middleInitial = student.middle_name ? ` ${student.middle_name.charAt(0)}.` : "";
  const extension = student.extension_name ? ` ${student.extension_name}` : "";
  return `${student.last_name}, ${student.first_name}${middleInitial}${extension}`.trim();
};

class MasterSheetService {
  static async getOptions(userId) {
    const numericUserId = Number(userId);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw serviceError(400, "INVALID_USER_ID", "A valid user is required.");
    }

    const [rows] = await db.execute(
      `SELECT
         saa.adviser_assignment_id,
         saa.section_id,
         saa.school_year_id,
         saa.assigned_from,
         saa.assigned_until,
         sec.section_name,
         gl.grade_level_name,
         sy.starts_on,
         sy.ends_on,
         sy.status AS school_year_status
       FROM SECTION_ADVISER_ASSIGNMENT saa
       INNER JOIN SECTION sec ON sec.section_id = saa.section_id
       INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
       INNER JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
       WHERE saa.user_id = ?
       ORDER BY
         CASE WHEN LOWER(sy.status) = 'ongoing' THEN 0 ELSE 1 END,
         sy.starts_on DESC,
         sec.section_name ASC`,
      [numericUserId],
    );

    return rows.map((row) => ({
      adviserAssignmentId: Number(row.adviser_assignment_id),
      sectionId: Number(row.section_id),
      schoolYearId: Number(row.school_year_id),
      schoolYearLabel: formatSchoolYear(row.starts_on, row.ends_on),
      schoolYearStatus: row.school_year_status,
      gradeLevel: row.grade_level_name,
      sectionName: row.section_name,
      assignedFrom: row.assigned_from,
      assignedUntil: row.assigned_until,
      isCurrent: String(row.school_year_status || "").toLowerCase() === "ongoing",
    }));
  }

  static async getMasterSheet(adviserAssignmentId, userId) {
    const assignmentId = Number(adviserAssignmentId);
    const numericUserId = Number(userId);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      throw serviceError(400, "INVALID_ASSIGNMENT_ID", "A valid adviser assignment is required.");
    }
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw serviceError(400, "INVALID_USER_ID", "A valid user is required.");
    }

    const [assignmentRows] = await db.execute(
      `SELECT
         saa.adviser_assignment_id,
         saa.section_id,
         saa.school_year_id,
         saa.user_id,
         saa.assigned_from,
         saa.assigned_until,
         sec.section_name,
         gl.grade_level_name,
         sy.starts_on,
         sy.ends_on,
         sy.curriculum,
         sy.status AS school_year_status,
         sch.school_name,
         sch.school_code,
         sch.region,
         sch.division,
         u.first_name,
         u.middle_name,
         u.last_name,
         u.extension_name
       FROM SECTION_ADVISER_ASSIGNMENT saa
       INNER JOIN SECTION sec ON sec.section_id = saa.section_id
       INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
       INNER JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
       INNER JOIN SCHOOL sch ON sch.school_id = sy.school_id
       INNER JOIN USER u ON u.user_id = saa.user_id
       WHERE saa.adviser_assignment_id = ?
         AND saa.user_id = ?
       LIMIT 1`,
      [assignmentId, numericUserId],
    );

    if (!assignmentRows.length) {
      throw serviceError(
        403,
        "MASTER_SHEET_FORBIDDEN",
        "You do not have access to this section's Master Sheet.",
      );
    }

    const assignment = assignmentRows[0];
    const [termRows] = await db.execute(
      `SELECT term_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status
       FROM ACADEMIC_TERM
       WHERE school_year_id = ?
       ORDER BY starts_at ASC, term_id ASC`,
      [assignment.school_year_id],
    );

    const [offeringRows] = await db.execute(
      `SELECT
         so.subject_offering_id,
         so.subject_id,
         s.subject_code,
         s.subject_name
       FROM SUBJECT_OFFERING so
       INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
       WHERE so.section_id = ?
         AND so.school_year_id = ?
         AND (s.status = 'ACTIVE' OR s.status IS NULL)
       ORDER BY s.subject_name ASC`,
      [assignment.section_id, assignment.school_year_id],
    );

    const [studentRows] = await db.execute(
      `SELECT
         ss.student_section_id,
         st.student_id,
         st.LRN AS lrn,
         st.first_name,
         st.middle_name,
         st.last_name,
         st.extension_name,
         st.sex
       FROM STUDENT_SECTION ss
       INNER JOIN STUDENT st ON st.student_id = ss.student_id
       WHERE ss.section_id = ?
         AND ss.school_year_id = ?
         AND (st.status = 'ACTIVE' OR st.status IS NULL)
       ORDER BY
         CASE WHEN UPPER(st.sex) IN ('M', 'MALE') THEN 0
              WHEN UPPER(st.sex) IN ('F', 'FEMALE') THEN 1
              ELSE 2 END,
         st.last_name,
         st.first_name,
         st.middle_name`,
      [assignment.section_id, assignment.school_year_id],
    );

    const [weightRows] = await db.execute(
      `SELECT
         scw.subj_comp_weight_id,
         scw.subject_id,
         scw.component_type_id,
         scw.percentage,
         ct.component_code,
         ct.component_name
       FROM SUBJECT_COMPONENT_WEIGHT scw
       INNER JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE scw.school_year_id = ?`,
      [assignment.school_year_id],
    );

    const [gradeRows] = await db.execute(
      `SELECT
         gs.grade_sheet_id,
         gs.subject_offering_id,
         gs.term_id,
         gs.workflow_status,
         gs.lock_status,
         so.subject_id,
         ga.activity_id,
         ga.subj_comp_weight_id,
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
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw
         ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN SCORE sc ON sc.activity_id = ga.activity_id
       WHERE so.section_id = ?
         AND so.school_year_id = ?
         AND (gs.workflow_status = 'SUBMITTED' OR gs.lock_status = 'TERM_LOCKED')
         AND gs.lock_status <> 'TEMPORARILY_REOPENED'
       ORDER BY gs.grade_sheet_id, ga.activity_id, sc.score_id`,
      [assignment.section_id, assignment.school_year_id],
    );

    return this.buildResponse({
      assignment,
      termRows,
      offeringRows,
      studentRows,
      weightRows,
      gradeRows,
    });
  }

  static buildResponse({ assignment, termRows, offeringRows, studentRows, weightRows, gradeRows }) {
    const warnings = new Set();
    const terms = [1, 2, 3].map((position) => {
      const matches = termRows.filter((term) => getTermPosition(term.term_name) === position);
      if (matches.length > 1) warnings.add(`Term ${position} has duplicate academic-period records.`);
      const term = matches[0];
      return {
        position,
        termId: term ? Number(term.term_id) : null,
        label: `Term ${position}`,
        status: term?.status || null,
        startsAt: term?.starts_at || null,
        endsAt: term?.ends_at || null,
        submissionDeadlineAt: term?.grade_submission_deadline_at || null,
      };
    });

    const offeringsBySubjectKey = new Map(SUBJECT_DEFINITIONS.map((subject) => [subject.key, []]));
    for (const offering of offeringRows) {
      const definition = resolveSubjectDefinition(offering);
      if (definition) offeringsBySubjectKey.get(definition.key).push(offering);
    }

    const weightsBySubjectId = new Map();
    for (const weight of weightRows) {
      const subjectId = Number(weight.subject_id);
      if (!weightsBySubjectId.has(subjectId)) weightsBySubjectId.set(subjectId, []);
      weightsBySubjectId.get(subjectId).push(weight);
    }

    const sheetsByOfferingAndTerm = new Map();
    const sheetMap = new Map();
    for (const row of gradeRows) {
      const sheetId = Number(row.grade_sheet_id);
      if (!sheetMap.has(sheetId)) {
        const sheet = {
          gradeSheetId: sheetId,
          subjectOfferingId: Number(row.subject_offering_id),
          subjectId: Number(row.subject_id),
          termId: Number(row.term_id),
          activities: [],
          activityMap: new Map(),
        };
        sheetMap.set(sheetId, sheet);
        const key = `${sheet.subjectOfferingId}:${sheet.termId}`;
        if (!sheetsByOfferingAndTerm.has(key)) sheetsByOfferingAndTerm.set(key, []);
        sheetsByOfferingAndTerm.get(key).push(sheet);
      }

      if (!row.activity_id) continue;
      const sheet = sheetMap.get(sheetId);
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

    const subjects = SUBJECT_DEFINITIONS.map((definition) => {
      const offerings = offeringsBySubjectKey.get(definition.key) || [];
      if (offerings.length === 0) warnings.add(`${definition.label} is not offered for this section.`);
      if (offerings.length > 1) warnings.add(`${definition.label} has duplicate subject offerings.`);
      return {
        key: definition.key,
        code: definition.code,
        label: definition.label,
        available: offerings.length === 1,
        subjectOfferingId: offerings.length === 1 ? Number(offerings[0].subject_offering_id) : null,
      };
    });

    let completedTermGrades = 0;
    let completedSubjectFinals = 0;
    const students = studentRows.map((student) => {
      const subjectGrades = {};
      for (const definition of SUBJECT_DEFINITIONS) {
        const offerings = offeringsBySubjectKey.get(definition.key) || [];
        const offering = offerings.length === 1 ? offerings[0] : null;
        const termGrades = terms.map((term) => {
          if (!offering || !term.termId) return null;
          const sheetKey = `${offering.subject_offering_id}:${term.termId}`;
          const sheets = sheetsByOfferingAndTerm.get(sheetKey) || [];
          if (sheets.length !== 1) {
            if (sheets.length > 1) warnings.add(`${definition.label} ${term.label} has duplicate official grade sheets.`);
            return null;
          }

          const weights = weightsBySubjectId.get(Number(offering.subject_id)) || [];
          const result = GradeComputationService.computeTermGrade({
            weights,
            activities: sheets[0].activities,
            studentSectionId: student.student_section_id,
          });
          if (!result.complete) return null;
          completedTermGrades += 1;
          return result.termGrade;
        });

        const finalGrade = termGrades.every((grade) => Number.isFinite(grade))
          ? Math.round(termGrades.reduce((sum, grade) => sum + grade, 0) / 3)
          : null;
        if (finalGrade !== null) completedSubjectFinals += 1;
        subjectGrades[definition.key] = { terms: termGrades, finalGrade };
      }

      const finalGrades = SUBJECT_DEFINITIONS.map(
        (definition) => subjectGrades[definition.key].finalGrade,
      );
      const generalAverage = finalGrades.every((grade) => Number.isFinite(grade))
        ? Math.round(finalGrades.reduce((sum, grade) => sum + grade, 0) / SUBJECT_DEFINITIONS.length)
        : null;

      return {
        studentSectionId: Number(student.student_section_id),
        studentId: Number(student.student_id),
        lrn: String(student.lrn || ""),
        firstName: student.first_name,
        middleName: student.middle_name,
        lastName: student.last_name,
        extensionName: student.extension_name,
        displayName: buildLearnerName(student),
        sex: normalizeSex(student.sex),
        grades: subjectGrades,
        generalAverage,
      };
    });

    if (students.some((student) => student.sex === "UNSPECIFIED")) {
      warnings.add("Some learners have no recognized sex value and appear after the female group.");
    }

    return {
      assignment: {
        adviserAssignmentId: Number(assignment.adviser_assignment_id),
        sectionId: Number(assignment.section_id),
        schoolYearId: Number(assignment.school_year_id),
      },
      school: {
        name: assignment.school_name,
        code: assignment.school_code,
        region: assignment.region,
        division: assignment.division,
      },
      schoolYear: {
        id: Number(assignment.school_year_id),
        label: formatSchoolYear(assignment.starts_on, assignment.ends_on),
        startsOn: assignment.starts_on,
        endsOn: assignment.ends_on,
        status: assignment.school_year_status,
        curriculum: assignment.curriculum,
      },
      section: {
        id: Number(assignment.section_id),
        gradeLevel: assignment.grade_level_name,
        name: assignment.section_name,
      },
      adviser: {
        userId: Number(assignment.user_id),
        name: formatPersonName(assignment),
      },
      terms,
      subjects,
      students,
      completeness: {
        studentCount: students.length,
        completedTermGrades,
        expectedTermGrades: students.length * SUBJECT_DEFINITIONS.length * 3,
        completedSubjectFinals,
        expectedSubjectFinals: students.length * SUBJECT_DEFINITIONS.length,
        completedGeneralAverages: students.filter((student) => student.generalAverage !== null).length,
      },
      warnings: [...warnings],
    };
  }
}

module.exports = MasterSheetService;
module.exports.SUBJECT_DEFINITIONS = SUBJECT_DEFINITIONS;
module.exports.resolveSubjectDefinition = resolveSubjectDefinition;
module.exports.getTermPosition = getTermPosition;
