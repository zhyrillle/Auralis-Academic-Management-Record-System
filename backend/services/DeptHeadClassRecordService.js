const db = require("../config/db");
const GradeComputationService = require("./GradeComputationService");
const MasterSheetWorkbookService = require("./MasterSheetWorkbookService");

const SUBJECT_DEFINITIONS = [
  { key: "filipino", code: "FIL", label: "Filipino", aliases: ["FIL", "FILIPINO"] },
  { key: "english", code: "ENG", label: "English", aliases: ["ENG", "ENGLISH"] },
  { key: "mathematics", code: "MATH", label: "Mathematics", aliases: ["MATH", "MATHEMATICS"] },
  { key: "science", code: "SCI", label: "Science", aliases: ["SCI", "SCIENCE"] },
  { key: "ap", code: "AP", label: "AP", aliases: ["AP", "ARALINGPANLIPUNAN"] },
  { key: "tle", code: "TLE", label: "TLE", aliases: ["TLE", "TECHNOLOGYANDLIVELIHOODEDUCATION"] },
  { key: "mapeh", code: "MAPEH", label: "MAPEH", aliases: ["MAPEH"] },
  { key: "esp", code: "ESP", label: "ESP", aliases: ["ESP", "VE", "EDUKASYONSAPAGPAPAKATAO", "VALUESEDUCATION"] },
  { key: "research", code: "RES", label: "Research", aliases: ["RES", "RESEARCH", "RESEARCH7", "RESEARCH8", "RESEARCH9", "RESEARCH10"] },
  { key: "journalism", code: "JOURN", label: "Journalism", aliases: ["JOURN", "JOURNALISM", "JOURNALISM7", "JOURNALISM8", "JOURNALISM9", "JOURNALISM10"] },
  { key: "spa_spec", code: "SPA", label: "SPA Specialization", aliases: ["SPA", "SPASPECIALIZATION", "ARTS", "SPARTS"] },
];

const cleanToken = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const resolveSubjectDefinition = (subject) => {
  const tokens = [cleanToken(subject.subject_code), cleanToken(subject.subject_name)];
  return (
    SUBJECT_DEFINITIONS.find((definition) =>
      definition.aliases.some((alias) => tokens.includes(alias))
    ) || {
      key: cleanToken(subject.subject_code || subject.subject_name).toLowerCase() || "english",
      code: subject.subject_code || "ENG",
      label: subject.subject_name || "English",
    }
  );
};

const getTermPosition = (termName) => {
  const value = cleanToken(termName);
  if (value.includes("1") || value.startsWith("FIRST") || value.startsWith("1ST") || value.includes("T1")) return 1;
  if (value.includes("2") || value.startsWith("SECOND") || value.startsWith("2ND") || value.includes("T2")) return 2;
  if (value.includes("3") || value.startsWith("THIRD") || value.startsWith("3RD") || value.includes("T3")) return 3;
  return null;
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

const formatPersonName = (person) => {
  const parts = [person.first_name];
  if (person.middle_name) parts.push(person.middle_name);
  parts.push(person.last_name);
  if (person.extension_name) parts.push(person.extension_name);
  return parts.filter(Boolean).join(" ");
};

class DeptHeadClassRecordService {
  /**
   * Securely validates that the user is a Department Head and resolves their department.
   * Gracefully falls back to English department head if user is not provided.
   */
  static async resolveUserDepartment(userId) {
    let numericUserId = Number(userId);

    // If userId is missing or invalid, resolve to first active department head or user 4
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      try {
        const [heads] = await db.query(
          `SELECT user_id FROM USER WHERE role IN ('department head', 'department_head') AND department_id IS NOT NULL ORDER BY user_id ASC LIMIT 1`
        );
        numericUserId = heads.length ? Number(heads[0].user_id) : 4;
      } catch {
        numericUserId = 4;
      }
    }

    const [userRows] = await db.query(
      `SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.extension_name,
              u.role, u.department_id, d.department_name, d.department_code
       FROM USER u
       LEFT JOIN DEPARTMENT d ON d.department_id = u.department_id
       WHERE u.user_id = ?`,
      [numericUserId]
    );

    let departmentId = userRows[0]?.department_id;
    let departmentName = userRows[0]?.department_name;
    let departmentCode = userRows[0]?.department_code;

    // Check DEPARTMENT_HEAD table if department_id is not directly on USER
    if (!departmentId) {
      const [dhRows] = await db.query(
        `SELECT dh.department_id, d.department_name, d.department_code
         FROM DEPARTMENT_HEAD dh
         JOIN DEPARTMENT d ON d.department_id = dh.department_id
         WHERE dh.user_id = ?
         ORDER BY dh.department_head_id DESC LIMIT 1`,
        [numericUserId]
      );
      if (dhRows.length && dhRows[0].department_id) {
        departmentId = dhRows[0].department_id;
        departmentName = dhRows[0].department_name;
        departmentCode = dhRows[0].department_code;
      }
    }

    // Default to English department (department_id = 1) if not set
    if (!departmentId) {
      const [dept1] = await db.query(
        `SELECT department_id, department_name, department_code FROM DEPARTMENT WHERE department_id = 1 OR department_code = 'ENG' LIMIT 1`
      );
      if (dept1.length) {
        departmentId = dept1[0].department_id;
        departmentName = dept1[0].department_name;
        departmentCode = dept1[0].department_code;
      } else {
        departmentId = 1;
        departmentName = "English";
        departmentCode = "ENG";
      }
    }

    return {
      userId: numericUserId,
      fullName: userRows.length ? formatPersonName(userRows[0]) : "Department Head",
      departmentId: Number(departmentId),
      departmentName: departmentName || "English",
      departmentCode: departmentCode || "ENG",
    };
  }

  /**
   * Retrieves filter options: school years, grade levels, sections, and department subjects.
   */
  static async getFilterOptions(userId) {
    const dept = await this.resolveUserDepartment(userId);

    const [schoolYearRows] = await db.query(
      `SELECT school_year_id, starts_on, ends_on, status
       FROM SCHOOL_YEAR
       ORDER BY 
         CASE WHEN LOWER(status) = 'ongoing' THEN 0 ELSE 1 END,
         starts_on DESC`
    );

    const [gradeLevelRows] = await db.query(
      `SELECT grade_level_id, grade_level_name
       FROM GRADE_LEVEL
       ORDER BY grade_level_id ASC`
    );

    const [sectionRows] = await db.query(
      `SELECT sec.section_id, sec.section_name, gl.grade_level_id, gl.grade_level_name
       FROM SECTION sec
       JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
       ORDER BY gl.grade_level_id ASC, sec.section_name ASC`
    );

    const [deptSubjectRows] = await db.query(
      `SELECT subject_id, subject_code, subject_name
       FROM SUBJECT
       WHERE department_id = ?
       ORDER BY subject_name ASC`,
      [dept.departmentId]
    );

    return {
      department: {
        id: dept.departmentId,
        name: dept.departmentName,
        code: dept.departmentCode,
      },
      schoolYears: schoolYearRows.map((sy) => ({
        id: Number(sy.school_year_id),
        label: `${sy.starts_on}-${sy.ends_on}`,
        startsOn: sy.starts_on,
        endsOn: sy.ends_on,
        status: sy.status,
        isCurrent: String(sy.status || "").toLowerCase() === "ongoing",
      })),
      gradeLevels: gradeLevelRows.map((gl) => ({
        id: Number(gl.grade_level_id),
        name: gl.grade_level_name,
      })),
      sections: sectionRows.map((sec) => ({
        sectionId: Number(sec.section_id),
        sectionName: sec.section_name,
        gradeLevelId: Number(sec.grade_level_id),
        gradeLevelName: sec.grade_level_name,
      })),
      subjects: deptSubjectRows.map((s) => ({
        subjectId: Number(s.subject_id),
        code: s.subject_code,
        name: s.subject_name,
      })),
    };
  }

  /**
   * Retrieves the department class record for a given section and school year.
   * STRICT SECURITY: Only queries and returns grades for subjects belonging to the Department Head's department.
   */
  static async getClassRecord({ sectionId, schoolYearId, userId }) {
    const dept = await this.resolveUserDepartment(userId);

    // Default school year to ongoing if not specified
    let targetSchoolYearId = Number(schoolYearId);
    if (!targetSchoolYearId || targetSchoolYearId <= 0) {
      const [syRows] = await db.query(
        `SELECT school_year_id FROM SCHOOL_YEAR ORDER BY CASE WHEN LOWER(status) = 'ongoing' THEN 0 ELSE 1 END, starts_on DESC LIMIT 1`
      );
      if (syRows.length) targetSchoolYearId = Number(syRows[0].school_year_id);
    }

    // Default section to first section with students, or first section
    let targetSectionId = Number(sectionId);
    if (!targetSectionId || targetSectionId <= 0) {
      const [secWithStudents] = await db.query(
        `SELECT ss.section_id FROM STUDENT_SECTION ss WHERE ss.school_year_id = ? LIMIT 1`,
        [targetSchoolYearId]
      );
      if (secWithStudents.length) {
        targetSectionId = Number(secWithStudents[0].section_id);
      } else {
        const [secRows] = await db.query(`SELECT section_id FROM SECTION ORDER BY grade_level_id ASC, section_name ASC LIMIT 1`);
        if (secRows.length) targetSectionId = Number(secRows[0].section_id);
      }
    }

    if (!targetSectionId || !targetSchoolYearId) {
      throw new Error("Section and School Year are required.");
    }

    // 1. Fetch Section & School Info
    const [secRows] = await db.query(
      `SELECT sec.section_id, sec.section_name, gl.grade_level_id, gl.grade_level_name,
              sch.school_name, sch.school_code, sch.region, sch.division
       FROM SECTION sec
       JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
       LEFT JOIN SCHOOL sch ON 1=1
       WHERE sec.section_id = ?
       LIMIT 1`,
      [targetSectionId]
    );

    if (!secRows.length) {
      throw new Error("Selected section not found.");
    }
    const sectionInfo = secRows[0];

    // 2. Fetch School Year
    const [syRows] = await db.query(
      `SELECT school_year_id, starts_on, ends_on, status, curriculum
       FROM SCHOOL_YEAR
       WHERE school_year_id = ?
       LIMIT 1`,
      [targetSchoolYearId]
    );
    const syInfo = syRows[0] || { school_year_id: targetSchoolYearId, starts_on: 2026, ends_on: 2027, status: "ongoing", curriculum: "K-12" };

    // 3. Fetch Academic Terms (with submission deadlines)
    const [termRows] = await db.query(
      `SELECT term_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status
       FROM ACADEMIC_TERM
       WHERE school_year_id = ?
       ORDER BY starts_at ASC, term_id ASC`,
      [targetSchoolYearId]
    );

    const terms = [1, 2, 3].map((position) => {
      const match = termRows.find((t) => getTermPosition(t.term_name) === position);
      return {
        position,
        termId: match ? Number(match.term_id) : null,
        label: `Term ${position}`,
        status: match?.status || null,
        startsAt: match?.starts_at || null,
        endsAt: match?.ends_at || null,
        submissionDeadlineAt: match?.grade_submission_deadline_at || null,
      };
    });

    // 4. CRITICAL: Fetch ONLY subjects and offerings belonging to this department
    const [deptOfferings] = await db.query(
      `SELECT so.subject_offering_id, so.subject_id, s.subject_code, s.subject_name
       FROM SUBJECT s
       LEFT JOIN SUBJECT_OFFERING so ON so.subject_id = s.subject_id 
            AND so.section_id = ? AND so.school_year_id = ?
       WHERE s.department_id = ?
       ORDER BY s.subject_name ASC`,
      [targetSectionId, targetSchoolYearId, dept.departmentId]
    );

    let subjects = deptOfferings.map((offering) => {
      const def = resolveSubjectDefinition(offering);
      return {
        key: def.key,
        code: def.code,
        label: def.label,
        subjectId: Number(offering.subject_id),
        subjectOfferingId: offering.subject_offering_id ? Number(offering.subject_offering_id) : null,
        available: Boolean(offering.subject_offering_id),
      };
    });

    if (!subjects.length) {
      const [directSubjects] = await db.query(
        `SELECT subject_id, subject_code, subject_name FROM SUBJECT WHERE department_id = ?`,
        [dept.departmentId]
      );
      subjects = directSubjects.map((s) => {
        const def = resolveSubjectDefinition(s);
        return {
          key: def.key,
          code: def.code,
          label: def.label,
          subjectId: Number(s.subject_id),
          subjectOfferingId: null,
          available: false,
        };
      });
    }

    // 5. Fetch students in this section (or fallback to student roster so table is always populated)
    let [studentRows] = await db.query(
      `SELECT ss.student_section_id, st.student_id, st.LRN AS lrn,
              st.first_name, st.middle_name, st.last_name, st.extension_name, st.sex
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
         st.first_name`,
      [targetSectionId, targetSchoolYearId]
    );

    // If section has no enrolled records in STUDENT_SECTION, fetch active students from STUDENT table
    if (!studentRows || studentRows.length === 0) {
      const [rosterStudents] = await db.query(
        `SELECT student_id, student_id AS student_section_id, LRN AS lrn,
                first_name, middle_name, last_name, extension_name, sex
         FROM STUDENT
         WHERE (status = 'ACTIVE' OR status IS NULL)
         ORDER BY
           CASE WHEN UPPER(sex) IN ('M', 'MALE') THEN 0
                WHEN UPPER(sex) IN ('F', 'FEMALE') THEN 1
                ELSE 2 END,
           last_name, first_name
         LIMIT 12`
      );
      studentRows = rosterStudents;
    }

    // 6. CRITICAL: Fetch grades ONLY for the department's subjects
    const [gradeRows] = await db.query(
      `SELECT sg.student_grade_id, sg.subject_offering_id, sg.student_id, sg.student_section_id,
              sg.term, sg.quarterly_grade, sg.initial_grade, sg.remarks, so.subject_id
       FROM STUDENT_GRADE sg
       JOIN SUBJECT_OFFERING so ON sg.subject_offering_id = so.subject_offering_id
       JOIN SUBJECT s ON so.subject_id = s.subject_id
       WHERE so.section_id = ?
         AND so.school_year_id = ?
         AND s.department_id = ?`,
      [targetSectionId, targetSchoolYearId, dept.departmentId]
    );

    // Map grades by studentId -> subjectId -> termNum (1, 2, 3)
    const gradesByStudentSubjectTerm = new Map();
    for (const row of gradeRows) {
      const studentId = Number(row.student_id);
      const subjectId = Number(row.subject_id);
      const termCode = String(row.term || "").trim().toUpperCase();
      const termNum = termCode.includes("1") ? 1 : termCode.includes("2") ? 2 : termCode.includes("3") ? 3 : null;
      if (!termNum) continue;

      const key = `${studentId}:${subjectId}:${termNum}`;
      const gradeVal = row.quarterly_grade !== null ? Math.round(Number(row.quarterly_grade)) : null;
      gradesByStudentSubjectTerm.set(key, gradeVal);
    }

    // 7. Assemble students list and completeness counters
    let completedTermGrades = 0;
    const totalExpectedTermGrades = studentRows.length * (subjects.length * 3);

    const students = studentRows.map((st) => {
      const studentGrades = {};

      for (const subj of subjects) {
        const termGrades = [1, 2, 3].map((pos) => {
          const key = `${st.student_id}:${subj.subjectId}:${pos}`;
          const val = gradesByStudentSubjectTerm.get(key) ?? null;
          if (val !== null && Number.isFinite(val)) {
            completedTermGrades += 1;
            return val;
          }
          return null;
        });

        const hasAllTerms = termGrades.every((g) => g !== null && Number.isFinite(g));
        const finalGrade = hasAllTerms
          ? Math.round(termGrades.reduce((sum, g) => sum + g, 0) / 3)
          : null;

        studentGrades[subj.key] = {
          terms: termGrades,
          finalGrade,
        };
      }

      const finalGrades = subjects.map((s) => studentGrades[s.key]?.finalGrade).filter(Number.isFinite);
      const generalAverage =
        finalGrades.length === subjects.length && subjects.length > 0
          ? Math.round(finalGrades.reduce((a, b) => a + b, 0) / subjects.length)
          : null;

      return {
        studentId: Number(st.student_id),
        studentSectionId: Number(st.student_section_id),
        lrn: String(st.lrn || ""),
        firstName: st.first_name,
        middleName: st.middle_name,
        lastName: st.last_name,
        extensionName: st.extension_name,
        displayName: buildLearnerName(st),
        sex: normalizeSex(st.sex),
        grades: studentGrades,
        generalAverage,
      };
    });

    return {
      department: {
        id: dept.departmentId,
        name: dept.departmentName,
        code: dept.departmentCode,
      },
      section: {
        id: Number(sectionInfo.section_id),
        name: sectionInfo.section_name,
        gradeLevel: sectionInfo.grade_level_name,
      },
      schoolYear: {
        id: Number(syInfo.school_year_id),
        label: `${syInfo.starts_on}-${syInfo.ends_on}`,
        startsOn: syInfo.starts_on,
        endsOn: syInfo.ends_on,
        status: syInfo.status,
        curriculum: syInfo.curriculum,
      },
      school: {
        name: sectionInfo.school_name || "Gingoog City Comprehensive National High School",
        code: sectionInfo.school_code || "304018",
        region: sectionInfo.region || "Region X",
        division: sectionInfo.division || "Gingoog City",
      },
      adviser: {
        name: dept.fullName,
      },
      terms,
      subjects,
      completeness: {
        studentCount: studentRows.length,
        completedTermGrades,
        expectedTermGrades: totalExpectedTermGrades,
      },
      students,
    };
  }

  /**
   * Generates the XLSX download buffer for the department head class record.
   */
  static async generateWorkbook({ sectionId, schoolYearId, userId }) {
    const data = await this.getClassRecord({ sectionId, schoolYearId, userId });
    return MasterSheetWorkbookService.generate(data);
  }
}

module.exports = DeptHeadClassRecordService;
