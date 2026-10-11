const db = require('../config/db');

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function integer(value, label, minimum, maximum) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') {
    throw badRequest(`${label} is required.`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < minimum || n > maximum) throw badRequest(`${label} is outside its allowed range.`);
  return n;
}

function normalizeBatch(body) {
  const sectionId = integer(body.sectionId, 'Section', 1, Number.MAX_SAFE_INTEGER);
  const schoolYearId = integer(body.schoolYearId, 'School year', 1, Number.MAX_SAFE_INTEGER);
  const config = body.config || {};
  const maxima = ['literal', 'inferential', 'critical'].map(name => integer(config[`${name}_max`], `${name} maximum`, 1, 1000));
  const scoreThreshold = integer(config.score_threshold, 'Score threshold', 1, maxima.reduce((a, b) => a + b, 0));
  const date = config.assessed_on || null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
    throw badRequest('Enter a valid assessment date.');
  }
  const testLevel = String(config.test_level || '').trim();
  if (testLevel.length > 100) throw badRequest('Screening test level must be at most 100 characters.');
  if (!Array.isArray(body.records) || !body.records.length) throw badRequest('Screening records are required.');
  const seen = new Set();
  const records = body.records.map(row => {
    const id = integer(row?.student_section_id, 'Learner enrollment', 1, Number.MAX_SAFE_INTEGER);
    if (seen.has(id)) throw badRequest('A learner has duplicate screening rows.');
    seen.add(id);
    const taken = row.test_taken;
    if (![null, 0, 1].includes(taken)) throw badRequest('Test taken must be blank, 0, or 1.');
    const scores = ['literal', 'inferential', 'critical'].map((name, i) => {
      const value = row[`${name}_score`];
      return value === null || value === '' || value === undefined ? null : integer(value, `${name} score`, 0, maxima[i]);
    });
    if (taken !== 1 && scores.some(value => value !== null)) throw badRequest('Only learners marked as tested may have scores.');
    return [id, date, testLevel || null, ...maxima, scoreThreshold, taken, ...scores];
  });
  return { sectionId, schoolYearId, records };
}

class PhilIriScreening {
  static async authorize(sectionId, schoolYearId, user) {
    if (user.normalized_role !== 'subject_teacher') throw Object.assign(new Error('Only an assigned teacher or adviser can access screening scores.'), { status: 403 });
    const [rows] = await db.execute(`
      SELECT 1 FROM SECTION_ADVISER_ASSIGNMENT
      WHERE section_id = ? AND school_year_id = ? AND user_id = ?
      UNION ALL
      SELECT 1 FROM TEACHER_ASSIGNMENT ta
      JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
      JOIN SUBJECT s ON s.subject_id = so.subject_id
      WHERE so.section_id = ? AND so.school_year_id = ? AND ta.user_id = ?
        AND (UPPER(s.subject_code) = 'ENG' OR UPPER(s.subject_name) = 'ENGLISH')
      LIMIT 1`, [sectionId, schoolYearId, user.user_id, sectionId, schoolYearId, user.user_id]);
    if (!rows.length) throw Object.assign(new Error('You are not assigned to this section for the selected school year.'), { status: 403 });
  }

  static async findBySection(sectionId, schoolYearId, user) {
    sectionId = integer(sectionId, 'Section', 1, Number.MAX_SAFE_INTEGER);
    schoolYearId = integer(schoolYearId, 'School year', 1, Number.MAX_SAFE_INTEGER);
    await this.authorize(sectionId, schoolYearId, user);
    const [rows] = await db.execute(`SELECT ps.screening_id, ps.student_section_id,
      DATE_FORMAT(ps.assessed_on, '%Y-%m-%d') AS assessed_on, ps.test_level,
      ps.literal_max, ps.inferential_max, ps.critical_max, ps.score_threshold,
      ps.test_taken, ps.literal_score, ps.inferential_score, ps.critical_score,
      ps.recorded_by, ps.updated_at FROM PHIL_IRI_SCREENING ps
      JOIN STUDENT_SECTION ss ON ss.student_section_id = ps.student_section_id
      WHERE ss.section_id = ? AND ss.school_year_id = ? ORDER BY ps.student_section_id`, [sectionId, schoolYearId]);
    return rows;
  }

  static async saveBatch(body, user) {
    const { sectionId, schoolYearId, records } = normalizeBatch(body);
    await this.authorize(sectionId, schoolYearId, user);
    const [roster] = await db.execute('SELECT student_section_id FROM STUDENT_SECTION WHERE section_id = ? AND school_year_id = ?', [sectionId, schoolYearId]);
    const allowed = new Set(roster.map(row => Number(row.student_section_id)));
    if (records.some(row => !allowed.has(row[0]))) throw badRequest('A learner does not belong to this section and school year.');
    const params = records.flatMap(row => [...row, user.user_id]);
    const [result] = await db.execute(`INSERT INTO PHIL_IRI_SCREENING
      (student_section_id, assessed_on, test_level, literal_max, inferential_max, critical_max,
       score_threshold, test_taken, literal_score, inferential_score, critical_score, recorded_by)
      VALUES ${records.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
      ON DUPLICATE KEY UPDATE assessed_on = VALUES(assessed_on), test_level = VALUES(test_level),
        literal_max = VALUES(literal_max), inferential_max = VALUES(inferential_max), critical_max = VALUES(critical_max),
        score_threshold = VALUES(score_threshold), test_taken = VALUES(test_taken),
        literal_score = VALUES(literal_score), inferential_score = VALUES(inferential_score),
        critical_score = VALUES(critical_score), recorded_by = VALUES(recorded_by)`, params);
    return result;
  }
}

module.exports = { PhilIriScreening, normalizeBatch };
