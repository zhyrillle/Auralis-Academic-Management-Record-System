const express = require('express');
const router = express.Router();
const db = require('../config/db');
const DeptHeadClassRecordService = require('../services/DeptHeadClassRecordService');

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
    filterSql += ` AND ${termPrefix}.term = ?`;
    params.push(`T${queryObj.quarter}`);
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

    let subQuery = `
      SELECT 
        COUNT(gs.grade_sheet_id) AS totalSheets,
        SUM(CASE WHEN gs.workflow_status = 'SUBMITTED' THEN 1 ELSE 0 END) AS submittedGrades
      FROM GRADE_SHEET gs
      JOIN SUBJECT_OFFERING so ON gs.subject_offering_id = so.subject_offering_id
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      WHERE s.department_id = ? 
    `;
    const subParams = [departmentId];
    subQuery += buildFilters(req.query, subParams, 'gs');
    const [subRows] = await db.query(subQuery, subParams);

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

    const totalSheets = Number(subRows[0]?.totalSheets) || 0;
    const submittedGrades = Number(subRows[0]?.submittedGrades) || 0;
    res.json({
      totalTeachers: Number(teacherRows[0]?.totalTeachers) || 0,
      submittedGrades,
      submittedGradesPercent: totalSheets > 0 ? Math.round((submittedGrades / totalSheets) * 100) : 0,
      delayedSubmissions: Math.max(0, totalSheets - submittedGrades),
      atRiskStudents: Number(riskRows[0]?.atRisk) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/submission-monitor', async (req, res) => {
  try {
    const departmentId = await getDepartmentId(req.headers['x-auralis-user-id']);
    let query = `
      SELECT 
        u.first_name, u.last_name, gl.grade_level_name, sec.section_name, gs.workflow_status
      FROM GRADE_SHEET gs
      JOIN SUBJECT_OFFERING so ON gs.subject_offering_id = so.subject_offering_id
      JOIN SUBJECT s ON so.subject_id = s.subject_id
      JOIN SECTION sec ON so.section_id = sec.section_id
      JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
      LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
      LEFT JOIN USER u ON ta.user_id = u.user_id
      WHERE s.department_id = ?
    `;
    const params = [departmentId];
    query += buildFilters(req.query, params, 'gs');
    query += ` ORDER BY gl.grade_level_name, sec.section_name`;

    const [rows] = await db.query(query, params);
    const results = rows.map(r => {
      const isSubmitted = r.workflow_status === 'SUBMITTED';
      return {
        teacher: (r.first_name && r.last_name) ? `${r.first_name} ${r.last_name}` : 'Unassigned',
        gradeSection: `${r.grade_level_name} - ${r.section_name}`,
        status: isSubmitted ? 'Submitted' : 'Pending',
        completion: isSubmitted ? 100 : 40
      };
    });
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
    const term = req.query.term || 'T1';

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
      LEFT JOIN GRADE_SHEET gs ON gs.subject_offering_id = so.subject_offering_id
      WHERE s.department_id = ?
        AND (gs.workflow_status IS NULL OR gs.workflow_status <> 'SUBMITTED')
      ORDER BY gl.grade_level_name, sec.section_name
    `;
    const [rows] = await db.query(query, [departmentId]);
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

