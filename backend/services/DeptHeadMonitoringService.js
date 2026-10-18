const db = require('../config/db');
const { decryptLrn } = require('../utils/encryption');

const fail = (status, message) => Object.assign(new Error(message), { status });
const token = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const id = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw fail(400, 'Select a valid school year or section.');
  return number;
};
const name = row => [row.first_name, row.middle_name, row.last_name, row.extension_name].filter(Boolean).join(' ');
const hasNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

function screeningStatus(row) {
  if (!row || Number(row.test_taken) !== 1) return 'Not assessed';
  return ['literal', 'inferential', 'critical'].every(part => hasNumber(row[`${part}_score`]) && Number.isInteger(Number(row[`${part}_score`]))
    && hasNumber(row[`${part}_max`]) && Number(row[`${part}_max`]) > 0
    && Number(row[`${part}_score`]) >= 0 && Number(row[`${part}_score`]) <= Number(row[`${part}_max`])) ? 'Complete' : 'Incomplete';
}
function postTestStatus(row) {
  if (!row) return 'Not assessed';
  return ['oral_reading_percent', 'comp_score_percent'].every(key => hasNumber(row[key]))
    && ['oral_reading_level', 'comp_reading_level', 'overall_reading_level'].every(key => Boolean(row[key])) ? 'Complete' : 'Incomplete';
}

class DeptHeadMonitoringService {
  static async context(user) {
    if (user?.normalized_role !== 'department_head') throw fail(403, 'Department Head access is required.');
    // Resolve the department from the database, never from a client-supplied department id.
    const [departments] = await db.execute(`SELECT d.department_id, d.department_name, d.department_code
      FROM DEPARTMENT d WHERE d.department_id = COALESCE(
        (SELECT dh.department_id FROM DEPARTMENT_HEAD dh WHERE dh.user_id = ?
          AND (dh.appointed_from IS NULL OR dh.appointed_from <= CURDATE())
          AND (dh.appointed_until IS NULL OR dh.appointed_until >= CURDATE())
          ORDER BY dh.department_head_id DESC LIMIT 1), ?)
      LIMIT 1`, [user.user_id, user.department_id || null]);
    if (!departments.length) throw fail(403, 'Your account has no assigned department.');
    const department = departments[0];
    const [subjects] = await db.execute('SELECT subject_id, subject_code, subject_name FROM SUBJECT WHERE department_id = ? ORDER BY subject_id', [department.department_id]);
    const matches = subjects.filter(subject => token(subject.subject_code) === token(department.department_code)
      || token(subject.subject_name) === token(department.department_name));
    const subject = matches.length === 1 ? matches[0] : subjects.length === 1 ? subjects[0] : null;
    if (!subject) throw fail(409, 'Your department needs a matching assigned subject before records can be reviewed.');
    const [[years], [grades], [schools]] = await Promise.all([
      db.execute('SELECT school_year_id, starts_on, ends_on, status FROM SCHOOL_YEAR ORDER BY starts_on DESC'),
      db.execute('SELECT grade_level_id, grade_level_name FROM GRADE_LEVEL ORDER BY grade_level_id'),
      db.execute('SELECT school_name, region, division FROM SCHOOL ORDER BY school_id LIMIT 1'),
    ]);
    return {
      department: { id: Number(department.department_id), name: department.department_name, code: department.department_code },
      subject: { subjectId: Number(subject.subject_id), code: subject.subject_code, name: subject.subject_name },
      school: schools[0] ? { name: schools[0].school_name, region: schools[0].region, division: schools[0].division } : null,
      canViewPhilIri: (token(department.department_code) === 'ENG' || ['ENGLISH', 'ENGLISHDEPARTMENT'].includes(token(department.department_name)))
        && (token(subject.subject_code) === 'ENG' || token(subject.subject_name) === 'ENGLISH'),
      schoolYears: years.map(year => ({ id: Number(year.school_year_id), label: `${year.starts_on}-${year.ends_on}`,
        isCurrent: ['active', 'ongoing'].includes(String(year.status).toLowerCase()) })),
      gradeLevels: grades.map(grade => ({ id: Number(grade.grade_level_id), name: grade.grade_level_name })),
    };
  }

  static async sections(user, schoolYearId) {
    const context = await this.context(user);
    const yearId = id(schoolYearId);
    if (!context.schoolYears.some(year => year.id === yearId)) throw fail(404, 'School year not found.');
    const [rows] = await db.execute(`SELECT sec.section_id, sec.section_name, sec.grade_level_id,
      gl.grade_level_name, sec.is_specialized, p.program_code,
      so.subject_offering_id,
      (SELECT COUNT(DISTINCT ss.student_id) FROM STUDENT_SECTION ss
        WHERE ss.section_id = sec.section_id AND ss.school_year_id = so.school_year_id) AS learner_count,
      u.first_name, u.middle_name, u.last_name, u.extension_name,
      adviser.first_name AS adviser_first_name, adviser.middle_name AS adviser_middle_name,
      adviser.last_name AS adviser_last_name, adviser.extension_name AS adviser_extension_name
      FROM SUBJECT_OFFERING so JOIN SECTION sec ON sec.section_id = so.section_id
      JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
      LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = (
        SELECT MAX(ta2.teacher_assignment_id) FROM TEACHER_ASSIGNMENT ta2 WHERE ta2.subject_offering_id = so.subject_offering_id)
      LEFT JOIN USER u ON u.user_id = ta.user_id
      LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = (
        SELECT MAX(saa2.adviser_assignment_id) FROM SECTION_ADVISER_ASSIGNMENT saa2
        WHERE saa2.section_id = sec.section_id AND saa2.school_year_id = so.school_year_id)
      LEFT JOIN USER adviser ON adviser.user_id = saa.user_id
      WHERE so.subject_id = ? AND so.school_year_id = ?
      ORDER BY gl.grade_level_id, sec.section_name, so.subject_offering_id DESC`, [context.subject.subjectId, yearId]);
    const seen = new Set();
    const sections = rows.filter(row => {
      if (seen.has(Number(row.section_id))) return false;
      seen.add(Number(row.section_id)); return true;
    }).map(row => ({ sectionId: Number(row.section_id), sectionName: row.section_name,
      gradeLevelId: Number(row.grade_level_id), gradeLevelName: row.grade_level_name,
      programCode: Number(row.is_specialized) === 1 ? row.program_code || 'Special Program' : 'EBEC',
      learnerCount: Number(row.learner_count), teacherName: name(row) || 'Unassigned teacher',
      adviserName: name({ first_name: row.adviser_first_name, middle_name: row.adviser_middle_name,
        last_name: row.adviser_last_name, extension_name: row.adviser_extension_name }) || 'Not assigned',
      subjectOfferingId: Number(row.subject_offering_id) }));
    return { ...context, schoolYearId: yearId, sections };
  }

  static async philIri(user, schoolYearId, sectionId = null) {
    const directory = await this.sections(user, schoolYearId);
    if (!directory.canViewPhilIri) throw fail(403, 'PHIL-IRI monitoring is available to the English Department Head.');
    const selectedId = sectionId === null ? null : id(sectionId);
    if (selectedId !== null && !directory.sections.some(section => section.sectionId === selectedId)) {
      throw fail(403, 'This section is outside your assigned subject and school year.');
    }
    const sectionClause = selectedId === null ? '' : ' AND ss.section_id = ?';
    const params = [directory.schoolYearId, directory.subject.subjectId, ...(selectedId === null ? [] : [selectedId])];
    const scope = `ss.school_year_id = ? AND EXISTS (SELECT 1 FROM SUBJECT_OFFERING so
      WHERE so.section_id = ss.section_id AND so.school_year_id = ss.school_year_id AND so.subject_id = ?)${sectionClause}`;
    const [roster] = await db.execute(`SELECT ss.student_section_id, ss.section_id, st.LRN AS lrn,
      st.first_name, st.middle_name, st.last_name, st.extension_name, st.sex FROM STUDENT_SECTION ss
      JOIN STUDENT st ON st.student_id = ss.student_id WHERE ${scope}
      ORDER BY st.last_name, st.first_name`, params);
    const read = async (sql, queryParams = params) => {
      try { const [rows] = await db.execute(sql, queryParams); return { available: true, rows }; }
      catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        return { available: false, rows: [] };
      }
    };
    const screening = await read(`SELECT ps.* FROM PHIL_IRI_SCREENING ps
      JOIN STUDENT_SECTION ss ON ss.student_section_id = ps.student_section_id WHERE ${scope} ORDER BY ps.updated_at DESC`);
    const postTest = await read(`SELECT pia.* FROM PHIL_IRI_ASSESSMENT pia
      JOIN STUDENT_SECTION ss ON ss.student_section_id = pia.student_section_id
      WHERE ${scope} AND pia.test_type = 'POST_TEST'
        AND (pia.subject_offering_id IS NULL OR EXISTS (SELECT 1 FROM SUBJECT_OFFERING po
          WHERE po.subject_offering_id = pia.subject_offering_id AND po.subject_id = ?
            AND po.section_id = ss.section_id AND po.school_year_id = ss.school_year_id)) ORDER BY pia.updated_at DESC`,
      [...params, directory.subject.subjectId]);
    const byEnrollment = rows => {
      const map = new Map();
      rows.forEach(row => { const key = Number(row.student_section_id); if (!map.has(key)) map.set(key, row); });
      return map;
    };
    const screens = byEnrollment(screening.rows);
    const posts = byEnrollment(postTest.rows);
    const learners = roster.map(row => {
      const key = Number(row.student_section_id);
      const screen = screens.get(key) || null;
      const post = posts.get(key) || null;
      return { enrollmentId: key, sectionId: Number(row.section_id), name: name(row), sex: row.sex ?? null,
        lrn: selectedId === null ? undefined : decryptLrn(row.lrn),
        screening: screen, screeningStatus: screening.available ? screeningStatus(screen) : 'Unavailable',
        postTest: post, postTestStatus: postTest.available ? postTestStatus(post) : 'Unavailable' };
    });
    const sections = directory.sections.filter(section => selectedId === null || section.sectionId === selectedId).map(section => {
      const members = learners.filter(learner => learner.sectionId === section.sectionId);
      return { ...section, learnerCount: members.length,
        screeningComplete: screening.available ? members.filter(learner => learner.screeningStatus === 'Complete').length : null,
        screeningIncomplete: screening.available ? members.filter(learner => learner.screeningStatus === 'Incomplete').length : null,
        postTestComplete: postTest.available ? members.filter(learner => learner.postTestStatus === 'Complete').length : null,
        postTestIncomplete: postTest.available ? members.filter(learner => learner.postTestStatus === 'Incomplete').length : null };
    });
    return { department: directory.department, schoolYearId: directory.schoolYearId, sections,
      availability: { screening: screening.available, postTest: postTest.available },
      ...(selectedId === null ? {} : { learners }) };
  }
}

module.exports = { DeptHeadMonitoringService, screeningStatus, postTestStatus };
