const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { getSubmissionMonitor, submissionTotals } = require('../services/DeptSubmissionMonitorService');
const DeptHeadClassRecordService = require('../services/DeptHeadClassRecordService');
router.use('/monitoring', require('./deptHeadMonitoringRoutes'));

async function getDepartmentId(userId) {
  if (!userId) throw new Error('User not authenticated');
  const [rows] = await db.query('SELECT department_id FROM USER WHERE user_id = ?', [userId]);
  if (!rows.length || !rows[0].department_id) {
    throw new Error('User does not belong to a department');
  }
  return rows[0].department_id;
}

function buildFilters(queryObj, params, termPrefix = null) {
  let filterSql = '';
  if (queryObj.schoolYear && queryObj.schoolYear !== 'All') {
    const startsOn = queryObj.schoolYear.split('-')[0];
    filterSql += ' AND sy.starts_on = ?';
    params.push(startsOn);
  }
  if (queryObj.gradeLevel && queryObj.gradeLevel !== 'All') {
    filterSql += ' AND gl.grade_level_name = ?';
    params.push(queryObj.gradeLevel);
  }
  if (termPrefix && queryObj.quarter && queryObj.quarter !== 'All') {
    if (termPrefix === 'at') {
      const termNameMap = { '1': '1st', '2': '2nd', '3': '3rd' };
      filterSql += ' AND at.term_name = ?';
      params.push(termNameMap[queryObj.quarter] || queryObj.quarter);
    } else {
      filterSql += ` AND ${termPrefix}.term = ?`;
      params.push(`T${queryObj.quarter}`);
    }
  }
  return filterSql;
}

router.get('/comparative-analysis', async (req, res) => {
  try {
    const departmentId = await getDepartmentId(req.headers['x-auralis-user-id']);
    let query = `
      SELECT 
        gl.grade_level_name AS gradeLevel,
        SUM(CASE WHEN sg.quarterly_grade >= 90 THEN 1 ELSE 0 END) AS aboveAverage,
        SUM(CASE WHEN sg.quarterly_grade >= 75 THEN 1 ELSE 0 END) AS passed,
        SUM(CASE WHEN sg.quarterly_grade < 75 THEN 1 ELSE 0 END) AS fail,
        COUNT(sg.student_grade_id) AS total
      FROM STUDENT_GRADE sg
      JOIN SUBJECT_OFFERING so ON sg.subject_offering_id = so.subject_offering_id
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      WHERE s.department_id = ?
    `;
    const params = [departmentId];
    query += buildFilters(req.query, params, 'sg');
    query += ` GROUP BY gl.grade_level_name ORDER BY gl.grade_level_name`;

    const [rows] = await db.query(query, params);
    const results = rows.map(r => ({
      gradeLevel: r.gradeLevel,
      aboveAverage: Number(r.aboveAverage) || 0,
      fail: Number(r.fail) || 0,
      passingRate: r.total > 0 ? Math.round((Number(r.passed) / Number(r.total)) * 100) : 0
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pass-rate', async (req, res) => {
  try {
    const departmentId = await getDepartmentId(req.headers['x-auralis-user-id']);
    let query = `
      SELECT 
        SUM(CASE WHEN sg.quarterly_grade >= 75 THEN 1 ELSE 0 END) AS passed,
        SUM(CASE WHEN sg.quarterly_grade < 75 THEN 1 ELSE 0 END) AS failed,
        COUNT(sg.student_grade_id) AS total
      FROM STUDENT_GRADE sg
      JOIN SUBJECT_OFFERING so ON sg.subject_offering_id = so.subject_offering_id
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      WHERE s.department_id = ?
    `;
    const params = [departmentId];
    query += buildFilters(req.query, params, 'sg');

    const [rows] = await db.query(query, params);
    const row = rows[0] || { passed: 0, failed: 0, total: 0 };
    const passed = Number(row.passed) || 0;
    const failed = Number(row.failed) || 0;
    const total = Number(row.total) || 0;
    res.json({ passed, failed, total, passRatePercentage: total > 0 ? Math.round((passed / total) * 100) : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const departmentId = await getDepartmentId(req.headers['x-auralis-user-id']);

    let teacherQuery = `
      SELECT COUNT(DISTINCT ta.user_id) AS totalTeachers
      FROM TEACHER_ASSIGNMENT ta
      JOIN SUBJECT_OFFERING so ON ta.subject_offering_id = so.subject_offering_id
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      WHERE s.department_id = ?
    `;
    const teacherParams = [departmentId];
    teacherQuery += buildFilters(req.query, teacherParams, null);
    const [teacherRows] = await db.query(teacherQuery, teacherParams);

    const submissionStats = submissionTotals(await getSubmissionMonitor(db, departmentId, req.query));

    let riskQuery = `
      SELECT COUNT(DISTINCT sg.student_id) AS atRisk
      FROM STUDENT_GRADE sg
      JOIN SUBJECT_OFFERING so ON sg.subject_offering_id = so.subject_offering_id
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      WHERE s.department_id = ? AND sg.quarterly_grade < 75
    `;
    const riskParams = [departmentId];
    riskQuery += buildFilters(req.query, riskParams, 'sg');
    const [riskRows] = await db.query(riskQuery, riskParams);

    res.json({
      totalTeachers: Number(teacherRows[0]?.totalTeachers) || 0,
      ...submissionStats,
      atRiskStudents: Number(riskRows[0]?.atRisk) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/submission-monitor', async (req, res) => {
  try {
    const departmentId = await getDepartmentId(req.headers['x-auralis-user-id']);
    const results = await getSubmissionMonitor(db, departmentId, req.query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/performance-matrix', async (req, res) => {
  try {
    const departmentId = await getDepartmentId(req.headers['x-auralis-user-id']);
    let query = `
      SELECT 
        sec.section_name AS section, gl.grade_level_name, AVG(sg.quarterly_grade) AS mean
      FROM STUDENT_GRADE sg
      JOIN SUBJECT_OFFERING so ON sg.subject_offering_id = so.subject_offering_id
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      WHERE s.department_id = ?
    `;
    const params = [departmentId];
    query += buildFilters(req.query, params, 'sg');
    query += ` GROUP BY sec.section_id, sec.section_name, gl.grade_level_name ORDER BY gl.grade_level_name, sec.section_name`;

    const [rows] = await db.query(query, params);

    const results = rows.map(r => {
      const mean = Number(r.mean) || 0;
      let dist = 'Average';
      if (mean >= 90) dist = 'Above Average';
      else if (mean < 75) dist = 'Needs Intervention';
      return {
        section: `${r.grade_level_name} - ${r.section}`,
        mean: Math.round(mean * 10) / 10,
        mps: Math.round((mean / 100) * 100 * 10) / 10,
        examDistribution: dist
      };
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/grade-distribution', async (req, res) => {
  try {
    const departmentId = await getDepartmentId(req.headers['x-auralis-user-id']);
    let query = `
      SELECT gl.grade_level_name AS gradeLevel, sg.term, AVG(sg.quarterly_grade) AS mean
      FROM STUDENT_GRADE sg
      JOIN SUBJECT_OFFERING so ON sg.subject_offering_id = so.subject_offering_id
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      WHERE s.department_id = ?
    `;
    const params = [departmentId];
    query += buildFilters(req.query, params, null);
    query += ` GROUP BY gl.grade_level_name, sg.term`;

    const [rows] = await db.query(query, params);

    const distMap = {};
    for (const r of rows) {
      if (!distMap[r.gradeLevel]) distMap[r.gradeLevel] = { gradeLevel: r.gradeLevel, term1Mean: null, term2Mean: null, term3Mean: null, term1Mps: null, term2Mps: null, term3Mps: null };
      const mean = Math.round(Number(r.mean) * 10) / 10;
      if (r.term === 'T1') { distMap[r.gradeLevel].term1Mean = mean; distMap[r.gradeLevel].term1Mps = mean; }
      else if (r.term === 'T2') { distMap[r.gradeLevel].term2Mean = mean; distMap[r.gradeLevel].term2Mps = mean; }
      else if (r.term === 'T3') { distMap[r.gradeLevel].term3Mean = mean; distMap[r.gradeLevel].term3Mps = mean; }
    }
    res.json(Object.values(distMap));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// DEPARTMENT HEAD CLASS RECORDS ENDPOINTS
// ==========================================

router.get('/grade-distribution-report', async (req, res) => {
  try {
    const userId = req.headers['x-auralis-user-id'] || req.query.userId || req.query.user_id;
    const departmentId = await getDepartmentId(userId);

    // Get Department details
    const [deptRows] = await db.query('SELECT department_name FROM DEPARTMENT WHERE department_id = ?', [departmentId]);
    const departmentName = deptRows[0]?.department_name || 'Department';

    // Get School Years
    const [syRows] = await db.query('SELECT school_year_id, starts_on, ends_on, status FROM SCHOOL_YEAR ORDER BY starts_on DESC');
    const schoolYears = syRows.map(sy => ({
      id: String(sy.school_year_id),
      starts_on: sy.starts_on,
      ends_on: sy.ends_on,
      label: `S.Y. ${sy.starts_on}-${sy.ends_on}`,
      is_active: sy.status === 'ongoing' || sy.starts_on === 2026
    }));

    const activeSy = schoolYears.find(s => s.is_active) || schoolYears[0];
    const selectedSchoolYear = req.query.schoolYear || (activeSy ? `${activeSy.starts_on}-${activeSy.ends_on}` : '2026-2027');
    const startsOn = selectedSchoolYear.includes('-') ? selectedSchoolYear.split('-')[0] : selectedSchoolYear;

    const rawTerm = String(req.query.term || '1').trim();
    let termCodes = [];
    if (rawTerm === '1' || rawTerm === 'T1' || rawTerm.includes('1')) {
      termCodes = ['T1', '1', '1st Term', 'Term 1', 'Quarter 1', '1st Quarter', 'Q1'];
    } else if (rawTerm === '2' || rawTerm === 'T2' || rawTerm.includes('2')) {
      termCodes = ['T2', '2', '2nd Term', 'Term 2', 'Quarter 2', '2nd Quarter', 'Q2'];
    } else if (rawTerm === '3' || rawTerm === 'T3' || rawTerm.includes('3')) {
      termCodes = ['T3', '3', '3rd Term', 'Term 3', 'Quarter 3', '3rd Quarter', 'Q3'];
    } else {
      termCodes = [rawTerm];
    }

    const termIdNum = parseInt(rawTerm.replace(/\D/g, ''), 10) || 1;

    // Query offerings strictly for this department's subjects
    const [offerings] = await db.query(`
      SELECT 
        so.subject_offering_id,
        so.section_id,
        so.school_year_id,
        sec.section_name,
        gl.grade_level_id,
        gl.grade_level_name,
        ta.user_id,
        u.first_name,
        u.last_name
      FROM SUBJECT_OFFERING so
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
      LEFT JOIN USER u ON ta.user_id = u.user_id
      WHERE s.department_id = ? AND sy.starts_on = ?
      ORDER BY gl.grade_level_id, u.last_name, sec.section_name
    `, [departmentId, startsOn]);

    // Pre-populate G7, G8, G9, G10
    const gradeLevels = [
      { id: 'G7', name: 'Grade 7' },
      { id: 'G8', name: 'Grade 8' },
      { id: 'G9', name: 'Grade 9' },
      { id: 'G10', name: 'Grade 10' },
    ];

    const gradeMap = new Map();
    gradeLevels.forEach(gl => {
      gradeMap.set(gl.id, {
        id: gl.id,
        name: gl.name,
        total_score: 0,
        num_takers: 0,
        score_mean: 0,
        mps: 0,
        no_grade: 0,
        r60_74: 0,
        r75_79: 0,
        r80_84: 0,
        r85_89: 0,
        r90_100: 0,
        teachers: new Map()
      });
    });

    const gradeSections = new Map();
    const seenOfferings = new Set();
    for (const row of offerings) {
      if (seenOfferings.has(row.subject_offering_id)) continue;
      seenOfferings.add(row.subject_offering_id);
      const { section_id, section_name, subject_offering_id, grade_level_name, user_id, first_name, last_name } = row;
      const glKey = grade_level_name ? (grade_level_name.startsWith('G') ? grade_level_name : `G${grade_level_name}`) : 'G7';

      if (!gradeMap.has(glKey)) {
        gradeMap.set(glKey, {
          id: glKey,
          name: `Grade ${glKey.replace(/\D/g, '')}`,
          total_score: 0,
          num_takers: 0,
          score_mean: 0,
          mps: 0,
          no_grade: 0,
          r60_74: 0,
          r75_79: 0,
          r80_84: 0,
          r85_89: 0,
          r90_100: 0,
          teachers: new Map()
        });
      }
      const glObj = gradeMap.get(glKey);

      // Enrolled students
      const [students] = await db.query(
        `SELECT DISTINCT ss.student_id FROM STUDENT_SECTION ss WHERE ss.section_id = ? AND ss.school_year_id = ?`,
        [section_id, row.school_year_id]
      ).catch(() => [[]]);

      // Quarterly grades
      const termPlaceholders = termCodes.map(() => 'UPPER(sg.term) = UPPER(?)').join(' OR ');
      const [grades] = await db.query(
        `SELECT sg.student_id, sg.quarterly_grade, sg.initial_grade
         FROM STUDENT_GRADE sg
         WHERE sg.subject_offering_id = ? AND (${termPlaceholders})`,
        [subject_offering_id, ...termCodes]
      ).catch(() => [[]]);

      const stGradeMap = new Map();
      (grades || []).forEach(g => {
        const finalGrade = (g.quarterly_grade !== null && g.quarterly_grade !== undefined)
          ? g.quarterly_grade
          : g.initial_grade;
        if (finalGrade !== null && finalGrade !== undefined && !isNaN(Number(finalGrade))) {
          stGradeMap.set(g.student_id, Number(finalGrade));
        }
      });

      const targetTermName = ['1st', '2nd', '3rd'][termIdNum - 1];
      const [termRows] = await db.query(`SELECT at.term_id FROM ACADEMIC_TERM at
        WHERE at.school_year_id = ? AND (UPPER(at.term_name) = UPPER(?) OR at.term_name LIKE ?) LIMIT 1`,
        [row.school_year_id, targetTermName, `%${termIdNum}%`]);
      const targetTermId = termRows[0]?.term_id || null;
      // 3. Calculate Mean and MPS for this section using Terminal Examination (TE) raw scores
      let teTotalScore = 0;
      let teNumTakers = 0;
      let teScoreMean = 0;
      let teMps = 0;
      let teMaxScore = 50;

      const [sheets] = await db.query(
        `SELECT gs.grade_sheet_id, gs.term_id, gs.workflow_status, gs.submitted_at
         FROM GRADE_SHEET gs
         LEFT JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
         WHERE gs.subject_offering_id = ?
           AND (
             gs.term_id = ?
             OR gs.term_id = ?
             OR at.term_name LIKE ?
             OR UPPER(at.term_name) = UPPER(?)
           )
         LIMIT 1`,
        [
          subject_offering_id,
          targetTermId || termIdNum,
          termIdNum,
          `%${termIdNum}%`,
          targetTermName || (rawTerm === '1' ? '1st' : rawTerm === '2' ? '2nd' : '3rd'),
        ]
      ).catch(() => [[]]);

      if (sheets && sheets.length > 0) {
        const gradeSheetId = sheets[0].grade_sheet_id;

        const [activities] = await db.query(
          `SELECT ga.activity_id, ga.activity_name, ga.highest_possible_score, ct.component_code
           FROM GRADE_ACTIVITY ga
           LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
           LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
           WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL) AND ga.status != 'ARCHIVED'`,
          [gradeSheetId]
        ).catch(() => [[]]);

        // Prioritize Terminal Exam / Quarterly Exam over regular daily works
        let teAct = (activities || []).find((a) => {
          const aName = String(a.activity_name || '').toUpperCase();
          const code = String(a.component_code || '').toUpperCase();
          return (code === 'QA' || code === 'EX' || /\b(TERM\s*EXAM|QUARTERLY\s*ASSESSMENT|QUARTERLY\s*EXAM|PERIODICAL\s*EXAM)\b/i.test(aName)) &&
                 !/\b(WRITTEN|WORK|PERFORMANCE|TASK|ST1|ST2|SUMMATIVE)\b/i.test(aName);
        });

        if (!teAct) {
          teAct = (activities || []).find((a) => {
            const aName = String(a.activity_name || '').toUpperCase();
            const code = String(a.component_code || '').toUpperCase();
            return (code === 'QA' || code === 'STE' || code === 'EX' || /\b(EXAM|QUARTERLY|TE)\b/i.test(aName)) &&
                   !/\b(WRITTEN|WORK|PERFORMANCE|TASK)\b/i.test(aName);
          });
        }

        if (!teAct && activities.length > 0) {
          teAct = activities[activities.length - 1];
        }

        if (teAct) {
          teMaxScore = Number(teAct.highest_possible_score) || 50;
          const [scoreRows] = await db.query(
            `SELECT sc.raw_score
             FROM SCORE sc
             JOIN STUDENT_SECTION ss ON ss.student_section_id = sc.student_section_id
             WHERE sc.activity_id = ? AND ss.section_id = ? AND sc.raw_score IS NOT NULL AND sc.raw_score != ''`,
            [teAct.activity_id, section_id]
          ).catch(() => [[]]);

          (scoreRows || []).forEach((sc) => {
            const val = Number(sc.raw_score);
            if (!isNaN(val)) {
              teTotalScore += val;
              teNumTakers += 1;
            }
          });

          if (teNumTakers > 0) {
            teScoreMean = Math.round((teTotalScore / teNumTakers) * 100) / 100;
            teMps = Math.round(((teScoreMean / teMaxScore) * 100) * 100) / 100;
          }
        }
      }

      // Fallback: If no activity score rows, but valid quarterly grades exist in STUDENT_GRADE
      if (teNumTakers === 0 && Array.from(stGradeMap.values()).length > 0) {
        const sumGrades = Array.from(stGradeMap.values()).reduce((acc, g) => acc + g, 0);
        teTotalScore = Math.round(sumGrades * 100) / 100;
        teNumTakers = Array.from(stGradeMap.values()).length;
        teScoreMean = Math.round((sumGrades / teNumTakers) * 100) / 100;
        teMps = teScoreMean; // Quarterly grade is already on a 0-100 percentage scale
      }

      let noGrade = 0, r60_74 = 0, r75_79 = 0, r80_84 = 0, r85_89 = 0, r90_100 = 0;
      const submitted = sheets[0] ? (sheets[0].workflow_status === "SUBMITTED" || sheets[0].submitted_at != null) : stGradeMap.size > 0;
      (submitted ? students || [] : []).forEach(st => {
        if (!stGradeMap.has(st.student_id)) {
          noGrade++;
        } else {
          const g = stGradeMap.get(st.student_id);
          if (g < 75) r60_74++;
          else if (g >= 75 && g <= 79) r75_79++;
          else if (g >= 80 && g <= 84) r80_84++;
          else if (g >= 85 && g <= 89) r85_89++;
          else if (g >= 90 && g <= 100) r90_100++;
          else r60_74++;
        }
      });

      const secObj = {
        id: section_id,
        name: section_name,
        total_score: Math.round(teTotalScore * 100) / 100,
        num_takers: teNumTakers,
        score_mean: teScoreMean,
        mps: teMps,
        no_grade: noGrade,
        r60_74,
        r75_79,
        r80_84,
        r85_89,
        r90_100,
      };

      if (!gradeSections.has(glKey)) gradeSections.set(glKey, []);
      gradeSections.get(glKey).push(secObj);

      // Retain sections with results even when a teacher assignment is missing.
      {
        const teacherKey = user_id || "unassigned";
        const teacherName = [first_name, last_name].filter(Boolean).join(" ").trim() || (user_id ? "Assigned teacher" : "Unassigned teacher");
        if (!glObj.teachers.has(teacherKey)) {
          glObj.teachers.set(teacherKey, {
            id: teacherKey,
            name: teacherName,
            total_score: 0,
            num_takers: 0,
            score_mean: 0,
            mps: 0,
            no_grade: 0,
            r60_74: 0,
            r75_79: 0,
            r80_84: 0,
            r85_89: 0,
            r90_100: 0,
            sections: []
          });
        }

        const tObj = glObj.teachers.get(teacherKey);
        tObj.sections.push(secObj);
        tObj.total_score += secObj.total_score;
        tObj.num_takers += secObj.num_takers;
        tObj.no_grade += noGrade;
        tObj.r60_74 += r60_74;
        tObj.r75_79 += r75_79;
        tObj.r80_84 += r80_84;
        tObj.r85_89 += r85_89;
        tObj.r90_100 += r90_100;
      }

      // Aggregate into grade level
      glObj.total_score += secObj.total_score;
      glObj.num_takers += secObj.num_takers;
      glObj.no_grade += noGrade;
      glObj.r60_74 += r60_74;
      glObj.r75_79 += r75_79;
      glObj.r80_84 += r80_84;
      glObj.r85_89 += r85_89;
      glObj.r90_100 += r90_100;
    }

    let grandTotalScore = 0;
    let grandNumTakers = 0;
    let grandNoGrade = 0;
    let grand60_74 = 0;
    let grand75_79 = 0;
    let grand80_84 = 0;
    let grand85_89 = 0;
    let grand90_100 = 0;

    const weightedMps = rows => {
      const takers = rows.reduce((sum, row) => sum + row.num_takers, 0);
      return takers ? Math.round(rows.reduce((sum, row) => sum + row.mps * row.num_takers, 0) / takers * 100) / 100 : 0;
    };
    const resultGrades = Array.from(gradeMap.values()).map(glObj => {
      glObj.score_mean = glObj.num_takers > 0 ? Math.round((glObj.total_score / glObj.num_takers) * 100) / 100 : 0;
      glObj.mps = weightedMps(gradeSections.get(glObj.id) || []);
      glObj.total_score = Math.round(glObj.total_score * 100) / 100;

      grandTotalScore += glObj.total_score;
      grandNumTakers += glObj.num_takers;
      grandNoGrade += glObj.no_grade;
      grand60_74 += glObj.r60_74;
      grand75_79 += glObj.r75_79;
      grand80_84 += glObj.r80_84;
      grand85_89 += glObj.r85_89;
      grand90_100 += glObj.r90_100;

      const teacherList = Array.from(glObj.teachers.values()).map(tObj => {
        tObj.score_mean = tObj.num_takers > 0 ? Math.round((tObj.total_score / tObj.num_takers) * 100) / 100 : 0;
        tObj.mps = weightedMps(tObj.sections);
        tObj.total_score = Math.round(tObj.total_score * 100) / 100;
        return tObj;
      });

      return {
        ...glObj,
        teachers: teacherList
      };
    });

    const grandMean = grandNumTakers > 0 ? Math.round((grandTotalScore / grandNumTakers) * 100) / 100 : 0;
    const grandMps = weightedMps(resultGrades);

    const summary = {
      name: 'Total',
      total_score: Math.round(grandTotalScore * 100) / 100,
      num_takers: grandNumTakers,
      score_mean: grandMean,
      mps: grandMps,
      no_grade: grandNoGrade,
      r60_74: grand60_74,
      r75_79: grand75_79,
      r80_84: grand80_84,
      r85_89: grand85_89,
      r90_100: grand90_100
    };

    res.json({
      departmentName,
      schoolYear: selectedSchoolYear,
      term: rawTerm,
      schoolYears,
      terms: [
        { id: '1', label: 'Term 1' },
        { id: '2', label: 'Term 2' },
        { id: '3', label: 'Term 3' },
      ],
      grades: resultGrades,
      summary
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/filter-options', async (req, res) => {
  try {
    const userId = req.headers['x-auralis-user-id'] || req.query.user_id || req.query.userId || req.query.department_id;
    const data = await DeptHeadClassRecordService.getFilterOptions(userId);
    res.json(data);
  } catch (err) {
    res.status(err.message?.includes('User') ? 403 : 500).json({ error: err.message });
  }
});

router.get('/class-record', async (req, res) => {
  try {
    const userId = req.headers['x-auralis-user-id'] || req.query.user_id || req.query.userId;
    const { sectionId, schoolYearId } = req.query;
    const data = await DeptHeadClassRecordService.getClassRecord({
      sectionId,
      schoolYearId,
      userId,
    });
    res.json(data);
  } catch (err) {
    res.status(err.message?.includes('User') ? 403 : 500).json({ error: err.message });
  }
});

router.get('/class-record/download', async (req, res) => {
  try {
    const userId = req.headers['x-auralis-user-id'] || req.query.user_id || req.query.userId;
    const { sectionId, schoolYearId } = req.query;
    const { buffer, filename } = await DeptHeadClassRecordService.generateWorkbook({
      sectionId,
      schoolYearId,
      userId,
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    res.status(err.message?.includes('User') ? 403 : 500).json({ error: err.message });
  }
});

router.get('/missing-grades', async (req, res) => {
  try {
    const userId = req.headers['x-auralis-user-id'] || req.query.user_id || req.query.userId;
    const departmentId = await getDepartmentId(userId);
    const termStr = req.query.term || 'T1';
    const termNum = termStr.replace(/^T/i, '');
    const termNameMap = { '1': '1st', '2': '2nd', '3': '3rd' };
    const termName = termNameMap[termNum] || termStr;

    let query = `
      SELECT 
        u.user_id AS teacherId,
        CONCAT(u.first_name, ' ', u.last_name) AS teacherName,
        gl.grade_level_name AS gradeLevel,
        sec.section_name AS sectionName,
        s.subject_name AS subjectName,
        gs.workflow_status
      FROM SUBJECT_OFFERING so
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
      LEFT JOIN USER u ON ta.user_id = u.user_id
      LEFT JOIN ACADEMIC_TERM at ON at.school_year_id = sy.school_year_id AND at.term_name = ?
      LEFT JOIN GRADE_SHEET gs ON gs.subject_offering_id = so.subject_offering_id AND gs.term_id = at.term_id
      WHERE s.department_id = ?
        AND (gs.workflow_status IS NULL OR gs.workflow_status <> 'SUBMITTED')
      ORDER BY gl.grade_level_name, sec.section_name
    `;
    const [rows] = await db.query(query, [termName, departmentId]);
    const alerts = rows.map((r, idx) => ({
      id: idx + 1,
      teacherId: r.teacherId,
      teacher: r.teacherName || 'Unassigned Teacher',
      sectionName: `${r.gradeLevel} - ${r.sectionName}`,
      subjectName: r.subjectName,
      status: r.workflow_status || 'Pending',
    }));
    res.json({ count: alerts.length, alerts });
  } catch (err) {
    res.json({ count: 0, alerts: [] });
  }
});

module.exports = router;

